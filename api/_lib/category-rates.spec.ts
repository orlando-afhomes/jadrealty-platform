import { describe, expect, it } from 'vitest';

import { pickRate, resolveCategoryRates } from './category-rates.js';

/**
 * Per-category rate resolution: a sale uses its property category's rates,
 * falling back to the global SystemConfig rates when the property/category
 * row is missing or malformed. The client is a plain stub (method-call form
 * keeps the supabase receiver - see the locationLookupsFor `.bind` fix).
 */
function stubClient(config: {
  properties: Record<string, { categorySlug: string | null }>;
  categories: Record<string, { direct_rate?: unknown; referral_rate?: unknown }>;
  globals: Record<string, string>;
}) {
  const calls: string[] = [];
  return {
    calls,
    client: {
      from: (table: string) => {
        const chain: Record<string, (...a: never[]) => unknown> & { __eq?: unknown } = {};
        chain.select = () => chain;
        chain.eq = ((_col: string, value: unknown) => {
          chain.__eq = value;
          calls.push(`${table}=${String(value)}`);
          return chain;
        }) as (...a: never[]) => unknown;
        chain.in = ((_key: string, values: unknown) => {
          const wanted = Array.isArray(values) ? values.map(String) : [];
          if (table === 'SystemConfig') {
            return Promise.resolve({
              data: Object.entries(config.globals).map(([key, value]) => ({ key, value })),
              error: null,
            });
          }
          if (table === 'PropertyCategory') {
            return Promise.resolve({
              data: Object.entries(config.categories)
                .filter(([slug]) => wanted.includes(slug))
                .map(([slug, rates]) => ({ slug, ...rates })),
              error: null,
            });
          }
          if (table === 'Property') {
            return Promise.resolve({
              data: Object.entries(config.properties)
                .filter(([id]) => wanted.includes(id))
                .map(([id, row]) => ({ id, categorySlug: row.categorySlug })),
              error: null,
            });
          }
          return Promise.resolve({ data: [], error: null });
        }) as (...a: never[]) => unknown;
        chain.maybeSingle = async () => {
          if (table === 'Property') {
            const row = Object.entries(config.properties).find(([id]) => id === chain.__eq);
            return {
              data: row ? { id: row[0], categorySlug: row[1].categorySlug } : null,
              error: null,
            };
          }
          return { data: null, error: null };
        };
        return chain;
      },
    },
  };
}

const GLOBALS = { COMMISSION_DIRECT_RATE: '0.0800', COMMISSION_REFERRAL_RATE: '0.0400' };

describe('pickRate', () => {
  it('prefers a valid category rate over the global', () => {
    expect(pickRate('0.1000', '0.0800')).toBe('0.1000');
  });

  it('falls back to a valid global when the category rate is missing or malformed', () => {
    expect(pickRate(undefined, '0.0800')).toBe('0.0800');
    expect(pickRate('nope', '0.0800')).toBe('0.0800');
    expect(pickRate('1.5000', '0.0800')).toBe('0.0800');
  });

  it('returns null when neither side is usable', () => {
    expect(pickRate(undefined, undefined)).toBeNull();
    expect(pickRate('bad', 'also-bad')).toBeNull();
  });
});

describe('resolveCategoryRates', () => {
  it('resolves both rates for a categorized property', async () => {
    const { client } = stubClient({
      properties: { prop1: { categorySlug: 'cat-one' } },
      categories: { 'cat-one': { direct_rate: '0.1000', referral_rate: '0.0500' } },
      globals: GLOBALS,
    });
    expect(await resolveCategoryRates(client as never, ['prop1'])).toEqual(
      new Map([['prop1', { directRate: '0.1000', referralRate: '0.0500' }]]),
    );
  });

  it('falls back to globals for dangling or uncategorized properties', async () => {
    const { client } = stubClient({
      properties: { ghost: { categorySlug: 'deleted-cat' }, bare: { categorySlug: null } },
      categories: {},
      globals: GLOBALS,
    });
    expect(await resolveCategoryRates(client as never, ['ghost', 'bare', 'missing'])).toEqual(
      new Map([
        ['ghost', { directRate: '0.0800', referralRate: '0.0400' }],
        ['bare', { directRate: '0.0800', referralRate: '0.0400' }],
        ['missing', { directRate: '0.0800', referralRate: '0.0400' }],
      ]),
    );
  });
});
