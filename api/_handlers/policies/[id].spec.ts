import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VercelRequest, VercelResponse } from '../../_lib/http.js';

import handler from './[id].js';

/**
 * PUT + DELETE /policies/:id: role gates, PDF object cleanup on delete and
 * on document replacement, audit. Supabase (PostgREST + Storage) is fully
 * mocked.
 */
const mocks = vi.hoisted(() => {
  const calls: { table: string; op: string; arg?: unknown }[] = [];
  const script = {
    roleSlug: 'super_admin',
    policy: null as Record<string, unknown> | null,
    storageError: null as { message: string } | null,
  };
  const builder = (table: string) => {
    const b: Record<string, (...a: never[]) => unknown> = {};
    b.select = () => b;
    b.eq = () => b;
    b.in = async () => {
      if (table === 'Role') return { data: [{ slug: script.roleSlug }], error: null };
      return { data: [], error: null };
    };
    b.maybeSingle = async () => {
      if (table === 'Policy') {
        const row = script.policy;
        return {
          data: row ? { document_url: (row.document_url ?? row.documentUrl) ?? null } : null,
          error: null,
        };
      }
      return { data: null, error: null };
    };
    b.update = (patch: unknown) => {
      calls.push({ table, op: 'update', arg: patch });
      const merged = { ...(script.policy ?? {}), ...((patch ?? {}) as Record<string, unknown>) };
      return {
        eq: () => ({
          select: () => ({
            single: async () => ({ data: merged, error: null }),
          }),
        }),
      };
    };
    b.delete = () => ({
      eq: () => ({
        select: () => ({
          single: async () => {
            calls.push({ table, op: 'delete' });
            if (!script.policy) return { data: null, error: { message: 'no rows' } };
            return { data: { ...script.policy }, error: null };
          },
        }),
      }),
    });
    b.then = (resolve: (v: unknown) => void) => {
      if (table === 'StaffAssignment') {
        resolve({ data: [{ roleId: 'r-1' }], error: null });
      } else resolve({ data: null, error: null });
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
      storage: {
        from: (bucket: string) => ({
          remove: async (paths: string[]) => {
            calls.push({ table: `storage:${bucket}`, op: 'remove', arg: paths });
            return { error: script.storageError };
          },
        }),
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

const authed = { authorization: 'Bearer good' };
const deleteReq = (id: string): VercelRequest =>
  ({ method: 'DELETE', query: { id }, headers: authed }) as VercelRequest;
const putReq = (id: string, body: unknown): VercelRequest =>
  ({ method: 'PUT', query: { id }, headers: authed, body }) as VercelRequest;

const POLICY_WITH_PDF = {
  id: 'pol-001',
  slug: 'terms',
  type: 'terms',
  title: 'Terms and Conditions',
  content: 'Terms copy.',
  document_url:
    'https://ref.supabase.co/storage/v1/object/public/marketing-tools/cms/1756000000-terms.pdf',
  updated_at: '2026-08-18T10:00:00.000Z',
};

describe('DELETE /policies/:id', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://policies.test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    mocks.calls.length = 0;
    mocks.script.roleSlug = 'super_admin';
    mocks.script.policy = { ...POLICY_WITH_PDF };
    mocks.script.storageError = null;
  });

  it('403s non-staff roles before any mutation', async () => {
    mocks.script.roleSlug = 'merchant';
    const { res, seen } = capture();
    await handler(deleteReq('pol-001'), res);
    expect(seen.status).toBe(403);
    expect(mocks.calls.some((c) => c.op === 'delete' || c.op === 'remove')).toBe(false);
  });

  it('deletes the row, removes the PDF object, and audits', async () => {
    const { res, seen } = capture();
    await handler(deleteReq('pol-001'), res);
    expect(seen.status).toBe(200);
    expect(seen.body).toEqual({ id: 'pol-001', deleted: true, fileRemoved: true });
    const removal = mocks.calls.find((c) => c.table === 'storage:marketing-tools');
    expect(removal?.op).toBe('remove');
    expect(removal?.arg).toEqual(['cms/1756000000-terms.pdf']);
    expect(mocks.calls.some((c) => c.table === 'Policy' && c.op === 'delete')).toBe(true);
    const audit = mocks.calls.find((c) => c.table === 'AuditLog')?.arg as Record<string, unknown>;
    expect(audit).toMatchObject({ action: 'POLICY_DELETED', target_id: 'pol-001' });
    expect(String(audit.detail)).toContain('uploaded PDF removed');
  });

  it('still deletes the row when storage removal fails', async () => {
    mocks.script.storageError = { message: 'bucket unavailable' };
    const { res, seen } = capture();
    await handler(deleteReq('pol-001'), res);
    expect(seen.status).toBe(200);
    expect(seen.body).toEqual({ id: 'pol-001', deleted: true, fileRemoved: false });
    expect(mocks.calls.some((c) => c.table === 'Policy' && c.op === 'delete')).toBe(true);
    const audit = mocks.calls.find((c) => c.table === 'AuditLog')?.arg as Record<string, unknown>;
    expect(String(audit.detail)).toContain('uploaded PDF removal failed');
  });

  it('reports fileRemoved false without touching storage when no PDF is attached', async () => {
    mocks.script.policy = { ...POLICY_WITH_PDF, document_url: null };
    const { res, seen } = capture();
    await handler(deleteReq('pol-001'), res);
    expect(seen.status).toBe(200);
    expect(seen.body).toEqual({ id: 'pol-001', deleted: true, fileRemoved: false });
    expect(mocks.calls.some((c) => c.table === 'storage:marketing-tools')).toBe(false);
  });

  it('404s when the policy does not exist', async () => {
    mocks.script.policy = null;
    const { res, seen } = capture();
    await handler(deleteReq('pol-missing'), res);
    expect(seen.status).toBe(404);
    expect(mocks.calls.some((c) => c.op === 'remove')).toBe(false);
  });
});

describe('PUT /policies/:id', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://policies.test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    mocks.calls.length = 0;
    mocks.script.roleSlug = 'super_admin';
    mocks.script.policy = { ...POLICY_WITH_PDF };
    mocks.script.storageError = null;
  });

  it('updates metadata without touching storage', async () => {
    const { res, seen } = capture();
    await handler(putReq('pol-001', { title: 'New Title' }), res);
    expect(seen.status).toBe(200);
    expect(mocks.calls.some((c) => c.table === 'storage:marketing-tools')).toBe(false);
  });

  it('removes the previous PDF object when the document is replaced', async () => {
    const nextUrl =
      'https://ref.supabase.co/storage/v1/object/public/marketing-tools/cms/1756111111-new.pdf';
    const { res, seen } = capture();
    await handler(putReq('pol-001', { documentUrl: nextUrl }), res);
    expect(seen.status).toBe(200);
    const update = mocks.calls.find((c) => c.table === 'Policy' && c.op === 'update');
    expect(update?.arg).toMatchObject({ document_url: nextUrl });
    const removal = mocks.calls.find((c) => c.table === 'storage:marketing-tools');
    expect(removal?.arg).toEqual(['cms/1756000000-terms.pdf']);
  });

  it('still updates when the old-object removal fails', async () => {
    mocks.script.storageError = { message: 'bucket unavailable' };
    const nextUrl =
      'https://ref.supabase.co/storage/v1/object/public/marketing-tools/cms/1756111111-new.pdf';
    const { res, seen } = capture();
    await handler(putReq('pol-001', { documentUrl: nextUrl }), res);
    expect(seen.status).toBe(200);
    expect(mocks.calls.some((c) => c.table === 'Policy' && c.op === 'update')).toBe(true);
  });
});
