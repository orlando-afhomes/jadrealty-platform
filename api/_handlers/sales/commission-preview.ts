import { commissionPreviewSchema } from '@jad/contracts';

import { verifyUser } from '../../_lib/auth.js';
import { resolveCategoryRates } from '../../_lib/category-rates.js';
import { toErrorEnvelope } from '../../_lib/envelope.js';
import type { VercelRequest, VercelResponse } from '../../_lib/http.js';
import { methodNotAllowed, requireService } from '../../_lib/rest.js';

/**
 * GET /sales/commission-preview?propertyId= - pre-submission commission
 * estimate for the member submit form (read-only, creates nothing).
 * Rates resolve per-category with global fallback, the same source
 * sale_qualify uses; the client multiplies by the catalog price locally.
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
  const auth = await verifyUser(req);
  if ('error' in auth) {
    const { error, status } = auth.error;
    res.status(status).json({ error });
    return;
  }
  const rawId = req.query.propertyId;
  const propertyId = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!propertyId || typeof propertyId !== 'string' || !propertyId.trim()) {
    const { error, status } = toErrorEnvelope('VALIDATION_ERROR', 'propertyId is required.', 400);
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const resolved = await resolveCategoryRates(supabase, [propertyId.trim()]);
  const rates = resolved.get(propertyId.trim());
  if (!rates?.directRate || !rates?.referralRate) {
    const { error, status } = toErrorEnvelope(
      'VALIDATION_ERROR',
      'Commission rates are not configured for this property.',
      422,
    );
    res.status(status).json({ error });
    return;
  }
  const parsed = commissionPreviewSchema.safeParse({
    propertyId: propertyId.trim(),
    directRate: rates.directRate,
    referralRate: rates.referralRate,
  });
  if (!parsed.success) {
    const { error, status } = toErrorEnvelope('INTERNAL', 'Stored rates failed validation', 500);
    res.status(status).json({ error });
    return;
  }
  res.status(200).json(parsed.data);
}
