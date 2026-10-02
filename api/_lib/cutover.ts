import {
  categoryCommissionRateSchema,
  cmsPropertyCategorySchema,
  createPropertyRequestSchema,
  createVoucherTemplateRequestSchema,
  updateContentItemRequestSchema,
  updatePropertyRequestSchema,
  updateVoucherTemplateRequestSchema,
} from '@jad/contracts';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';

/**
 * B7 cutover helpers (Phase B7): voucher/catalog request validation, category
 * merging, voucher code generation. Pure functions - unit-tested. Row
 * mappers live in pipeline.ts / money.ts.
 */

export function validateCreateTemplate(body: unknown) {
  return createVoucherTemplateRequestSchema.safeParse(body ?? {});
}

export function validateUpdateTemplate(body: unknown) {
  return updateVoucherTemplateRequestSchema.safeParse(body ?? {});
}

export function validateCreateProperty(body: unknown) {
  return createPropertyRequestSchema.safeParse(body ?? {});
}

export function validateUpdateProperty(body: unknown) {
  return updatePropertyRequestSchema.safeParse(body ?? {});
}

export function validateUpdateContentItem(body: unknown) {
  return updateContentItemRequestSchema.safeParse(body ?? {});
}

/** Category presentation schema (CMS-owned fields). */
export const categoryPresentationSchema = cmsPropertyCategorySchema.omit({ slug: true });

export type CategoryPresentation = z.infer<typeof categoryPresentationSchema>;

/** Merged category view: DB key + CMS presentation + derived listing count + rates. */
export const mergedCategorySchema = cmsPropertyCategorySchema.extend({
  listingCount: z.number().int().nonnegative(),
  // Transactional rates ride the merged view so the admin UI edits them
  // through the same single endpoint. Optional so a row missing the new
  // columns (pre-migration read) still lists instead of filtering out.
  directRate: categoryCommissionRateSchema.optional(),
  referralRate: categoryCommissionRateSchema.optional(),
});

export function mergeCategory(
  slug: string,
  title: string,
  presentation: Record<string, unknown> | undefined,
  listingCount: number,
  rates?: { directRate?: unknown; referralRate?: unknown },
): Record<string, unknown> {
  // Missing presentation falls back to the title so the category stays
  // visible (the merged schema requires non-empty copy).
  const shortDescription =
    typeof presentation?.shortDescription === 'string' && presentation.shortDescription
      ? presentation.shortDescription
      : title;
  const description =
    typeof presentation?.description === 'string' && presentation.description
      ? presentation.description
      : title;
  const row: Record<string, unknown> = {
    slug,
    title,
    shortDescription,
    description,
    image:
      typeof presentation?.image === 'object' && presentation?.image !== null
        ? presentation.image
        : { id: slug, alt: title },
    isFeatured: presentation?.isFeatured === true,
    listingCount,
  };
  // Only well-formed rates ride along; anything else stays absent so the
  // merged row keeps validating and the UI falls back to display logic.
  if (typeof rates?.directRate === 'string' && categoryCommissionRateSchema.safeParse(rates.directRate).success) {
    row.directRate = rates.directRate;
  }
  if (typeof rates?.referralRate === 'string' && categoryCommissionRateSchema.safeParse(rates.referralRate).success) {
    row.referralRate = rates.referralRate;
  }
  return row;
}

export function isValidMergedCategory(row: Record<string, unknown>): boolean {
  return mergedCategorySchema.safeParse(row).success;
}

/**
 * Random voucher code (`JAD-VCH-<year>-<XXXXXX>`, 6 chars A-Z0-9, e.g.
 * `JAD-VCH-2026-1H57MP`). Deliberately NOT sequential: sequential codes are
 * enumerable, and QR payloads are bearer-adjacent. Collisions against live
 * codes are retried in-memory; the DB `code` unique index plus the assign
 * handler's retry loop remain the backstop for cross-instance races.
 */
export const VOUCHER_CODE_SUFFIX_LENGTH = 6;

const VOUCHER_CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function randomCodeSuffix(length: number): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += VOUCHER_CODE_ALPHABET[(bytes[i] as number) % VOUCHER_CODE_ALPHABET.length];
  }
  return out;
}

export function nextVoucherCode(existingCodes: string[], now = new Date()): string {
  const year = now.getUTCFullYear();
  const taken = new Set(existingCodes);
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = `JAD-VCH-${year}-${randomCodeSuffix(VOUCHER_CODE_SUFFIX_LENGTH)}`;
    if (!taken.has(code)) return code;
  }
  // Astronomically unlikely (36^6 space) - timestamp fallback so issuance
  // never blocks; uniqueness is still enforced by the DB index + retry.
  return `JAD-VCH-${year}-${Date.now().toString(36).toUpperCase().slice(-6).padStart(6, '0')}`;
}
