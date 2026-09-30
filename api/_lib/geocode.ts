/**
 * Nominatim geocoding access - server-side only (keys/URLs never ship to
 * the client, no `VITE_` exposure). One provider identity for every geo
 * call: the `REVERSE_GEO_*` env knobs (URL, user agent, referer, timeout)
 * already required by registration location verification. OpenStreetMap
 * usage policy requires the identifying User-Agent; all calls are
 * server-side so no browser key management exists.
 */

export interface NominatimConfig {
  /** Reverse-geocode endpoint URL (verbatim env value). */
  reverseUrl: string;
  /** Forward-search endpoint URL (derived from the reverse URL). */
  searchUrl: string;
  timeoutMs: number;
  userAgent: string;
  referer: string;
}

/** Derive the `/search` endpoint from the configured reverse URL. */
export function deriveSearchUrl(reverseUrl: string): string {
  const trimmed = reverseUrl.replace(/\/+$/, '');
  if (trimmed.toLowerCase().endsWith('/reverse')) {
    return `${trimmed.slice(0, -'/reverse'.length)}/search`;
  }
  return `${trimmed}/search`;
}

export function getNominatimConfig(): NominatimConfig {
  const reverseUrl =
    process.env.REVERSE_GEO_PROVIDER_URL ?? 'https://nominatim.openstreetmap.org/reverse';
  const timeoutMs = Number(process.env.REVERSE_GEO_TIMEOUT_MS ?? 4000);
  return {
    reverseUrl,
    searchUrl: deriveSearchUrl(reverseUrl),
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 4000,
    userAgent: process.env.REVERSE_GEO_USER_AGENT ?? 'jad-realty/1.0 (contact: support@jad.local)',
    referer: process.env.REVERSE_GEO_REFERER ?? 'https://jad-realty.vercel.app',
  };
}

export interface NominatimFetchError extends Error {
  code: 'GEO_SEARCH_FAILED';
}

/**
 * GET a Nominatim JSON endpoint with policy headers + abort timeout.
 * Throws a coded error (never provider internals for the client - callers
 * log server-side and degrade gracefully).
 */
export async function fetchNominatimJson(
  fetchUrl: string,
  config: Pick<NominatimConfig, 'timeoutMs' | 'userAgent' | 'referer'>,
): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(fetchUrl, {
      headers: {
        'User-Agent': config.userAgent,
        Referer: config.referer,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(config.timeoutMs),
    });
  } catch (error) {
    throw Object.assign(
      new Error((error as Error).name === 'TimeoutError' ? 'Geocode timeout' : (error as Error).message),
      { code: 'GEO_SEARCH_FAILED', cause: error },
    );
  }
  if (!res.ok) {
    throw Object.assign(new Error(`Nominatim error ${res.status}`), { code: 'GEO_SEARCH_FAILED' });
  }
  try {
    return await res.json();
  } catch {
    throw Object.assign(new Error('Invalid Nominatim JSON'), { code: 'GEO_SEARCH_FAILED' });
  }
}
