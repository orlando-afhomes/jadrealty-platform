import { policySchema } from '@jad/contracts';

import { verifyStaff } from '../../_lib/auth.js';
import { appendAudit } from '../../_lib/audit.js';
import { toErrorEnvelope } from '../../_lib/envelope.js';
import type { VercelRequest, VercelResponse } from '../../_lib/http.js';
import { methodNotAllowed, readJsonBody, requireService } from '../../_lib/rest.js';

const updateSchema = policySchema.pick({ title: true, type: true, content: true }).partial();

/** PUT /policies/:id — admin policy edit (FR-ADM-004). */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'PUT') {
    methodNotAllowed(res, req.method);
    return;
  }
  const auth = await verifyStaff(req, ['super_admin', 'admin']);
  if ('error' in auth) {
    const { error, status } = auth.error;
    res.status(status).json({ error });
    return;
  }
  const rawId = req.query.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id) {
    const { error, status } = toErrorEnvelope('VALIDATION_ERROR', 'Policy id is required', 400);
    res.status(status).json({ error });
    return;
  }
  const parsedBody = readJsonBody(req);
  if (!parsedBody.ok) {
    const { error, status } = parsedBody.error;
    res.status(status).json({ error });
    return;
  }
  const parsed = updateSchema.safeParse(parsedBody.body);
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    const { error, status } = toErrorEnvelope(
      'VALIDATION_ERROR',
      parsed.success ? 'Nothing to update' : (parsed.error.issues[0]?.message ?? 'Validation failed'),
      400,
      parsed.success ? undefined : parsed.error.issues,
    );
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.data.title !== undefined) patch.title = parsed.data.title;
  if (parsed.data.type !== undefined) patch.type = parsed.data.type;
  if (parsed.data.content !== undefined) patch.content = parsed.data.content;
  const { data, error } = await supabase.from('Policy').update(patch).eq('id', id).select().single();
  if (error) {
    const { error: env, status } = toErrorEnvelope('INTERNAL', error.message, 500);
    res.status(status).json({ error: env });
    return;
  }
  if (!data) {
    const { error: env, status } = toErrorEnvelope('NOT_FOUND', `Policy not found: ${id}`, 404);
    res.status(status).json({ error: env });
    return;
  }
  const row = data as { id: string; title: string };
  await appendAudit(supabase, {
    action: 'POLICY_UPDATED',
    actorId: auth.userId,
    actorRole: auth.slugs[0] ?? 'admin',
    targetType: 'Policy',
    targetId: row.id,
    targetName: row.title,
    detail: `Updated policy ${row.title}`,
  });
  res.status(200).json(data);
}
