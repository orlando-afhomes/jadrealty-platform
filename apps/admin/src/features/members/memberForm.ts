import { z } from 'zod';

import {
  buildPhoneRuleForDial,
  capitalizePersonName,
  composeE164Phone,
  MAX_NAME_LENGTH,
  MAX_STREET_LENGTH,
  middleInitialSchema,
  normalizeMiddleInitial,
  normalizeName,
  parseBirthDate,
  personNameSchema,
  sanitizeMiddleInitial,
  sanitizePersonName,
  staffPasswordSchema,
  UNICODE_CONTROL_RE,
  validatePhoneNumber,
} from '@jad/contracts';
import type { CountryPhoneMeta } from '@jad/contracts';

/**
 * Create/Edit Member dialog validation - register parity.
 *
 * Every rule delegates to the `@jad/contracts` normalize-then-validate
 * core (`registration-validation.ts`) that `/register` and the API enforce,
 * so admin input, registration input, and server enforcement can never
 * disagree. Length/format checks always run on normalized values, never on
 * raw input - pasted, autofilled, and devtools-manipulated values hit the
 * same path as typed ones. The server (`POST /admin/members`) re-validates
 * everything; this module is UX-only.
 */

export const MEMBER_SPONSOR_CODE_MAX_LENGTH = 40;
const MAX_EMAIL_LENGTH = 254;

/** Fixed admin suffix choices ( Jr./Sr./numerals ) - a dropdown, never free text. */
export const MEMBER_NAME_SUFFIXES = ['Jr.', 'Sr.', 'II', 'III', 'IV', 'V'] as const;

export interface MemberFormValues {
  firstName: string;
  middleInitial: string;
  noMiddleInitial: boolean;
  lastName: string;
  /** Optional suffix (Jr./Sr./III) - register parity, max 10. */
  nameSuffix: string;
  email: string;
  temporaryPassword: string;
  phoneDial: string;
  phoneNational: string;
  dateOfBirth: string;
  gender: string;
  customGender: string;
  countryCode: string;
  /** Street/building/unit line (required for admin-created members). */
  street: string;
  provinceCode: string;
  cityCode: string;
  barangayCode: string;
  region: string;
  city: string;
  programCode: string;
  referralCode: string;
}

export interface MemberFormContext {
  /** Minimum age from public config (`QUALIFICATION_MIN_AGE`, default 18). */
  minAge: number;
  countries?: CountryPhoneMeta[];
  /** Loaded hierarchy options for client-side membership checks. */
  provinceCodes?: string[];
  cityCodes?: string[];
  barangayCodes?: string[];
}

function personNameError(value: string, label: string): string | undefined {
  if (!normalizeName(value)) return `${label} is required.`;
  const result = personNameSchema.safeParse(value);
  if (result.success) return undefined;
  if (result.error.issues.some((issue) => issue.code === 'too_big')) {
    return `${label} must be ${MAX_NAME_LENGTH} characters or less.`;
  }
  return `${label} may only contain letters, spaces, hyphens, and apostrophes.`;
}

function middleInitialError(value: string, noMiddleInitial: boolean): string | undefined {
  if (noMiddleInitial) return undefined;
  if (!value.trim()) return 'Enter the middle initial or select N/A.';
  if (/^[A-Z]$/.test(normalizeMiddleInitial(value))) return undefined;
  return 'Use one letter (A–Z) for the middle initial, or select N/A.';
}

function emailError(value: string): string | undefined {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return 'Email is required.';
  if (normalized.length > MAX_EMAIL_LENGTH) {
    return `Email must be ${MAX_EMAIL_LENGTH} characters or less.`;
  }
  if (!z.string().email().safeParse(normalized).success) return 'Enter a valid email address.';
  return undefined;
}

function passwordError(value: string): string | undefined {
  if (!value) return 'Temporary password is required.';
  const result = staffPasswordSchema.safeParse(value);
  if (result.success) return undefined;
  if (value.length < 8) return 'Password must be at least 8 characters.';
  return 'Password must be at most 72 characters.';
}

function phoneError(
  national: string,
  dial: string,
  countries: CountryPhoneMeta[] | undefined,
): string | undefined {
  if (!national.trim()) return 'Phone is required.';
  if (
    !validatePhoneNumber(composeE164Phone(dial, national), buildPhoneRuleForDial(countries, dial))
  ) {
    return 'Enter a valid phone number for the selected country code.';
  }
  return undefined;
}

function birthDateError(dateOfBirth: string, minAge: number): string | undefined {
  if (!dateOfBirth.trim()) return 'Date of birth is required.';
  const parsed = parseBirthDate(dateOfBirth);
  if (!parsed.ok) return 'Enter a valid date of birth.';
  if ((parsed.age ?? 0) < minAge) {
    return `The member must be at least ${minAge} years old.`;
  }
  return undefined;
}

function streetError(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return 'Street address is required.';
  if (trimmed.length > MAX_STREET_LENGTH) {
    return `Street address must be ${MAX_STREET_LENGTH} characters or less.`;
  }
  if (UNICODE_CONTROL_RE.test(trimmed)) return 'Street address contains invalid characters.';
  return undefined;
}

function regionCityError(value: string, label: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return `${label} is required.`;
  if (trimmed.length > MAX_NAME_LENGTH) {
    return `${label} must be ${MAX_NAME_LENGTH} characters or less.`;
  }
  if (UNICODE_CONTROL_RE.test(trimmed)) return `${label} contains invalid characters.`;
  return undefined;
}

