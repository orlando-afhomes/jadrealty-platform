import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VercelRequest, VercelResponse } from '../../../_lib/http.js';

import handler from './[id].js';

/**
 * DELETE /admin/members/:id (super_admin permanent purge): the SQL cascade
 * cannot touch Supabase Storage, so the handler removes the purged member's
 * government-ID folders best-effort afterwards - never blocking the purge.
 */
const mocks = vi.hoisted(() => {
  const calls: { table: string; op: string; arg?: unknown }[] = [];
  const script = {
    roleSlug: 'super_admin',
    member: null as Record<string, unknown> | null,
    registrationIds: [] as string[],
    storageError: null as { message: string } | null,
  };
  const builder = (table: string) => {
    const b: Record<string, (...a: never[]) => unknown> = {};
    b.select = () => b;
    b.eq = () => b;
    b.ilike = async () => {
      if (table === 'Registration') {
        return { data: script.registrationIds.map((id) => ({ id })), error: null };
      }
      return { data: [], error: null };
    };
    b.in = async () => {
      if (table === 'Role') return { data: [{ slug: script.roleSlug }], error: null };
      return { data: [], error: null };
    };
    b.maybeSingle = async () => {
      if (table === 'Member') return { data: script.member, error: null };
      return { data: null, error: null };
    };
    b.then = (resolve: (v: unknown) => void) => {
      if (table === 'StaffAssignment') resolve({ data: [{ roleId: 'r-1' }], error: null });
      else resolve({ data: null, error: null });
    };
    return {
      ...b,
      insert: async (row: unknown) => {
        calls.push({ table, op: 'insert', arg: row });
        return { error: null };
      },
    };
  };
  return {
    calls,
    script,
    service: {
      from: (table: string) => builder(table),
      rpc: async (fn: string) => {
        calls.push({ table: 'rpc', op: fn });
        if (fn === 'member_purge_cascade') {
          return {
            data: { purged: { id: 'mem-001', email: 'juan@example.com', name: 'Juan Dela Cruz' } },
            error: null,
          };
        }
        return { data: null, error: null };
      },
      storage: {
        from: (bucket: string) => ({
          list: async (path?: string) => {
            calls.push({ table: `storage:${bucket}`, op: 'list', arg: path });
            return { data: [{ name: '1756000000-id.png' }], error: null };
          },
          remove: async (paths: string[]) => {
            calls.push({ table: `storage:${bucket}`, op: 'remove', arg: paths });
            return { error: script.storageError };
          },
        }),
      },
      auth: {
        admin: {
          deleteUser: async () => {
            calls.push({ table: 'auth.users', op: 'deleteUser' });
            return { error: null };
          },
        },
      },
    },
    anon: {
      auth: {
        getUser: async () => ({
          data: { user: { id: 'staff-uuid-1', user_metadata: {} } },
          error: null,
        }),
      },
    },
  };
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: (_url: string, key: string) => (key === 'service' ? mocks.service : mocks.anon),
}));

function capture() {
  const seen: { status?: number; body?: unknown } = {};
  const res: VercelResponse = {
    setHeader: () => {},
    status: (code: number) => {
      seen.status = code;
      return res;
    },
    json: (body: unknown) => {
      seen.body = body;
    },
    end: () => {},
  };
  return { res, seen };
}

const purgeReq = (id: string): VercelRequest =>
  ({
    method: 'DELETE',
    query: { id },
    headers: { authorization: 'Bearer good' },
    body: { reason: 'Duplicate test account' },
  }) as VercelRequest;

describe('DELETE /admin/members/:id (purge)', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://purge.test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    mocks.calls.length = 0;
    mocks.script.roleSlug = 'super_admin';
    mocks.script.member = {
      id: 'mem-001',
      email: 'juan@example.com',
      name: 'Juan Dela Cruz',
      registrationId: 'reg-001',
    };
    mocks.script.registrationIds = ['reg-001', 'reg-002'];
    mocks.script.storageError = null;
  });

  it('purges the member and removes their ID-document folders', async () => {
    const { res, seen } = capture();
    await handler(purgeReq('mem-001'), res);
    expect(seen.status).toBe(200);
    expect(seen.body).toMatchObject({ purgedId: 'mem-001', authRemoved: true });
    const removals = mocks.calls.filter(
      (c) => c.table === 'storage:government-ids' && c.op === 'remove',
    );
    expect(removals.map((r) => r.arg)).toEqual([
      ['reg-001/1756000000-id.png'],
      ['reg-002/1756000000-id.png'],
    ]);
    const audit = mocks.calls.find((c) => c.table === 'AuditLog')?.arg as Record<string, unknown>;
    expect(audit).toMatchObject({ action: 'MEMBER_PURGED', target_id: 'mem-001' });
  });

  it('still purges when storage removal fails', async () => {
    mocks.script.storageError = { message: 'bucket unavailable' };
    const { res, seen } = capture();
    await handler(purgeReq('mem-001'), res);
    expect(seen.status).toBe(200);
    expect(seen.body).toMatchObject({ purgedId: 'mem-001' });
  });

  it('403s non-super-admin staff before any mutation', async () => {
    mocks.script.roleSlug = 'admin';
    const { res, seen } = capture();
    await handler(purgeReq('mem-001'), res);
    expect(seen.status).toBe(403);
    expect(mocks.calls.some((c) => c.table === 'rpc')).toBe(false);
    expect(mocks.calls.some((c) => c.table.startsWith('storage:'))).toBe(false);
  });
});
