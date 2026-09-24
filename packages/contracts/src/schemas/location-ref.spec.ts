import { describe, expect, it } from 'vitest';

import {
  barangayRefSchema,
  barangaysQuerySchema,
  citiesQuerySchema,
  cityRefSchema,
  provinceRefSchema,
  provincesQuerySchema,
} from './location';

describe('location reference schemas', () => {
  it('validates province entries including independent cities as top level', () => {
    expect(
      provinceRefSchema.safeParse({ code: '0128', name: 'Ilocos Norte', kind: 'province' })
        .success,
    ).toBe(true);
    expect(
      provinceRefSchema.safeParse({ code: '133900', name: 'City of Manila', kind: 'city' })
        .success,
    ).toBe(true);
    expect(provinceRefSchema.safeParse({ code: '0128', name: 'Ilocos Norte' }).success).toBe(
      false,
    );
  });

  it('validates city entries with nullable province for independent cities', () => {
    expect(
      cityRefSchema.safeParse({
        code: '012801',
        name: 'Laoag City',
        provinceCode: '0128',
        kind: 'city',
      }).success,
    ).toBe(true);
    expect(
      cityRefSchema.safeParse({
        code: '133900',
        name: 'City of Manila',
        provinceCode: null,
        kind: 'city',
      }).success,
    ).toBe(true);
    expect(
      cityRefSchema.safeParse({ code: '012801', name: 'Laoag City', kind: 'city' }).success,
    ).toBe(false);
  });

  it('validates barangay entries', () => {
    expect(
      barangayRefSchema.safeParse({ code: '012801001', name: 'Brgy 1', cityCode: '012801' })
        .success,
    ).toBe(true);
    expect(barangayRefSchema.safeParse({ code: '012801001', name: 'Brgy 1' }).success).toBe(
      false,
    );
  });

  it('validates list query params', () => {
    expect(provincesQuerySchema.safeParse({ countryCode: 'PH' }).success).toBe(true);
    expect(provincesQuerySchema.safeParse({ countryCode: 'PHL' }).success).toBe(false);
    expect(provincesQuerySchema.safeParse({}).success).toBe(false);
    expect(citiesQuerySchema.safeParse({ provinceCode: '0128' }).success).toBe(true);
    expect(citiesQuerySchema.safeParse({}).success).toBe(false);
    expect(barangaysQuerySchema.safeParse({ cityCode: '012801' }).success).toBe(true);
    expect(barangaysQuerySchema.safeParse({}).success).toBe(false);
  });
});
