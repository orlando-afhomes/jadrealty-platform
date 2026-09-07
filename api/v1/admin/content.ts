import { verifyStaff } from '../../_lib/auth.js';
import type { VercelRequest, VercelResponse } from '../../_lib/http.js';
import { isValidContentItemRow, mapContentItemRow } from '../../_lib/mappers.js';
import { methodNotAllowed, okList, requireService } from '../../_lib/rest.js';
import { toErrorEnvelope } from '../../_lib/envelope.js';

/** GET /admin/content — full library incl. unpublished (super_admin + admin). */
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
  const auth = await verifyStaff(req, ['super_admin', 'admin']);
  if ('error' in auth) {
    const { error, status } = auth.error;
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const { data, error } = await supabase
    .from('ContentItem')
    .select('id, title, description, kind, download_url, share, created_at')
    .order('created_at', { ascending: false });
  if (error) {
    const { error: env, status } = toErrorEnvelope('INTERNAL', error.message, 500);
    res.status(status).json({ error: env });
    return;
  }
  const rows = (((data as unknown[]) ?? []) as Record<string, unknown>[]).map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    kind: row.kind,
    downloadUrl: row.download_url ?? undefined,
    share: (row.share as Record<string, string> | null) ?? undefined,
    createdAt: row.created_at,
  }));
  okList(res, rows.filter(isValidContentItemRow));
}
