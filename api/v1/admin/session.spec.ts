import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VercelRequest, VercelResponse } from '../../_lib/http.js';

import handler from './session.js';

/**
 * GET /admin/session — own staff session resolved server-side (no anon Role
 * reads). Supabase is fully mocked.
 */
const mocks = vi.hoisted(() => {
  const script = {
    staffRow: {
      id: 'u-1',
      email: 'admin@jad.local',
      name: 'Admin User',
      status: 'ACTIVE',
    } as Record<string, unknown> | null,
  };
  const builder = (table: string) => {
    const b: Record<string, (...a: never[]) => unknown> = {};
    b.select = () => b;
    b.eq = () => b;
    b.in = async () => {
      if (table === 'Role') return { data: [{ slug: 'super_admin' }], error: null };
      return { data: [], error: null };
    };
    b.then = (resolve: (v: unknown) => void) => {
      if (table === 'StaffAssignment') resolve({ data: [{ roleId: 'r-1' }], error: null });
      else resolve({ data: null, error: null });
    };
    b.maybeSingle = async () => {
      if (table === 'StaffUser') return { data: script.staffRow, error: null };
      return { data: null, error: null };
    };
    return b;
  };
  return {
    script,
    service: { from: (table: string) => builder(table) },
    anon: {
      auth: {
        getUser: async () => ({
          data: { user: { id: 'u-1', user_metadata: {} } },
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

const authed = { authorization: 'Bearer good' };
const req = (): VercelRequest => ({ method: 'GET', query: {}, headers: authed }) as VercelRequest;

describe('GET /admin/session', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://sess.test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    mocks.script.staffRow = {
      id: 'u-1',
      email: 'admin@jad.local',
      name: 'Admin User',
      status: 'ACTIVE',
    };
  });

  it('returns the staff profile with slugs', async () => {
    const { res, seen } = capture();
    await handler(req(), res);
    expect(seen.status).toBe(200);
    expect(seen.body).toMatchObject({
      id: 'u-1',
      email: 'admin@jad.local',
      status: 'ACTIVE',
      slugs: ['super_admin'],
    });
  });

  it('404s callers without a staff identity', async () => {
    mocks.script.staffRow = null;
    const { res, seen } = capture();
    await handler(req(), res);
    expect(seen.status).toBe(404);
  });

  it('401s without credentials', async () => {
    const { res, seen } = capture();
    await handler({ method: 'GET', query: {}, headers: {} } as VercelRequest, res);
    expect(seen.status).toBe(401);
  });
});
