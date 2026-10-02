import { describe, expect, it } from 'vitest';

import {
  createPayoutAccountRequestSchema,
  isValidCardNumber,
  legacyPayoutMethodSchema,
  payoutAccountSchema,
  payoutMethodSchema,
} from './payout.js';

/**
 * Payout methods: writes accept the four owner-confirmed methods;
 * reads additionally accept legacy `OTHER` rows.
 */
describe('payout method vocabulary', () => {
  it('accepts the four creatable methods on writes', () => {
    for (const method of ['CREDIT_DEBIT_CARD', 'DIGITAL_BANK', 'GCASH', 'TRADITIONAL_BANK']) {
      expect(payoutMethodSchema.safeParse(method).success).toBe(true);
    }
    expect(payoutMethodSchema.safeParse('OTHER').success).toBe(false);
  });

  it('rejects OTHER on account creation', () => {
    expect(
      createPayoutAccountRequestSchema.safeParse({
        method: 'OTHER',
        accountName: 'Juan Dela Cruz',
        accountIdentifier: '12345678',
      }).success,
    ).toBe(false);
  });

  it('keeps legacy OTHER rows readable', () => {
    expect(legacyPayoutMethodSchema.safeParse('OTHER').success).toBe(true);
    expect(
      payoutAccountSchema.safeParse({
        id: 'pa-1',
        method: 'OTHER',
        accountName: 'Juan Dela Cruz',
        accountIdentifierMasked: '•••• 5678',
        status: 'PENDING',
        isPrimary: false,
        createdAt: '2026-08-20T10:00:00.000Z',
      }).success,
    ).toBe(true);
  });

  it('validates card numbers with the Luhn checksum', () => {
    expect(isValidCardNumber('4111111111111111')).toBe(true);
    expect(isValidCardNumber('5500000000000004')).toBe(true);
    expect(isValidCardNumber('378282246310005')).toBe(true);
    expect(isValidCardNumber('4111111111111112')).toBe(false);
    expect(isValidCardNumber('12345')).toBe(false);
    expect(isValidCardNumber('411111111111111a')).toBe(false);
  });

  it('enforces per-method identifier shapes on creation', () => {
    const base = { accountName: 'Juan Dela Cruz' };
    expect(
      createPayoutAccountRequestSchema.safeParse({
        ...base,
        method: 'GCASH',
        accountIdentifier: '09175550199',
      }).success,
    ).toBe(true);
    expect(
      createPayoutAccountRequestSchema.safeParse({
        ...base,
        method: 'GCASH',
        accountIdentifier: '12345',
      }).success,
    ).toBe(false);
    expect(
      createPayoutAccountRequestSchema.safeParse({
        ...base,
        method: 'CREDIT_DEBIT_CARD',
        accountIdentifier: '4111111111111111',
      }).success,
    ).toBe(true);
    expect(
      createPayoutAccountRequestSchema.safeParse({
        ...base,
        method: 'CREDIT_DEBIT_CARD',
        accountIdentifier: '4111111111111112',
      }).success,
    ).toBe(false);
    expect(
      createPayoutAccountRequestSchema.safeParse({
        ...base,
        method: 'TRADITIONAL_BANK',
        accountIdentifier: '1234567890',
      }).success,
    ).toBe(true);
    expect(
      createPayoutAccountRequestSchema.safeParse({
        ...base,
        method: 'TRADITIONAL_BANK',
        accountIdentifier: '123',
      }).success,
    ).toBe(false);
  });
});
