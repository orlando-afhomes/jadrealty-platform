import { describe, expect, it } from 'vitest';

import { createMockServer } from '../index';

function jsonEnvelope(): { error: { code: string; message: string } } {
  return { error: { code: 'NOT_FOUND', message: 'Not found' } };
}

describe('createMockServer', () => {
  it('intercepts requests by URL suffix and returns the mock body', async () => {
    const server = createMockServer(
      [
        {
          path: '/admin/queues',
          response: { registrations: 3, sales: 1, payouts: 2, withdrawals: 0 },
        },
      ],
      0,
    );
    server.install();
    const res = await fetch('/api/v1/admin/queues');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ registrations: 3, sales: 1, payouts: 2, withdrawals: 0 });
    server.restore();
  });

  it('supports status codes and the error envelope', async () => {
    const server = createMockServer(
      [
        {
          path: '/registrations',
          response: {
            body: jsonEnvelope(),
            status: 403,
          },
        },
      ],
      0,
    );
    server.install();
    const res = await fetch('/api/v1/registrations');
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe('NOT_FOUND');
    server.restore();
  });

  it('returns a 404 envelope for unmatched paths', async () => {
    const server = createMockServer([], 0);
    server.install();
    const res = await fetch('/api/v1/nope');
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe('NOT_FOUND');
    server.restore();
  });

  it('restores the original fetch', async () => {
    const original = globalThis.fetch;
    const server = createMockServer([], 0);
    server.install();
    expect(globalThis.fetch).not.toBe(original);
    server.restore();
    expect(globalThis.fetch).toBe(original);
  });

  it('supports function responses for dynamic data', async () => {
    const server = createMockServer([{ path: '/config', response: () => ({ count: 7 }) }], 0);
    server.install();
    const res = await fetch('/api/v1/config');
    expect(await res.json()).toEqual({ count: 7 });
    server.restore();
  });
});
