import {
  categoryCommissionRateSchema,
  cmsPropertyCategorySchema,
} from '@jad/contracts';

import { ADMIN_STAFF } from '../../_lib/access.js';
import { appendAudit } from '../../_lib/audit.js';
import { verifyStaffModule } from '../../_lib/auth.js';
import type { VercelRequest, VercelResponse } from '../../_lib/http.js';
import { isValidMergedCategory, mergeCategory } from '../../_lib/cutover.js';
import { methodNotAllowed, readJsonBody, requireService } from '../../_lib/rest.js';
import { toErrorEnvelope } from '../../_lib/envelope.js';

type Service = NonNullable<ReturnType<typeof requireService>>;

type CmsPropertiesContent = {
  categories?: Record<string, unknown>[];
  [key: string]: unknown;
};

/**
 * Category endpoints own the merge of the transactional key
 * (`PropertyCategory`: slug + title) and the CMS presentation
 * (`cms_contents.properties.categories`). Reads join all three sources
 * (key, presentation, listing count); writes update both stores so the
 * admin UI keeps its single-endpoint contract.
 */
async function readCmsCategories(
  supabase: Service,
): Promise<{ row: Record<string, unknown>; categories: Record<string, unknown>[] } | null> {
  const { data, error } = await supabase
    .from('cms_contents')
    .select('key,content,version')
    .eq('key', 'properties')
    .maybeSingle();
  if (error || !data) return null;
  const row = data as Record<string, unknown>;
  const content = (row.content ?? {}) as CmsPropertiesContent;
  const categories = Array.isArray(content.categories) ? content.categories : [];
  return { row, categories };
}

async function writeCmsCategories(
  supabase: Service,
  row: Record<string, unknown>,
  categories: Record<string, unknown>[],
  actorId: string,
): Promise<string | null> {
  const content = { ...((row.content ?? {}) as Record<string, unknown>), categories };
  const version = typeof row.version === 'number' ? row.version + 1 : 1;
  const { error } = await supabase
    .from('cms_contents')
    .upsert({ key: 'properties', content, version, updated_by: actorId }, { onConflict: 'key' });
  return error ? error.message : null;
}

