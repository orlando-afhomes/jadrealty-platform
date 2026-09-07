import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VercelRequest, VercelResponse } from '../../_lib/http.js';

import createStaff from './staff.js';

/**
 * Staff creation conflict adoption: the real GoTrue duplicate message
 * ("...has already been registered") must be recognized (not leaked as
 * INTERNAL) and the orphaned auth account adopted.
 */
const mocks = vi.hoisted(() => {
  const calls: { table: string; op: string; arg?: unknown }[] = [];
  const script = {
    roleSlug: 'super_admin',
    dupeMembers: [] as unknown[],
    createError: null as { message: string; code?: string } | null,
    listedUsers: [] as { id: string; email?: string }[],
  };
  const builder = (table: string) => {
    const b: Record<string, (...a: never[]) => unknown> = {};
    b.select = () => b;
    b.eq = () => b;
    b.or = () => b;
    b.limit = async () => {
      if (table === 'Member') return { data: script.dupeMembers, error: null };
      if (table === 'Role') return { data: [{ id: 'role-uuid-admin' }], error: null };
      return { data: [], error: null };
    };
    b.in = async () => {
      if (table === 'Role') return { data: [{ slug: script.roleSlug }], error: null };
      return { data: [], error: null };
    };
    b.maybeSingle = async () => {
      if (table === 'MemberRole') return { data: [{ roleId: 'r-1' }], error: null };
      return { data: null, error: null };
    };
    b.then = (resolve: (v: unknown) => void) => {
      if (table === 'MemberRole') resolve({ data: [{ roleId: 'r-1' }], error: null });
      else if (table === 'Role')
        resolve({
          data: [
            {
              id: 'role-uuid-admin',
              key: 'admin',
              slug: 'admin',
              name: 'Admin',
              permissions: [],
              is_system: true,
            },
          ],
          error: null,
        });
      else resolve({ data: null, error: null });
    };
    return {
      ...b,
      insert: async (row: unknown) => {
        calls.push({ table, op: 'insert', arg: row });
        return { error: null };
      },
      upsert: async (row: unknown) => {
        calls.push({ table, op: 'upsert', arg: row });
        return { error: null };
      },
    };
  };
  return {
    calls,
    script,
    service: { from: (table: string) => builder(table) },
    anon: {
      auth: {
        getUser: async () => ({
          data: { user: { id: 'staff-uuid-1', user_metadata: {} } },
          error: null,
        }),
      },
    },
    adminAuth: {
      createUser: async (input: unknown) => {
        calls.push({ table: 'auth.users', op: 'createUser', arg: input });
        if (script.createError) return { data: {}, error: script.createError };
        return { data: { user: { id: 'new-staff-uuid' } }, error: null };
      },
      listUsers: async () => ({ data: { users: script.listedUsers } }),
    },
  };
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: (_url: string, key: string) => {
    if (key === 'service') {
      const svc = mocks.service as { from: (t: string) => unknown };
      return { ...svc, auth: { admin: mocks.adminAuth } };
    }
    return mocks.anon;
  },
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

const authed = { authorization: 'Bearer good' };
const BODY = {
  name: 'Ada Admin',
  email: 'ada@example.com',
  roleId: 'admin',
  actor: 'Saul Super',
  actorRole: 'super_admin',
};

describe('POST /admin/staff', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://fix.test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    mocks.calls.length = 0;
    mocks.script.dupeMembers = [];
    mocks.script.createError = null;
    mocks.script.listedUsers = [];
  });

  it('adopts the orphaned auth account on the real duplicate message', async () => {
    mocks.script.createError = {
      message: 'A user with this email address has already been registered',
    };
    mocks.script.listedUsers = [{ id: 'orphan-uuid', email: 'ada@example.com' }];
    const { res, seen } = capture();
    await createStaff(
      { method: 'POST', query: {}, headers: authed, body: BODY } as VercelRequest,
      res,
    );
    expect(seen.status).toBe(201);
    expect(seen.body).toMatchObject({ id: 'orphan-uuid', email: 'ada@example.com' });
    const upsert = mocks.calls.find((c) => c.table === 'Member' && c.op === 'upsert')
      ?.arg as Record<string, unknown>;
    expect(upsert.id).toBe('orphan-uuid');
  });

  it('still surfaces non-conflict auth errors as INTERNAL', async () => {
    mocks.script.createError = { message: 'Database error saving new user' };
    const { res, seen } = capture();
    await createStaff(
      { method: 'POST', query: {}, headers: authed, body: BODY } as VercelRequest,
      res,
    );
    expect(seen.status).toBe(500);
    expect(seen.body).toMatchObject({
      error: { code: 'INTERNAL', message: 'Database error saving new user' },
    });
  });
});
