import { z } from 'zod';

/**
 * Payout account resources (API-SPECIFICATION §6.9, FEAT-044..046, FR-PAY-001..006).
 * `accountIdentifier` is SENSITIVE (DATABASE-DESIGN §8.3, SECURITY.md).
 * Lists/tables always render `accountIdentifierMasked`; the raw
 * `accountIdentifier` is additionally served to the owning member and
 * FINANCE_VIEW staff so detail modals can show the full number. Never log it.
 * Lifecycle: Pending → Admin Review → Confirmed (BR-PAY-004).
 */

/** Payout account state machine - CONFIRMED (BR-PAY-004, DATABASE-DESIGN §7.19). REJECTED is a frontend mock extension for the Approve/Reject workflow (requires Owner confirmation if made permanent). */
export const payoutAccountStatusSchema = z.enum([
  'PENDING',
  'ADMIN_REVIEW',
  'CONFIRMED',
  'REJECTED',
]);

export type PayoutAccountStatus = z.infer<typeof payoutAccountStatusSchema>;

/**
 * Payout method - owner-confirmed set (replaces the OD-016 PROPOSED set):
 * credit/debit card, digital bank, GCash, traditional bank. Writes accept
 * only these four; reads additionally accept legacy `OTHER` rows (see
 * `legacyPayoutMethodSchema`) so pre-existing accounts keep rendering.
 */
export const payoutMethodSchema = z.enum([
  'CREDIT_DEBIT_CARD',
  'DIGITAL_BANK',
  'GCASH',
  'TRADITIONAL_BANK',
]);

export type PayoutMethod = z.infer<typeof payoutMethodSchema>;

/**
 * Read-side method union: the four creatable methods plus legacy `OTHER`
 * rows written before Credit/Debit Card existed. Never accepted on writes -
 * `createPayoutAccountRequestSchema` stays on `payoutMethodSchema`.
 */
export const legacyPayoutMethodSchema = z.enum([
  'CREDIT_DEBIT_CARD',
  'DIGITAL_BANK',
  'GCASH',
  'TRADITIONAL_BANK',
  'OTHER',
]);

export type LegacyPayoutMethod = z.infer<typeof legacyPayoutMethodSchema>;

/** Per-method identifier shapes (single source for client hints and server enforcement). */
const GCASH_IDENTIFIER_RE = /^09\d{9}$/;
const BANK_ACCOUNT_IDENTIFIER_RE = /^\d{10,12}$/;
const CARD_IDENTIFIER_RE = /^\d{13,19}$/;

/**
 * Luhn checksum for card numbers (PANs). Length-checked first (13-19
 * digits), then the Luhn sum must be a multiple of 10. Catches transposed
 * or mistyped digits before an account reaches staff review.
 */
export function isValidCardNumber(value: string): boolean {
  if (!CARD_IDENTIFIER_RE.test(value)) return false;
  let sum = 0;
  let doubleDigit = false;
  for (let i = value.length - 1; i >= 0; i--) {
    let digit = value.charCodeAt(i) - 48;
    if (digit < 0 || digit > 9) return false;
    if (doubleDigit) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    doubleDigit = !doubleDigit;
  }
  return sum % 10 === 0;
}

/** Payout account - `GET /me/payout-accounts` (API-SPECIFICATION #48). */
export const payoutAccountSchema = z.object({
  id: z.string().min(1),
  method: legacyPayoutMethodSchema,
  accountName: z.string().min(1),
  /** Server-masked identifier - always present; tables render this. */
  accountIdentifierMasked: z.string().min(1),
  /** Raw identifier - present for owner/staff reads; detail modals render this. */
  accountIdentifier: z.string().min(1).optional(),
  status: payoutAccountStatusSchema,
  isPrimary: z.boolean(),
  createdAt: z.string(),
  rejectionReason: z.string().optional(),
});

export type PayoutAccount = z.infer<typeof payoutAccountSchema>;

/** `POST /me/payout-accounts` request (API-SPECIFICATION #49; methods per OD-016). */
export const createPayoutAccountRequestSchema = z
  .object({
    method: payoutMethodSchema,
    accountName: z.string().min(1),
    accountIdentifier: z.string().min(1),
  })
  .superRefine((data, ctx) => {
    const identifier = data.accountIdentifier.trim();
    const valid =
      data.method === 'GCASH'
        ? GCASH_IDENTIFIER_RE.test(identifier)
        : data.method === 'CREDIT_DEBIT_CARD'
          ? isValidCardNumber(identifier)
          : BANK_ACCOUNT_IDENTIFIER_RE.test(identifier);
    if (!valid) {
      ctx.addIssue({
        code: 'custom',
        path: ['accountIdentifier'],
        message:
          data.method === 'GCASH'
            ? 'Enter a valid GCash number (09 followed by 9 digits).'
            : data.method === 'CREDIT_DEBIT_CARD'
              ? 'Enter a valid 13-19 digit card number.'
              : 'Enter a valid 10-12 digit account number.',
      });
    }
  });

export type CreatePayoutAccountRequest = z.infer<typeof createPayoutAccountRequestSchema>;

/** `PATCH /me/payout-accounts/:id` - designates a single Primary (BR-PAY-006, #50). */
export const setPrimaryPayoutAccountRequestSchema = z.object({
  isPrimary: z.literal(true),
});

export type SetPrimaryPayoutAccountRequest = z.infer<typeof setPrimaryPayoutAccountRequestSchema>;
