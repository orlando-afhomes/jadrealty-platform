import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VercelRequest, VercelResponse } from '../../_lib/http.js';
import { resetRateLimits } from '../../_lib/rate-limit.js';

import { createCategory, listCategories } from './property-categories.js';
import updateCategory from './property-categories/[slug].js';

/**
 * Per-category commission rates: each category owns its Direct Commission /
 * Direct Referral percentages. Supabase is fully mocked; the global
 * SystemConfig values below are test-only (never production literals).
 */
const GLOBAL_DIRECT = '0.0700';
const GLOBAL_REFERRAL = '0.0300';

const mocks = vi.hoisted(() => {
  const calls: { table: string; op: string; arg?: unknown }[] = [];
  const script = {
    categories: [] as Record<string, unknown>[],
    properties: [] as Record<string, unknown>[],
    config: [
      // Test-only globals (never production literals) - hoisted factory
      // cannot reference module consts, so the values repeat below.
      { key: 'COMMISSION_DIRECT_RATE', value: '0.0700' },
      { key: 'COMMISSION_REFERRAL_RATE', value: '0.0300' },
    ] as Record<string, unknown>[],
    cmsContent: null as Record<string, unknown> | null,
    insertError: null as string | null,
    updateError: null as string | null,
  };
  const resultFor = (table: string) => {
    if (table === 'PropertyCategory') return script.categories;
    if (table === 'Property') return script.properties;
    if (table === 'SystemConfig') return script.config;
    return [];
  };
  const chainFor = (table: string) => {
    const chain: Record<string, (...a: never[]) => unknown> & { __eq?: [string, unknown] } = {};
    chain.select = () => chain;
    chain.eq = ((col: string, val: unknown) => {
      chain.__eq = [col, val];
      return chain;
    }) as (...a: never[]) => unknown;
    chain.order = () => chain;
    chain.in = async () => {
      if (table === 'Role') return { data: [{ slug: 'admin' }], error: null };
      if (table === 'SystemConfig') return { data: script.config, error: null };
      return { data: [], error: null };
    };
    chain.maybeSingle = async () => {
      if (table === 'cms_contents') {
        return script.cmsContent
          ? { data: script.cmsContent, error: null }
          : { data: null, error: null };
      }
      const rows = resultFor(table);
      const [col, val] = chain.__eq ?? [];
      const hit =
        col !== undefined ? rows.find((r) => (r as Record<string, unknown>)[col] === val) : rows[0];
      return { data: hit ?? null, error: null };
    };
    chain.insert = (row: unknown) => {
      calls.push({ table, op: 'insert', arg: row });
      if (script.insertError) return { error: new Error(script.insertError) };
      return { error: null };
    };
    chain.update = (patch: unknown) => {
      calls.push({ table, op: 'update', arg: patch });
      return {
        eq: async (col: string, val: unknown) => {
          if (script.updateError) return { error: new Error(script.updateError) };
          for (const row of resultFor(table)) {
            if ((row as Record<string, unknown>)[col] === val) Object.assign(row, patch);
          }
          return { error: null };
        },
      };
    };
    chain.upsert = (row: unknown) => {
      calls.push({ table, op: 'upsert', arg: row });
      return { error: null };
    };
    chain.delete = () => {
      calls.push({ table, op: 'delete' });
      return { eq: async () => ({ error: null }) };
    };
    chain.then = (resolve: (v: unknown) => void) => {
      if (table === 'StaffUser') {
        resolve({ data: [{ status: 'ACTIVE', mustChangePassword: false }], error: null });
      } else if (table === 'StaffAssignment') {
        resolve({ data: [{ roleId: 'r-admin' }], error: null });
      } else if (table === 'Role') {
        resolve({ data: [{ slug: 'admin' }], error: null });
      } else if (table === 'Property' && (chain as { __count?: boolean }).__count) {
        resolve({ data: [], error: null, count: 0 });
      } else {
        resolve({ data: resultFor(table), error: null });
      }
    };
    return chain;
  };
  return {
    calls,
    script,
    service: {
      from: (table: string) => chainFor(table),
      auth: { admin: { listUsers: async () => ({ data: { users: [] }, error: null }) } },
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
const postReq = (body: unknown): VercelRequest =>
  ({ method: 'POST', query: {}, headers: authed, body }) as VercelRequest;
const patchReq = (slug: string, body: unknown): VercelRequest =>
  ({ method: 'PATCH', query: { slug }, headers: authed, body }) as VercelRequest;
const getReq = (): VercelRequest => ({ method: 'GET', query: {}, headers: authed }) as VercelRequest;

const PRESENTATION = {
  title: 'Condos',
  shortDescription: 'Resale condos',
  description: 'Tenanted condo resales with leases in place.',
  image: { id: 'photo-1', alt: 'Condos' },
};

describe('category commission rates', () => {
  beforeEach(() => {
    resetRateLimits();
    vi.stubEnv('SUPABASE_URL', 'https://cat.test.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    vi.stubEnv('SUPABASE_ANON_KEY', 'anon');
    mocks.calls.length = 0;
    mocks.script.categories = [
      { slug: 'cat-one', title: 'Cat One', direct_rate: '0.1000', referral_rate: '0.0500' },
      { slug: 'cat-two', title: 'Cat Two', direct_rate: '0.1500', referral_rate: '0.0800' },
    ];
    mocks.script.properties = [];
    mocks.script.cmsContent = {
      key: 'properties',
      content: { categories: [], properties: [], page: {} },
      version: 1,
    };
    mocks.script.insertError = null;
    mocks.script.updateError = null;
  });

  it('lists each category with its own rates', async () => {
    const { res, seen } = capture();
    await listCategories(getReq(), res);
    expect(seen.status).toBe(200);
    const data = (seen.body as { data: Record<string, unknown>[] }).data;
    expect(data.find((c) => c.slug === 'cat-one')).toMatchObject({
      directRate: '0.1000',
      referralRate: '0.0500',
    });
    expect(data.find((c) => c.slug === 'cat-two')).toMatchObject({
      directRate: '0.1500',
      referralRate: '0.0800',
    });
  });

  it('creates a category with explicit rates', async () => {
    const { res, seen } = capture();
    await createCategory(
      postReq({ slug: 'cat-new', ...PRESENTATION, directRate: '0.1200', referralRate: '0.0600' }),
      res,
    );
    expect(seen.status).toBe(201);
    expect(mocks.calls.find((c) => c.table === 'PropertyCategory' && c.op === 'insert')?.arg).toMatchObject({
      slug: 'cat-new',
      direct_rate: '0.1200',
      referral_rate: '0.0600',
    });
    expect(seen.body).toMatchObject({ directRate: '0.1200', referralRate: '0.0600' });
  });

  it('defaults omitted create rates to the live globals (never literals)', async () => {
    const { res, seen } = capture();
    await createCategory(postReq({ slug: 'cat-new', ...PRESENTATION }), res);
    expect(seen.status).toBe(201);
    expect(mocks.calls.find((c) => c.table === 'PropertyCategory' && c.op === 'insert')?.arg).toMatchObject({
      direct_rate: GLOBAL_DIRECT,
      referral_rate: GLOBAL_REFERRAL,
    });
  });

  it('patches one rate without touching the other', async () => {
    const { res, seen } = capture();
    await updateCategory(patchReq('cat-one', { directRate: '0.1100' }), res);
    expect(seen.status).toBe(200);
    const update = mocks.calls.find(
      (c) => c.table === 'PropertyCategory' && c.op === 'update',
    )?.arg as Record<string, unknown>;
    expect(update).toMatchObject({ direct_rate: '0.1100' });
    expect(update).not.toHaveProperty('referral_rate');
    expect(mocks.script.categories.find((c) => c.slug === 'cat-one')).toMatchObject({
      direct_rate: '0.1100',
      referral_rate: '0.0500',
    });
    expect(mocks.script.categories.find((c) => c.slug === 'cat-two')).toMatchObject({
      direct_rate: '0.1500',
      referral_rate: '0.0800',
    });
    expect(seen.body).toMatchObject({ directRate: '0.1100', referralRate: '0.0500' });
  });

  it('rejects out-of-range rates', async () => {
    const { res, seen } = capture();
    await updateCategory(patchReq('cat-one', { directRate: '1.5000' }), res);
    expect(seen.status).toBe(400);
    expect(mocks.script.categories.find((c) => c.slug === 'cat-one')).toMatchObject({
      direct_rate: '0.1000',
    });
  });
});
