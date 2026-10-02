import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchRemoteFileSize } from './uploads';

describe('fetchRemoteFileSize', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the content-length on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 200, headers: { 'Content-Length': '12345' } })),
    );
    await expect(fetchRemoteFileSize('https://cdn.test/f.pdf')).resolves.toBe(12345);
  });

  it('returns null for non-http URLs without fetching', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await expect(fetchRemoteFileSize('data:text/plain,hi')).resolves.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns null on failure responses and network errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 403 })));
    await expect(fetchRemoteFileSize('https://cdn.test/f.pdf')).resolves.toBeNull();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('nope')));
    await expect(fetchRemoteFileSize('https://cdn.test/f.pdf')).resolves.toBeNull();
  });

  it('returns null for malformed lengths', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 200, headers: { 'Content-Length': 'lots' } })),
    );
    await expect(fetchRemoteFileSize('https://cdn.test/f.pdf')).resolves.toBeNull();
  });
});
