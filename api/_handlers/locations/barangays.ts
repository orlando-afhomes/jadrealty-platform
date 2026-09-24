import { barangayRefSchema, barangaysQuerySchema } from '@jad/contracts';

import { toErrorEnvelope } from '../../_lib/envelope.js';
import type { VercelRequest, VercelResponse } from '../../_lib/http.js';
import { methodNotAllowed, okList, requireService } from '../../_lib/rest.js';

/**
 * GET /locations/barangays?cityCode=... - public barangays of one
 * city/municipality. Unknown cities 404 (fail-closed so manipulated parents
 * cannot probe or bypass the hierarchy).
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
  const query = barangaysQuerySchema.safeParse({
    cityCode: typeof req.query.cityCode === 'string' ? req.query.cityCode.trim() : '',
  });
  if (!query.success) {
    const { error, status } = toErrorEnvelope(
      'VALIDATION_ERROR',
      'A city/municipality is required.',
      400,
    );
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const cityCode = query.data.cityCode;
  const { data: city, error: cityError } = await supabase
    .from('ph_cities')
    .select('code')
    .eq('code', cityCode)
    .maybeSingle();
  if (cityError) {
    const { error, status } = toErrorEnvelope('INTERNAL', cityError.message, 500);
    res.status(status).json({ error });
    return;
  }
  if (!city) {
    const { error, status } = toErrorEnvelope('NOT_FOUND', 'Unknown city/municipality.', 404);
    res.status(status).json({ error });
    return;
  }
  const { data, error } = await supabase
    .from('ph_barangays')
    .select('code, name, city_code')
    .eq('city_code', cityCode)
    .order('name');
  if (error) {
    const { error: env, status } = toErrorEnvelope('INTERNAL', error.message, 500);
    res.status(status).json({ error: env });
    return;
  }
  const rows = (((data as Record<string, unknown>[] | null) ?? [])
    .map((row) => ({
      code: row.code,
      name: row.name,
      cityCode: (row.city_code ?? row.cityCode) as string,
    }))
    .filter((row) => barangayRefSchema.safeParse(row).success));
  okList(res, rows);
}
