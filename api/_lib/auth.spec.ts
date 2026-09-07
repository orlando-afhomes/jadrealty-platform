import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  canonicalSlug,
  extractBearerToken,
  isAuthConflict,
  slugsAllowed,
  verifyStaff,
  verifyUser,
} from './auth.js';
import type { VercelRequest } from './http.js';

function req(headers: Record<string, string> = {}): VercelRequest {
  return { method: 'GET', query: {}, headers };
}

const ENV_KEYS = [
  'SUPABASE_URL',
  'VITE_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'DATABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_ANON_KEY',
  'VITE_SUPABASE_ANON_KEY',
] as const;

function setEnv(values: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
  for (const key of ENV_KEYS) {
    if (values[key] === undefined) delete process.env[key];
    else vi.stubEnv(key, values[key]);
  }
}

describe('canonicalSlug', () => {
  it('normalizes case and separators', () => {
    expect(canonicalSlug('Super-Admin')).toBe('super_admin');
    expect(canonicalSlug(' SUPER ADMIN ')).toBe('super_admin');
    expect(canonicalSlug('admin')).toBe('admin');
    expect(canonicalSlug(null)).toBe('');
  });
});

describe('slugsAllowed', () => {
  it('matches case- and separator-insensitively', () => {
    expect(slugsAllowed(['Super-Admin'], ['super_admin'])).toBe(true);
    expect(slugsAllowed(['ADMIN'], ['admin'])).toBe(true);
  });

  it('accepts compact superadmin against super_admin', () => {
    expect(slugsAllowed(['superadmin'], ['super_admin'])).toBe(true);
  });

  it('denies non-listed and empty slugs', () => {
    expect(slugsAllowed(['user'], ['super_admin', 'admin'])).toBe(false);
    expect(slugsAllowed([], ['super_admin', 'admin'])).toBe(false);
    expect(slugsAllowed(['finance'], ['super_admin', 'admin'])).toBe(false);
  });
});

describe('extractBearerToken', () => {
  it('prefers the Authorization bearer token', () => {
    expect(extractBearerToken(req({ authorization: 'Bearer abc123' }))).toBe('abc123');
  });

  it('parses the Supabase JSON auth cookie', () => {
    const cookie = `sb-ref-auth-token=${encodeURIComponent(JSON.stringify({ access_token: 'tok-1' }))}`;
    expect(extractBearerToken(req({ cookie }))).toBe('tok-1');
  });

  it('parses the array-form auth cookie', () => {
    const cookie = `sb-ref-auth-token=${encodeURIComponent(JSON.stringify([{ access_token: 'tok-2' }]))}`;
    expect(extractBearerToken(req({ cookie }))).toBe('tok-2');
  });

  it('falls back to a raw cookie string', () => {
    expect(extractBearerToken(req({ cookie: 'sb-ref-auth-token=raw-token' }))).toBe('raw-token');
  });

  it('returns undefined when no credential is present', () => {
    expect(extractBearerToken(req({}))).toBeUndefined();
    expect(extractBearerToken(req({ authorization: 'Basic xyz' }))).toBeUndefined();
  });
});

describe('verifyUser', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 500 when Supabase is not configured', async () => {
    setEnv({});
    const result = await verifyUser(req({ authorization: 'Bearer x' }));
    expect('error' in result && result.error.status).toBe(500);
  });

  it('returns 401 when the token is missing or invalid', async () => {
    setEnv({ SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_ANON_KEY: 'anon' });
    expect('error' in (await verifyUser(req({}))) && true).toBe(true);
    const bad = await verifyUser(req({ authorization: 'Bearer bad' }), {
      auth: { getUser: async () => ({ data: { user: null }, error: new Error('bad') }) },
    });
    expect('error' in bad && bad.error.status).toBe(401);
  });

  it('returns the auth user id without any role check', async () => {
    setEnv({ SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_ANON_KEY: 'anon' });
    const result = await verifyUser(req({ authorization: 'Bearer good' }), {
      auth: { getUser: async () => ({ data: { user: { id: 'mem-1' } }, error: null }) },
    });
    expect(result).toEqual({ userId: 'mem-1' });
  });
});

