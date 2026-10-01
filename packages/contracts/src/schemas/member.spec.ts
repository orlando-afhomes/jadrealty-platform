import { describe, expect, it } from 'vitest';

import { memberCodeSchema, memberProfileSchema, purgeMemberResponseSchema } from './member';

describe('purgeMemberResponseSchema', () => {
  it('requires authRemoved so callers know whether the auth identity is gone', () => {
    expect(
      purgeMemberResponseSchema.safeParse({ purgedId: 'mem-uuid-1', authRemoved: true }).success,
    ).toBe(true);
    expect(
      purgeMemberResponseSchema.safeParse({ purgedId: 'mem-uuid-1', authRemoved: false }).success,
    ).toBe(true);
    // A bare purgedId no longer validates: silently dropping authRemoved
    // reintroduces login-capable orphans after purge.
    expect(purgeMemberResponseSchema.safeParse({ purgedId: 'mem-uuid-1' }).success).toBe(false);
  });
});

describe('memberCodeSchema', () => {
  it('accepts JAD-MEM-0001 style codes and rejects uuids', () => {
    expect(memberCodeSchema.safeParse('JAD-MEM-0001').success).toBe(true);
    expect(memberCodeSchema.safeParse('JAD-MEM-0010').success).toBe(true);
    expect(memberCodeSchema.safeParse('JAD-MEM-10000').success).toBe(true);
    expect(memberCodeSchema.safeParse('JAD-MEM-001').success).toBe(false);
    expect(memberCodeSchema.safeParse('JAD-0001').success).toBe(false);
    expect(memberCodeSchema.safeParse('e61f929c-4f78-4dbe-8d28-43c40d55164a').success).toBe(false);
  });

  it('is optional on the profile so legacy rows still parse', () => {
    const base = {
      id: 'mem-uuid-1',
      firstName: 'Juan',
      lastName: 'Cruz',
      dateOfBirth: '1990-01-01',
      age: 36,
      gender: 'Male',
      countryCode: 'PH',
      countryName: 'Philippines',
      phone: '+639171234567',
      email: 'juan@example.com',
      referralCode: 'JAD-JUAN01',
      status: 'APPROVED_ACTIVE',
      isQualified: true,
      program: { id: 'prg-domestic', code: 'DOMESTIC', name: 'Domestic Program' },
    };
    expect(memberProfileSchema.safeParse(base).success).toBe(true);
    expect(
      memberProfileSchema.safeParse({ ...base, memberCode: 'JAD-MEM-0001' }).success,
    ).toBe(true);
    expect(memberProfileSchema.safeParse({ ...base, memberCode: 'bogus' }).success).toBe(false);
  });
});
