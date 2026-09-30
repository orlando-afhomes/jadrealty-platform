import { locationSuggestQuerySchema, locationSuggestionSchema } from '@jad/contracts';

import { toErrorEnvelope } from '../../_lib/envelope.js';
import { fetchNominatimJson, getNominatimConfig } from '../../_lib/geocode.js';
import type { VercelRequest, VercelResponse } from '../../_lib/http.js';
import { enforceRateLimit } from '../../_lib/rate-limit.js';
import { methodNotAllowed, okList } from '../../_lib/rest.js';

const MAX_RESULTS = 5;

function pickString(...candidates: unknown[]): string {
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim() !== '') return candidate.trim();
  }
  return '';
}

interface NominatimAddress {
  state?: unknown;
  county?: unknown;
  city?: unknown;
  town?: unknown;
  village?: unknown;
  hamlet?: unknown;
}

interface NominatimRow {
  display_name?: unknown;
  address?: NominatimAddress;
}

/**
 * Map Nominatim `/search` rows to registration fill values. Region prefers
 * state (county fallback); city prefers city/town/village/hamlet. Rows
 * missing either side are dropped - a suggestion must fill both fields.
 */
export function mapSuggestRows(data: unknown): { label: string; region: string; city: string }[] {
  if (!Array.isArray(data)) return [];
  const out: { label: string; region: string; city: string }[] = [];
  for (const item of data.slice(0, MAX_RESULTS)) {
    const row = item as NominatimRow;
    const address = row.address ?? {};
    const region = pickString(address.state, address.county);
    const city = pickString(address.city, address.town, address.village, address.hamlet);
    const candidate = {
      label: pickString(row.display_name, city && region ? `${city}, ${region}` : ''),
      region,
      city,
    };
    if (locationSuggestionSchema.safeParse(candidate).success) out.push(candidate);
  }
  return out;
}

/**
 * GET /locations/suggest?countryCode=US&q=los - public international
 * address suggestions for non-PH registration (region/state + city fill
 * values via Nominatim forward search, country-scoped). Assistive only:
 * provider outages degrade to an empty list (the form always accepts free
 * text and the server stores submitted text verbatim), never a client
 * error - details stay in server logs. The Philippines keeps its curated
 * PSGC hierarchy instead.
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
  // Nominatim policy (~1 req/s): per-IP brake on top of the client's
  // debounce + min-length gating.
  if (!enforceRateLimit(req, res, { scope: 'locations/suggest', max: 30 })) {
    return;
  }
  const query = locationSuggestQuerySchema.safeParse({
    countryCode:
      typeof req.query.countryCode === 'string' ? req.query.countryCode.trim().toUpperCase() : '',
    q: typeof req.query.q === 'string' ? req.query.q : '',
  });
  if (!query.success) {
    const { error, status } = toErrorEnvelope(
      'VALIDATION_ERROR',
      'Enter at least 3 characters to search.',
      400,
    );
    res.status(status).json({ error });
    return;
  }
  const { countryCode, q } = query.data;
  if (countryCode === 'PH') {
    const { error, status } = toErrorEnvelope(
      'VALIDATION_ERROR',
      'The Philippines uses the province/city/barangay list instead.',
      400,
    );
    res.status(status).json({ error });
    return;
  }
  const config = getNominatimConfig();
  const params = new URLSearchParams({
    format: 'json',
    q,
    countrycodes: countryCode.toLowerCase(),
    addressdetails: '1',
    limit: String(MAX_RESULTS),
  });
  try {
    const data = await fetchNominatimJson(`${config.searchUrl}?${params.toString()}`, config);
    okList(res, mapSuggestRows(data));
  } catch (error) {
    console.error('[locations/suggest] provider failed:', (error as Error)?.message ?? error);
    okList(res, []);
  }
}
