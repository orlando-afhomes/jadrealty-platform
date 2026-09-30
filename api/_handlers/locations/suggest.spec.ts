import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VercelRequest, VercelResponse } from '../../_lib/http.js';

import handler from './suggest.js';

/** GET /locations/suggest - Nominatim-backed; fetch fully mocked. */
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

const NOMINATIM_ROWS = [
  {
    display_name: 'Los Angeles, California, United States',
    address: { state: 'California', city: 'Los Angeles' },
  },
  {
    display_name: 'Los Altos, California, United States',
    address: { state: 'California', town: 'Los Altos' },
  },
  // Missing city side - dropped, a suggestion must fill both fields.
  { display_name: 'California, United States', address: { state: 'California' } },
];

function mockProvider(rows: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => rows,
  });
}

describe('GET /locations/suggest', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps provider rows to region/city fill values', async () => {
    vi.stubGlobal('fetch', mockProvider(NOMINATIM_ROWS));
    const { res, seen } = capture();
    await handler(getReq({ countryCode: 'US', q: 'los' }), res);
    expect(seen.status).toBe(200);
    expect(seen.body).toMatchObject({
      data: [
        {
          label: 'Los Angeles, California, United States',
          region: 'California',
          city: 'Los Angeles',
        },
        { label: 'Los Altos, California, United States', region: 'California', city: 'Los Altos' },
      ],
    });
  });

  it('scopes the provider query to the country with policy headers', async () => {
    const fetchMock = mockProvider([]);
    vi.stubGlobal('fetch', fetchMock);
    const { res } = capture();
    await handler(getReq({ countryCode: 'US', q: 'los angeles' }), res);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/search?');
    expect(url).toContain('q=los+angeles');
    expect(url).toContain('countrycodes=us');
    expect(url).toContain('addressdetails=1');
    expect((init.headers as Record<string, string>)['User-Agent']).toMatch(/jad-realty/);
  });

  it('rejects the Philippines (curated hierarchy instead)', async () => {
    const fetchMock = mockProvider([]);
    vi.stubGlobal('fetch', fetchMock);
    const { res, seen } = capture();
    await handler(getReq({ countryCode: 'PH', q: 'manila' }), res);
    expect(seen.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects short queries without calling the provider', async () => {
    const fetchMock = mockProvider([]);
    vi.stubGlobal('fetch', fetchMock);
    const { res, seen } = capture();
    await handler(getReq({ countryCode: 'US', q: 'lo' }), res);
    expect(seen.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('degrades to an empty list when the provider fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    );
    const { res, seen } = capture();
    await handler(getReq({ countryCode: 'US', q: 'los' }), res);
    expect(seen.status).toBe(200);
    expect(seen.body).toMatchObject({ data: [] });
  });

  it('rejects non-GET methods', async () => {
    const { res, seen } = capture();
    await handler({ method: 'POST', query: {}, headers: {} } as VercelRequest, res);
    expect(seen.status).toBe(405);
  });
});
