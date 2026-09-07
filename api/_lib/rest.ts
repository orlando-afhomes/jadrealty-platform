import { createClient } from '@supabase/supabase-js';

import { getSupabaseEnv } from './env.js';
import { toErrorEnvelope } from './envelope.js';
import type { VercelResponse } from './http.js';

/**
 * Shared REST helpers for api/ collection handlers: list envelopes matching
 * what `requestList` validates (`{ data, meta: { page, pageSize, total } }`),
 * service-role client acquisition, and small error shortcuts.
 */

export function okList(res: VercelResponse, rows: unknown[]): void {
  res.status(200).json({ data: rows, meta: { page: 1, pageSize: rows.length, total: rows.length } });
}

export function methodNotAllowed(res: VercelResponse, method: string | undefined): void {
  const { error, status } = toErrorEnvelope('NOT_FOUND', `Method ${method} not allowed`, 405);
  res.status(status).json({ error });
}

/** Service-role client, or a 500 already sent (returns null in that case). */
export function requireService(res: VercelResponse) {
  const { url, serviceKey } = getSupabaseEnv();
  if (!url || !serviceKey) {
    const { error, status } = toErrorEnvelope('INTERNAL', 'Supabase not configured', 500);
    res.status(status).json({ error });
    return null;
  }
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false } });
}

/** Parse a JSON-capable request body (dev-server pre-parses; Vercel may give a string). */
export function readJsonBody(req: { body?: unknown }):
  | { ok: true; body: unknown }
  | { ok: false; error: ReturnType<typeof toErrorEnvelope> } {
  let body: unknown = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return { ok: false, error: toErrorEnvelope('VALIDATION_ERROR', 'Invalid JSON body', 400) };
    }
  }
  return { ok: true, body };
}
