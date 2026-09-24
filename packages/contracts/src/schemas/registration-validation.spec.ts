import { describe, expect, it } from 'vitest';

import {
  GENERIC_E164_RULE,
  MAX_BIRTH_AGE_YEARS,
  MAX_NAME_LENGTH,
  birthDateSchema,
  genericAddressSchema,
  middleInitialSchema,
  normalizeMiddleInitial,
  normalizeName,
  normalizePhoneDigits,
  parseBirthDate,
  personNameSchema,
  philippineAddressSchema,
  capitalizePersonName,
  sanitizeMiddleInitial,
  sanitizePersonName,
  toPhoneRule,
  validatePhoneNumber,
  type PhoneCountryRule,
} from './registration-validation';

const PH_RULE: PhoneCountryRule = {
  countryCode: 'PH',
  dialCode: '63',
  nationalLengths: [10],
  nationalPattern: /^9\d{9}$/,
};

const US_RULE: PhoneCountryRule = {
  countryCode: 'US',
  dialCode: '1',
  nationalLengths: [10],
};

describe('normalizeName', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeName('  Juan   Dela  Cruz  ')).toBe('Juan Dela Cruz');
  });

  it('normalizes curly apostrophes to straight', () => {
    expect(normalizeName('O’Brien')).toBe("O'Brien");
  });
});

describe('sanitizePersonName', () => {
  it.each(['John', 'John Paul', 'Juan Dela Cruz', "O'Brien", 'Anne-Marie', 'Peña', 'Ñoño'])(
    'keeps valid name %s untouched',
    (name) => {
      expect(sanitizePersonName(name)).toBe(name);
    },
  );

  it('removes digits from typed input', () => {
    expect(sanitizePersonName('John123')).toBe('John');
  });

  it('removes special characters from typed input', () => {
    expect(sanitizePersonName('John@Doe')).toBe('JohnDoe');
    expect(sanitizePersonName('J#o$h%n!')).toBe('John');
  });

  it('folds curly apostrophes and strips control characters', () => {
    expect(sanitizePersonName('O’Brien')).toBe("O'Brien");
    expect(sanitizePersonName('John\u0007Doe')).toBe('JohnDoe');
  });

  it('leaves spacing alone for the submit normalizer to collapse', () => {
    expect(sanitizePersonName('John  Paul')).toBe('John  Paul');
  });
});

describe('personNameSchema', () => {
  it.each(['Juan', 'De la Cruz', "O'Brien", 'Anne-Marie', 'Peña', 'Ñoño'])(
    'accepts legitimate name %s',
    (name) => {
      expect(personNameSchema.safeParse(name).success).toBe(true);
    },
  );

  it.each(['Juan3', 'J@ne', 'Mary_Jane', '', '   ', 'John\u0007Doe'])(
    'rejects invalid name %s',
    (name) => {
      expect(personNameSchema.safeParse(name).success).toBe(false);
    },
  );

  it(`rejects names longer than ${MAX_NAME_LENGTH} characters`, () => {
    expect(personNameSchema.safeParse('A'.repeat(MAX_NAME_LENGTH + 1)).success).toBe(false);
    expect(personNameSchema.safeParse('A'.repeat(MAX_NAME_LENGTH)).success).toBe(true);
  });
});

describe('capitalizePersonName', () => {
  it.each([
    ['orlando', 'Orlando'],
    ['Orlando', 'Orlando'],
    ['orlando dela cruz', 'Orlando Dela Cruz'],
    ['JUAN dela CRUZ', 'Juan Dela Cruz'],
    ["o'brien", "O'Brien"],
    ['anne-marie', 'Anne-Marie'],
    ['ñoño', 'Ñoño'],
    ['', ''],
  ])('formats %s as %s', (input, expected) => {
    expect(capitalizePersonName(input)).toBe(expected);
  });

  it('leaves spacing alone for the submit normalizer to collapse', () => {
    expect(capitalizePersonName('john  paul')).toBe('John  Paul');
  });
});

describe('sanitizeMiddleInitial', () => {
  it.each([
    ['A', 'A'],
    ['a', 'A'],
    ['b', 'B'],
  ])('keeps single letter %s uppercased as %s', (input, expected) => {
    expect(sanitizeMiddleInitial(input)).toBe(expected);
  });

  it('keeps only the first letter when more are entered', () => {
    expect(sanitizeMiddleInitial('AB')).toBe('A');
    expect(sanitizeMiddleInitial('A1')).toBe('A');
  });

  it('finds the first valid letter in pasted text', () => {
    expect(sanitizeMiddleInitial('1A')).toBe('A');
    expect(sanitizeMiddleInitial('@B')).toBe('B');
  });

  it.each(['123', '@', '#', '.', '', '   '])('rejects %s to empty', (value) => {
    expect(sanitizeMiddleInitial(value)).toBe('');
  });

  it('accepts an international letter like the name fields', () => {
    expect(sanitizeMiddleInitial('Ñ')).toBe('Ñ');
  });
});

describe('middleInitialSchema', () => {
  it('accepts empty (explicit N/A normalizes to empty)', () => {
    expect(middleInitialSchema.safeParse('').success).toBe(true);
    expect(middleInitialSchema.safeParse(undefined).success).toBe(true);
  });

  it('accepts a single letter and normalizes period + case', () => {
    expect(normalizeMiddleInitial('A')).toBe('A');
    expect(normalizeMiddleInitial('a')).toBe('A');
    expect(normalizeMiddleInitial('A.')).toBe('A');
    expect(middleInitialSchema.safeParse('A.').success).toBe(true);
  });

  it.each(['1', '-', 'AB', 'A..', '.'])('rejects invalid initial %s', (value) => {
    expect(middleInitialSchema.safeParse(value).success).toBe(false);
  });
});

