import { cityRefSchema, citiesQuerySchema } from '@jad/contracts';

import { toErrorEnvelope } from '../../_lib/envelope.js';
import type { VercelRequest, VercelResponse } from '../../_lib/http.js';
import { methodNotAllowed, okList, requireService } from '../../_lib/rest.js';

/**
 * GET /locations/cities?provinceCode=... - public cities/municipalities of
 * one province. An independent city code (top-level selection) has no
 * children and returns an empty list; unknown codes 404 (fail-closed so
 * manipulated parents cannot probe or bypass the hierarchy).
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
  const query = citiesQuerySchema.safeParse({
    provinceCode: typeof req.query.provinceCode === 'string' ? req.query.provinceCode.trim() : '',
  });
  if (!query.success) {
    const { error, status } = toErrorEnvelope('VALIDATION_ERROR', 'A province is required.', 400);
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const parentCode = query.data.provinceCode;
  const { data: province, error: provinceError } = await supabase
    .from('ph_provinces')
    .select('code')
    .eq('code', parentCode)
    .maybeSingle();
  if (provinceError) {
    const { error, status } = toErrorEnvelope('INTERNAL', provinceError.message, 500);
    res.status(status).json({ error });
    return;
  }
  if (province) {
    const { data, error } = await supabase
      .from('ph_cities')
      .select('code, name, province_code, is_city')
      .eq('province_code', parentCode)
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
        provinceCode: (row.province_code ?? row.provinceCode) as string | null,
        kind: row.is_city === false ? 'municipality' : 'city',
      }))
      .filter((row) => cityRefSchema.safeParse(row).success));
    okList(res, rows);
    return;
  }
  const { data: independent, error: independentError } = await supabase
    .from('ph_cities')
    .select('code')
    .eq('code', parentCode)
    .is('province_code', null)
    .maybeSingle();
  if (independentError) {
    const { error, status } = toErrorEnvelope('INTERNAL', independentError.message, 500);
    res.status(status).json({ error });
    return;
  }
  if (independent) {
    okList(res, []);
    return;
  }
  const { error, status } = toErrorEnvelope('NOT_FOUND', 'Unknown province.', 404);
  res.status(status).json({ error });
}
