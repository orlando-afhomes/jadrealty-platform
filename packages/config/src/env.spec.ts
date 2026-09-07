import { describe, expect, it } from 'vitest';

import { loadPublicEnv } from '../src/index';

describe('loadPublicEnv', () => {
  it('defaults VITE_API_BASE_URL when absent', () => {
    const env = loadPublicEnv({});
    expect(env.VITE_API_BASE_URL).toBe('/api/v1');
  });

  it('reads an explicit VITE_API_BASE_URL', () => {
    const env = loadPublicEnv({ VITE_API_BASE_URL: 'https://api.example.test/api/v1' });
    expect(env.VITE_API_BASE_URL).toBe('https://api.example.test/api/v1');
  });

  it('ignores unknown keys', () => {
    const env = loadPublicEnv({ SOMETHING_ELSE: 'x', VITE_API_BASE_URL: '/api/v1' });
    expect(env.VITE_API_BASE_URL).toBe('/api/v1');
  });

  it('rejects a non-string VITE_API_BASE_URL', () => {
    expect(() => loadPublicEnv({ VITE_API_BASE_URL: 42 })).toThrow();
  });

  it('rejects an empty VITE_API_BASE_URL', () => {
    expect(() => loadPublicEnv({ VITE_API_BASE_URL: '' })).toThrow();
  });
});
