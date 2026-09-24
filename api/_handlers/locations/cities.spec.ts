import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VercelRequest, VercelResponse } from '../../_lib/http.js';

import handler from './cities.js';

/** GET /locations/cities - children of a province; Supabase fully mocked. */
const mocks = vi.hoisted(() => {
  const calls: { table: string; op: string; arg?: unknown }[] = [];
  const script = {
    province: null as Record<string, unknown> | null,
    cities: [] as Record<string, unknown>[],
    independent: null as Record<string, unknown> | null,
  };
  const builder = (table: string) => {
    const b: Record<string, (...a: never[]) => unknown> = {};
    b.select = () => b;
    b.eq = () => b;
    b.is = () => b;
    b.order = async () => {
      calls.push({ table, op: 'list' });
      if (table === 'ph_cities') return { data: script.cities, error: null };
      return { data: [], error: null };
    };
    b.maybeSingle = async () => {
      if (table === 'ph_provinces') return { data: script.province, error: null };
      if (table === 'ph_cities') return { data: script.independent, error: null };
      return { data: null, error: null };
    };
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

describe('GET /locations/cities', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://loc.test.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    mocks.calls.length = 0;
    mocks.script.province = { code: '0128' };
    mocks.script.cities = [
      { code: '012801', name: 'Laoag City', province_code: '0128', is_city: true },
      { code: '012802', name: 'Adams', province_code: '0128', is_city: false },
    ];
    mocks.script.independent = null;
  });

  it('lists the cities and municipalities of a province', async () => {
    const { res, seen } = capture();
    await handler(getReq({ provinceCode: '0128' }), res);
    expect(seen.status).toBe(200);
    expect(seen.body).toMatchObject({
      data: [
        { code: '012801', name: 'Laoag City', provinceCode: '0128', kind: 'city' },
        { code: '012802', name: 'Adams', provinceCode: '0128', kind: 'municipality' },
      ],
    });
  });

  it('returns an empty list for an independent city parent', async () => {
    mocks.script.province = null;
    mocks.script.independent = { code: '133900' };
    const { res, seen } = capture();
    await handler(getReq({ provinceCode: '133900' }), res);
    expect(seen.status).toBe(200);
    expect(seen.body).toMatchObject({ data: [] });
  });

  it('404s unknown province codes and 400s a missing parent', async () => {
    mocks.script.province = null;
    mocks.script.independent = null;
    const { res: res1, seen: seen1 } = capture();
    await handler(getReq({ provinceCode: '9999' }), res1);
    expect(seen1.status).toBe(404);
    const { res: res2, seen: seen2 } = capture();
    await handler(getReq({}), res2);
    expect(seen2.status).toBe(400);
  });
});
