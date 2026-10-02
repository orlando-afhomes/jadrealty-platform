import { z } from 'zod';

import { exactDecimalStringSchema } from './money.js';

/**
 * Voucher status - PROPOSED. Only the confirmed redemption lifecycle is
 * enumerated: an ACTIVE voucher has remaining value (full or partial, BR-VCH-001/002);
 * a FULLY_REDEEMED voucher has zero remaining value. Transfer, revocation,
 * expiration, and merchant permissions are BLOCKED on OD-019..023 (BR-VCH-007)
 * and are therefore NOT part of the vocabulary.
 */
export const voucherStatusSchema = z.enum(['ACTIVE', 'FULLY_REDEEMED']);

export type VoucherStatus = z.infer<typeof voucherStatusSchema>;

/**
 * Upper bound for validity windows (100 years). Generous for any real use;
 * unbounded values overflow PG `timestamptz` into a 500 downstream.
 */
export const MAX_VALIDITY_DAYS = 36500;

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/;

/**
 * Strict calendar date (`YYYY-MM-DD`, optionally with a time part as the
 * assign/template endpoints already accept full ISO datetimes). Real
 * month/day ranges including leap years.
 */
export function isValidIsoDate(value: string): boolean {
  const match = ISO_DATE_RE.exec(value);
  if (!match?.[1] || !match[2] || !match[3]) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

/**
 * Past-date check on the calendar-day part (deterministic server-side UTC;
 * the client additionally guards with its local today). Invalid shapes count
 * as past so one refine covers both.
 */
export function isPastIsoDate(value: string, todayIso = new Date().toISOString().slice(0, 10)): boolean {
  if (!isValidIsoDate(value)) return true;
  return value.slice(0, 10) < todayIso;
}

/**
 * Voucher - `GET /me/vouchers` / `GET /vouchers/:id` (API-SPECIFICATION #61/#62,
 * FEAT-053, FR-VCH-001..003, SCR-MEM-020/021). The member sees their OWN vouchers
 * only (object-level, NFR-AUTHZ-002); ownership is server-authoritative. Values
 * are exact-decimal STRINGS (BR-VCH-002: Original − Redeemed = Remaining); the
 * server computes `remainingValue` - the client never derives it. Shape is PROPOSED.
 */
export const voucherSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(4),
  title: z.string().min(1),
  originalValue: exactDecimalStringSchema,
  remainingValue: exactDecimalStringSchema,
  status: voucherStatusSchema,
  createdAt: z.string(),
  expiresAt: z.string().optional(),
  // Present once the voucher is redeemed (FULLY_REDEEMED). `redeemedBy` is the
  // StaffUser uuid of the actor who confirmed the scan.
  redeemedAt: z.string().optional(),
  redeemedBy: z.string().optional(),
});

export type Voucher = z.infer<typeof voucherSchema>;

/**
 * Voucher template - defines a voucher type that can be assigned to members
 * (`GET /admin/voucher-templates`, Phase B5). Values are exact-decimal STRINGS.
 * `expiresAt` (fixed date) takes precedence over `validityDays` (days from
 * issuance); neither set means open-ended. Shape mirrors the admin mock.
 */
export const voucherTemplateSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  originalValue: exactDecimalStringSchema,
  createdAt: z.string(),
  expiresAt: z.string().optional(),
  validityDays: z.number().int().positive().optional(),
});

export type VoucherTemplate = z.infer<typeof voucherTemplateSchema>;

/** `POST /admin/voucher-templates` - id is server-generated. */
export const createVoucherTemplateRequestSchema = z.object({
  title: z.string().min(1),
  originalValue: exactDecimalStringSchema,
  expiresAt: z
    .string()
    .optional()
    .refine((value) => value === undefined || !isPastIsoDate(value), {
      message: 'Expiry cannot be in the past.',
    }),
  validityDays: z.number().int().min(1).max(MAX_VALIDITY_DAYS).optional(),
});

export type CreateVoucherTemplateRequest = z.infer<typeof createVoucherTemplateRequestSchema>;

/** `PATCH /admin/voucher-templates/:id` - mirrors the admin mock update rules. */
export const updateVoucherTemplateRequestSchema = z.object({
  title: z.string().min(1).optional(),
  expiresAt: z
    .string()
    .nullable()
    .optional()
    .refine((value) => value == null || !isPastIsoDate(value), {
      message: 'Expiry cannot be in the past.',
    }),
  validityDays: z.number().int().min(1).max(MAX_VALIDITY_DAYS).nullable().optional(),
});

export type UpdateVoucherTemplateRequest = z.infer<typeof updateVoucherTemplateRequestSchema>;

/**
 * `POST /admin/vouchers/assign` - assign a voucher (definition) to a member.
 * The expiry rule is set per assignment (`expiresAt` fixed date wins over
 * `validityDays`; neither set → the template rule applies, else open-ended).
 */
export const assignVoucherRequestSchema = z.object({
  templateId: z.string().min(1),
  memberId: z.string().min(1),
  expiresAt: z
    .string()
    .optional()
    .refine((value) => value === undefined || !isPastIsoDate(value), {
      message: 'Expiry cannot be in the past.',
    }),
  validityDays: z.number().int().min(1).max(MAX_VALIDITY_DAYS).optional(),
});

export type AssignVoucherRequest = z.infer<typeof assignVoucherRequestSchema>;

/** `POST /admin/vouchers/scan` - resolve a voucher from its QR payload (the unique code). */
export const scanVoucherRequestSchema = z.object({
  code: z.string().min(1),
});

export type ScanVoucherRequest = z.infer<typeof scanVoucherRequestSchema>;

/** `POST /admin/vouchers/:id/redeem` - confirm a scan, redeem the voucher in full. */
export const redeemVoucherRequestSchema = z.object({});

export type RedeemVoucherRequest = z.infer<typeof redeemVoucherRequestSchema>;

/**
 * Admin assignment view - `GET /admin/vouchers` (Phase B7). The member-facing
 * `Voucher` plus the back-office linkage (template, member). The admin
 * detail page renders member names from this shape.
 */
export const voucherAssignmentSchema = voucherSchema.extend({
  templateId: z.string().min(1),
  memberId: z.string().min(1),
  memberName: z.string().min(1),
});

export type VoucherAssignment = z.infer<typeof voucherAssignmentSchema>;
