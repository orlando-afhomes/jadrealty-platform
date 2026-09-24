import { z } from 'zod';

import { memberStatusSchema } from './member.js';
import { roleSchema } from './role.js';
import {
  birthDateSchema,
  MAX_NAME_LENGTH,
  MAX_STREET_LENGTH,
  middleInitialSchema,
  personNameSchema,
  UNICODE_CONTROL_RE,
} from './registration-validation.js';

/**
 * Session principal - `GET /auth/me` + `POST /auth/login` (API-SPECIFICATION
 * #3/#6, FR-AUTH-004). No SSOT defines the exact session field list yet; this
 * is the PROPOSED baseline carried by the mock session (ARCH-DEC-007:
 * HttpOnly-cookie session; the client never stores credentials or tokens).
 *
 * `isQualified` is member eligibility (`members.is_qualified`, BR-QUAL-001) and
 * `status` is the member's membership status (BR-AUTH-002). Both apply to the
 * MEMBER role only - they are eligibility, not roles.
 */
export const sessionUserSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email(),
  role: roleSchema,
  isQualified: z.boolean().optional(),
  status: memberStatusSchema.optional(),
});

export type SessionUser = z.infer<typeof sessionUserSchema>;

/** `POST /auth/login` request - identifier accepts email or phone (FR-AUTH-004). */
export const loginRequestSchema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(1),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;

/** `POST /auth/login` response - the established session principal. */
export const loginResponseSchema = z.object({
  user: sessionUserSchema,
});

export type LoginResponse = z.infer<typeof loginResponseSchema>;

/** One captured qualification answer (FR-REG-003; question content TBD OD-002). */
export const qualificationAnswerSchema = z.object({
  questionId: z.string().min(1),
  answer: z.string().min(1),
});

export type QualificationAnswer = z.infer<typeof qualificationAnswerSchema>;

/**
 * Government ID submission - captured at registration (FR-REG-002, FEAT-010).
 * `data` carries transient base64 file bytes on submit only (never persisted,
 * never returned by readers - stripped server-side before storage).
 * `storagePath` is the private-bucket key set server-side after upload.
 */
export const idDocumentSchema = z.object({
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  storagePath: z.string().min(1).optional(),
  data: z.string().min(1).optional(),
});

export type IdDocument = z.infer<typeof idDocumentSchema>;

/**
 * `POST /auth/register` request (API-SPECIFICATION #1, FEAT-007, FR-REG-001..013).
 * Program choice + profile + qualification answers + optional referral code +
 * ID document + email/password. Purchase is NOT required (BR-REG-006).
 *
 * Field rules mirror the shared validators in `registration-validation.ts`
 * (normalize-then-validate, applied in BOTH layers): names are charset-pinned,
 * the middle initial folds `A.` to `A`, the birth date is a strict past
 * calendar date, and the address is structured - PH uses hierarchy codes,
 * other countries use region/city text. Phone shape is checked here;
 * country-specific length/format is enforced by the handler against the
 * resolved country rule.
 */
const PHONE_BASE_RE = /^\+?[\d\s().\-]+$/;

const addressFields = {
  /** Street/building/unit line (legacy `address` key kept for compatibility). */
  address: z
    .string()
    .trim()
    .max(MAX_STREET_LENGTH)
    .refine((value) => !UNICODE_CONTROL_RE.test(value))
    .optional(),
  /** Philippine hierarchy codes (PSGC) - required together when country is PH. */
  provinceCode: z.string().trim().min(1).max(10).optional(),
  cityCode: z.string().trim().min(1).max(10).optional(),
  barangayCode: z.string().trim().min(1).max(10).optional(),
  /** Non-PH structured address - required together for other countries. */
  region: z.string().trim().min(1).max(MAX_NAME_LENGTH).optional(),
  city: z.string().trim().min(1).max(MAX_NAME_LENGTH).optional(),
};

type AddressFields = {
  countryCode?: string;
  provinceCode?: string;
  cityCode?: string;
  barangayCode?: string;
  region?: string;
  city?: string;
};

/**
 * Address group integrity: no mixing of PH codes with region/city text, no
 * partial groups. Country-aware completeness (PH trio vs region+city pair)
 * applies when the country is known; partial payloads without a country
 * (resubmit) only require group completeness.
 */
