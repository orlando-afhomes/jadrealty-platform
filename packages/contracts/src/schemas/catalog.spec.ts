import { describe, expect, it } from 'vitest';

import {
  createCategoryRequestSchema,
  propertyCategorySchema,
  updateCategoryRequestSchema,
} from './catalog';

const BASE = {
  slug: 'tenanted-condo-resales',
  title: 'Tenanted Condo Resales',
  directRate: '0.1000',
  referralRate: '0.0500',
};

describe('propertyCategorySchema', () => {
  it('accepts independent per-category rates', () => {
    expect(propertyCategorySchema.safeParse(BASE).success).toBe(true);
    expect(
      propertyCategorySchema.safeParse({ ...BASE, directRate: '0.1500', referralRate: '0.0800' })
        .success,
    ).toBe(true);
  });

  it('accepts boundary rates 0 and 1', () => {
    expect(
      propertyCategorySchema.safeParse({ ...BASE, directRate: '0', referralRate: '1.0000' })
        .success,
    ).toBe(true);
  });

  it.each(['1.0001', '2', '-0.05', 'abc', '0.12345', ''])(
    'rejects out-of-range or malformed rate %s',
    (directRate) => {
      expect(propertyCategorySchema.safeParse({ ...BASE, directRate }).success).toBe(false);
      expect(propertyCategorySchema.safeParse({ ...BASE, referralRate: directRate }).success).toBe(
        false,
      );
    },
  );
});

describe('createCategoryRequestSchema', () => {
  it('accepts explicit rates', () => {
    expect(createCategoryRequestSchema.safeParse(BASE).success).toBe(true);
  });

  it('allows omitting rates (server defaults to the live globals)', () => {
    const { slug, title } = BASE;
    expect(createCategoryRequestSchema.safeParse({ slug, title }).success).toBe(true);
  });
});

describe('updateCategoryRequestSchema', () => {
  it('accepts a single-rate patch without touching the other rate', () => {
    const parsed = updateCategoryRequestSchema.safeParse({ directRate: '0.1200' });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toEqual({ directRate: '0.1200' });
      expect('referralRate' in parsed.data).toBe(false);
    }
  });
});
