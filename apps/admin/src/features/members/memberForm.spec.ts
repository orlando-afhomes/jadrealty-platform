import { describe, expect, it } from 'vitest';

import { normalizeMemberForm, validateMemberForm, type MemberFormValues } from './memberForm';

const PH = {
  minAge: 18,
  countries: [
    {
      code: 'PH',
      name: 'Philippines',
      dialCode: '63',
      phoneMin: 10,
      phoneMax: 10,
      phonePattern: '^9[0-9]{9}$',
    },
    { code: 'US', name: 'United States', dialCode: '1', phoneMin: 10, phoneMax: 10 },
  ],
  provinceCodes: ['0128', '133900'],
  cityCodes: ['012801', '012802', '133900'],
  barangayCodes: ['012801001', '012801002', '133900001'],
};

function valid(): MemberFormValues {
  return {
    firstName: 'Juan',
    middleInitial: 'D',
    noMiddleInitial: false,
    lastName: 'Dela Cruz',
    nameSuffix: '',
    email: 'Juan.DelaCruz@Example.com',
    temporaryPassword: 'password123',
    phoneDial: '63',
    phoneNational: '9171234567',
    dateOfBirth: '1992-03-14',
    gender: 'Male',
    customGender: '',
    countryCode: 'PH',
    street: '123 Mabini St',
    provinceCode: '0128',
    cityCode: '012801',
    barangayCode: '012801001',
    region: '',
    city: '',
    programCode: 'ABROAD',
    referralCode: '',
  };
}