function refineRegistrationAddress(obj: AddressFields, ctx: z.RefinementCtx) {
  const trio = [obj.provinceCode, obj.cityCode, obj.barangayCode];
  const pair = [obj.region, obj.city];
  const trioPresent = trio.some((v) => v !== undefined);
  const pairPresent = pair.some((v) => v !== undefined);
  if (trioPresent && pairPresent) {
    ctx.addIssue({
      code: 'custom',
      message: 'Provide either Philippine location codes or region/city text, not both.',
    });
    return;
  }
  if (obj.countryCode === 'PH') {
    if (!obj.provinceCode || !obj.cityCode || !obj.barangayCode) {
      ctx.addIssue({
        code: 'custom',
        message: 'Select your province, city/municipality, and barangay.',
      });
    }
    return;
  }
  if (obj.countryCode !== undefined) {
    if (!obj.region || !obj.city) {
      ctx.addIssue({ code: 'custom', message: 'Enter your region/state and city.' });
    }
    return;
  }
  if (trioPresent && trio.some((v) => !v)) {
    ctx.addIssue({
      code: 'custom',
      message: 'Select your province, city/municipality, and barangay.',
    });
  }
  if (pairPresent && pair.some((v) => !v)) {
    ctx.addIssue({ code: 'custom', message: 'Enter your region/state and city.' });
  }
}

const registerBaseSchema = z.object({
  programId: z.string().min(1),
  firstName: personNameSchema,
  lastName: personNameSchema,
  middleInitial: middleInitialSchema,
  nameSuffix: z.string().trim().max(10).optional(),
  dateOfBirth: birthDateSchema(0),
  gender: z.string().trim().min(1).max(MAX_NAME_LENGTH),
  countryCode: z.string().trim().length(2),
  ...addressFields,
  phone: z.string().trim().min(1).max(25).regex(PHONE_BASE_RE),
  email: z.string().email(),
  password: z.string().min(1),
  referralCode: z.string().optional(),
  qualificationAnswers: z.array(qualificationAnswerSchema),
  idDocument: idDocumentSchema,
  verificationId: z.string().uuid().optional(),
});

export const registerRequestSchema = registerBaseSchema.superRefine(refineRegistrationAddress);

export type RegisterRequest = z.infer<typeof registerRequestSchema>;

/**
 * Registration application resource (SCR-AUTH-004). No SSOT defines the exact
 * application field list; `emailVerified` reflects BR-AUTH-001 (email
 * verification precedes approval). Status vocabulary is BR-AUTH-002.
 */
export const registrationApplicationSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  status: memberStatusSchema,
  emailVerified: z.boolean(),
  createdAt: z.string(),
});

export type RegistrationApplication = z.infer<typeof registrationApplicationSchema>;

/** `POST /auth/register` response - application created in `Pending`. */
export const registerResponseSchema = z.object({
  application: registrationApplicationSchema,
  /**
   * Whether the verification code email was accepted for delivery
   * (EmailJS). False when the email service is unconfigured or the send
   * failed - the applicant can re-request via
   * `POST /auth/verify-email/resend`.
   */
  emailSent: z.boolean().optional(),
  /** True when the email already had a pending application (replay, no duplicate). */
  replayed: z.boolean().optional(),
});

export type RegisterResponse = z.infer<typeof registerResponseSchema>;

/** `POST /auth/verify-email` request - one-time verification code (FEAT-009). */
export const verifyEmailRequestSchema = z.object({
  email: z.string().email(),
  code: z.string().min(1),
});

export type VerifyEmailRequest = z.infer<typeof verifyEmailRequestSchema>;

/** `POST /auth/verify-email/resend` request - re-issue the one-time code (FEAT-009). */
export const resendVerificationRequestSchema = z.object({
  email: z.string().email(),
});

export type ResendVerificationRequest = z.infer<typeof resendVerificationRequestSchema>;

/** `POST /auth/verify-email` response - email now verified (BR-AUTH-001). */
export const verifyEmailResponseSchema = z.object({
  email: z.string().email(),
  verifiedAt: z.string(),
});

export type VerifyEmailResponse = z.infer<typeof verifyEmailResponseSchema>;

/**
 * `POST /auth/verify-email/resend` response - MOCK-ONLY simulation. The real
 * API emails a code and returns no code; this mock surfaces the "email" the
 * applicant would receive so the frontend-only demo is usable. `devOnlyCode`
 * is never present in the real contract - consumers treat it as dev tooling.
 */
export const resendVerificationResponseSchema = z.object({
  email: z.string().email(),
  devOnlyCode: z.string().optional(),
  /** Seconds until another resend is allowed (present when a live code exists). */
  retryAfterSeconds: z.number().int().positive().optional(),
});

export type ResendVerificationResponse = z.infer<typeof resendVerificationResponseSchema>;

/**
 * `POST /me/resubmit` request - corrected registration data (FR-REG-005, #13).
 * All fields optional, but every provided value faces the same rules as
 * intake (the refinement tolerates an absent country and enforces group
 * completeness only). The handler additionally checks country-correctness
 * against the member's immutable country.
 */
export const resubmitRequestSchema =
  registerBaseSchema.partial().superRefine(refineRegistrationAddress);

export type ResubmitRequest = z.infer<typeof resubmitRequestSchema>;
