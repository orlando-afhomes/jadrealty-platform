/**
 * Human-readable registration identifiers (`JAD-REG-0001` style).
 *
 * `Registration.id` is TEXT PRIMARY KEY (not a uuid) and is already the
 * identifier every URL, lookup, display, storage prefix, and
 * `Member.registrationId` link uses - so the PK itself carries the new
 * shape. Assigned by the `registration_id_seq` sequence +
 * `registration_id_fill` trigger (see migration
 * `20261022000003_registration_seq_id.sql`). Pure helpers here mirror that
 * SQL so mocks/tests stay in sync; the database remains the source of truth.
 */

export const REGISTRATION_ID_RE = /^JAD-REG-[0-9]{4,}$/;
export const REGISTRATION_ID_PREFIX = 'JAD-REG-';
export const REGISTRATION_ID_PAD = 4;

/** Format a 1-based sequence value as `JAD-REG-0001` (grows past 4 digits). */
export function formatRegistrationId(seq: number): string {
  const n = Math.max(1, Math.floor(seq));
  return `${REGISTRATION_ID_PREFIX}${String(n).padStart(REGISTRATION_ID_PAD, '0')}`;
}

/** True when the value matches the persisted `JAD-REG-0001` shape. */
export function isRegistrationId(value: unknown): value is string {
  return typeof value === 'string' && REGISTRATION_ID_RE.test(value);
}

/** Numeric sequence behind an ID (`JAD-REG-0003` -> 3), null when malformed. */
export function parseRegistrationIdSeq(id: string): number | null {
  if (!isRegistrationId(id)) return null;
  const n = Number.parseInt(id.slice(REGISTRATION_ID_PREFIX.length), 10);
  return Number.isSafeInteger(n) && n >= 1 ? n : null;
}

/**
 * Next ID after the given existing IDs (mock/dev helper only).
 * Production uses the `registration_id_seq` sequence - never max+1 queries.
 */
export function nextMockRegistrationId(existing: (string | null | undefined)[]): string {
  let max = 0;
  for (const id of existing) {
    if (typeof id !== 'string') continue;
    const seq = parseRegistrationIdSeq(id);
    if (seq !== null && seq > max) max = seq;
  }
  return formatRegistrationId(max + 1);
}
