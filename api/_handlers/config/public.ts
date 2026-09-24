import { toErrorEnvelope } from '../../_lib/envelope.js';
import type { VercelRequest, VercelResponse } from '../../_lib/http.js';
import { methodNotAllowed, requireService } from '../../_lib/rest.js';

const DEFAULT_GENDERS = ['Male', 'Female', 'Others'];

/** GET /config/public - non-sensitive parameters only (API-SPECIFICATION #81). */
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
  const supabase = requireService(res);
  if (!supabase) return;
  const { data: rows, error } = await supabase.from('SystemConfig').select('key, value');
  if (error) {
    const { error: env, status } = toErrorEnvelope('INTERNAL', error.message, 500);
    res.status(status).json({ error: env });
    return;
  }
  const byKey = new Map(
    ((rows as { key: string; value: string }[] | null) ?? []).map((r) => [r.key, r.value]),
  );
  const minimumAge = Number.parseInt(byKey.get('QUALIFICATION_MIN_AGE') ?? '18', 10);
  const moneyOk = (v: string | undefined): v is string =>
    typeof v === 'string' && /^[0-9]+(\.[0-9]{1,2})?$/.test(v);
  const minWithdrawal = byKey.get('MIN_WITHDRAWAL_AMOUNT');
  const maxWithdrawal = byKey.get('MAX_WITHDRAWAL_AMOUNT');
  let genders: string[] = DEFAULT_GENDERS;
  try {
    const parsed: unknown = JSON.parse(byKey.get('GENDERS') ?? '[]');
    if (Array.isArray(parsed) && parsed.every((g) => typeof g === 'string') && parsed.length > 0) {
      genders = parsed as string[];
    }
  } catch {
    // fall through to defaults
  }
  const { data: countries, error: countriesError } = await supabase
    .from('countries')
    .select('code, name, dial_code, phone_national_min, phone_national_max, phone_pattern')
    .eq('is_active', true)
    .order('code');
  if (countriesError) {
    const { error: env, status } = toErrorEnvelope('INTERNAL', countriesError.message, 500);
    res.status(status).json({ error: env });
    return;
  }
  res.status(200).json({
    minimumAge: Number.isFinite(minimumAge) ? minimumAge : 18,
    genders,
    countries: ((countries as Record<string, unknown>[] | null) ?? []).map(sanitizeCountry),
    withdrawalLimits: {
      min: moneyOk(minWithdrawal) ? minWithdrawal : '100.00',
      max: moneyOk(maxWithdrawal) ? maxWithdrawal : '50000.00',
    },
  });
}

/**
 * Phone metadata is operator-curated reference data - malformed values are
 * dropped per row (clients fall back to generic E.164) rather than served.
 */
function sanitizeCountry(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { code: row.code, name: row.name };
  if (typeof row.dial_code === 'string' && /^[0-9]{1,4}$/.test(row.dial_code)) {
    out.dialCode = row.dial_code;
  }
  const asBound = (value: unknown): number | null => {
    const n = typeof value === 'number' ? value : value === '' || value == null ? NaN : Number(value);
    return Number.isInteger(n) && (n as number) > 0 && (n as number) <= 15 ? (n as number) : null;
  };
  const min = asBound(row.phone_national_min);
  const max = asBound(row.phone_national_max);
  if (min !== null) out.phoneMin = min;
  if (max !== null) out.phoneMax = max;
  if (typeof row.phone_pattern === 'string' && row.phone_pattern.length > 0) {
    try {
      new RegExp(row.phone_pattern);
      out.phonePattern = row.phone_pattern;
    } catch {
      // invalid regex - drop it, generic length rules still apply
    }
  }
  return out;
}