describe('normalizePhoneDigits', () => {
  it('strips separators but keeps a single leading +', () => {
    expect(normalizePhoneDigits('+63 (918) 555-0101')).toBe('+639185550101');
    expect(normalizePhoneDigits('0918 555 0101')).toBe('09185550101');
  });

  it('rejects letters by returning null', () => {
    expect(normalizePhoneDigits('0918-CALL-ME')).toBeNull();
  });
});

describe('validatePhoneNumber (Philippines)', () => {
  it.each(['09185550101', '+639185550101', '639185550101', '0918 555 0101', '+63-918-555-0101'])(
    'accepts %s and normalizes to E.164',
    (input) => {
      expect(validatePhoneNumber(input, PH_RULE)).toBe('+639185550101');
    },
  );

  it.each(['08185550101', '0918555010', '091855501011', '9185550101', '', '   ', '+63918555ABCD'])(
    'rejects %s',
    (input) => {
      expect(validatePhoneNumber(input, PH_RULE)).toBeNull();
    },
  );
});

describe('toPhoneRule', () => {
  it('builds a curated rule from metadata', () => {
    expect(
      toPhoneRule({
        countryCode: 'PH',
        dialCode: '63',
        min: 10,
        max: 10,
        pattern: '^9[0-9]{9}$',
      }),
    ).toMatchObject({ countryCode: 'PH', dialCode: '63', nationalLengths: [10] });
  });

  it('falls back to generic E.164 on missing or malformed metadata', () => {
    expect(toPhoneRule({})).toMatchObject({ dialCode: '' });
    expect(
      toPhoneRule({ dialCode: '6+3!', min: 'ten', max: -1, pattern: '([invalid' }),
    ).toMatchObject({ dialCode: '' });
    expect(toPhoneRule({ dialCode: '63', min: 11, max: 10 })).toMatchObject({ dialCode: '' });
  });
});

describe('validatePhoneNumber (other countries)', () => {  it('validates NANP numbers for US', () => {
    expect(validatePhoneNumber('+14155552671', US_RULE)).toBe('+14155552671');
    expect(validatePhoneNumber('14155552671', US_RULE)).toBe('+14155552671');
    expect(validatePhoneNumber('+1415555267', US_RULE)).toBeNull();
  });

  it('falls back to generic E.164 (7-15 digits) without a country rule', () => {
    expect(validatePhoneNumber('+442071234567', GENERIC_E164_RULE)).toBe('+442071234567');
    expect(validatePhoneNumber('123456', GENERIC_E164_RULE)).toBeNull();
    expect(validatePhoneNumber('+1234567890123456', GENERIC_E164_RULE)).toBeNull();
  });
});

describe('parseBirthDate', () => {
  const NOW = new Date('2026-09-23T00:00:00Z');

  it('accepts a valid adult birth date with correct age', () => {
    const parsed = parseBirthDate('1990-01-01', NOW);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.age).toBe(36);
  });

  it.each(['2026-09-23', '2026-09-24', '2030-01-01'])('rejects today/future date %s', (value) => {
    expect(parseBirthDate(value, NOW).ok).toBe(false);
  });

  it.each(['2026-02-30', 'not-a-date', '1990-13-01', '1990-00-10', '  '])(
    'rejects invalid date %s',
    (value) => {
      expect(parseBirthDate(value, NOW).ok).toBe(false);
    },
  );

  it(`rejects birth dates older than ${MAX_BIRTH_AGE_YEARS} years`, () => {
    expect(parseBirthDate('1890-01-01', NOW).ok).toBe(false);
    expect(parseBirthDate('1906-09-23', NOW).ok).toBe(true);
  });
});

describe('birthDateSchema', () => {
  const NOW = new Date('2026-09-23T00:00:00');

  it('rejects underage applicants', () => {
    expect(birthDateSchema(18, NOW).safeParse('2010-09-23').success).toBe(false);
    expect(birthDateSchema(18, NOW).safeParse('2008-09-23').success).toBe(true);
  });

  it('rejects malformed values even when they reach the schema', () => {
    expect(birthDateSchema(18, NOW).safeParse('  ').success).toBe(false);
    expect(birthDateSchema(18, NOW).safeParse('09/23/2008').success).toBe(false);
  });
});

describe('philippineAddressSchema', () => {
  it('requires province, city, and barangay codes', () => {
    expect(
      philippineAddressSchema.safeParse({
        provinceCode: '0128',
        cityCode: '012801',
        barangayCode: '012801001',
        street: '123 Main St',
      }).success,
    ).toBe(true);
    expect(
      philippineAddressSchema.safeParse({ provinceCode: '0128', cityCode: '012801' }).success,
    ).toBe(false);
  });

  it('rejects whitespace-only codes and overlong street', () => {
    expect(
      philippineAddressSchema.safeParse({
        provinceCode: '   ',
        cityCode: '012801',
        barangayCode: '012801001',
      }).success,
    ).toBe(false);
    expect(
      philippineAddressSchema.safeParse({
        provinceCode: '0128',
        cityCode: '012801',
        barangayCode: '012801001',
        street: 'x'.repeat(121),
      }).success,
    ).toBe(false);
  });
});

describe('genericAddressSchema', () => {
  it('requires region and city text for non-PH countries', () => {
    expect(
      genericAddressSchema.safeParse({ region: 'California', city: 'Los Angeles' }).success,
    ).toBe(true);
    expect(genericAddressSchema.safeParse({ region: 'California' }).success).toBe(false);
    expect(genericAddressSchema.safeParse({ region: '   ', city: 'LA' }).success).toBe(false);
  });
});
