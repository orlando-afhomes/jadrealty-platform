import { describe, expect, it } from 'vitest';

import {
  isValidMergedCategory,
  mergeCategory,
  nextVoucherCode,
  validateCreateProperty,
  validateCreateTemplate,
  validateUpdateProperty,
  validateUpdateTemplate,
} from './cutover.js';

describe('template request validation', () => {
  it('accepts a complete template and rejects bad values', () => {
    expect(
      validateCreateTemplate({ title: 'Gift', originalValue: '500.00', validityDays: 90 }).success,
    ).toBe(true);
    expect(validateCreateTemplate({ title: '', originalValue: '500.00' }).success).toBe(false);
    expect(validateCreateTemplate({ title: 'Gift', originalValue: 'abc' }).success).toBe(false);
  });

  it('accepts partial updates with nullable clears', () => {
    expect(validateUpdateTemplate({ title: 'New' }).success).toBe(true);
    expect(validateUpdateTemplate({ expiresAt: null, validityDays: null }).success).toBe(true);
    expect(validateUpdateTemplate({ validityDays: -1 }).success).toBe(false);
  });
});

describe('property request validation', () => {
  it('accepts creates and rejects unknown statuses', () => {
    expect(
      validateCreateProperty({ name: 'Lot', categoryId: 'cat', price: '10.00', status: 'ACTIVE' })
        .success,
    ).toBe(true);
    expect(validateCreateProperty({ name: 'Lot', categoryId: 'cat', status: 'SOLD' }).success).toBe(
      false,
    );
  });

  it('accepts empty partial updates', () => {
    expect(validateUpdateProperty({}).success).toBe(true);
    expect(validateUpdateProperty({ status: 'INACTIVE' }).success).toBe(true);
  });
});

describe('mergeCategory', () => {
  it('merges the key, presentation, and count', () => {
    const merged = mergeCategory(
      'cat',
      'Title',
      {
        shortDescription: 'Short',
        description: 'Long',
        image: { id: 'i', alt: 'a' },
        isFeatured: true,
      },
      3,
    );
    expect(merged).toMatchObject({
      slug: 'cat',
      title: 'Title',
      listingCount: 3,
      isFeatured: true,
    });
    expect(isValidMergedCategory(merged)).toBe(true);
  });

  it('falls back to the title when presentation is missing', () => {
    const merged = mergeCategory('cat', 'Title', undefined, 0);
    expect(merged).toMatchObject({
      shortDescription: 'Title',
      description: 'Title',
      listingCount: 0,
    });
    expect(isValidMergedCategory(merged)).toBe(true);
  });
});

describe('nextVoucherCode', () => {
  it('increments the max suffix with the current year', () => {
    const now = new Date('2026-05-01T00:00:00.000Z');
    expect(nextVoucherCode(['JAD-VCH-2026-101', 'JAD-VCH-2026-109'], now)).toBe('JAD-VCH-2026-110');
    expect(nextVoucherCode([], now)).toBe('JAD-VCH-2026-101');
  });
});