describe('verifyStaff', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 500 when Supabase is not configured', async () => {
    setEnv({});
    const result = await verifyStaff(req({ authorization: 'Bearer x' }), ['admin']);
    expect('error' in result && result.error.status).toBe(500);
  });

  it('returns 401 when the token is missing', async () => {
    setEnv({ SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_ANON_KEY: 'anon' });
    const result = await verifyStaff(req({}), ['admin']);
    expect('error' in result && result.error.status).toBe(401);
  });

  it('returns 401 for an invalid session', async () => {
    setEnv({ SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_ANON_KEY: 'anon' });
    const result = await verifyStaff(req({ authorization: 'Bearer bad' }), ['admin'], {
      anonClient: {
        auth: { getUser: async () => ({ data: { user: null }, error: new Error('bad') }) },
      },
    });
    expect('error' in result && result.error.status).toBe(401);
  });

  it('allows a listed staff slug and returns user plus slugs', async () => {
    setEnv({
      SUPABASE_URL: 'https://x.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'anon',
      SUPABASE_SERVICE_ROLE_KEY: 'service',
    });
    const result = await verifyStaff(
      req({ authorization: 'Bearer good' }),
      ['super_admin', 'admin'],
      {
        anonClient: {
          auth: {
            getUser: async () => ({
              data: { user: { id: 'u-1', user_metadata: {} } },
              error: null,
            }),
          },
        },
        serviceClient: {
          from: () => ({
            select: () => ({
              eq: async () => ({ data: [{ roleId: 'r-1' }], error: null }),
              in: async () => ({ data: [{ slug: 'super_admin' }], error: null }),
            }),
          }),
        },
      },
    );
    expect(result).toEqual({ userId: 'u-1', slugs: ['super_admin'] });
  });

  it('returns 403 for an unlisted role', async () => {
    setEnv({
      SUPABASE_URL: 'https://x.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'anon',
      SUPABASE_SERVICE_ROLE_KEY: 'service',
    });
    const result = await verifyStaff(
      req({ authorization: 'Bearer good' }),
      ['super_admin', 'admin'],
      {
        anonClient: {
          auth: {
            getUser: async () => ({
              data: { user: { id: 'u-2', user_metadata: {} } },
              error: null,
            }),
          },
        },
        serviceClient: {
          from: () => ({
            select: () => ({
              eq: async () => ({ data: [{ roleId: 'r-9' }], error: null }),
              in: async () => ({ data: [{ slug: 'user' }], error: null }),
            }),
          }),
        },
      },
    );
    expect('error' in result && result.error.status).toBe(403);
  });

  it('preserves the metadata fallback when the DB yields no links', async () => {
    setEnv({
      SUPABASE_URL: 'https://x.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'anon',
      SUPABASE_SERVICE_ROLE_KEY: 'service',
    });
    const empty = {
      from: () => ({
        select: () => ({
          eq: async () => ({ data: [], error: null }),
          in: async () => ({ data: [], error: null }),
        }),
      }),
    };
    const meta = {
      auth: {
        getUser: async () => ({
          data: { user: { id: 'u-3', user_metadata: { role: 'admin' } } },
          error: null,
        }),
      },
    };
    const allowed = await verifyStaff(req({ authorization: 'Bearer good' }), ['admin'], {
      anonClient: meta,
      serviceClient: empty,
    });
    expect(allowed).toEqual({ userId: 'u-3', slugs: ['admin'] });

    const denied = await verifyStaff(req({ authorization: 'Bearer good' }), ['admin'], {
      anonClient: {
        auth: {
          getUser: async () => ({ data: { user: { id: 'u-4', user_metadata: {} } }, error: null }),
        },
      },
      serviceClient: empty,
    });
    expect('error' in denied && denied.error.status).toBe(403);
  });
});

describe('isAuthConflict', () => {
  it('recognizes the real GoTrue duplicate wording', () => {
    expect(
      isAuthConflict(new Error('A user with this email address has already been registered')),
    ).toBe(true);
    expect(
      isAuthConflict(new Error('A user with this phone number has already been registered')),
    ).toBe(true);
  });

  it('recognizes legacy wording and error codes', () => {
    expect(isAuthConflict(new Error('already exists'))).toBe(true);
    expect(isAuthConflict({ message: 'duplicate key value', status: 409 })).toBe(true);
    expect(isAuthConflict({ message: 'x', code: 'email_exists' })).toBe(true);
    expect(isAuthConflict({ message: 'x', code: 'phone_exists' })).toBe(true);
  });

  it('rejects unrelated failures and non-errors', () => {
    expect(isAuthConflict(new Error('Database error saving new user'))).toBe(false);
    expect(isAuthConflict(new Error('Password should be stronger'))).toBe(false);
    expect(isAuthConflict(null)).toBe(false);
    expect(isAuthConflict('already exists')).toBe(false);
  });
});
