/**
 * Human-readable member codes (`JAD-MEM-0001` style).
 *
 * `Member.id` stays the auth uuid (PK/FK). `Member.memberCode` is the
 * admin-facing identifier: unique, stable, persisted, assigned by the
 * `member_code_seq` sequence + `member_code_fill` trigger (see migrations
 * `20261022000001_member_code.sql` + `20261022000002_member_code_mem_format.sql`).
 * Pure helpers here mirror that SQL so mocks/tests stay in sync; the database
 * remains the source of truth.
 */

export const MEMBER_CODE_RE = /^JAD-MEM-[0-9]{4,}$/;
export const MEMBER_CODE_PREFIX = 'JAD-MEM-';
export const MEMBER_CODE_PAD = 4;

/** Format a 1-based sequence value as `JAD-MEM-0001` (grows past 4 digits). */
export function formatMemberCode(seq: number): string {
  const n = Math.max(1, Math.floor(seq));
  return `${MEMBER_CODE_PREFIX}${String(n).padStart(MEMBER_CODE_PAD, '0')}`;
}

/** True when the value matches the persisted `JAD-MEM-0001` shape. */
export function isMemberCode(value: unknown): value is string {
  return typeof value === 'string' && MEMBER_CODE_RE.test(value);
}

/** Numeric sequence behind a code (`JAD-MEM-0001` -> 1), null when malformed. */
export function parseMemberCodeSeq(code: string): number | null {
  if (!isMemberCode(code)) return null;
  const n = Number.parseInt(code.slice(MEMBER_CODE_PREFIX.length), 10);
  return Number.isSafeInteger(n) && n >= 1 ? n : null;
}

/**
 * Next code after the given existing codes (mock/dev helper only).
 * Production uses the `member_code_seq` sequence - never max+1 queries.
 */
export function nextMockMemberCode(existing: (string | null | undefined)[]): string {
  let max = 0;
  for (const code of existing) {
    if (typeof code !== 'string') continue;
    const seq = parseMemberCodeSeq(code);
    if (seq !== null && seq > max) max = seq;
  }
  return formatMemberCode(max + 1);
}
