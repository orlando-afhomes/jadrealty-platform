import { describe, expect, it } from 'vitest';

import { purgeMemberResponseSchema } from './member';

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
