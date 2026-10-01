import { z } from 'zod';

/**
 * Registration field validators - SINGLE SOURCE for client UX checks and
 * server enforcement (BR-REG-001..013). Every rule here runs in BOTH layers:
 * the web form calls the pure functions for immediate feedback, the API
 * enforces the Zod schemas (the client is never the security boundary).
 *
 * Pipeline is always normalize-then-validate: pasted values, autofill, and
 * manipulated input are normalized first so length/format checks run on the
 * real value, never on raw padding.
 */

/** Maximum length for person names, regions, and cities (matches genderOther precedent). */
export const MAX_NAME_LENGTH = 60;

/** Maximum plausible age in years - birth dates older than this are rejected. */
export const MAX_BIRTH_AGE_YEARS = 120;

/** Maximum length for the free-text street/building/unit line. */
export const MAX_STREET_LENGTH = 120;

/** Letters (+ combining marks) with single separators: spaces, hyphens, apostrophes. */
const NAME_RE = /^[\p{L}\p{M}]+(?:[ '\-][\p{L}\p{M}]+)*$/u;

/** Unicode control/format/surrogate code points - never valid in user text. */
export const UNICODE_CONTROL_RE = /[\p{C}]/u;

/** Strict calendar date: YYYY-MM-DD only (no datetimes, no slashes). */
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Normalize a free-text name: trim, collapse all internal whitespace runs
 * (spaces, tabs, pasted newlines) to single spaces, fold curly apostrophes
 * to straight. Returns '' for blank input.
 */
export function normalizeName(value: string): string {
  return value.replace(/['’]/g, "'").replace(/\s+/g, ' ').trim();
}

/**
 * Strip characters that can never appear in a person name - input shaping
 * for typing/paste, mirroring the `personNameSchema` charset (Unicode
 * letters/marks plus space, hyphen, apostrophe; curly apostrophes fold to
 * straight). Digits, symbols, and control characters are removed outright.
 * Spacing is left untouched so mid-string edits don't fight the cursor;
 * `normalizeName` still collapses whitespace on submit. The Zod schema
 * remains the enforcement boundary; this is UX-only.
 */
export function sanitizePersonName(value: string): string {
  return value.replace(/['’]/g, "'").replace(/[^\p{L}\p{M} '\-]/gu, '');
}

/**
 * Title-case a person-name input as-typed: the first letter and every
 * letter following a space, hyphen, or apostrophe becomes uppercase, all
 * other letters lowercase (`JUAN dela CRUZ` → `Juan Dela Cruz`,
 * `o'brien` → `O'Brien`). Operates on already-sanitized input so only name
 * characters are present; spacing is untouched. Unicode-aware via the
 * built-in case mapping. UX-only shaping - the schema stays the boundary.
 */
export function capitalizePersonName(value: string): string {
  return value
    .toLowerCase()
    .replace(/(^|[\s'\-])(\p{L})/gu, (_, boundary: string, letter: string) => {
      return `${boundary}${letter.toUpperCase()}`;
    });
}

/** Person-name schema: normalized, required, length-capped, charset-pinned. */
export const personNameSchema = z
  .string()
  .transform(normalizeName)
  .pipe(z.string().min(1).max(MAX_NAME_LENGTH).regex(NAME_RE));

/**
 * Normalize a middle initial: trim; a single letter with an optional
 * trailing period (`A.`/`a`) folds to its uppercase form; the explicit N/A
 * choice arrives as empty and stays empty. Anything else passes through
 * untouched so the schema rejects it.
 */
export function normalizeMiddleInitial(value: string): string {
  const trimmed = value.trim();
  if (trimmed === '') return '';
  const match = /^([A-Za-z])\.?$/.exec(trimmed);
  return match?.[1] ? match[1].toUpperCase() : trimmed;
}

/** Middle-initial schema: empty (N/A) or exactly one A-Z letter. */
export const middleInitialSchema = z.preprocess(
  (value) => (typeof value === 'string' ? normalizeMiddleInitial(value) : value),
  z.string().max(1).regex(/^[A-Z]?$/).optional(),
);

/**
 * Keep only the first letter of middle-initial input, uppercased - shaping
 * for typing/paste, mirroring the person-name charset (Unicode letters, so
 * international initials behave like the name fields). Digits, symbols
 * (including the `.` abbreviation dot - `normalizeMiddleInitial` folds it
 * away regardless), and control characters never enter state; anything past
 * the first letter is dropped. The schema remains the enforcement boundary.
 */
export function sanitizeMiddleInitial(value: string): string {
  const match = /\p{L}/u.exec(value);
  return match?.[0]?.toUpperCase() ?? '';
}

/** Clean free text: trimmed, required, length-capped, no control characters. */
function cleanText(max: number) {
  return z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((value) => !UNICODE_CONTROL_RE.test(value));
}

export interface PhoneCountryRule {
  /** ISO alpha-2 code this rule applies to ('' for the generic fallback). */
  countryCode: string;
  /** National dial code digits without '+', e.g. '63' ('' for generic). */
  dialCode: string;
  /**
   * Allowed lengths of the national significant number (digits after the
   * dial code / trunk prefix), e.g. [10] for PH (`9185550101`) and US.
   */
  nationalLengths: number[];
  /** Optional stricter shape for the national significant number. */
  nationalPattern?: RegExp;
}

/**
 * Generic ITU-T E.164 fallback for countries without a curated rule:
 * 7-15 significant digits with an optional leading '+'.
 */
export const GENERIC_E164_RULE: PhoneCountryRule = {
  countryCode: '',
  dialCode: '',
  nationalLengths: [7, 8, 9, 10, 11, 12, 13, 14, 15],
};

export interface PhoneRuleInput {
  countryCode?: unknown;
  dialCode?: unknown;
  min?: unknown;
  max?: unknown;
  pattern?: unknown;
}

/**
 * Coerce operator-curated phone metadata into an effective rule, falling
 * back to generic E.164 when any part is missing or malformed. Single
 * kernel shared by the DB seeder shape, the API row shape, and the client
 * config shape - malformed metadata can never produce a broken rule.
 */
export function toPhoneRule(input: PhoneRuleInput): PhoneCountryRule {
  const fallback: PhoneCountryRule = { ...GENERIC_E164_RULE };
  const dial =
    typeof input.dialCode === 'string' && /^[0-9]{1,4}$/.test(input.dialCode)
      ? input.dialCode
      : '';
  if (!dial) return fallback;
  const bound = (value: unknown): number | null => {
    const n =
      typeof value === 'number' ? value : value === '' || value == null ? NaN : Number(value);
    return Number.isInteger(n) && n > 0 && n <= 15 ? n : null;
  };
  const min = bound(input.min);
  const max = bound(input.max);
  if (min === null || max === null || min > max) return fallback;
  const nationalLengths: number[] = [];
  for (let length = min; length <= max; length += 1) nationalLengths.push(length);
  let nationalPattern: RegExp | undefined;
  if (typeof input.pattern === 'string' && input.pattern.length > 0) {
    try {
      nationalPattern = new RegExp(input.pattern);
    } catch {
      nationalPattern = undefined;
    }
  }
  return {
    countryCode: typeof input.countryCode === 'string' ? input.countryCode : '',
    dialCode: dial,
    nationalLengths,
    ...(nationalPattern ? { nationalPattern } : {}),
  };
}

/**
 * Normalize raw phone input: reject letters outright (null), keep one
 * leading '+' at most, strip spaces/hyphens/parens/dots. Returns the
 * compact form (`+639...` or `09...`) or null when unusable.
 */
export function normalizePhoneDigits(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === '' || /[a-zA-Z]/.test(trimmed)) return null;
  if (!/^\+?[\d\s().\-]*\d[\d\s().\-]*$/.test(trimmed)) return null;
  const digits = trimmed.replace(/[^\d]/g, '');
  if (digits === '') return null;
  return trimmed.startsWith('+') ? `+${digits}` : digits;
}

export interface ParsedBirthDate {
  ok: boolean;
  /** Midnight-local birth date (present when ok). */
  date?: Date;
  /** Completed years at `now` (present when ok). */
  age?: number;
}

/**
 * Strict birth-date parse: YYYY-MM-DD shape, real calendar date
 * (2026-02-30 fails the round-trip), strictly before today, and no older
 * than MAX_BIRTH_AGE_YEARS. Time-of-day and timezone cannot smuggle a
 * boundary value past - comparison is calendar-date based.
 */
export function parseBirthDate(value: string, now: Date = new Date()): ParsedBirthDate {
  const match = DATE_RE.exec(value.trim());
  if (!match) return { ok: false };
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return { ok: false };
  }
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (date.getTime() >= today.getTime()) return { ok: false };
  if (year < today.getFullYear() - MAX_BIRTH_AGE_YEARS) return { ok: false };
  let age = today.getFullYear() - year;
  if (
    today.getMonth() < month - 1 ||
    (today.getMonth() === month - 1 && today.getDate() < day)
  ) {
    age -= 1;
  }
  return { ok: true, date, age };
}

/**
 * Latest birth date satisfying a minimum age, as `YYYY-MM-DD` (drives date
 * input `max` attributes - typed values still go through `parseBirthDate`).
 */
export function cutoffDateForMinAge(minAge: number, now: Date = new Date()): string {
  const y = now.getFullYear() - minAge;
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Birth-date schema: strict parse + configurable minimum age. */
export function birthDateSchema(minAge: number, now: Date = new Date()) {
  return z
    .string()
    .trim()
    .min(1)
    .refine((value) => {
      const parsed = parseBirthDate(value, now);
      return parsed.ok && (parsed.age ?? 0) >= minAge;
    });
}

/**
 * Validate a phone number against a country's rule. Returns the canonical
 * E.164 form (`+<dial><national>`) or null. Curated rules resolve local
 * trunk (`0...`) and bare dial-code forms; the generic rule accepts any
 * 7-15 digit international number. Length/format always apply to the
 * normalized value, never to raw input.
 */
export function validatePhoneNumber(input: string, rule: PhoneCountryRule): string | null {
  const cleaned = normalizePhoneDigits(input);
  if (!cleaned) return null;
  const digits = cleaned.startsWith('+') ? cleaned.slice(1) : cleaned;
  if (rule.dialCode === '') {
    if (!rule.nationalLengths.includes(digits.length)) return null;
    return `+${digits}`;
  }
  let national: string;
  if (digits.startsWith(rule.dialCode)) {
    national = digits.slice(rule.dialCode.length);
  } else if (digits.startsWith('0')) {
    national = digits.slice(1);
  } else {
    return null;
  }
  if (!rule.nationalLengths.includes(national.length)) return null;
  if (rule.nationalPattern && !rule.nationalPattern.test(national)) return null;
  return `+${rule.dialCode}${national}`;
}

/** Phone metadata for one country, as served by GET /config/public. */
export interface CountryPhoneMeta {
  code: string;
  name: string;
  dialCode?: string;
  phoneMin?: number;
  phoneMax?: number;
  phonePattern?: string;
}

/**
 * Build the effective phone rule for a country from config metadata,
 * falling back to generic E.164 when the country carries no (valid) rule.
 */
export function buildPhoneRule(
  countries: CountryPhoneMeta[] | undefined,
  countryCode: string,
): PhoneCountryRule {
  const row = countries?.find((candidate) => candidate.code === countryCode);
  if (!row) return { ...GENERIC_E164_RULE };
  return toPhoneRule({
    countryCode,
    dialCode: row.dialCode,
    min: row.phoneMin,
    max: row.phoneMax,
    pattern: row.phonePattern,
  });
}

/** One entry of a phone field's country-code dropdown. */
export interface DialCodeOption {
  /** Dial digits without '+', e.g. '63'. */
  dial: string;
  /** ISO code of the (first) country carrying this dial. */
  countryCode: string;
  label: string;
}

const DIAL_RE = /^[0-9]{1,4}$/;

/**
 * Dial-code dropdown options from public config. Countries without a valid
 * dial code are skipped; duplicate dials collapse to their first country
 * (shared dials such as +1 validate against that country's rule).
 */
export function dialCodeOptions(
  countries: CountryPhoneMeta[] | undefined,
): DialCodeOption[] {
  const options: DialCodeOption[] = [];
  for (const row of countries ?? []) {
    if (!row.dialCode || !DIAL_RE.test(row.dialCode)) continue;
    if (options.some((option) => option.dial === row.dialCode)) continue;
    options.push({
      dial: row.dialCode,
      countryCode: row.code,
      label: `+${row.dialCode} ${row.name}`,
    });
  }
  return options;
}

/**
 * Effective phone rule for a selected dial code (first country carrying the
 * dial wins), falling back to generic E.164 for unknown dials.
 */
export function buildPhoneRuleForDial(
  countries: CountryPhoneMeta[] | undefined,
  dial: string,
): PhoneCountryRule {
  const row = countries?.find((candidate) => candidate.dialCode === dial);
  if (!row) return { ...GENERIC_E164_RULE };
  return toPhoneRule({
    countryCode: row.code,
    dialCode: row.dialCode,
    min: row.phoneMin,
    max: row.phoneMax,
    pattern: row.phonePattern,
  });
}

/** Largest national length a rule allows (drives input truncation). */
export function maxNationalLength(rule: PhoneCountryRule): number {
  return rule.nationalLengths.length > 0 ? Math.max(...rule.nationalLengths) : 15;
}

/**
 * Sanitize raw phone input to national digits capped at `maxLen`. Strips
 * every non-digit, then drops an embedded dial code or trunk `0` only when
 * the digit string overflows (a bare national number never exceeds `maxLen`,
 * so overflow proves a prefix rode along - paste, autofill, `+63 ...`). The
 * result is always slice-capped, so typing and pasting can never exceed the
 * country's limit; length/format enforcement stays in `validatePhoneNumber`.
 */
export function sanitizeNationalInput(rawValue: string, dial: string, maxLen: number): string {
  let digits = rawValue.replace(/\D/g, '');
  if (digits === '') return '';
  if (dial !== '' && digits.length > maxLen && digits.startsWith(dial)) {
    digits = digits.slice(dial.length);
  }
  while (digits.startsWith('0') && digits.length > maxLen) {
    digits = digits.slice(1);
  }
  return digits.slice(0, maxLen);
}

/**
 * Split a stored phone value (canonical E.164 `+<dial><national>`) into dial
 * + national parts. Never truncates - overlong values stay overlong so
 * validation flags them.
 */
export function splitStoredPhone(
  stored: string,
  countries: CountryPhoneMeta[] | undefined,
  countryCode: string,
): { dial: string; national: string } {
  const rows = countries ?? [];
  const verified = rows.find((row) => row.code === countryCode);
  const verifiedDial =
    verified?.dialCode && DIAL_RE.test(verified.dialCode) ? verified.dialCode : '';
  const digits = stored.replace(/\D/g, '');
  if (digits === '') return { dial: verifiedDial, national: '' };
  // Prefer the verified country's dial for the bare dial-code form.
  if (verifiedDial !== '' && digits.startsWith(verifiedDial)) {
    return { dial: verifiedDial, national: digits.slice(verifiedDial.length) };
  }
  const other = rows.find(
    (row) => row.dialCode && DIAL_RE.test(row.dialCode) && digits.startsWith(row.dialCode),
  );
  if (other?.dialCode) return { dial: other.dialCode, national: digits.slice(other.dialCode.length) };
  if (digits.startsWith('0') && verifiedDial !== '') {
    return { dial: verifiedDial, national: digits.slice(1) };
  }
  return { dial: verifiedDial, national: digits };
}

/** Compose the canonical E.164 submit value from dial + national digits. */
export function composeE164Phone(dial: string, national: string): string {
  const digits = national.replace(/\D/g, '');
  if (digits === '') return '';
  return dial !== '' ? `+${dial}${digits}` : `+${digits}`;
}

/** Philippine structured address: province → city → barangay codes + optional street. */
export const philippineAddressSchema = z.object({
  provinceCode: z.string().trim().min(1).max(10),
  cityCode: z.string().trim().min(1).max(10),
  barangayCode: z.string().trim().min(1).max(10),
  street: z
    .string()
    .trim()
    .max(MAX_STREET_LENGTH)
    .refine((value) => !UNICODE_CONTROL_RE.test(value))
    .optional(),
});

/** Generic structured address for countries without a location dataset. */
export const genericAddressSchema = z.object({
  region: cleanText(MAX_NAME_LENGTH),
  city: cleanText(MAX_NAME_LENGTH),
  street: z
    .string()
    .trim()
    .max(MAX_STREET_LENGTH)
    .refine((value) => !UNICODE_CONTROL_RE.test(value))
    .optional(),
});
