import { afterEach, describe, expect, it, vi } from 'vitest';

import { appendAudit } from './audit.js';
import { toErrorEnvelope } from './envelope.js';
import { getSupabaseEnv } from './env.js';

describe('toErrorEnvelope', () => {
  it('returns the contracts error shape plus status', () => {
    const { error, status } = toErrorEnvelope('NOT_FOUND', 'Missing', 404, { key: 'x' });
    expect(status).toBe(404);
    expect(error.code).toBe('NOT_FOUND');
    expect(error.message).toBe('Missing');
    expect(error.details).toEqual({ key: 'x' });
    expect(typeof error.requestId).toBe('string');
    expect(typeof error.timestamp).toBe('string');
  });

  it('omits details when not provided', () => {
    const { error } = toErrorEnvelope('INTERNAL', 'Boom', 500);
    expect(error.details).toBeUndefined();
  });
});

describe('getSupabaseEnv', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('prefers explicit SUPABASE_URL over derived values', () => {
    vi.stubEnv('SUPABASE_URL', 'https://ref.supabase.co');
    vi.stubEnv('DATABASE_URL', 'postgresql://postgres:pw@db.other.supabase.co:5432/postgres');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'svc');
    const env = getSupabaseEnv();
    expect(env.url).toBe('https://ref.supabase.co');
    expect(env.serviceKey).toBe('svc');
  });

  it('derives the URL from DATABASE_URL', () => {
    vi.stubEnv('SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('DATABASE_URL', 'postgresql://postgres:pw@db.abc123.supabase.co:5432/postgres');
    expect(getSupabaseEnv().url).toBe('https://abc123.supabase.co');
  });
});

describe('appendAudit', () => {
  it('inserts the mapped row and never throws on failure', async () => {
    const inserted: Record<string, unknown>[] = [];
    await appendAudit(
      {
        from: () => ({
          insert: async (row: Record<string, unknown>) => {
            inserted.push(row);
            return { error: null };
          },
        }),
      },
      {
        action: 'ROLE_DELETED',
        actorId: 'u-1',
        actorRole: 'SUPER_ADMIN',
        targetType: 'Role',
        targetId: 'role-x',
        targetName: 'X',
        detail: 'Deleted role X',
      },
    );
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      action: 'ROLE_DELETED',
      actor_id: 'u-1',
      actor_role: 'SUPER_ADMIN',
      target_type: 'Role',
      target_id: 'role-x',
      target_name: 'X',
      detail: 'Deleted role X',
    });
    expect(typeof inserted[0]!.created_at).toBe('string');

    const errors: unknown[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((e) => errors.push(e));
    await appendAudit(
      {
        from: () => ({
          insert: async () => {
            throw new Error('db down');
          },
        }),
      },
      { action: 'X' },
    );
    expect(errors.length).toBeGreaterThan(0);
    spy.mockRestore();
  });
});
