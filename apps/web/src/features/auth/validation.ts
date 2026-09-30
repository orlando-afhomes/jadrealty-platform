/**
 * Frontend-only form validation for the auth preview screens (SCR-AUTH-001/002).
 *
 * UX validation only - the client is never the security boundary
 * (FRONTEND-ARCHITECTURE §8). No credentials are stored or logged anywhere.
 * Rules stay within documented requirements; the 8-character password minimum
 * is an ASSUMPTION (credential policy is TBD - REQUIREMENTS ASSUMPTION 1).
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** RFC 5321 mailbox ceiling - overlong input is rejected, never submitted. */
export const MAX_EMAIL_LENGTH = 254;
/** bcrypt truncation boundary (mirrors staffPasswordSchema max) - login caps input here. */
export const MAX_PASSWORD_LENGTH = 72;
export type LoginField = 'identifier' | 'password';

export interface LoginValues {
  identifier: string;
  password: string;
}

export type LoginErrors = Partial<Record<LoginField, string>>;

export const LOGIN_FIELD_ORDER: LoginField[] = ['identifier', 'password'];

function isValidEmail(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length <= MAX_EMAIL_LENGTH && EMAIL_RE.test(trimmed);
}

/**
 * Email-only identifier (phone login never worked - GoTrue email auth is the
 * sole mechanism, so a phone-shaped value can only fail server-side with a
 * confusing error). Submitted value is trimmed by the caller.
 */
export function validateLogin(values: LoginValues): LoginErrors {
  const errors: LoginErrors = {};

  const identifier = values.identifier.trim();
  if (!identifier) {
    errors.identifier = 'Enter your email address.';
  } else if (!isValidEmail(identifier)) {
    errors.identifier = 'Enter a valid email address.';
  }

  if (!values.password) {
    errors.password = 'Enter your password.';
  }

  return errors;
}

/** First field with an error, in display order - for focus management. */
export function firstInvalidField<T extends string>(
  errors: Partial<Record<T, string>>,
  order: readonly T[],
): T | undefined {
  return order.find((field) => errors[field] !== undefined);
}
