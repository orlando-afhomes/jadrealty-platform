import { randomUUID } from 'node:crypto';

import { ADMIN_STAFF } from '../../_lib/access.js';
import { findAuthUserId, isAuthConflict, verifyStaffModule } from '../../_lib/auth.js';
import { appendAudit } from '../../_lib/audit.js';
import { getSupabaseEnv } from '../../_lib/env.js';
import type { VercelRequest, VercelResponse } from '../../_lib/http.js';
import { isValidAdminMemberRow, mapAdminMemberRow } from '../../_lib/pipeline.js';
import {
  generateReferralCode,
  isReferralCodeConflict,
  MAX_REFERRAL_CODE_ATTEMPTS,
} from '../../_lib/referral-codes.js';
import {
  adminMemberSchema,
  birthDateSchema,
  MAX_STREET_LENGTH,
  middleInitialSchema,
  personNameSchema,
  staffPasswordSchema,
  validatePhoneNumber,
} from '@jad/contracts';
import {
  buildPhoneRule,
  locationLookupsFor,
  resolveIntakeAddress,
} from '../../_lib/intake-validation.js';
import { enforceRateLimit } from '../../_lib/rate-limit.js';
import { methodNotAllowed, okList, readJsonBody, serviceClient } from '../../_lib/rest.js';
import { toErrorEnvelope } from '../../_lib/envelope.js';

function idempotencyKey(req: VercelRequest): string | undefined {
  const raw = req.headers['idempotency-key'] ?? req.headers['Idempotency-Key'];
  const key = Array.isArray(raw) ? raw[0] : raw;
  return typeof key === 'string' && key ? key : undefined;
}

const PROGRAM_IDS = ['prg-domestic', 'prg-abroad'] as const;

