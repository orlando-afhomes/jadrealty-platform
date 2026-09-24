import { provinceRefSchema, provincesQuerySchema } from '@jad/contracts';

import { toErrorEnvelope } from '../../_lib/envelope.js';
import type { VercelRequest, VercelResponse } from '../../_lib/http.js';
import { methodNotAllowed, okList, requireService } from '../../_lib/rest.js';

/**
 * GET /locations/provinces?countryCode=PH - public top-level Philippine
 * address list: provinces plus independent/component cities (which sit
 * directly under their region). Only PH has a location dataset; other
 * countries use structured text fields instead.
 */
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
  const query = provincesQuerySchema.safeParse({
    countryCode:
      typeof req.query.countryCode === 'string' ? req.query.countryCode.trim().toUpperCase() : '',
  });
  if (!query.success || query.data.countryCode !== 'PH') {
    const { error, status } = toErrorEnvelope(
      'VALIDATION_ERROR',
      'A searchable location list is available for the Philippines only.',
      400,
    );
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const { data: provinces, error: provincesError } = await supabase
    .from('ph_provinces')
    .select('code, name')
    .order('name');
  if (provincesError) {
    const { error, status } = toErrorEnvelope('INTERNAL', provincesError.message, 500);
    res.status(status).json({ error });
    return;
  }
  const { data: independents, error: independentsError } = await supabase
    .from('ph_cities')
    .select('code, name')
    .is('province_code', null)
    .order('name');
  if (independentsError) {
    const { error, status } = toErrorEnvelope('INTERNAL', independentsError.message, 500);
    res.status(status).json({ error });
    return;
  }
  const rows = [
    ...(((provinces as { code: unknown; name: unknown }[] | null) ?? []).map((row) => ({
      code: row.code,
      name: row.name,
      kind: 'province',
    }))),
    ...(((independents as { code: unknown; name: unknown }[] | null) ?? []).map((row) => ({
      code: row.code,
      name: row.name,
      kind: 'city',
    }))),
  ]
    .filter((row) => provinceRefSchema.safeParse(row).success)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  okList(res, rows);
}
