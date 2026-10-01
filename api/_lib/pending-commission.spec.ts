import { describe, expect, it } from 'vitest';

import { sumPendingCommission } from './pending-commission.js';

/**
 * Pending-commission estimate: own open sales x direct rate, referred sales
 * x referral rate, plus direct-downline open sales with no referrer x
 * referral rate (sponsor fallback). Exact-decimal strings only.
 */
describe('sumPendingCommission', () => {
  const rates = { directRate: '0.0800', referralRate: '0.0400' };

  it('sums direct commission on own open sales only', () => {
    expect(
      sumPendingCommission({
        ownSales: [
          { status: 'SUBMITTED', propertyValue: '1200000.00' },
          { status: 'ADMIN_APPROVED', propertyValue: '8600000.00' },
          { status: 'PAYMENT_VERIFIED', propertyValue: '5500000.00' },
          { status: 'QUALIFYING_SALE', propertyValue: '2000000.00' },
          { status: 'REJECTED', propertyValue: '4000000.00' },
        ],
        referredSales: [],
        downlineSales: [],
        ...rates,
      }),
      // 96000 + 688000 + 440000; qualified + rejected excluded.
    ).toBe('1224000.00');
  });

  it('sums referral commission on picked-referrer sales', () => {
    expect(
      sumPendingCommission({
        ownSales: [],
        referredSales: [{ status: 'PAYMENT_VERIFIED', propertyValue: '5500000.00' }],
        downlineSales: [],
        ...rates,
      }),
    ).toBe('220000.00');
  });

  it('includes downline open sales with no referrer (sponsor fallback)', () => {
    expect(
      sumPendingCommission({
        ownSales: [],
        referredSales: [],
        downlineSales: [
          { status: 'SUBMITTED', propertyValue: '1200000.00' },
          { status: 'QUALIFYING_SALE', propertyValue: '9999999.00' },
        ],
        ...rates,
      }),
      // 48000; the qualified sale is already credited, not pending.
    ).toBe('48000.00');
  });

  it('combines all three slices without double counting', () => {
    expect(
      sumPendingCommission({
        ownSales: [{ status: 'SUBMITTED', propertyValue: '1000000.00' }],
        referredSales: [{ status: 'SUBMITTED', propertyValue: '1000000.00' }],
        downlineSales: [{ status: 'SUBMITTED', propertyValue: '1000000.00' }],
        ...rates,
      }),
      // 80000 + 40000 + 40000.
    ).toBe('160000.00');
  });

  it('skips malformed amounts, rates, and non-pending statuses', () => {
    expect(
      sumPendingCommission({
        ownSales: [
          { status: 'SUBMITTED', propertyValue: 'not-money' },
          { status: 'SUBMITTED', propertyValue: '1000000.00' },
        ],
        referredSales: [{ status: 'LOCKED', propertyValue: '1000000.00' }],
        downlineSales: [],
        directRate: 'bogus',
        referralRate: '0.0400',
      }),
      // Bad direct rate zeroes the own slice; locked excluded.
    ).toBe('0.00');
  });

  it('returns zero when nothing is pending', () => {
    expect(
      sumPendingCommission({ ownSales: [], referredSales: [], downlineSales: [], ...rates }),
    ).toBe('0.00');
  });

  it('uses per-sale category rates ahead of the batch globals', () => {
    expect(
      sumPendingCommission({
        ownSales: [
          { status: 'SUBMITTED', propertyValue: '1000000.00', directRate: '0.1000' },
          { status: 'SUBMITTED', propertyValue: '1000000.00', directRate: '0.1500' },
          { status: 'SUBMITTED', propertyValue: '1000000.00' },
        ],
        referredSales: [{ status: 'SUBMITTED', propertyValue: '1000000.00', referralRate: '0.0500' }],
        downlineSales: [],
        ...rates,
      }),
      // 100000 + 150000 + 80000 (global fallback) + 50000.
    ).toBe('380000.00');
  });

  it('a per-sale rate rescues its slice when the batch global is malformed', () => {
    expect(
      sumPendingCommission({
        ownSales: [{ status: 'SUBMITTED', propertyValue: '1000000.00', directRate: '0.1000' }],
        referredSales: [],
        downlineSales: [],
        directRate: 'bogus',
        referralRate: '0.0400',
      }),
    ).toBe('100000.00');
  });
});
