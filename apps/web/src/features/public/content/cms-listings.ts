import type { CmsProperty, CmsPropertyCategory, PropertiesContent } from '@jad/contracts';
import { isExactDecimal } from '@jad/shared';

import { PROPERTY_CATEGORIES, PROPERTY_RECORDS } from './properties';
import type { Property, PropertyCategory } from './types';

/**
 * CMS listings bridge - makes the public property pages dynamic.
 *
 * `GET /cms/properties` already returns live `{categories, properties, page}`
 * (admin CMS editor + catalog sync keep it current), but the pages rendered
 * the static `PROPERTY_RECORDS` for cards/counts/detail. These adapters map
 * CMS records onto the static card shape so the same components render live
 * data, with the static files as the silent fallback (Q6) when the fetch
 * fails or returns the legacy page-copy fallback shape.
 */

/** CMS category → card shape (structurally identical; strips CMS-only links). */
export function toPropertyCategory(category: CmsPropertyCategory): PropertyCategory {
  return {
    slug: category.slug,
    title: category.title,
    shortDescription: category.shortDescription,
    description: category.description,
    image: { id: category.image.id, alt: category.image.alt },
  };
}

/**
 * CMS property → record shape. `price` passes through only when it is an
 * exact-decimal string: `formatMoney` throws on display text (e.g.
 * `₱1.2M negotiable`), and both card and detail already render a clean
 * inquiry state when the price is absent.
 */
export function toProperty(property: CmsProperty): Property {
  return {
    id: property.id,
    name: property.name,
    categoryId: property.categoryId,
    location: property.location,
    ...(property.price && isExactDecimal(property.price) ? { price: property.price } : {}),
    keyFacts: property.keyFacts.map((fact) => ({ label: fact.label, value: fact.value })),
    characteristics: [...property.characteristics],
    overview: [...property.overview],
    highlights: [...property.highlights],
    gallery: property.gallery.map((photo) => ({ id: photo.id, alt: photo.alt })),
  };
}

/**
 * Records to render: live CMS properties when the fetch resolved with a
 * record array (empty = the admin cleared the listings), else the static
 * catalog. The legacy page-copy fallback shape carries no `properties` key,
 * so it falls back without a cast that hides mismatches.
 */
export function resolveListingRecords(cms: PropertiesContent | undefined): Property[] {
  if (!cms || !Array.isArray(cms.properties)) return PROPERTY_RECORDS;
  return cms.properties.map(toProperty);
}

/** Categories to render: live CMS categories when present, else static. */
export function resolveListingCategories(cms: PropertiesContent | undefined): PropertyCategory[] {
  if (!cms || !Array.isArray(cms.categories) || cms.categories.length === 0) {
    return PROPERTY_CATEGORIES;
  }
  return cms.categories.map(toPropertyCategory);
}

/**
 * Featured section: CMS `isFeatured` flags first (admin merchandising);
 * when nothing is flagged, one property per category (static parity).
 */
export function resolveFeaturedProperties(
  cms: PropertiesContent | undefined,
  records: Property[] = resolveListingRecords(cms),
  categories: PropertyCategory[] = resolveListingCategories(cms),
  limit = categories.length,
): Property[] {
  const flags = new Map((cms?.properties ?? []).map((p) => [p.id, p.isFeatured ?? false]));
  const flagged = records.filter((record) => flags.get(record.id));
  if (flagged.length > 0) return flagged.slice(0, limit);
  return categories
    .map((category) => records.find((record) => record.categoryId === category.slug))
    .filter((record): record is Property => record !== undefined)
    .slice(0, limit);
}
