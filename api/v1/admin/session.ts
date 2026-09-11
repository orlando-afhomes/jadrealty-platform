import { queryStaffSlugs, verifyUser } from '../../_lib/auth.js';
import type { VercelRequest, VercelResponse } from '../../_lib/http.js';
import { methodNotAllowed, readJsonBody, requireService } from '../../_lib/rest.js';
import { toErrorEnvelope } from '../../_lib/envelope.js';
import { appendAudit } from '../../_lib/audit.js';
import { staffSessionSchema, updateStaffProfileRequestSchema } from '@jad/contracts';

/**
 * GET /admin/session — own staff session (Phase 6 staff separation).
 * PATCH /admin/session — update own display name (My Account).
 * Any authenticated caller; resolves the StaffUser row + role slugs via
 * service_role so admin clients never read Role tables with the anon key.
 * 404 when the caller holds no staff identity (client treats as non-staff).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PATCH,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'GET' && req.method !== 'PATCH') {
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
    .select('id,email,name,status,mustChangePassword')
    .eq('id', user.userId)
    .maybeSingle();
  if (error || !staff) {
    const { error: env, status } = toErrorEnvelope('NOT_FOUND', 'No staff profile', 404);
    res.status(status).json({ error: env });
    return;
  }
  const row = staff as {
    id: string;
    email: string;
    name: string;
    status: string;
    mustChangePassword?: boolean;
  };
  // A disabled staff identity must not resolve a session — the shell would
  // otherwise load while every data call 403s. verifyStaff enforces the same.
  if (row.status === 'DISABLED') {
    const { error: env, status } = toErrorEnvelope('FORBIDDEN', 'Account disabled.', 403);
    res.status(status).json({ error: env });
    return;
  }

  if (req.method === 'PATCH') {
    const parsedBody = readJsonBody(req);
    if (!parsedBody.ok) {
      const { error: bodyError, status } = parsedBody.error;
      res.status(status).json({ error: bodyError });
      return;
    }
    const parsed = updateStaffProfileRequestSchema.safeParse(parsedBody.body);
    if (!parsed.success) {
      const { error: env, status } = toErrorEnvelope(
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message ?? 'Enter a display name.',
        400,
        parsed.error.issues,
      );
      res.status(status).json({ error: env });
      return;
    }
    const { error: updateError } = await supabase
      .from('StaffUser')
      .update({ name: parsed.data.name })
      .eq('id', user.userId);
    if (updateError) {
      const { error: env, status } = toErrorEnvelope('INTERNAL', updateError.message, 500);
      res.status(status).json({ error: env });
      return;
    }
    row.name = parsed.data.name;
    // Keep the auth display cache in sync (the admin shell reads it for the
    // topbar). Best-effort: a metadata failure must not undo the StaffUser
    // write that the directory and session readers depend on.
    try {
      await supabase.auth.admin.updateUserById(user.userId, {
        user_metadata: { full_name: parsed.data.name },
      });
    } catch {
      // fall through — StaffUser already updated
    }
    await appendAudit(supabase, {
      action: 'STAFF_PROFILE_UPDATED',
      actorId: user.userId,
      actorRole: 'self',
      targetType: 'Staff',
      targetId: row.id,
      targetName: row.name,
      detail: `Updated display name to ${row.name}`,
    });
  }

  const slugs = await queryStaffSlugs(supabase, user.userId);
  const parsed = staffSessionSchema.safeParse({
    id: row.id,
    email: row.email,
    name: row.name,
    status: row.status,
    slugs,
    mustChangePassword: row.mustChangePassword === true,
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
