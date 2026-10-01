import { describe, expect, it } from 'vitest';

import {
  formatMemberCode,
  isMemberCode,
  nextMockMemberCode,
  parseMemberCodeSeq,
} from './member-codes.js';

describe('member-codes', () => {
  it('formats JAD-MEM-0001 style codes with 4-digit padding', () => {
    expect(formatMemberCode(1)).toBe('JAD-MEM-0001');
    expect(formatMemberCode(42)).toBe('JAD-MEM-0042');
    expect(formatMemberCode(10000)).toBe('JAD-MEM-10000');
  });

  it('validates the persisted shape', () => {
    expect(isMemberCode('JAD-MEM-0001')).toBe(true);
    expect(isMemberCode('JAD-MEM-12345')).toBe(true);
    expect(isMemberCode('JAD-MEM-001')).toBe(false);
    expect(isMemberCode('JAD-0001')).toBe(false);
    expect(isMemberCode('jad-mem-0001')).toBe(false);
    expect(isMemberCode('e61f929c-4f78-4dbe-8d28-43c40d55164a')).toBe(false);
    expect(isMemberCode(null)).toBe(false);
  });

  it('parses the sequence back out', () => {
    expect(parseMemberCodeSeq('JAD-MEM-0001')).toBe(1);
    expect(parseMemberCodeSeq('JAD-MEM-0042')).toBe(42);
    expect(parseMemberCodeSeq('nope')).toBeNull();
  });

  it('picks the next mock code after the max', () => {
    expect(nextMockMemberCode(['JAD-MEM-0001', 'JAD-MEM-0003'])).toBe('JAD-MEM-0004');
    expect(nextMockMemberCode([])).toBe('JAD-MEM-0001');
    expect(nextMockMemberCode([null, undefined, 'bogus'])).toBe('JAD-MEM-0001');
  });
});
