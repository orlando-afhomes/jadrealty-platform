import { describe, expect, it } from 'vitest';

import {
  formatRegistrationId,
  isRegistrationId,
  nextMockRegistrationId,
  parseRegistrationIdSeq,
} from './registration-ids.js';

describe('registration-ids', () => {
  it('formats JAD-REG-0001 style IDs with 4-digit padding', () => {
    expect(formatRegistrationId(1)).toBe('JAD-REG-0001');
    expect(formatRegistrationId(3)).toBe('JAD-REG-0003');
    expect(formatRegistrationId(10000)).toBe('JAD-REG-10000');
  });

  it('validates the persisted shape and rejects the legacy format', () => {
    expect(isRegistrationId('JAD-REG-0001')).toBe(true);
    expect(isRegistrationId('JAD-REG-12345')).toBe(true);
    expect(isRegistrationId('JAD-REG-001')).toBe(false);
    expect(isRegistrationId('reg-muowzfzy')).toBe(false);
    expect(isRegistrationId('reg-001')).toBe(false);
    expect(isRegistrationId(null)).toBe(false);
  });

  it('parses the sequence back out', () => {
    expect(parseRegistrationIdSeq('JAD-REG-0003')).toBe(3);
    expect(parseRegistrationIdSeq('JAD-REG-0042')).toBe(42);
    expect(parseRegistrationIdSeq('reg-muowzfzy')).toBeNull();
  });

  it('picks the next mock ID after the max', () => {
    expect(nextMockRegistrationId(['JAD-REG-0001', 'JAD-REG-0003'])).toBe('JAD-REG-0004');
    expect(nextMockRegistrationId([])).toBe('JAD-REG-0001');
    expect(nextMockRegistrationId([null, undefined, 'bogus'])).toBe('JAD-REG-0001');
  });
});
