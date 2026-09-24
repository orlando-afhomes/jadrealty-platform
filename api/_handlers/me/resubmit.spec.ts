import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VercelRequest, VercelResponse } from '../../_lib/http.js';

import resubmitHandler from './resubmit.js';

/**
 * Resubmit ID upload (Phase B8+): fresh file bytes upload to the private
 * bucket while only metadata (+ storagePath) is stored; payloads without
 * bytes keep the existing document untouched.
 */
const mocks = vi.hoisted(() => {
  const calls: { table: string; op: string; arg?: unknown }[] = [];
  const script = {
    member: null as unknown,
    registrationRow: null as unknown,
    country: null as unknown,
    province: null as unknown,
    city: null as unknown,
    barangay: null as unknown,
    minAge: '18',
    uploadError: null as string | null,
  };
  const builder = (table: string) => {
    const b: Record<string, (...a: never[]) => unknown> = {};
    b.select = () => b;
    b.eq = () => b;
    b.maybeSingle = async () => {
      if (table === 'Member') return { data: script.member, error: null };
      if (table === 'SystemConfig') return { data: { value: script.minAge }, error: null };
      if (table === 'Registration') return { data: script.registrationRow, error: null };
      if (table === 'countries') return { data: script.country, error: null };
      if (table === 'ph_provinces') return { data: script.province, error: null };
      if (table === 'ph_cities') return { data: script.city, error: null };
      if (table === 'ph_barangays') return { data: script.barangay, error: null };
      return { data: null, error: null };
    };
    return {
      ...b,
      update: (patch: unknown) => {
        calls.push({ table, op: 'update', arg: patch });
        return { eq: async () => ({ error: null }) };
      },
    };
  };
  return {
    calls,
    script,
    service: {
      from: (table: string) => builder(table),
      storage: {
        from: () => ({
          upload: async (...args: unknown[]) => {
            calls.push({ table: 'government-ids', op: 'upload', arg: args[0] });
            if (script.uploadError) return { error: { message: script.uploadError } };
            return { error: null };
          },
          remove: async (paths: unknown) => {
            calls.push({ table: 'government-ids', op: 'remove', arg: paths });
            return { error: null };
          },
        }),
      },
      auth: {
        admin: {
          getUserById: async () => ({ data: { user: null } }),
        },
      },
    },
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

describe('POST /me/resubmit government ID', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://doc.test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    mocks.calls.length = 0;
    mocks.script.uploadError = null;
    mocks.script.registrationRow = null;
    mocks.script.country = {
      code: 'PH',
      dial_code: '63',
      phone_national_min: 10,
      phone_national_max: 10,
      phone_pattern: '^9[0-9]{9}$',
    };
    mocks.script.province = { code: '0128', name: 'Ilocos Norte' };
    mocks.script.city = { code: '012801', name: 'Laoag City', province_code: '0128' };
    mocks.script.barangay = { code: '012801001', name: 'Brgy 1', city_code: '012801' };
    mocks.script.member = {
      id: 'mem-uuid-1',
      status: 'REJECTED',
      email: 'juan@example.com',
      firstName: 'Juan',
      lastName: 'Dela Cruz',
      countryCode: 'PH',
      registrationId: 'reg-001',
    };
  });

  it('uploads a fresh file and stores metadata plus the path', async () => {
    const png =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const { res, seen } = capture();
    await resubmitHandler(
      {
        method: 'POST',
        query: {},
        headers: authed,
        body: {
          governmentId: { fileName: 'id.png', mimeType: 'image/png', sizeBytes: 70, data: png },
        },
      } as VercelRequest,
      res,
    );
    expect(seen.status).toBe(200);
    expect(mocks.calls.some((c) => c.table === 'government-ids')).toBe(true);
    const update = mocks.calls.find((c) => c.table === 'Registration')?.arg as Record<
      string,
      unknown
    >;
    const governmentId = update.governmentId as Record<string, unknown>;
    expect(typeof governmentId.storagePath === 'string').toBe(true);
    expect(governmentId.data).toBeUndefined();
    expect(governmentId.fileName).toBe('id.png');
  });

  it('leaves the stored document alone when no bytes are sent', async () => {
    const { res, seen } = capture();
    await resubmitHandler(
      {
        method: 'POST',
        query: {},
        headers: authed,
        body: { phone: '+639100000001' },
      } as VercelRequest,
      res,
    );
    expect(seen.status).toBe(200);
    expect(mocks.calls.some((c) => c.table === 'government-ids')).toBe(false);
    // Returning to PENDING re-opens review, including the government ID -
    // the approval-time flag is cleared.
    const memberUpdate = mocks.calls.find((c) => c.table === 'Member')?.arg as Record<
      string,
      unknown
    >;
    expect(memberUpdate).toMatchObject({ status: 'PENDING', idVerified: false });
  });

  it('500s a failed upload without losing the application update', async () => {
    mocks.script.uploadError = 'bucket missing';
    const { res, seen } = capture();
    await resubmitHandler(
      {
        method: 'POST',
        query: {},
        headers: authed,
        body: {
          governmentId: {
            fileName: 'id.png',
            mimeType: 'image/png',
            sizeBytes: 3,
            data: 'data:,QQ==',
          },
        },
      } as VercelRequest,
      res,
    );
    expect(seen.status).toBe(500);
    expect(seen.body).toMatchObject({ error: { code: 'INTERNAL', message: 'bucket missing' } });
  });

  it('removes the superseded ID file after a replacement upload', async () => {
    mocks.script.registrationRow = {
      governmentId: {
        fileName: 'old-id.png',
        mimeType: 'image/png',
        storagePath: 'reg-001/1756000000-old-id.png',
      },
    };
    const png =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const { res, seen } = capture();
    await resubmitHandler(
      {
        method: 'POST',
        query: {},
        headers: authed,
        body: {
          governmentId: { fileName: 'id.png', mimeType: 'image/png', sizeBytes: 70, data: png },
        },
      } as VercelRequest,
      res,
    );
    expect(seen.status).toBe(200);
    const update = mocks.calls.find((c) => c.table === 'Registration')?.arg as Record<
      string,
      unknown
    >;
    const governmentId = update.governmentId as Record<string, unknown>;
    expect(governmentId.storagePath).not.toBe('reg-001/1756000000-old-id.png');
    const removal = mocks.calls.find((c) => c.table === 'government-ids' && c.op === 'remove');
    expect(removal?.arg).toEqual(['reg-001/1756000000-old-id.png']);
  });

  it('400s schema-invalid values that previously passed unvalidated', async () => {
    for (const body of [
      { firstName: 'Juan3' },
      { phone: '0918-CALL-ME' },
      { dateOfBirth: 'not-a-date' },
      { dateOfBirth: '2030-01-01' },
      { provinceCode: '0128' },
      { region: 'California' },
    ]) {
      const { res, seen } = capture();
      await resubmitHandler(
        { method: 'POST', query: {}, headers: authed, body } as VercelRequest,
        res,
      );
      expect(seen.status).toBe(400);
    }
  });

  it('normalizes phone to E.164 and resolves hierarchy names', async () => {
    const { res, seen } = capture();
    await resubmitHandler(
      {
        method: 'POST',
        query: {},
        headers: authed,
        body: {
          phone: '0918 555 0101',
          provinceCode: '0128',
          cityCode: '012801',
          barangayCode: '012801001',
        },
      } as VercelRequest,
      res,
    );
    expect(seen.status).toBe(200);
    const memberUpdate = mocks.calls.find((c) => c.table === 'Member')?.arg as Record<
      string,
      unknown
    >;
    expect(memberUpdate.phone).toBe('+639185550101');
    expect(memberUpdate).toMatchObject({
      province_code: '0128',
      province_name: 'Ilocos Norte',
      city_code: '012801',
      city_name: 'Laoag City',
      barangay_code: '012801001',
      barangay_name: 'Brgy 1',
    });
  });

  it('400s a city that does not belong to the selected province', async () => {
    mocks.script.city = { code: '133900', name: 'City of Manila', province_code: null };
    const { res, seen } = capture();
    await resubmitHandler(
      {
        method: 'POST',
        query: {},
        headers: authed,
        body: { provinceCode: '0128', cityCode: '133900', barangayCode: '133900001' },
      } as VercelRequest,
      res,
    );
    expect(seen.status).toBe(400);
  });
});
