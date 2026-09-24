import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VercelRequest, VercelResponse } from '../../_lib/http.js';

import handler from './public.js';

/**
 * GET /config/public serves the non-sensitive subset (minimumAge, genders,
 * countries, withdrawalLimits) from SystemConfig. These specs pin the mapping
 * and the safe fallbacks for missing/malformed rows.
 */
const mocks = vi.hoisted(() => {
  const script = {
    configRows: [] as { key: string; value: string }[],
    configError: null as string | null,
    countries: [] as Record<string, unknown>[],
  };
  const builder = (table: string) => {
    const b: Record<string, (...a: never[]) => unknown> = {};
    b.select = () => b;
    b.eq = () => b;
    b.order = async () => {
      if (table === 'countries') return { data: script.countries, error: null };
      return { data: [], error: null };
    };
    b.then = (resolve: (v: unknown) => void) => {
      if (table === 'SystemConfig') {
        resolve(
          script.configError
            ? { data: null, error: new Error(script.configError) }
            : { data: script.configRows, error: null },
        );
      } else {
        resolve({ data: [], error: null });
      }
    };
    return b;
  };
  return {
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

const getReq = (): VercelRequest => ({ method: 'GET', query: {}, headers: {} }) as VercelRequest;

describe('GET /config/public', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://public.test.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    mocks.script.configRows = [
      { key: 'QUALIFICATION_MIN_AGE', value: '18' },
      { key: 'GENDERS', value: '["Male","Female","Others"]' },
      { key: 'MIN_WITHDRAWAL_AMOUNT', value: '100.00' },
      { key: 'MAX_WITHDRAWAL_AMOUNT', value: '50000.00' },
    ];
    mocks.script.configError = null;
    mocks.script.countries = [{ code: 'PH', name: 'Philippines' }];
  });

  it('serves the non-sensitive subset including withdrawal limits', async () => {
    const { res, seen } = capture();
    await handler(getReq(), res);
    expect(seen.status).toBe(200);
    expect(seen.body).toMatchObject({
      minimumAge: 18,
      genders: ['Male', 'Female', 'Others'],
      countries: [{ code: 'PH', name: 'Philippines' }],
      withdrawalLimits: { min: '100.00', max: '50000.00' },
    });
  });

  it('serves phone metadata for countries that carry it', async () => {
    mocks.script.countries = [
      {
        code: 'PH',
        name: 'Philippines',
        dial_code: '63',
        phone_national_min: 10,
        phone_national_max: 10,
        phone_pattern: '^9[0-9]{9}$',
      },
      { code: 'US', name: 'United States' },
    ];
    const { res, seen } = capture();
    await handler(getReq(), res);
    expect(seen.status).toBe(200);
    expect(seen.body).toMatchObject({
      countries: [
        {
          code: 'PH',
          name: 'Philippines',
          dialCode: '63',
          phoneMin: 10,
          phoneMax: 10,
          phonePattern: '^9[0-9]{9}$',
        },
        { code: 'US', name: 'United States' },
      ],
    });
  });

  it('drops malformed phone metadata instead of serving it', async () => {
    mocks.script.countries = [
      {
        code: 'PH',
        name: 'Philippines',
        dial_code: '6+3!',
        phone_national_min: 'ten',
        phone_national_max: -1,
        phone_pattern: 42,
      },
    ];
    const { res, seen } = capture();
    await handler(getReq(), res);
    expect(seen.status).toBe(200);
    expect(seen.body).toMatchObject({ countries: [{ code: 'PH', name: 'Philippines' }] });
  });

  it('falls back to safe defaults for missing or malformed rows', async () => {
    mocks.script.configRows = [
      { key: 'GENDERS', value: 'not-json' },
      { key: 'MIN_WITHDRAWAL_AMOUNT', value: 'abc' },
    ];
    const { res, seen } = capture();
    await handler(getReq(), res);
    expect(seen.status).toBe(200);
    expect(seen.body).toMatchObject({
      minimumAge: 18,
      genders: ['Male', 'Female', 'Others'],
      withdrawalLimits: { min: '100.00', max: '50000.00' },
    });
  });

  it('500s config read failures', async () => {
    mocks.script.configError = 'connection refused';
    const { res, seen } = capture();
    await handler(getReq(), res);
    expect(seen.status).toBe(500);
  });
});
