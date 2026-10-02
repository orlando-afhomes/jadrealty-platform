import { voucherAssignmentSchema } from '@jad/contracts';
import { isExpired } from '@jad/shared';

import { ADMIN_STAFF } from '../../../../_lib/access.js';
import { appendAudit } from '../../../../_lib/audit.js';
import { verifyStaffModule } from '../../../../_lib/auth.js';
import type { VercelRequest, VercelResponse } from '../../../../_lib/http.js';
import { mapVoucherAssignmentRow } from '../../../../_lib/pipeline.js';
import { enforceRateLimit } from '../../../../_lib/rate-limit.js';
import { methodNotAllowed, requireService } from '../../../../_lib/rest.js';
import { toErrorEnvelope } from '../../../../_lib/envelope.js';

/**
 * POST /admin/vouchers/:id/redeem - confirm a scan and redeem the voucher in
 * full (super_admin, admin). Single conditional UPDATE (status ACTIVE only)
 * so concurrent confirmations cannot double-redeem; remaining value goes to
 * '0.00' and the redemption is stamped + audited.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'POST') {
    methodNotAllowed(res, req.method);
    return;
  }
  const auth = await verifyStaffModule(req, 'vouchers', ADMIN_STAFF);
  if ('error' in auth) {
    const { error, status } = auth.error;
    res.status(status).json({ error });
    return;
  }
  // Redemptions move value - brake floods alongside scan (V2).
  if (
    !enforceRateLimit(req, res, {
      scope: 'admin/vouchers/redeem',
      max: process.env.VOUCHERS_REDEEM_RATE_LIMIT
        ? Number(process.env.VOUCHERS_REDEEM_RATE_LIMIT)
        : 120,
    })
  ) {
    return;
  }
  const rawId = req.query.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id) {
    const { error, status } = toErrorEnvelope('VALIDATION_ERROR', 'Voucher id is required', 400);
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const { data: found, error: readError } = await supabase
    .from('Voucher')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (readError || !found) {
    const { error, status } = toErrorEnvelope('NOT_FOUND', 'Voucher not found', 404);
    res.status(status).json({ error });
    return;
  }
  const current = found as Record<string, unknown>;
  if (current.status !== 'ACTIVE') {
    const { error, status } = toErrorEnvelope(
      'CONFLICT',
      'This voucher has already been redeemed.',
      409,
    );
    res.status(status).json({ error });
    return;
  }
  // Re-check expiry at confirm time: scan enforces this too, but redeem is a
  // separate request - the voucher may have expired since the scan, or the
  // caller may have skipped scan entirely (V1).
  if (isExpired(typeof current.expiresAt === 'string' ? current.expiresAt : undefined)) {
    const { error, status } = toErrorEnvelope('CONFLICT', 'This voucher has expired.', 409);
    res.status(status).json({ error });
    return;
  }
  const now = new Date().toISOString();
  const { data: updated, error: updateError } = await supabase
    .from('Voucher')
    .update({
      status: 'FULLY_REDEEMED',
      remainingValue: '0.00',
      redeemedAt: now,
      redeemedBy: auth.userId,
    })
    .eq('id', id)
    .eq('status', 'ACTIVE')
    .select('*')
    .maybeSingle();
  if (updateError) {
    const { error: env, status } = toErrorEnvelope('INTERNAL', updateError.message, 500);
    res.status(status).json({ error: env });
    return;
  }
  if (!updated) {
    const { error: env, status } = toErrorEnvelope(
      'CONFLICT',
      'This voucher has already been redeemed.',
      409,
    );
    res.status(status).json({ error: env });
    return;
  }
  const redeemed = updated as Record<string, unknown>;
  await appendAudit(supabase, {
    action: 'VOUCHER_REDEEMED',
    actorId: auth.userId,
    actorRole: auth.slugs[0] ?? 'admin',
    targetType: 'Voucher',
    targetId: id,
    targetName: `${String(current.title ?? id)} - ${String(current.memberName ?? '')}`,
    detail: `Redeemed voucher ${String(current.code ?? id)} for ${String(current.memberName ?? '')}`,
  });
  const validated = voucherAssignmentSchema.safeParse(mapVoucherAssignmentRow(redeemed));
  if (!validated.success) {
    const { error: env, status } = toErrorEnvelope(
      'INTERNAL',
      'Redeemed voucher failed validation',
      500,
    );
    res.status(status).json({ error: env });
    return;
  }
  res.status(200).json(validated.data);
}
