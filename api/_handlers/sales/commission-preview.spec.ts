import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VercelRequest, VercelResponse } from '../../_lib/http.js';

import handler from './commission-preview.js';

/**
 * GET /sales/commission-preview resolves per-category rates with global
 * fallback (same source as sale_qualify) without creating anything.
 * Supabase is fully mocked.
 */
const mocks = vi.hoisted(() => {
  const script = {
    configRows: [] as { key: string; value: string }[],
    properties: [] as { id: string; categorySlug: string | null }[],
    categories: [] as { slug: string; direct_rate: unknown; referral_rate: unknown }[],
  };
  const chainFor = (table: string) => {
    const chain: Record<string, (...a: never[]) => unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.in = async (_col: string, _vals: unknown) => {
      if (table === 'SystemConfig') return { data: script.configRows, error: null };
      if (table === 'Property') return { data: script.properties, error: null };
      if (table === 'PropertyCategory') return { data: script.categories, error: null };
      return { data: [], error: null };
    };
    chain.maybeSingle = async () => ({ data: null, error: null });
    return chain;
  };
  return {
    script,
    service: { from: (table: string) => chainFor(table) },
    anon: {
      auth: {
        getUser: async () => ({
          data: { user: { id: 'mem-uuid-1', user_metadata: {} } },
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
const getReq = (propertyId?: string): VercelRequest =>
  ({
    method: 'GET',
    query: propertyId === undefined ? {} : { propertyId },
    headers: authed,
  }) as VercelRequest;

describe('GET /sales/commission-preview', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://preview.test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    mocks.script.configRows = [
      { key: 'COMMISSION_DIRECT_RATE', value: '0.0800' },
      { key: 'COMMISSION_REFERRAL_RATE', value: '0.0400' },
    ];
    mocks.script.properties = [{ id: 'prop-1', categorySlug: 'condo' }];
    mocks.script.categories = [{ slug: 'condo', direct_rate: '0.1000', referral_rate: '0.0500' }];
  });

  it('returns the category rates for a categorized property', async () => {
    const { res, seen } = capture();
    await handler(getReq('prop-1'), res);
    expect(seen.status).toBe(200);
    expect(seen.body).toEqual({
      propertyId: 'prop-1',
      directRate: '0.1000',
      referralRate: '0.0500',
    });
  });

  it('falls back to global rates for an uncategorized property', async () => {
    mocks.script.properties = [{ id: 'prop-9', categorySlug: null }];
    const { res, seen } = capture();
    await handler(getReq('prop-9'), res);
    expect(seen.status).toBe(200);
    expect(seen.body).toEqual({
      propertyId: 'prop-9',
      directRate: '0.0800',
      referralRate: '0.0400',
    });
  });

  it('rejects a missing propertyId', async () => {
    const { res, seen } = capture();
    await handler(getReq(undefined), res);
    expect(seen.status).toBe(400);
  });

  it('returns 422 when no rates are configured anywhere', async () => {
    mocks.script.configRows = [];
    mocks.script.properties = [];
    mocks.script.categories = [];
    const { res, seen } = capture();
    await handler(getReq('prop-1'), res);
    expect(seen.status).toBe(422);
  });

  it('requires authentication', async () => {
    const { res, seen } = capture();
    await handler(
      { method: 'GET', query: { propertyId: 'prop-1' }, headers: {} } as VercelRequest,
      res,
    );
    expect(seen.status).toBe(401);
  });
});