describe('validateMemberForm', () => {
  it('accepts a complete valid create form', () => {
    expect(validateMemberForm(valid(), PH, { isEdit: false })).toEqual({});
  });

  it('rejects numbers, symbols, whitespace-only, and overlong names', () => {
    expect(
      validateMemberForm({ ...valid(), firstName: 'Juan2' }, PH, { isEdit: false }),
    ).toMatchObject({ firstName: expect.any(String) });
    expect(
      validateMemberForm({ ...valid(), lastName: '   ' }, PH, { isEdit: false }),
    ).toMatchObject({ lastName: expect.any(String) });
    expect(
      validateMemberForm({ ...valid(), firstName: 'J@uan!' }, PH, { isEdit: false }),
    ).toMatchObject({ firstName: expect.any(String) });
    expect(
      validateMemberForm({ ...valid(), lastName: 'D'.repeat(61) }, PH, { isEdit: false }),
    ).toMatchObject({ lastName: expect.any(String) });
    // Legitimate formats pass.
    expect(
      validateMemberForm({ ...valid(), firstName: "Mary-Jane O'Brien" }, PH, { isEdit: false }),
    ).toEqual({});
  });

  it('handles the middle initial + N/A contract like /register', () => {
    // Missing without N/A is an error.
    expect(
      validateMemberForm({ ...valid(), middleInitial: '' }, PH, { isEdit: false }),
    ).toMatchObject({ middleInitial: expect.any(String) });
    // N/A skips the requirement.
    expect(
      validateMemberForm({ ...valid(), middleInitial: '', noMiddleInitial: true }, PH, {
        isEdit: false,
      }),
    ).toEqual({});
    // Two letters / digits rejected; 'A.' folds to A.
    expect(
      validateMemberForm({ ...valid(), middleInitial: 'AB' }, PH, { isEdit: false }),
    ).toMatchObject({ middleInitial: expect.any(String) });
    expect(
      validateMemberForm({ ...valid(), middleInitial: '1' }, PH, { isEdit: false }),
    ).toMatchObject({ middleInitial: expect.any(String) });
    expect(validateMemberForm({ ...valid(), middleInitial: 'a.' }, PH, { isEdit: false })).toEqual(
      {},
    );
  });

  it('validates email shape and trims/normalizes on submit', () => {
    for (const bad of ['nope', 'a@b', 'a @b.com', 'a@b .com', '']) {
      expect(validateMemberForm({ ...valid(), email: bad }, PH, { isEdit: false })).toMatchObject({
        email: expect.any(String),
      });
    }
    const normalized = normalizeMemberForm(valid());
    expect(normalized.email).toBe('juan.delacruz@example.com');
  });

  it('enforces the shared 8-72 password boundary on create only', () => {
    expect(
      validateMemberForm({ ...valid(), temporaryPassword: 'short' }, PH, { isEdit: false }),
    ).toMatchObject({ temporaryPassword: expect.any(String) });
    expect(
      validateMemberForm({ ...valid(), temporaryPassword: 'x'.repeat(73) }, PH, { isEdit: false }),
    ).toMatchObject({ temporaryPassword: expect.any(String) });
    // Edit mode never asks for a password.
    expect(validateMemberForm({ ...valid(), temporaryPassword: '' }, PH, { isEdit: true })).toEqual(
      {},
    );
  });

  it('validates the normalized phone against the dial rule', () => {
    // Letters / wrong rule fail; the composed E.164 value is stored.
    expect(
      validateMemberForm({ ...valid(), phoneNational: 'abc' }, PH, { isEdit: false }),
    ).toMatchObject({ phone: expect.any(String) });
    expect(
      validateMemberForm({ ...valid(), phoneNational: '812345678' }, PH, { isEdit: false }),
    ).toMatchObject({ phone: expect.any(String) });
    expect(normalizeMemberForm(valid()).phone).toBe('+639171234567');
    // Dial change re-targets the rule (US number under +1 passes).
    expect(
      validateMemberForm({ ...valid(), phoneDial: '1', phoneNational: '2125550142' }, PH, {
        isEdit: false,
      }),
    ).toEqual({});
  });

  it('rejects today, future, impossible, ancient, and underage birth dates', () => {
    const today = new Date().toISOString().slice(0, 10);
    const future = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const underage = `${new Date().getFullYear() - 10}-01-01`;
    for (const dob of [today, future, '2026-02-30', 'not-a-date', '1800-01-01', underage, '']) {
      expect(
        validateMemberForm({ ...valid(), dateOfBirth: dob }, PH, { isEdit: false }),
      ).toMatchObject({ dateOfBirth: expect.any(String) });
    }
  });

  it('requires a complete valid PH hierarchy and checks membership', () => {
    expect(
      validateMemberForm({ ...valid(), provinceCode: '' }, PH, { isEdit: false }),
    ).toMatchObject({ provinceCode: expect.any(String) });
    expect(
      validateMemberForm({ ...valid(), cityCode: '999999' }, PH, { isEdit: false }),
    ).toMatchObject({ cityCode: expect.any(String) });
    expect(
      validateMemberForm({ ...valid(), barangayCode: '' }, PH, { isEdit: false }),
    ).toMatchObject({ barangayCode: expect.any(String) });
    expect(validateMemberForm({ ...valid(), street: '  ' }, PH, { isEdit: false })).toMatchObject({
      street: expect.any(String),
    });
  });

  it('requires region + city text for non-PH countries', () => {
    const us = { ...valid(), countryCode: 'US', provinceCode: '', cityCode: '', barangayCode: '' };
    expect(validateMemberForm(us, PH, { isEdit: false })).toMatchObject({
      region: expect.any(String),
      city: expect.any(String),
    });
    expect(
      validateMemberForm({ ...us, region: 'California', city: 'Los Angeles' }, PH, {
        isEdit: false,
      }),
    ).toEqual({});
  });

  it('accepts an optional short suffix and rejects overlong ones', () => {
    expect(validateMemberForm({ ...valid(), nameSuffix: 'Jr.' }, PH, { isEdit: false })).toEqual(
      {},
    );
    expect(
      validateMemberForm({ ...valid(), nameSuffix: 'Esquire Junior' }, PH, { isEdit: false }),
    ).toMatchObject({ nameSuffix: expect.any(String) });
    expect(normalizeMemberForm({ ...valid(), nameSuffix: '  Sr. ' }).nameSuffix).toBe('Sr.');
    expect(normalizeMemberForm(valid()).nameSuffix).toBeUndefined();
  });

  it('caps the sponsor code and normalizes names on submit', () => {
    expect(
      validateMemberForm({ ...valid(), referralCode: 'x'.repeat(41) }, PH, { isEdit: false }),
    ).toMatchObject({ referralCode: expect.any(String) });
    const normalized = normalizeMemberForm({
      ...valid(),
      firstName: '  jUAN  ',
      middleInitial: 'd',
    });
    expect(normalized.firstName).toBe('Juan');
    expect(normalized.middleInitial).toBe('D');
    expect(
      normalizeMemberForm({ ...valid(), middleInitial: '', noMiddleInitial: true }).middleInitial,
    ).toBeUndefined();
  });
});
