import { z } from 'zod';

import { exactDecimalRateSchema, exactDecimalStringSchema } from './money.js';

/**
 * Catalog - transactional system-of-record (BR-PRP-001..004, FEAT-025/026).
 * Catalog owns: ID, category, price, status. CMS owns presentation
 * (descriptions, highlights, gallery, merchandising) but both reference the
 * same property ID. This gives a cleaner future DB model than treating
 * cms_contents as the transactional source.
 *
 * Future DB: `properties(id PK slug, category_id FK, price numeric, status)`
 * and `property_categories(slug PK)`; sales snapshot `propertyValue` via BI-006.
 */

export const catalogPropertyStatusSchema = z.enum(['ACTIVE', 'INACTIVE']);
export type CatalogPropertyStatus = z.infer<typeof catalogPropertyStatusSchema>;

export const catalogPropertySchema = z.object({
  id: z
    .string()
    .min(1, 'ID is required')
    .max(60, 'ID must be 60 characters or less')
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'ID must be lowercase alphanumeric with hyphens'),
  name: z.string().min(1, 'Name is required').max(120, 'Name must be 120 characters or less'),
  categoryId: z
    .string()
    .min(1, 'Category is required')
    .max(60, 'Category must be 60 characters or less'),
  price: exactDecimalStringSchema.optional(),
  status: catalogPropertyStatusSchema,
});

export type CatalogProperty = z.infer<typeof catalogPropertySchema>;

/** `POST /admin/properties` - id is server-generated. */
export const createPropertyRequestSchema = catalogPropertySchema.omit({ id: true });

export type CreatePropertyRequest = z.infer<typeof createPropertyRequestSchema>;

/** `PATCH /admin/properties/:id` - partial edits. */
export const updatePropertyRequestSchema = catalogPropertySchema.omit({ id: true }).partial();

export type UpdatePropertyRequest = z.infer<typeof updatePropertyRequestSchema>;

/**
 * Per-category commission rate: exact-decimal 0..1 with up to 4 places
 * (`0.0800` = 8%). Mirrors the PropertyCategory CHECK
 * (`^(0(\.[0-9]{1,4})?|1(\.0{1,4})?)$`) so contract-valid values always pass
 * the database and sale_qualify's looser format check.
 */
export const categoryCommissionRateSchema = exactDecimalRateSchema.refine(
  (value) => {
    const num = Number(value);
    return Number.isFinite(num) && num >= 0 && num <= 1;
  },
  { message: 'Rate must be between 0 and 1 (e.g. 0.0800 for 8%)' },
);

export type CategoryCommissionRate = z.infer<typeof categoryCommissionRateSchema>;

/** Transactional `PropertyCategory` row: identity + its commission rates. */
export const propertyCategorySchema = z.object({
  slug: z
    .string()
    .min(1, 'Slug is required')
    .max(60, 'Slug must be 60 characters or less')
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase alphanumeric with hyphens'),
  title: z.string().min(1, 'Title is required').max(120, 'Title must be 120 characters or less'),
  directRate: categoryCommissionRateSchema,
  referralRate: categoryCommissionRateSchema,
});

export type PropertyCategory = z.infer<typeof propertyCategorySchema>;

/**
 * `POST /admin/property-categories` - rates optional; the handler defaults
 * omitted rates to the live global SystemConfig values (never literals).
 */
export const createCategoryRequestSchema = propertyCategorySchema
  .omit({ directRate: true, referralRate: true })
  .extend({
    directRate: categoryCommissionRateSchema.optional(),
    referralRate: categoryCommissionRateSchema.optional(),
  });

export type CreateCategoryRequest = z.infer<typeof createCategoryRequestSchema>;

/** `PATCH /admin/property-categories/:slug` - partial edits, rates independent. */
export const updateCategoryRequestSchema = propertyCategorySchema
  .omit({ slug: true, title: true })
  .partial();

export type UpdateCategoryRequest = z.infer<typeof updateCategoryRequestSchema>;
