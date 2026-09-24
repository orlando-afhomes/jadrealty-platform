import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VercelRequest, VercelResponse } from '../../_lib/http.js';

import handler from './barangays.js';

/** GET /locations/barangays - barangays of a city; Supabase fully mocked. */
const mocks = vi.hoisted(() => {
  const calls: { table: string; op: string; arg?: unknown }[] = [];
  const script = {
    city: null as Record<string, unknown> | null,
    barangays: [] as Record<string, unknown>[],
  };
  const builder = (table: string) => {
    const b: Record<string, (...a: never[]) => unknown> = {};
    b.select = () => b;
    b.eq = () => b;
    b.order = async () => {
      calls.push({ table, op: 'list' });
      if (table === 'ph_barangays') return { data: script.barangays, error: null };
      return { data: [], error: null };
    };
    b.maybeSingle = async () => {
      if (table === 'ph_cities') return { data: script.city, error: null };
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

describe('GET /locations/barangays', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://loc.test.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    mocks.calls.length = 0;
    mocks.script.city = { code: '012801' };
    mocks.script.barangays = [
      { code: '012801001', name: 'Brgy 1', city_code: '012801' },
      { code: '012801002', name: 'Brgy 2', city_code: '012801' },
    ];
  });

  it('lists the barangays of a city', async () => {
    const { res, seen } = capture();
    await handler(getReq({ cityCode: '012801' }), res);
    expect(seen.status).toBe(200);
    expect(seen.body).toMatchObject({
      data: [
        { code: '012801001', name: 'Brgy 1', cityCode: '012801' },
        { code: '012801002', name: 'Brgy 2', cityCode: '012801' },
      ],
    });
  });

  it('404s unknown cities and 400s a missing parent', async () => {
    mocks.script.city = null;
    const { res: res1, seen: seen1 } = capture();
    await handler(getReq({ cityCode: '999999' }), res1);
    expect(seen1.status).toBe(404);
    expect(mocks.calls.some((c) => c.table === 'ph_barangays')).toBe(false);
    const { res: res2, seen: seen2 } = capture();
    await handler(getReq({}), res2);
    expect(seen2.status).toBe(400);
  });
});
