import { saleSchema } from '@jad/contracts';

import { verifyUser } from '../../_lib/auth.js';
import type { VercelRequest, VercelResponse } from '../../_lib/http.js';
import { mapSaleRow } from '../../_lib/pipeline.js';
import { methodNotAllowed, requireService } from '../../_lib/rest.js';
import { toErrorEnvelope } from '../../_lib/envelope.js';

/** GET /sales/:id — own sale only (404 otherwise, hides existence). */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'GET') {
    methodNotAllowed(res, req.method);
    return;
  }
  const auth = await verifyUser(req);
  if ('error' in auth) {
    const { error, status } = auth.error;
    res.status(status).json({ error });
    return;
  }
  const rawId = req.query.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id) {
    const { error, status } = toErrorEnvelope('NOT_FOUND', 'Not found', 404);
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const { data, error } = await supabase
    .from('Sale')
    .select('*')
    .eq('id', id)
    .eq('sellerId', auth.userId)
    .maybeSingle();
  if (error) {
    const { error: env, status } = toErrorEnvelope('INTERNAL', error.message, 500);
    res.status(status).json({ error: env });
    return;
  }
  if (!data) {
    const { error: env, status } = toErrorEnvelope('NOT_FOUND', 'Not found', 404);
    res.status(status).json({ error: env });
    return;
  }
  const parsed = saleSchema.safeParse(mapSaleRow(data as Record<string, unknown>));
  if (!parsed.success) {
    const { error: env, status } = toErrorEnvelope('INTERNAL', 'Stored sale failed validation', 500);
    res.status(status).json({ error: env });
    return;
  }
  res.status(200).json(parsed.data);
}
