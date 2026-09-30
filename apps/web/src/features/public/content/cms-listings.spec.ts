import { describe, expect, it } from 'vitest';

import { CMS_PROPERTIES_SEED } from '@jad/contracts';

import { PROPERTY_CATEGORIES, PROPERTY_RECORDS } from './properties';
import {
  resolveFeaturedProperties,
  resolveListingCategories,
  resolveListingRecords,
  toProperty,
  toPropertyCategory,
} from './cms-listings';

describe('cms-listings adapters', () => {
  it('maps a CMS category to the card shape', () => {
    const category = toPropertyCategory(CMS_PROPERTIES_SEED.categories[0]!);
    expect(category).toEqual({
      slug: CMS_PROPERTIES_SEED.categories[0]!.slug,
      title: CMS_PROPERTIES_SEED.categories[0]!.title,
      shortDescription: CMS_PROPERTIES_SEED.categories[0]!.shortDescription,
      description: CMS_PROPERTIES_SEED.categories[0]!.description,
      image: CMS_PROPERTIES_SEED.categories[0]!.image,
    });
  });

  it('maps a CMS property to the record shape, keeping exact-decimal prices', () => {
    const seed = CMS_PROPERTIES_SEED.properties[0]!;
    const property = toProperty(seed);
    expect(property).toMatchObject({
      id: seed.id,
      name: seed.name,
      categoryId: seed.categoryId,
      location: seed.location,
      keyFacts: seed.keyFacts,
      characteristics: seed.characteristics,
      overview: seed.overview,
      highlights: seed.highlights,
      gallery: seed.gallery,
    });
    expect(property.price).toBe(seed.price);
  });

  it('drops display-text CMS prices so formatMoney never throws', () => {
    const seed = CMS_PROPERTIES_SEED.properties[0]!;
    expect(toProperty({ ...seed, price: '₱1.2M negotiable' }).price).toBeUndefined();
    expect(toProperty({ ...seed, price: undefined }).price).toBeUndefined();
  });
});

describe('cms-listings resolvers', () => {
  it('resolves live CMS records and categories when the fetch succeeded', () => {
    expect(resolveListingRecords(CMS_PROPERTIES_SEED)).toHaveLength(
      CMS_PROPERTIES_SEED.properties.length,
    );
    expect(resolveListingCategories(CMS_PROPERTIES_SEED)).toHaveLength(
      CMS_PROPERTIES_SEED.categories.length,
    );
  });

  it('falls back to static records for the legacy fallback shape or a failed fetch', () => {
    expect(resolveListingRecords(undefined)).toBe(PROPERTY_RECORDS);
    expect(resolveListingCategories(undefined)).toBe(PROPERTY_CATEGORIES);
    // The static PROPERTIES page-copy fallback carries no record arrays.
    const legacy = { hero: {}, title: 't' } as never;
    expect(resolveListingRecords(legacy)).toBe(PROPERTY_RECORDS);
    expect(resolveListingCategories(legacy)).toBe(PROPERTY_CATEGORIES);
  });

  it('prefers isFeatured flags for featured sections', () => {
    const records = resolveListingRecords(CMS_PROPERTIES_SEED);
    const categories = resolveListingCategories(CMS_PROPERTIES_SEED);
    const flagged = {
      ...CMS_PROPERTIES_SEED,
      properties: CMS_PROPERTIES_SEED.properties.map((p, i) =>
        i === 0 ? { ...p, isFeatured: true } : { ...p, isFeatured: false },
      ),
    };
    expect(resolveFeaturedProperties(flagged, records, categories).map((p) => p.id)).toEqual([
      CMS_PROPERTIES_SEED.properties[0]!.id,
    ]);
  });

  it('falls back to one-per-category when nothing is flagged', () => {
    const records = resolveListingRecords(CMS_PROPERTIES_SEED);
    const categories = resolveListingCategories(CMS_PROPERTIES_SEED);
    const unflagged = {
      ...CMS_PROPERTIES_SEED,
      properties: CMS_PROPERTIES_SEED.properties.map((p) => ({ ...p, isFeatured: false })),
    };
    const featured = resolveFeaturedProperties(unflagged, records, categories);
    expect(featured).toHaveLength(categories.length);
    expect(new Set(featured.map((p) => p.categoryId))).toEqual(
      new Set(categories.map((c) => c.slug)),
    );
  });
});
