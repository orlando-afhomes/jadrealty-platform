import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VercelRequest, VercelResponse } from '../../_lib/http.js';

import handler from './provinces.js';

/**
 * GET /locations/provinces - public PH top-level list (provinces plus
 * independent cities). Supabase is fully mocked.
 */
const mocks = vi.hoisted(() => {
  const calls: { table: string; op: string; arg?: unknown }[] = [];
  const script = {
    provinces: [] as Record<string, unknown>[],
    cities: [] as Record<string, unknown>[],
  };
  const builder = (table: string) => {
    const b: Record<string, (...a: never[]) => unknown> = {};
    b.select = () => b;
    b.order = async () => {
      calls.push({ table, op: 'list' });
      if (table === 'ph_provinces') return { data: script.provinces, error: null };
      if (table === 'ph_cities') return { data: script.cities, error: null };
      return { data: [], error: null };
    };
    b.is = () => b;
    return b;
  };
  return {
    calls,
    script,
    service: { from: (table: string) => builder(table) },
    anon: {},
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

const getReq = (query: Record<string, unknown> = {}): VercelRequest =>
  ({ method: 'GET', query, headers: {} }) as VercelRequest;

describe('GET /locations/provinces', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://loc.test.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    mocks.calls.length = 0;
    mocks.script.provinces = [{ code: '0128', name: 'Ilocos Norte' }];
    mocks.script.cities = [{ code: '133900', name: 'City of Manila' }];
  });

  it('lists provinces plus independent cities for PH', async () => {
    const { res, seen } = capture();
    await handler(getReq({ countryCode: 'PH' }), res);
    expect(seen.status).toBe(200);
    expect(seen.body).toMatchObject({
      data: [
        { code: '133900', name: 'City of Manila', kind: 'city' },
        { code: '0128', name: 'Ilocos Norte', kind: 'province' },
      ],
    });
  });

  it('400s a missing or non-PH country', async () => {
    const { res: res1, seen: seen1 } = capture();
    await handler(getReq({}), res1);
    expect(seen1.status).toBe(400);
    const { res: res2, seen: seen2 } = capture();
    await handler(getReq({ countryCode: 'US' }), res2);
    expect(seen2.status).toBe(400);
    expect(mocks.calls.length).toBe(0);
  });
});
