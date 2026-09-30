import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCreateClient = vi.fn((...args: unknown[]) => {
  void args;
  return { auth: {} };
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}));

import { getSupabaseClient, isSupabaseConfigured, resetSupabaseClientForTest } from './supabase';

/**
 * A trailing newline pasted into the Vercel `VITE_SUPABASE_ANON_KEY` once
 * produced an invalid `apikey` on every request and in the Realtime
 * WebSocket URL (`...QmtOg%0A`). The client must trim before constructing.
 */
describe('supabase client env hygiene', () => {
  beforeEach(() => {
    resetSupabaseClientForTest();
    mockCreateClient.mockClear();
    vi.stubEnv('VITE_SUPABASE_URL', 'https://ref.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key\n');
  });

  it('treats a trailing-newline anon key as configured', () => {
    expect(isSupabaseConfigured()).toBe(true);
  });

  it('passes the trimmed key to createClient (no %0A realtime bug)', () => {
    expect(getSupabaseClient()).not.toBeNull();
    expect(mockCreateClient).toHaveBeenCalledWith(
      'https://ref.supabase.co',
      'anon-key',
      expect.anything(),
    );
  });
});