function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** GET /admin/members - roster excluding archived. POST - create with auth account. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Idempotency-Key');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  const auth = await verifyStaffModule(req, 'members', ADMIN_STAFF);
  if ('error' in auth) {
    const { error, status } = auth.error;
    res.status(status).json({ error });
    return;
  }
  const { url, serviceKey } = getSupabaseEnv();
  if (!url || !serviceKey) {
    const { error, status } = toErrorEnvelope('INTERNAL', 'Supabase not configured', 500);
    res.status(status).json({ error });
    return;
  }
  const supabase = serviceClient();
  if (!supabase) {
    const { error, status } = toErrorEnvelope('INTERNAL', 'Supabase not configured', 500);
    res.status(status).json({ error });
    return;
  }

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('Member')
      .select('*')
      .is('archivedAt', null)
      .order('createdAt', { ascending: false });
    if (error) {
      const { error: env, status } = toErrorEnvelope('INTERNAL', error.message, 500);
      res.status(status).json({ error: env });
      return;
    }
    const { data: programs } = await supabase.from('Program').select('id, code, name');
    const byId = new Map(
      ((programs as { id: string; code: string; name: string }[] | null) ?? []).map((p) => [
        p.id,
        p,
      ]),
    );
    const rows = (((data as unknown[]) ?? []) as Record<string, unknown>[]).map((row) =>
      mapAdminMemberRow(row, byId),
    );
    okList(res, rows.filter(isValidAdminMemberRow));
    return;
  }

  if (req.method === 'POST') {
    // This endpoint mints auth identities - brake floods like the other
    // account-creating endpoints do (register/session-password parity).
    if (
      !enforceRateLimit(req, res, {
        scope: 'admin/members',
        max: process.env.ADMIN_MEMBERS_RATE_LIMIT
          ? Number(process.env.ADMIN_MEMBERS_RATE_LIMIT)
          : 30,
      })
    ) {
      return;
    }
    // Double-submit protection (sales/withdrawals parity): the dialog sends
    // a fresh key per open; retries replay the stored 201 payload instead of
    // minting a second auth user + duplicate MEMBER_CREATED audit. Scoped by
    // staff actor inside the key (staff ids are not Member rows, so
    // IdempotencyKey.memberId stays null here).
    const rawKey = idempotencyKey(req);
    if (!rawKey) {
      const { error, status } = toErrorEnvelope(
        'VALIDATION_ERROR',
        'Idempotency-Key header is required.',
        400,
      );
      res.status(status).json({ error });
      return;
    }
    const idemPath = `POST:/admin/members:${auth.userId}:${rawKey}`;
    const { data: replay } = await supabase
      .from('IdempotencyKey')
      .select('response,expiresAt')
      .eq('key', idemPath)
      .maybeSingle();
    const expired =
      replay !== null &&
      (replay as { expiresAt?: string | null }).expiresAt != null &&
      new Date((replay as { expiresAt: string }).expiresAt).getTime() <= Date.now();
    if (expired) {
      await supabase.from('IdempotencyKey').delete().eq('key', idemPath);
    } else if (replay && (replay as { response?: unknown }).response) {
      res.status(200).json((replay as { response: unknown }).response);
      return;
    }
    const parsedBody = readJsonBody(req);
    if (!parsedBody.ok) {
      const { error, status } = parsedBody.error;
      res.status(status).json({ error });
      return;
    }
    const input = (parsedBody.body ?? {}) as Record<string, unknown>;
    // Names, initial, email, phone, DOB, and address are validated with the
    // same `@jad/contracts` normalize-then-validate core `/register` and the
    // intake API enforce - the dialog is UX-only, this is the boundary.
    const firstNameParsed = personNameSchema.safeParse(input.firstName ?? '');
    const lastNameParsed = personNameSchema.safeParse(input.lastName ?? '');
    if (!firstNameParsed.success || !lastNameParsed.success) {
      const { error, status } = toErrorEnvelope(
        'VALIDATION_ERROR',
        'First and last name are required (letters, spaces, hyphens, apostrophes).',
        400,
      );
      res.status(status).json({ error });
      return;
    }
    const firstName = firstNameParsed.data;
    const lastName = lastNameParsed.data;
    const middleInitialParsed = middleInitialSchema.safeParse(input.middleInitial ?? '');
    if (!middleInitialParsed.success) {
      const { error, status } = toErrorEnvelope(
        'VALIDATION_ERROR',
        'Middle initial must be a single letter (A-Z) or omitted.',
        400,
      );
      res.status(status).json({ error });
      return;
    }
    const middleInitial = middleInitialParsed.data ?? '';
    const email = String(input.email ?? '')
      .trim()
      .toLowerCase();
    // The dialog sends programCode (e.g. ABROAD); accept it and map to the
    // program id, defaulting to prg-domestic.
    const rawProgram = String(input.programId ?? input.programCode ?? 'prg-domestic');
    const programId = (PROGRAM_IDS as readonly string[]).includes(rawProgram)
      ? rawProgram
      : `prg-${rawProgram.toLowerCase()}`;
    if (!validEmail(email) || email.length > 254) {
      const { error, status } = toErrorEnvelope(
        'VALIDATION_ERROR',
        'A valid email address is required.',
        400,
      );
      res.status(status).json({ error });
      return;
    }
    // NOTE: any country × program combination is intentionally allowed
    // (admin power, e.g. OFW on Domestic) - only existence is enforced, and
    // the program row itself is verified against the Program table below.
    const countryCode = String(input.countryCode ?? '').trim();
    // Independent reference reads overlap in one round (B4): country rule
    // (also feeds phone validation below, so no second countries fetch),
    // minimum age, program existence (never trust the hardcoded list alone),
    // and the email pre-check.
    const [countryRes, minAgeRes, programRes, existingRes] = await Promise.all([
      supabase
        .from('countries')
        .select('code,name,is_active,dial_code,phone_national_min,phone_national_max,phone_pattern')
        .eq('code', countryCode)
        .maybeSingle(),
      supabase
        .from('SystemConfig')
        .select('value')
        .eq('key', 'QUALIFICATION_MIN_AGE')
        .maybeSingle(),
      supabase.from('Program').select('id').eq('id', programId).maybeSingle(),
      supabase.from('Member').select('id').eq('email', email).limit(1),
    ]);
    if (!programRes.data) {
      const { error, status } = toErrorEnvelope('VALIDATION_ERROR', 'Unknown program.', 400);
      res.status(status).json({ error });
      return;
    }
    const country = countryRes.data as {
      code?: string;
      name?: string;
      is_active?: boolean;
      dial_code?: unknown;
      phone_national_min?: unknown;
      phone_national_max?: unknown;
      phone_pattern?: unknown;
    } | null;
    if (!country || typeof country.code !== 'string' || country.is_active === false) {
      const { error, status } = toErrorEnvelope('VALIDATION_ERROR', 'Select a valid country.', 400);
      res.status(status).json({ error });
      return;
    }
    const countryName = typeof country.name === 'string' && country.name ? country.name : '';
    const lookups = locationLookupsFor(supabase);
    const phone = validatePhoneNumber(
      String(input.phone ?? ''),
      buildPhoneRule({
        code: countryCode,
        dial_code: country.dial_code,
        phone_national_min: country.phone_national_min,
        phone_national_max: country.phone_national_max,
        phone_pattern: country.phone_pattern,
      }),
    );
    if (!phone) {
      const { error, status } = toErrorEnvelope(
        'VALIDATION_ERROR',
        'Enter a valid phone number.',
        400,
      );
      res.status(status).json({ error });
      return;
    }
    const minAge = Number.parseInt(
      String((minAgeRes.data as { value?: unknown } | null)?.value ?? '18'),
      10,
    );
    const dobCheck = birthDateSchema(Number.isFinite(minAge) ? minAge : 18).safeParse(
      input.dateOfBirth ?? '',
    );
    if (!dobCheck.success) {
      const { error, status } = toErrorEnvelope(
        'VALIDATION_ERROR',
        'Enter a valid date of birth.',
        400,
      );
      res.status(status).json({ error });
      return;
    }
    const dateOfBirth = dobCheck.data;
    const gender = String(input.gender ?? '').trim();
    if (!gender || gender.length > 60) {
      const { error, status } = toErrorEnvelope('VALIDATION_ERROR', 'Gender is required.', 400);
      res.status(status).json({ error });
      return;
    }
    // Optional name suffix - fixed choices only (Jr./Sr./II/III/IV/V),
    // mirroring the admin dialog dropdown.
    const nameSuffix = String(input.nameSuffix ?? '').trim();
    if (nameSuffix && !['Jr.', 'Sr.', 'II', 'III', 'IV', 'V'].includes(nameSuffix)) {
      const { error, status } = toErrorEnvelope(
        'VALIDATION_ERROR',
        'Name suffix must be one of Jr., Sr., II, III, IV, V.',
        400,
      );
      res.status(status).json({ error });
      return;
    }
    const street = String(input.address ?? '').trim();
    if (!street || street.length > MAX_STREET_LENGTH) {
      const { error, status } = toErrorEnvelope(
        'VALIDATION_ERROR',
        'Street address is required.',
        400,
      );
      res.status(status).json({ error });
      return;
    }
    const addressCheck = await resolveIntakeAddress(lookups, countryCode, {
      street,
      provinceCode: typeof input.provinceCode === 'string' ? input.provinceCode : undefined,
      cityCode: typeof input.cityCode === 'string' ? input.cityCode : undefined,
      barangayCode: typeof input.barangayCode === 'string' ? input.barangayCode : undefined,
      region: typeof input.region === 'string' ? input.region : undefined,
      city: typeof input.city === 'string' ? input.city : undefined,
    });
    if (!addressCheck.ok) {
      const { error, status } = toErrorEnvelope('VALIDATION_ERROR', addressCheck.message, 400);
      res.status(status).json({ error });
      return;
    }
    const addressColumns = addressCheck.columns;
    const rawPassword =
      typeof input.temporaryPassword === 'string' && input.temporaryPassword
        ? input.temporaryPassword
        : null;
    if (rawPassword !== null && !staffPasswordSchema.safeParse(rawPassword).success) {
      const { error, status } = toErrorEnvelope(
        'VALIDATION_ERROR',
        'Temporary password must be 8-72 characters.',
        400,
      );
      res.status(status).json({ error });
      return;
    }
    const existing = existingRes.data;
    if (Array.isArray(existing) && existing.length > 0) {
      const { error, status } = toErrorEnvelope(
        'CONFLICT',
        'A member with this email already exists.',
        409,
      );
      res.status(status).json({ error });
      return;
    }
    const created = await supabase.auth.admin.createUser({
      email,
      password: rawPassword ?? randomUUID(),
      email_confirm: true,
      user_metadata: { full_name: `${firstName} ${lastName}` },
    });
    if (created.error && !isAuthConflict(created.error)) {
      const { error, status } = toErrorEnvelope('INTERNAL', created.error.message, 500);
      res.status(status).json({ error });
      return;
    }
    let authId = (created.data as { user?: { id: string } } | null)?.user?.id ?? null;
    // Duplicate identity (e.g. orphaned auth row from a failed earlier
    // attempt): adopt the existing auth account instead of failing.
    if (!authId) {
      authId = await findAuthUserId(supabase, { email });
    }
    if (!authId) {
      const { error, status } = toErrorEnvelope(
        'AUTH_IDENTITY_UNRESOLVABLE',
        'An auth account already exists for this email but could not be matched. Reconcile the identity in Supabase Auth (or remove the stray account) and retry.',
        409,
      );
      res.status(status).json({ error });
      return;
    }
    const now = new Date().toISOString();
    const buildMemberRow = (referralCode: string, sponsorId: string | null) => ({
      id: authId,
      email,
      name: `${firstName} ${lastName}`,
      status: 'APPROVED_ACTIVE',
      isQualified: false,
      firstName,
      lastName,
      middleInitial,
      nameSuffix,
      phone,
      dateOfBirth,
      gender,
      address: addressColumns.address,
      province_code: addressColumns.province_code,
      province_name: addressColumns.province_name,
      city_code: addressColumns.city_code,
      city_name: addressColumns.city_name,
      barangay_code: addressColumns.barangay_code,
      barangay_name: addressColumns.barangay_name,
      region_name: addressColumns.region_name,
      countryCode,
      countryName,
      programId,
      referralCode,
      sponsorId,
      accountStatus: 'ACTIVE',
      createdAt: now,
    });
    // Optional sponsor link (B7 Member.sponsorId). Accepts the sponsor's
    // referral CODE (not a uuid) and resolves it exactly like registration
    // approval: ACTIVE + qualified, never self. Unresolvable codes reject
    // (400) instead of silently creating a sponsorless member.
    let sponsorId: string | null = null;
    const sponsorCode = String(input.referralCode ?? '').trim();
    if (sponsorCode) {
      // Targeted case-insensitive lookup (LIKE metacharacters escaped) - no
      // full-table scan; the JS comparison below confirms the exact match.
      const escaped = sponsorCode.replace(/[\\%_]/g, (match) => `\\${match}`);
      const { data: sponsorRows } = await supabase
        .from('Member')
        .select('id,referralCode,accountStatus,isQualified')
        .ilike('referralCode', escaped);
      const sponsor = (
        (sponsorRows as
          | {
              id: string;
              referralCode?: string | null;
              accountStatus?: string;
              isQualified?: boolean;
            }[]
          | null) ?? []
      ).find(
        (candidate) => (candidate.referralCode ?? '').toLowerCase() === sponsorCode.toLowerCase(),
      );
      if (
        !sponsor ||
        sponsor.id === authId ||
        sponsor.accountStatus !== 'ACTIVE' ||
        sponsor.isQualified !== true
      ) {
        const { error, status } = toErrorEnvelope(
          'VALIDATION_ERROR',
          'The referral code could not be matched to an active, qualified sponsor.',
          400,
        );
        res.status(status).json({ error });
        return;
      }
      sponsorId = sponsor.id;
    }
    // Fresh entropy per attempt with the shared retry budget (no
    // full-table pre-scan): the partial UNIQUE index stays the source of
    // truth, so concurrent creates converge instead of colliding.
    let referralCode = generateReferralCode(lastName);
    let memberResult = await supabase
      .from('Member')
      .upsert(buildMemberRow(referralCode, sponsorId), { onConflict: 'id' });
    for (
      let attempt = 1;
      attempt < MAX_REFERRAL_CODE_ATTEMPTS &&
      memberResult.error &&
      isReferralCodeConflict(memberResult.error);
      attempt += 1
    ) {
      referralCode = generateReferralCode(lastName);
      memberResult = await supabase
        .from('Member')
        .upsert(buildMemberRow(referralCode, sponsorId), { onConflict: 'id' });
    }
    if (memberResult.error) {
      if (isReferralCodeConflict(memberResult.error)) {
        const { error, status } = toErrorEnvelope(
          'CONFLICT',
          'Referral code collision - retry member creation.',
          409,
        );
        res.status(status).json({ error });
        return;
      }
      const { error, status } = toErrorEnvelope('INTERNAL', memberResult.error.message, 500);
      res.status(status).json({ error });
      return;
    }
    const { data: roleRows } = await supabase
      .from('Role')
      .select('id')
      .eq('slug', 'member_basic')
      .limit(1);
    const basicId = ((roleRows as { id: string }[] | null) ?? [])[0]?.id;
    if (basicId) {
      await supabase
        .from('MemberRole')
        .upsert({ memberId: authId, roleId: basicId }, { onConflict: '"memberId","roleId"' });
    }
    await appendAudit(supabase, {
      action: 'MEMBER_CREATED',
      actorId: auth.userId,
      actorRole: auth.slugs[0] ?? 'admin',
      targetType: 'Member',
      targetId: authId,
      targetName: `${firstName} ${lastName}`,
      detail: `Created member ${firstName} ${lastName}`,
    });
    // Return the full created row - the client validates POST responses
    // against adminMemberSchema, so a partial shape would fail parsing
    // AFTER a successful create (phantom member + stuck form).
    const { data: createdRow, error: readBackError } = await supabase
      .from('Member')
      .select('*')
      .eq('id', authId)
      .maybeSingle();
    if (readBackError || !createdRow) {
      const { error, status } = toErrorEnvelope(
        'INTERNAL',
        readBackError?.message ?? 'Created member unreadable',
        500,
      );
      res.status(status).json({ error });
      return;
    }
    const { data: programs } = await supabase.from('Program').select('id, code, name');
    const byId = new Map(
      ((programs as { id: string; code: string; name: string }[] | null) ?? []).map((p) => [
        p.id,
        p,
      ]),
    );
    const mapped = mapAdminMemberRow(createdRow as Record<string, unknown>, byId);
    const parsed = adminMemberSchema.safeParse(mapped);
    if (!parsed.success) {
      const { error, status } = toErrorEnvelope(
        'INTERNAL',
        'Created member failed validation',
        500,
      );
      res.status(status).json({ error });
      return;
    }
    await supabase.from('IdempotencyKey').upsert(
      {
        key: idemPath,
        memberId: null,
        response: parsed.data,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
      { onConflict: 'key' },
    );
    res.status(201).json(parsed.data);
    return;
  }

  methodNotAllowed(res, req.method);
}
