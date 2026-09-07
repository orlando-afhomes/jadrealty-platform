import { policySchema } from '@jad/contracts';

import { toErrorEnvelope } from '../_lib/envelope.js';
import type { VercelRequest, VercelResponse } from '../_lib/http.js';
import { methodNotAllowed, okList, requireService } from '../_lib/rest.js';

/** GET /policies — public list (API-SPECIFICATION #69). */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'GET') {
    methodNotAllowed(res, req.method);
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const { data, error } = await supabase
    .from('Policy')
    .select('id, type, title, content, updated_at')
    .order('id');
  if (error) {
    const { error: env, status } = toErrorEnvelope('INTERNAL', error.message, 500);
    res.status(status).json({ error: env });
    return;
  }
  const rows = (((data as unknown[]) ?? []) as Record<string, unknown>[]).map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    content: row.content,
    updatedAt: row.updated_at ?? row.updatedAt,
  }));
  okList(res, rows.filter((row) => policySchema.safeParse(row).success));
}
