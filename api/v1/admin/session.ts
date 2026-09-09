import { queryStaffSlugs, verifyUser } from '../../_lib/auth.js';
import type { VercelRequest, VercelResponse } from '../../_lib/http.js';
import { methodNotAllowed, requireService } from '../../_lib/rest.js';
import { toErrorEnvelope } from '../../_lib/envelope.js';
import { staffSessionSchema } from '@jad/contracts';

/**
 * GET /admin/session — own staff session (Phase 6 staff separation).
 * Any authenticated caller; resolves the StaffUser row + role slugs via
 * service_role so admin clients never read Role tables with the anon key.
 * 404 when the caller holds no staff identity (client treats as non-staff).
 */
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
  const user = await verifyUser(req);
  if ('error' in user) {
    const { error, status } = user.error;
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const { data: staff, error } = await supabase
    .from('StaffUser')
    .select('id,email,name,status')
    .eq('id', user.userId)
    .maybeSingle();
  if (error || !staff) {
    const { error: env, status } = toErrorEnvelope('NOT_FOUND', 'No staff profile', 404);
    res.status(status).json({ error: env });
    return;
  }
  const row = staff as { id: string; email: string; name: string; status: string };
  const slugs = await queryStaffSlugs(supabase, user.userId);
  const parsed = staffSessionSchema.safeParse({
    id: row.id,
    email: row.email,
    name: row.name,
    status: row.status,
    slugs,
  });
  if (!parsed.success) {
    const { error: env, status } = toErrorEnvelope(
      'INTERNAL',
      'Stored staff record failed validation',
      500,
    );
    res.status(status).json({ error: env });
    return;
  }
  res.status(200).json(parsed.data);
}
