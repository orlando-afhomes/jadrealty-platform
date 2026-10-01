import {
  categoryCommissionRateSchema,
  cmsPropertyCategorySchema,
  createPropertyRequestSchema,
  createVoucherTemplateRequestSchema,
  updateContentItemRequestSchema,
  updatePropertyRequestSchema,
  updateVoucherTemplateRequestSchema,
} from '@jad/contracts';
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
 * Next voucher code (`JAD-VCH-<year>-<nnn>`, suffix = max existing + 1).
 * Mirrors the mock `JAD-VCH-2026-NNN` format with the current year.
 */
export function nextVoucherCode(existingCodes: string[], now = new Date()): string {
  const year = now.getUTCFullYear();
  let max = 100;
  for (const code of existingCodes) {
    const match = /-(\d+)$/.exec(code);
    if (match) max = Math.max(max, Number.parseInt(match[1]!, 10));
  }
  return `JAD-VCH-${year}-${max + 1}`;
}
