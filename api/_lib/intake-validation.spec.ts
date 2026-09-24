import { describe, expect, it } from 'vitest';

import { buildPhoneRule, resolveIntakeAddress, validateIntakePhone } from './intake-validation.js';

/**
 * Shared registration-intake guards (register + resubmit): country-rule
 * phone validation with E.164 normalization, and PH hierarchy membership
 * checks with server-resolved name snapshots. Supabase access is injected
 * as tiny query callbacks so specs run without mocks of the client.
 */

const PH_ROW = {
  code: 'PH',
  dial_code: '63',
  phone_national_min: 10,
  phone_national_max: 10,
  phone_pattern: '^9[0-9]{9}$',
};

const db = () => {
  const calls: string[] = [];
  return {
    calls,
    country: async (code: string) => {
      calls.push(`country:${code}`);
      return code === 'PH' ? { ...PH_ROW } : null;
    },
    province: async (code: string) => {
      calls.push(`province:${code}`);
      return code === '0128' ? { code: '0128', name: 'Ilocos Norte' } : null;
    },
    city: async (code: string) => {
      calls.push(`city:${code}`);
      if (code === '012801')
        return { code: '012801', name: 'Laoag City', province_code: '0128' };
      if (code === '133900')
        return { code: '133900', name: 'City of Manila', province_code: null };
      return null;
    },
    barangay: async (code: string) => {
      calls.push(`barangay:${code}`);
      if (code === '012801001')
        return { code: '012801001', name: 'Brgy 1', city_code: '012801' };
      if (code === '133900001')
        return { code: '133900001', name: 'Brgy 2', city_code: '133900' };
      return null;
    },
  };
};

describe('buildPhoneRule', () => {
  it('builds a curated rule from a countries row', () => {
    expect(buildPhoneRule(PH_ROW)).toMatchObject({ dialCode: '63', nationalLengths: [10] });
  });

  it('falls back to generic E.164 when the row carries no metadata', () => {
    expect(buildPhoneRule({ code: 'XX' })).toMatchObject({ dialCode: '' });
    expect(buildPhoneRule(null)).toMatchObject({ dialCode: '' });
  });

  it('drops malformed metadata instead of serving it', () => {
    const rule = buildPhoneRule({
      code: 'XX',
      dial_code: '6+3!',
      phone_national_min: 'ten',
      phone_national_max: -1,
      phone_pattern: '([invalid',
    });
    expect(rule).toMatchObject({ dialCode: '' });
  });
});

describe('validateIntakePhone', () => {
  it('normalizes a valid PH number to E.164', async () => {
    const database = db();
    const result = await validateIntakePhone(
      { country: database.country },
      'PH',
      '0918 555 0101',
    );
    expect(result).toEqual({ ok: true as const, normalized: '+639185550101' });
  });

  it('rejects letters, wrong lengths, and wrong prefixes', async () => {
    const database = db();
    for (const phone of ['0918-CALL-ME', '0918555010', '08185550101', '   ']) {
      const result = await validateIntakePhone({ country: database.country }, 'PH', phone);
      expect(result.ok).toBe(false);
    }
  });

  it('uses generic E.164 for countries without metadata or rows', async () => {
    const database = db();
    expect(
      await validateIntakePhone({ country: database.country }, 'US', '+14155552671'),
    ).toEqual({ ok: true as const, normalized: '+14155552671' });
    expect(
      (await validateIntakePhone({ country: database.country }, 'US', '123456')).ok,
    ).toBe(false);
  });
});

describe('resolveIntakeAddress', () => {
  it('resolves a valid PH hierarchy with name snapshots', async () => {
    const database = db();
    const result = await resolveIntakeAddress(database, 'PH', {
      provinceCode: '0128',
      cityCode: '012801',
      barangayCode: '012801001',
      street: '123 Main St',
    });
    expect(result).toEqual({
      ok: true as const,
      columns: {
        address: '123 Main St',
        province_code: '0128',
        province_name: 'Ilocos Norte',
        city_code: '012801',
        city_name: 'Laoag City',
        barangay_code: '012801001',
        barangay_name: 'Brgy 1',
        region_name: null,
      },
    });
  });

  it('supports an independent city as its own top level', async () => {
    const database = db();
    const result = await resolveIntakeAddress(database, 'PH', {
      provinceCode: '133900',
      cityCode: '133900',
      barangayCode: '133900001',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.columns.city_code).toBe('133900');
      expect(result.columns.barangay_name).toBe('Brgy 2');
    }
  });

  it('rejects mismatched combinations (city of another province, stray barangay)', async () => {
    const database = db();
    const mismatchedCity = await resolveIntakeAddress(database, 'PH', {
      provinceCode: '0128',
      cityCode: '133900',
      barangayCode: '133900001',
    });
    expect(mismatchedCity.ok).toBe(false);
    const strayBarangay = await resolveIntakeAddress(database, 'PH', {
      provinceCode: '0128',
      cityCode: '012801',
      barangayCode: '133900001',
    });
    expect(strayBarangay.ok).toBe(false);
    const unknownProvince = await resolveIntakeAddress(database, 'PH', {
      provinceCode: '9999',
      cityCode: '012801',
      barangayCode: '012801001',
    });
    expect(unknownProvince.ok).toBe(false);
  });

  it('stores region/city text for non-PH countries', async () => {
    const database = db();
    const result = await resolveIntakeAddress(database, 'US', {
      region: 'California',
      city: 'Los Angeles',
      street: '456 Sunset Blvd',
    });
    expect(result).toEqual({
      ok: true as const,
      columns: {
        address: '456 Sunset Blvd',
        province_code: null,
        province_name: null,
        city_code: null,
        city_name: 'Los Angeles',
        barangay_code: null,
        barangay_name: null,
        region_name: 'California',
      },
    });
  });
});
