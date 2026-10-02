import { describe, expect, it } from 'vitest';

import {
  assignVoucherRequestSchema,
  createVoucherTemplateRequestSchema,
  isPastIsoDate,
  isValidIsoDate,
  MAX_VALIDITY_DAYS,
  updateVoucherTemplateRequestSchema,
} from './voucher.js';

/** Voucher expiry guards: past dates rejected, windows bounded. */
describe('voucher expiry validation', () => {
  it('validates strict calendar dates', () => {
    expect(isValidIsoDate('2026-10-31')).toBe(true);
    expect(isValidIsoDate('2024-02-29')).toBe(true);
    expect(isValidIsoDate('2027-01-01T00:00:00.000Z')).toBe(true);
    expect(isValidIsoDate('2023-02-29')).toBe(false);
    expect(isValidIsoDate('2026-13-01')).toBe(false);
    expect(isValidIsoDate('not-a-date')).toBe(false);
  });

  it('detects past dates against an injectable today', () => {
    expect(isPastIsoDate('2020-01-01', '2026-10-01')).toBe(true);
    expect(isPastIsoDate('2026-10-01', '2026-10-01')).toBe(false);
    expect(isPastIsoDate('2027-01-01', '2026-10-01')).toBe(false);
    expect(isPastIsoDate('garbage', '2026-10-01')).toBe(true);
  });

  it('rejects past expiry dates on assignment', () => {
    const base = { templateId: 'vtpl-1', memberId: 'mem-1' };
    expect(assignVoucherRequestSchema.safeParse({ ...base, expiresAt: '2020-01-01' }).success).toBe(
      false,
    );
    expect(assignVoucherRequestSchema.safeParse({ ...base, expiresAt: '2099-01-01' }).success).toBe(
      true,
    );
    expect(assignVoucherRequestSchema.safeParse(base).success).toBe(true);
  });

  it(`bounds validity windows at ${MAX_VALIDITY_DAYS} days`, () => {
    const base = { templateId: 'vtpl-1', memberId: 'mem-1' };
    expect(
      assignVoucherRequestSchema.safeParse({ ...base, validityDays: MAX_VALIDITY_DAYS }).success,
    ).toBe(true);
    expect(
      assignVoucherRequestSchema.safeParse({ ...base, validityDays: MAX_VALIDITY_DAYS + 1 })
        .success,
    ).toBe(false);
    expect(
      createVoucherTemplateRequestSchema.safeParse({
        title: 'Gift',
        originalValue: '500.00',
        validityDays: MAX_VALIDITY_DAYS + 1,
      }).success,
    ).toBe(false);
    expect(updateVoucherTemplateRequestSchema.safeParse({ validityDays: 0 }).success).toBe(false);
  });
});
