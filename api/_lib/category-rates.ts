import { serviceClient } from './rest.js';

type ServiceClient = NonNullable<ReturnType<typeof serviceClient>>;

/**
 * Per-category commission rate resolution (single source for every calc
 * site: sale_qualify SQL aside, which joins inline for atomicity).
 *
 * A sale uses its property category's rates; when the property row is
 * missing (legacy dangling propertyId), has no category, or the category
 * row/rates are malformed, the global SystemConfig rates apply (accepted
 * fallback - legacy sales must still qualify). Returns null only when
 * neither side is usable; callers then keep their existing loud failure.
 */

/** Category rate shape: exact-decimal 0..1, up to 4 places (DB CHECK). */
const CATEGORY_RATE_RE = /^(0(\.[0-9]{1,4})?|1(\.0{1,4})?)$/;

/** Global rate shape: exact-decimal, up to 4 places (existing behavior, no range cap). */
const GLOBAL_RATE_RE = /^[0-9]+(\.[0-9]{1,4})?$/;

function isCategoryRate(value: unknown): value is string {
  return typeof value === 'string' && CATEGORY_RATE_RE.test(value);
}

function isGlobalRate(value: unknown): value is string {
  return typeof value === 'string' && GLOBAL_RATE_RE.test(value);
}

/** Prefer a valid category rate, else a valid global; null when neither works. */
export function pickRate(categoryValue: unknown, globalValue: unknown): string | null {
  if (isCategoryRate(categoryValue)) return categoryValue;
  if (isGlobalRate(globalValue)) return globalValue;
  return null;
}

export interface ResolvedRates {
  directRate: string | null;
  referralRate: string | null;
}

type Row = Record<string, unknown> | null;

/**
 * Resolve rates for a batch of property ids in three queries (properties,
 * categories, globals) regardless of batch size. Every id maps to a result -
 * unresolvable ones carry the globals, or nulls when the globals are unusable.
 */
export async function resolveCategoryRates(
  supabase: ServiceClient,
  propertyIds: string[],
): Promise<Map<string, ResolvedRates>> {
  const ids = [...new Set(propertyIds.filter(Boolean))];
  const out = new Map<string, ResolvedRates>();
  const { data: globalRows } = await supabase
    .from('SystemConfig')
    .select('key,value')
    .in('key', ['COMMISSION_DIRECT_RATE', 'COMMISSION_REFERRAL_RATE']);
  let globalDirect: unknown;
  let globalReferral: unknown;
  for (const row of ((globalRows ?? []) as { key?: unknown; value?: unknown }[])) {
    if (row.key === 'COMMISSION_DIRECT_RATE') globalDirect = row.value;
    if (row.key === 'COMMISSION_REFERRAL_RATE') globalReferral = row.value;
  }
  const fallback: ResolvedRates = {
    directRate: isGlobalRate(globalDirect) ? globalDirect : null,
    referralRate: isGlobalRate(globalReferral) ? globalReferral : null,
  };
  if (ids.length === 0) return out;
  const { data: properties } = await supabase
    .from('Property')
    .select('id,categorySlug')
    .in('id', ids);
  const slugs = new Map<string, string | null>();
  for (const id of ids) slugs.set(id, null);
  for (const p of ((properties ?? []) as { id?: unknown; categorySlug?: unknown }[])) {
    if (typeof p.id === 'string' && slugs.has(p.id)) {
      slugs.set(p.id, typeof p.categorySlug === 'string' ? p.categorySlug : null);
    }
  }
  const wanted = [...new Set([...slugs.values()].filter((s): s is string => s !== null))];
  const bySlug = new Map<string, { directRate: unknown; referralRate: unknown }>();
  if (wanted.length > 0) {
    const { data: categories } = await supabase
      .from('PropertyCategory')
      .select('slug,direct_rate,referral_rate')
      .in('slug', wanted);
    for (const c of ((categories ?? []) as {
      slug?: unknown;
      direct_rate?: unknown;
      referral_rate?: unknown;
    }[])) {
      if (typeof c.slug === 'string') {
        bySlug.set(c.slug, { directRate: c.direct_rate, referralRate: c.referral_rate });
      }
    }
  }
  for (const id of ids) {
    const slug = slugs.get(id);
    const cat = slug ? bySlug.get(slug) : undefined;
    out.set(id, {
      directRate: pickRate(cat?.directRate, fallback.directRate),
      referralRate: pickRate(cat?.referralRate, fallback.referralRate),
    });
  }
  return out;
}