/** GET /admin/property-categories - merged key + presentation + counts. */
export async function listCategories(req: VercelRequest, res: VercelResponse) {
  const auth = await verifyStaffModule(req, 'properties', ADMIN_STAFF);
  if ('error' in auth) {
    const { error, status } = auth.error;
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const [{ data: dbCategories }, { data: properties }, cms] = await Promise.all([
    supabase
      .from('PropertyCategory')
      .select('slug,title,direct_rate,referral_rate')
      .order('slug', { ascending: true }),
    supabase.from('Property').select('categorySlug'),
    readCmsCategories(supabase),
  ]);
  const counts = new Map<string, number>();
  for (const p of (properties as { categorySlug?: unknown }[] | null) ?? []) {
    if (typeof p.categorySlug === 'string')
      counts.set(p.categorySlug, (counts.get(p.categorySlug) ?? 0) + 1);
  }
  const presentation = new Map<string, Record<string, unknown>>();
  for (const c of cms?.categories ?? []) {
    if (typeof c.slug === 'string') presentation.set(c.slug, c);
  }
  const rows = (
    (dbCategories as
      | { slug: string; title: string; direct_rate?: unknown; referral_rate?: unknown }[]
      | null) ?? []
  ).map((cat) =>
    mergeCategory(cat.slug, cat.title, presentation.get(cat.slug), counts.get(cat.slug) ?? 0, {
      directRate: cat.direct_rate,
      referralRate: cat.referral_rate,
    }),
  );
  res.status(200).json({
    data: rows.filter(isValidMergedCategory),
    meta: { page: 1, pageSize: rows.length, total: rows.length },
  });
}

/**
 * Resolve create-time rates: explicit values win, omitted ones default to the
 * live global SystemConfig values (never literals). Fail-closed when the
 * globals are missing or malformed - a category must never be created with a
 * silent 0% rate.
 */
async function resolveCreateRates(
  supabase: Service,
  rateFields: { directRate?: string; referralRate?: string },
): Promise<
  | { ok: true; directRate: string; referralRate: string }
  | { ok: false; message: string }
> {
  if (rateFields.directRate !== undefined && rateFields.referralRate !== undefined) {
    return { ok: true, directRate: rateFields.directRate, referralRate: rateFields.referralRate };
  }
  const { data } = await supabase
    .from('SystemConfig')
    .select('key,value')
    .in('key', ['COMMISSION_DIRECT_RATE', 'COMMISSION_REFERRAL_RATE']);
  const byKey: Record<string, string> = {};
  for (const row of ((data ?? []) as { key?: unknown; value?: unknown }[])) {
    if (typeof row.key === 'string' && typeof row.value === 'string') byKey[row.key] = row.value;
  }
  const directRate = rateFields.directRate ?? byKey.COMMISSION_DIRECT_RATE;
  const referralRate = rateFields.referralRate ?? byKey.COMMISSION_REFERRAL_RATE;
  if (
    typeof directRate !== 'string' ||
    typeof referralRate !== 'string' ||
    !categoryCommissionRateSchema.safeParse(directRate).success ||
    !categoryCommissionRateSchema.safeParse(referralRate).success
  ) {
    return { ok: false, message: 'Commission rates are not configured' };
  }
  return { ok: true, directRate, referralRate };
}

/** POST /admin/property-categories - create key + presentation. */
export async function createCategory(req: VercelRequest, res: VercelResponse) {
  const auth = await verifyStaffModule(req, 'properties', ADMIN_STAFF);
  if ('error' in auth) {
    const { error, status } = auth.error;
    res.status(status).json({ error });
    return;
  }
  const parsedBody = readJsonBody(req);
  if (!parsedBody.ok) {
    const { error, status } = parsedBody.error;
    res.status(status).json({ error });
    return;
  }
  const parsed = cmsPropertyCategorySchema.safeParse(parsedBody.body ?? {});
  if (!parsed.success) {
    const { error, status } = toErrorEnvelope(
      'VALIDATION_ERROR',
      'Enter a slug, title, descriptions, and image.',
      400,
    );
    res.status(status).json({ error });
    return;
  }
  // Per-category rates ride the same body. Omitted rates default to the live
  // globals (never literals); malformed rates are a 400.
  const body = (parsedBody.body ?? {}) as Record<string, unknown>;
  const rateFields: { directRate?: string; referralRate?: string } = {};
  for (const field of ['directRate', 'referralRate'] as const) {
    const value = body[field];
    if (value === undefined) continue;
    if (
      typeof value !== 'string' ||
      !categoryCommissionRateSchema.safeParse(value).success
    ) {
      const { error, status } = toErrorEnvelope(
        'VALIDATION_ERROR',
        'Commission rates must be decimals between 0 and 1 (e.g. 0.0800 for 8%).',
        400,
      );
      res.status(status).json({ error });
      return;
    }
    rateFields[field] = value;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const { data: existing } = await supabase
    .from('PropertyCategory')
    .select('slug')
    .eq('slug', parsed.data.slug)
    .maybeSingle();
  if (existing) {
    const { error, status } = toErrorEnvelope('CONFLICT', 'Category slug already exists.', 409);
    res.status(status).json({ error });
    return;
  }
  const cms = await readCmsCategories(supabase);
  if (!cms) {
    const { error, status } = toErrorEnvelope('INTERNAL', 'Catalog CMS content unavailable.', 500);
    res.status(status).json({ error });
    return;
  }
  const resolved = await resolveCreateRates(supabase, rateFields);
  if (!resolved.ok) {
    const { error, status } = toErrorEnvelope('INTERNAL', resolved.message, 500);
    res.status(status).json({ error });
    return;
  }
  const { error: insertError } = await supabase.from('PropertyCategory').insert({
    slug: parsed.data.slug,
    title: parsed.data.title,
    direct_rate: resolved.directRate,
    referral_rate: resolved.referralRate,
  });
  if (insertError) {
    const { error, status } = toErrorEnvelope('INTERNAL', insertError.message, 500);
    res.status(status).json({ error });
    return;
  }
  const presentation = {
    title: parsed.data.title,
    shortDescription: parsed.data.shortDescription,
    description: parsed.data.description,
    image: parsed.data.image,
    isFeatured: parsed.data.isFeatured ?? false,
  };
  const writeError = await writeCmsCategories(
    supabase,
    cms.row,
    [...cms.categories, { slug: parsed.data.slug, ...presentation }],
    auth.userId,
  );
  if (writeError) {
    const { error, status } = toErrorEnvelope('INTERNAL', writeError, 500);
    res.status(status).json({ error });
    return;
  }
  await appendAudit(supabase, {
    action: 'CATEGORY_CREATED',
    actorId: auth.userId,
    actorRole: auth.slugs[0] ?? 'admin',
    targetType: 'PropertyCategory',
    targetId: parsed.data.slug,
    targetName: parsed.data.title,
    detail: `Created category ${parsed.data.title} (direct ${resolved.directRate}, referral ${resolved.referralRate})`,
  });
  res
    .status(201)
    .json(
      mergeCategory(parsed.data.slug, parsed.data.title, presentation, 0, {
        directRate: resolved.directRate,
        referralRate: resolved.referralRate,
      }),
    );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method === 'GET') return listCategories(req, res);
  if (req.method === 'POST') return createCategory(req, res);
  methodNotAllowed(res, req.method);
}
