import { describe, expect, it } from 'vitest';

import { registerRequestSchema, resubmitRequestSchema } from './auth';

const PH_BASE = {
  programId: 'prg-domestic',
  firstName: 'Juan',
  lastName: 'Dela Cruz',
  middleInitial: 'A',
  dateOfBirth: '1990-01-01',
  gender: 'Male',
  countryCode: 'PH',
  provinceCode: '0128',
  cityCode: '012801',
  barangayCode: '012801001',
  street: '123 Main St',
  phone: '09185550101',
  email: 'juan@example.com',
  password: 'S3cure-password',
  qualificationAnswers: [],
  idDocument: { fileName: 'id.png', mimeType: 'image/png', sizeBytes: 100 },
};

describe('registerRequestSchema', () => {
  it('accepts a valid Philippine application with hierarchy codes', () => {
    expect(registerRequestSchema.safeParse(PH_BASE).success).toBe(true);
  });

  it('normalizes names and the middle initial', () => {
    const parsed = registerRequestSchema.safeParse({
      ...PH_BASE,
      firstName: '  Juan  ',
      middleInitial: 'A.',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.firstName).toBe('Juan');
      expect(parsed.data.middleInitial).toBe('A');
    }
  });

  it.each(['Juan3', 'J@ne', '   ', 'A'.repeat(61)])('rejects firstName %s', (firstName) => {
    expect(registerRequestSchema.safeParse({ ...PH_BASE, firstName }).success).toBe(false);
  });

  it.each(['AB', '1', '-', 'A..'])('rejects middleInitial %s', (middleInitial) => {
    expect(registerRequestSchema.safeParse({ ...PH_BASE, middleInitial }).success).toBe(false);
  });

  it.each(['2026-09-23', '2026-09-24', 'not-a-date', '2026-02-30', '1890-01-01', '  '])(
    'rejects dateOfBirth %s',
    (dateOfBirth) => {
      expect(registerRequestSchema.safeParse({ ...PH_BASE, dateOfBirth }).success).toBe(false);
    },
  );

  it('rejects letters in phone at schema level', () => {
    expect(registerRequestSchema.safeParse({ ...PH_BASE, phone: '0918-CALL-ME' }).success).toBe(
      false,
    );
  });

  it('requires the full PH hierarchy and forbids mixing with region/city text', () => {
    const { barangayCode: _dropped, ...noBarangay } = PH_BASE;
    expect(registerRequestSchema.safeParse(noBarangay).success).toBe(false);
    expect(
      registerRequestSchema.safeParse({ ...PH_BASE, region: 'Ilocos', city: 'Laoag' }).success,
    ).toBe(false);
  });

  it('accepts a non-PH application with region + city text', () => {
    const { provinceCode, cityCode, barangayCode, ...rest } = PH_BASE;
    void provinceCode;
    void cityCode;
    void barangayCode;
    expect(
      registerRequestSchema.safeParse({
        ...rest,
        countryCode: 'US',
        region: 'California',
        city: 'Los Angeles',
      }).success,
    ).toBe(true);
  });

  it('rejects a non-PH application with PH codes or an incomplete pair', () => {
    const { provinceCode, cityCode, barangayCode, ...rest } = PH_BASE;
    void provinceCode;
    void cityCode;
    void barangayCode;
    expect(
      registerRequestSchema.safeParse({ ...rest, countryCode: 'US', provinceCode: '0128' })
        .success,
    ).toBe(false);
    expect(
      registerRequestSchema.safeParse({ ...rest, countryCode: 'US', region: 'California' }).success,
    ).toBe(false);
  });
});

describe('resubmitRequestSchema', () => {
  it('accepts an empty partial (nothing to check)', () => {
    expect(resubmitRequestSchema.safeParse({}).success).toBe(true);
  });

  it('still rejects invalid values in a partial update', () => {
    expect(resubmitRequestSchema.safeParse({ firstName: 'Juan3' }).success).toBe(false);
    expect(resubmitRequestSchema.safeParse({ provinceCode: '0128' }).success).toBe(false);
    expect(resubmitRequestSchema.safeParse({ region: 'CA' }).success).toBe(false);
  });
});