/** Full submit validation - every field, normalized values only. */
export function validateMemberForm(
  values: MemberFormValues,
  ctx: MemberFormContext,
  opts: { isEdit: boolean },
): Record<string, string> {
  const errors: Record<string, string> = {};
  const first = personNameError(values.firstName, 'First name');
  if (first) errors.firstName = first;
  const last = personNameError(values.lastName, 'Last name');
  if (last) errors.lastName = last;
  const mi = middleInitialError(values.middleInitial, values.noMiddleInitial);
  if (mi) errors.middleInitial = mi;
  const suffix = values.nameSuffix.trim();
  if (suffix && !(MEMBER_NAME_SUFFIXES as readonly string[]).includes(suffix)) {
    errors.nameSuffix = 'Select a valid name suffix.';
  }
  if (!opts.isEdit) {
    const email = emailError(values.email);
    if (email) errors.email = email;
    const password = passwordError(values.temporaryPassword);
    if (password) errors.temporaryPassword = password;
  }
  const phone = phoneError(values.phoneNational, values.phoneDial, ctx.countries);
  if (phone) errors.phone = phone;
  const dob = birthDateError(values.dateOfBirth, ctx.minAge);
  if (dob) errors.dateOfBirth = dob;
  if (!values.gender.trim()) errors.gender = 'Gender is required.';
  else if (values.gender === 'Others') {
    const custom = values.customGender.trim();
    if (!custom) errors.customGender = 'Please specify gender.';
    else if (custom.length > MAX_NAME_LENGTH) {
      errors.customGender = `Gender must be ${MAX_NAME_LENGTH} characters or less.`;
    }
  }
  if (!values.countryCode) errors.country = 'Country is required.';
  const street = streetError(values.street);
  if (street) errors.street = street;
  if (values.countryCode === 'PH') {
    if (!values.provinceCode.trim()) errors.provinceCode = 'Select a province.';
    else if (ctx.provinceCodes && !ctx.provinceCodes.includes(values.provinceCode.trim())) {
      errors.provinceCode = 'Select a valid province.';
    }
    if (!values.cityCode.trim()) errors.cityCode = 'Select a city/municipality.';
    else if (ctx.cityCodes && !ctx.cityCodes.includes(values.cityCode.trim())) {
      errors.cityCode = 'Select a valid city/municipality.';
    }
    if (!values.barangayCode.trim()) errors.barangayCode = 'Select a barangay.';
    else if (ctx.barangayCodes && !ctx.barangayCodes.includes(values.barangayCode.trim())) {
      errors.barangayCode = 'Select a valid barangay for the chosen city.';
    }
  } else if (values.countryCode) {
    const region = regionCityError(values.region, 'Region/state');
    if (region) errors.region = region;
    const city = regionCityError(values.city, 'City');
    if (city) errors.city = city;
  }
  const sponsor = values.referralCode.trim();
  if (sponsor.length > MEMBER_SPONSOR_CODE_MAX_LENGTH) {
    errors.referralCode = `Sponsor code must be ${MEMBER_SPONSOR_CODE_MAX_LENGTH} characters or less.`;
  }
  return errors;
}

export interface NormalizedMemberForm {
  firstName: string;
  middleInitial?: string;
  lastName: string;
  nameSuffix?: string;
  email: string;
  temporaryPassword: string;
  /** Canonical E.164 (`+<dial><national>`). */
  phone: string;
  phoneDial: string;
  dateOfBirth: string;
  gender: string;
  countryCode: string;
  street: string;
  provinceCode?: string;
  cityCode?: string;
  barangayCode?: string;
  region?: string;
  city?: string;
  programCode: string;
  referralCode?: string;
}

/**
 * Normalize validated values for submission - the same normalize-then-submit
 * shape `/register` sends (title-cased names, uppercased initial, E.164
 * phone, trimmed everything). Call only after `validateMemberForm` passes.
 */
export function normalizeMemberForm(values: MemberFormValues): NormalizedMemberForm {
  const mi = values.noMiddleInitial ? '' : normalizeMiddleInitial(values.middleInitial);
  const suffix = values.nameSuffix.trim();
  return {
    firstName: capitalizePersonName(sanitizePersonName(values.firstName)).trim(),
    ...(mi ? { middleInitial: mi } : {}),
    lastName: capitalizePersonName(sanitizePersonName(values.lastName)).trim(),
    ...(suffix ? { nameSuffix: suffix } : {}),
    email: values.email.trim().toLowerCase(),
    temporaryPassword: values.temporaryPassword,
    // Already validated by `validateMemberForm` - compose only.
    phone: composeE164Phone(values.phoneDial, values.phoneNational),
    phoneDial: values.phoneDial,
    dateOfBirth: values.dateOfBirth.trim(),
    gender: values.gender === 'Others' ? values.customGender.trim() : values.gender,
    countryCode: values.countryCode,
    street: values.street.trim(),
    ...(values.countryCode === 'PH'
      ? {
          provinceCode: values.provinceCode.trim() || undefined,
          cityCode: values.cityCode.trim() || undefined,
          barangayCode: values.barangayCode.trim() || undefined,
        }
      : {
          region: values.region.trim() || undefined,
          city: values.city.trim() || undefined,
        }),
    programCode: values.programCode,
    ...(values.referralCode.trim() ? { referralCode: values.referralCode.trim() } : {}),
  };
}

/** Live input shapers (typing + paste) mirroring `/register` onChange behavior. */
export const shapePersonNameInput = sanitizePersonName;
export const shapeMiddleInitialInput = sanitizeMiddleInitial;
export const titleCasePersonName = capitalizePersonName;

/** Re-exported for the dialog's blur shaping (single source stays in contracts). */
export { middleInitialSchema, personNameSchema };
