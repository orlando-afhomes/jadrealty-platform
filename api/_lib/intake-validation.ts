import {
  GENERIC_E164_RULE,
  toPhoneRule,
  validatePhoneNumber,
  type PhoneCountryRule,
} from '@jad/contracts';

import { serviceClient } from './rest.js';

/**
 * Shared registration-intake guards (POST /auth/register + POST /me/resubmit).
 * Supabase access is injected as tiny query callbacks so the rules stay pure
 * and specs run without client mocks. Handlers adapt their service client;
 * the database remains the source of truth for rules and hierarchy.
 */

export interface CountryPhoneRow {
  code?: unknown;
  dial_code?: unknown;
  phone_national_min?: unknown;
  phone_national_max?: unknown;
  phone_pattern?: unknown;
}

/** Build the effective phone rule for a countries row (generic fallback). */
export function buildPhoneRule(row: CountryPhoneRow | null): PhoneCountryRule {
  if (!row) return { ...GENERIC_E164_RULE };
  return toPhoneRule({
    countryCode: row.code,
    dialCode: row.dial_code,
    min: row.phone_national_min,
    max: row.phone_national_max,
    pattern: row.phone_pattern,
  });
}

export interface CountryLookup {
  country: (code: string) => Promise<CountryPhoneRow | null>;
}

/**
 * Validate a raw phone against the resolved country rule. Returns the
 * canonical E.164 form for storage, or a client-safe failure message.
 */
export async function validateIntakePhone(
  deps: CountryLookup,
  countryCode: string,
  phone: string,
): Promise<{ ok: true; normalized: string } | { ok: false; message: string }> {
  const rule = buildPhoneRule(await deps.country(countryCode));
  const normalized = validatePhoneNumber(phone, rule);
  if (!normalized) return { ok: false, message: 'Enter a valid phone number.' };
  return { ok: true, normalized };
}

export interface LocationLookups extends CountryLookup {
  province: (code: string) => Promise<{ code: string; name: string } | null>;
  city: (
    code: string,
  ) => Promise<{ code: string; name: string; province_code: string | null } | null>;
  barangay: (code: string) => Promise<{ code: string; name: string; city_code: string } | null>;
}

/** Minimal chain surface (the real client's `from()` type omits chain methods). */
interface LookupChain {
  select: (...args: unknown[]) => LookupChain;
  eq: (...args: unknown[]) => LookupChain;
  is: (...args: unknown[]) => LookupChain;
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
}

type ServiceClient = NonNullable<ReturnType<typeof serviceClient>>;

type Row = Record<string, unknown> | null;

/**
 * Build the injected lookups from a service-role client. Read failures
 * resolve to null (callers treat missing reference data as invalid input,
 * fail-closed - never as a pass).
 */
export function locationLookupsFor(client: ServiceClient): LocationLookups {
  const from = client.from as unknown as (table: string) => LookupChain;
  const single = async (
    table: string,
    columns: string,
    column: string,
    value: string,
  ): Promise<Row> => {
    const { data, error } = await from(table).select(columns).eq(column, value).maybeSingle();
    if (error || !data || typeof data !== 'object') return null;
    return data as Record<string, unknown>;
  };
  return {
    country: async (code: string) =>
      single(
        'countries',
        'code, dial_code, phone_national_min, phone_national_max, phone_pattern',
        'code',
        code,
      ),
    province: async (code: string) => {
      const row = await single('ph_provinces', 'code, name', 'code', code);
      if (!row || typeof row.code !== 'string' || typeof row.name !== 'string') return null;
      return { code: row.code, name: row.name };
    },
    city: async (code: string) => {
      const row = await single('ph_cities', 'code, name, province_code', 'code', code);
      if (!row || typeof row.code !== 'string' || typeof row.name !== 'string') return null;
      const provinceCode = row.province_code;
      return {
        code: row.code,
        name: row.name,
        province_code: typeof provinceCode === 'string' ? provinceCode : null,
      };
    },
    barangay: async (code: string) => {
      const row = await single('ph_barangays', 'code, name, city_code', 'code', code);
      if (!row || typeof row.code !== 'string' || typeof row.name !== 'string') return null;
      const cityCode = row.city_code;
      if (typeof cityCode !== 'string') return null;
      return { code: row.code, name: row.name, city_code: cityCode };
    },
  };
}

export interface AddressInput {
  provinceCode?: string;
  cityCode?: string;
  barangayCode?: string;
  region?: string;
  city?: string;
  street?: string;
}

export interface AddressColumns {
  address: string | null;
  province_code: string | null;
  province_name: string | null;
  city_code: string | null;
  city_name: string | null;
  barangay_code: string | null;
  barangay_name: string | null;
  region_name: string | null;
}

/**
 * Resolve structured address input to storable columns with server-resolved
 * name snapshots (client names are never trusted). PH enforces hierarchy
 * membership (city in province, barangay in city, incl. the independent-city
 * self-parent convention); other countries store region/city text.
 */
export async function resolveIntakeAddress(
  deps: LocationLookups,
  countryCode: string,
  input: AddressInput,
): Promise<{ ok: true; columns: AddressColumns } | { ok: false; message: string }> {
  const street =
    typeof input.street === 'string' && input.street.trim() !== '' ? input.street.trim() : null;
  if (countryCode !== 'PH') {
    const region = typeof input.region === 'string' ? input.region.trim() : '';
    const city = typeof input.city === 'string' ? input.city.trim() : '';
    if (!region || !city) return { ok: false, message: 'Enter your region/state and city.' };
    return {
      ok: true,
      columns: {
        address: street,
        province_code: null,
        province_name: null,
        city_code: null,
        city_name: city,
        barangay_code: null,
        barangay_name: null,
        region_name: region,
      },
    };
  }
  const provinceCode = (input.provinceCode ?? '').trim();
  const cityCode = (input.cityCode ?? '').trim();
  const barangayCode = (input.barangayCode ?? '').trim();
  if (!provinceCode || !cityCode || !barangayCode) {
    return { ok: false, message: 'Select your province, city/municipality, and barangay.' };
  }
  let province = await deps.province(provinceCode);
  if (!province) {
    // Independent city selected as the top level: it parents itself.
    const selfCity = await deps.city(provinceCode);
    if (!selfCity || selfCity.province_code !== null) {
      return { ok: false, message: 'Select a valid province.' };
    }
    province = { code: selfCity.code, name: selfCity.name };
  }
  const city = await deps.city(cityCode);
  if (!city) return { ok: false, message: 'Select a valid city/municipality.' };
  if (city.province_code !== null) {
    if (city.province_code !== province.code) {
      return { ok: false, message: 'The city does not belong to the selected province.' };
    }
  } else if (city.code !== province.code) {
    return { ok: false, message: 'The city does not belong to the selected province.' };
  }
  const barangay = await deps.barangay(barangayCode);
  if (!barangay || barangay.city_code !== city.code) {
    return { ok: false, message: 'Select a valid barangay for the chosen city.' };
  }
  return {
    ok: true,
    columns: {
      address: street,
      province_code: province.code,
      province_name: province.name,
      city_code: city.code,
      city_name: city.name,
      barangay_code: barangay.code,
      barangay_name: barangay.name,
      region_name: null,
    },
  };
}
