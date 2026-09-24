import { resubmitRequestSchema } from '@jad/contracts';

import { appendAudit } from '../../_lib/audit.js';
import { verifyUser } from '../../_lib/auth.js';
import {
  GOVERNMENT_ID_BUCKET,
  stripDocumentData,
  uploadGovernmentId,
} from '../../_lib/documents.js';
import {
  locationLookupsFor,
  resolveIntakeAddress,
  validateIntakePhone,
  type AddressColumns,
} from '../../_lib/intake-validation.js';
import { removeStorageKeys } from '../../_lib/storage.js';
import type { VercelRequest, VercelResponse } from '../../_lib/http.js';
import { calculateAge } from '../../_lib/pipeline.js';
import { methodNotAllowed, readJsonBody, requireService } from '../../_lib/rest.js';
import { toErrorEnvelope } from '../../_lib/envelope.js';

/**
 * POST /me/resubmit - corrected data for a REJECTED application. Applies the
 * editable fields to the Member row and its linked Registration, then returns
 * both to PENDING (unlimited resubmissions, BR-REG-005). Country is immutable.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'POST') {
    methodNotAllowed(res, req.method);
    return;
  }
  const auth = await verifyUser(req);
  if ('error' in auth) {
    const { error, status } = auth.error;
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const { data: member, error: memberError } = await supabase
    .from('Member')
    .select('*')
    .eq('id', auth.userId)
    .maybeSingle();
  if (memberError || !member) {
    const { error, status } = toErrorEnvelope('NOT_FOUND', 'Member not found', 404);
    res.status(status).json({ error });
    return;
  }
  const m = member as Record<string, unknown>;
  if (m.status !== 'REJECTED') {
    const { error, status } = toErrorEnvelope(
      'CONFLICT',
      'Only a rejected application can be resubmitted.',
      409,
    );
    res.status(status).json({ error });
    return;
  }
  const parsedBody = readJsonBody(req);
  if (!parsedBody.ok) {
    const { error, status } = parsedBody.error;
    res.status(status).json({ error });
    return;
  }
  // Legacy alias: early clients send `governmentId` where the contract
  // expects `idDocument`. Fold it before validation (idDocument wins).
  const rawBody = (parsedBody.body ?? {}) as Record<string, unknown>;
  if (rawBody.idDocument === undefined && rawBody.governmentId !== undefined) {
    rawBody.idDocument = rawBody.governmentId;
  }
  // Resubmission faces the same rules as intake - every provided value is
  // schema-validated (names, birth date, phone shape, address groups).
  // Country-specific phone/address checks follow against the immutable
  // member country.
  const parsed = resubmitRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    const { error, status } = toErrorEnvelope(
      'VALIDATION_ERROR',
      'Some resubmitted details are missing or invalid.',
      400,
      parsed.error.issues,
    );
    res.status(status).json({ error });
    return;
  }
  const body = parsed.data;
  if (
    body.countryCode !== undefined &&
    body.countryCode.toUpperCase() !== String(m.countryCode ?? '').toUpperCase()
  ) {
    const { error, status } = toErrorEnvelope(
      'VALIDATION_ERROR',
      'Country cannot be changed.',
      400,
    );
    res.status(status).json({ error });
    return;
  }
  const memberCountry = String(m.countryCode ?? '');
  const lookups = locationLookupsFor(supabase);
  // Phone: country-rule validation with E.164 normalization.
  let normalizedPhone: string | undefined;
  if (body.phone !== undefined) {
    const phoneCheck = await validateIntakePhone({ country: lookups.country }, memberCountry, body.phone);
    if (!phoneCheck.ok) {
      const { error, status } = toErrorEnvelope('VALIDATION_ERROR', phoneCheck.message, 400);
      res.status(status).json({ error });
      return;
    }
    normalizedPhone = phoneCheck.normalized;
  }
  // Address: hierarchy changes resolve against the member's country
  // (membership-checked, names snapshotted); a street-only correction
  // updates just the street line.
  let addressColumns: AddressColumns | undefined;
  if (
    body.provinceCode !== undefined ||
    body.cityCode !== undefined ||
    body.barangayCode !== undefined ||
    body.region !== undefined ||
    body.city !== undefined
  ) {
    const addressCheck = await resolveIntakeAddress(lookups, memberCountry, {
      provinceCode: body.provinceCode,
      cityCode: body.cityCode,
      barangayCode: body.barangayCode,
      region: body.region,
      city: body.city,
      street: body.address,
    });
    if (!addressCheck.ok) {
      const { error, status } = toErrorEnvelope('VALIDATION_ERROR', addressCheck.message, 400);
      res.status(status).json({ error });
      return;
    }
    addressColumns = addressCheck.columns;
  }
  if (typeof body.dateOfBirth === 'string' && body.dateOfBirth) {
    const { data: minAgeRow } = await supabase
      .from('SystemConfig')
      .select('value')
      .eq('key', 'QUALIFICATION_MIN_AGE')
      .maybeSingle();
    const minAge = Number((minAgeRow as { value?: string } | null)?.value ?? 18) || 18;
    if (calculateAge(body.dateOfBirth) < minAge) {
      const { error, status } = toErrorEnvelope(
        'VALIDATION_ERROR',
        `Applicants must be at least ${minAge} years old.`,
        400,
      );
      res.status(status).json({ error });
      return;
    }
  }
  const memberPatch: Record<string, unknown> = {
    status: 'PENDING',
    isQualified: false,
    // Returning to PENDING re-opens review, including the government ID -
    // clear the approval-time flag (mirrors the mock's isIdVerified reset).
    idVerified: false,
  };
  // Schema-normalized values flow straight into the patches (no raw input).
  if (body.firstName !== undefined) memberPatch.firstName = body.firstName;
  if (body.lastName !== undefined) memberPatch.lastName = body.lastName;
  if (body.middleInitial !== undefined) memberPatch.middleInitial = body.middleInitial;
  if (body.nameSuffix !== undefined) memberPatch.nameSuffix = body.nameSuffix;
  if (normalizedPhone !== undefined) memberPatch.phone = normalizedPhone;
  if (body.dateOfBirth !== undefined) memberPatch.dateOfBirth = body.dateOfBirth;
  if (body.gender !== undefined) memberPatch.gender = body.gender;
  const hierarchyTouched =
    body.provinceCode !== undefined ||
    body.cityCode !== undefined ||
    body.barangayCode !== undefined ||
    body.region !== undefined ||
    body.city !== undefined;
  if (addressColumns !== undefined) {
    if (body.address !== undefined) memberPatch.address = addressColumns.address;
    memberPatch.province_code = addressColumns.province_code;
    memberPatch.province_name = addressColumns.province_name;
    memberPatch.city_code = addressColumns.city_code;
    memberPatch.city_name = addressColumns.city_name;
    memberPatch.barangay_code = addressColumns.barangay_code;
    memberPatch.barangay_name = addressColumns.barangay_name;
    memberPatch.region_name = addressColumns.region_name;
  } else if (body.address !== undefined) {
    // Street-only correction (no hierarchy fields touched).
    memberPatch.address = body.address === '' ? null : body.address;
  }
  const fullName = [memberPatch.firstName ?? m.firstName, memberPatch.lastName ?? m.lastName]
    .filter((part) => typeof part === 'string' && part)
    .join(' ');
  if (fullName) memberPatch.name = fullName;
  const { error: updateError } = await supabase
    .from('Member')
    .update(memberPatch)
    .eq('id', auth.userId);
  if (updateError) {
    const { error, status } = toErrorEnvelope('INTERNAL', updateError.message, 500);
    res.status(status).json({ error });
    return;
  }
  const registrationId = typeof m.registrationId === 'string' ? m.registrationId : null;
  // Exact storage key of a replaced ID document, removed best-effort after
  // the row update commits (file-last ordering keeps DB and Storage
  // consistent even when the removal fails).
  let regPatchPendingStorageRemoval: string | null = null;
  if (registrationId) {
    const regPatch: Record<string, unknown> = {
      status: 'PENDING',
      reviewedAt: null,
      reviewedBy: null,
      rejectionNote: null,
    };
    for (const field of [
      'firstName',
      'lastName',
      'middleInitial',
      'nameSuffix',
      'phone',
      'address',
      'dateOfBirth',
      'gender',
      'province_code',
      'province_name',
      'city_code',
      'city_name',
      'barangay_code',
      'barangay_name',
      'region_name',
    ] as const) {
      if (memberPatch[field] !== undefined) regPatch[field] = memberPatch[field];
    }
    if (body.qualificationAnswers !== undefined)
      regPatch.qualificationAnswers = body.qualificationAnswers;
    const governmentId = body.idDocument as Record<string, unknown> | undefined;
    if (governmentId !== undefined) {
      // Never persist upload bytes; upload a fresh file when provided. A
      // replaced file orphans its old object - captured here so it can be
      // removed after the row update succeeds (never before).
      let previousStoragePath: string | null = null;
      if (typeof governmentId.data === 'string' && governmentId.data) {
        const { data: currentReg } = await supabase
          .from('Registration')
          .select('governmentId')
          .eq('id', registrationId)
          .maybeSingle();
        const stored = (currentReg as { governmentId?: unknown } | null)?.governmentId as
          | Record<string, unknown>
          | undefined;
        if (typeof stored?.storagePath === 'string' && stored.storagePath) {
          previousStoragePath = stored.storagePath as string;
        }
      }
      regPatch.governmentId = stripDocumentData(governmentId) ?? governmentId;
      if (typeof governmentId.data === 'string' && governmentId.data) {
        const uploaded = await uploadGovernmentId(supabase, registrationId, {
          fileName: governmentId.fileName,
          mimeType: governmentId.mimeType,
          data: governmentId.data,
        });
        if (!uploaded.ok) {
          const { error, status } = toErrorEnvelope('INTERNAL', uploaded.message, 500);
          res.status(status).json({ error });
          return;
        }
        regPatch.governmentId = {
          ...(regPatch.governmentId as Record<string, unknown>),
          storagePath: uploaded.storagePath,
        };
        if (previousStoragePath && previousStoragePath !== uploaded.storagePath) {
          regPatchPendingStorageRemoval = previousStoragePath;
        }
      }
    }
    const { error: regUpdateError } = await supabase
      .from('Registration')
      .update(regPatch)
      .eq('id', registrationId);
    if (regUpdateError) {
      const { error, status } = toErrorEnvelope('INTERNAL', regUpdateError.message, 500);
      res.status(status).json({ error });
      return;
    }
    if (regPatchPendingStorageRemoval) {
      await removeStorageKeys(supabase, GOVERNMENT_ID_BUCKET, [regPatchPendingStorageRemoval]);
    }
  }
  await appendAudit(supabase, {
    action: 'APPLICATION_RESUBMITTED',
    actorId: auth.userId,
    actorRole: 'member',
    targetType: 'Registration',
    targetId: registrationId ?? auth.userId,
    targetName: fullName || String(m.email ?? auth.userId),
    detail: `Resubmitted application ${registrationId ?? auth.userId}`,
  });
  const { data: authUser } = await supabase.auth.admin.getUserById(auth.userId);
  const emailVerified = Boolean(
    authUser?.user && (authUser.user as { email_confirmed_at?: string }).email_confirmed_at,
  );
  res.status(200).json({
    application: {
      id: auth.userId,
      email: m.email,
      status: 'PENDING',
      emailVerified,
      createdAt: new Date().toISOString(),
    },
  });
}
