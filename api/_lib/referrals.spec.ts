import { describe, expect, it } from 'vitest';

import { childrenOf, descendantsOf, genealogyTree } from './referrals.js';

const ROWS = [
  { id: 'a' },
  { id: 'b', sponsorId: 'a' },
  { id: 'c', sponsorId: 'a' },
  { id: 'd', sponsorId: 'b' },
  { id: 'e', sponsorId: 'x' },
];

describe('childrenOf', () => {
  it('returns direct children in id order', () => {
    expect(childrenOf(ROWS, 'a').map((r) => r.id)).toEqual(['b', 'c']);
    expect(childrenOf(ROWS, 'z')).toEqual([]);
  });
});

describe('descendantsOf', () => {
  it('collects the whole downline excluding the root', () => {
    expect(
      descendantsOf(ROWS, 'a')
        .map((r) => r.id)
        .sort(),
    ).toEqual(['b', 'c', 'd']);
    expect(descendantsOf(ROWS, 'e')).toEqual([]);
  });

  it('terminates on sponsor cycles', () => {
    const cyclic = [
      { id: 'a', sponsorId: 'b' },
      { id: 'b', sponsorId: 'a' },
    ];
    expect(descendantsOf(cyclic, 'a').map((r) => r.id)).toEqual(['b']);
  });
});

describe('genealogyTree', () => {
  const NODES = ROWS.map((r) => ({
    ...r,
    name: r.id.toUpperCase(),
    status: 'APPROVED_ACTIVE',
    isQualified: true,
    joinedAt: '2026-01-01T00:00:00.000Z',
  }));

  it('builds the nested tree', () => {
    const root = genealogyTree(NODES, 'a');
    expect(root?.children.map((c) => c.id)).toEqual(['b', 'c']);
    expect(root?.children[0]?.children.map((c) => c.id)).toEqual(['d']);
  });

  it('returns null for unknown roots and breaks cycles', () => {
    expect(genealogyTree(NODES, 'z')).toBeNull();
    const cyclic = [
      { id: 'a', sponsorId: 'b', name: 'A', status: 'S', isQualified: false, joinedAt: 't' },
      { id: 'b', sponsorId: 'a', name: 'B', status: 'S', isQualified: false, joinedAt: 't' },
    ];
    const root = genealogyTree(cyclic, 'a');
    expect(root?.children.map((c) => c.id)).toEqual(['b']);
    expect(root?.children[0]?.children).toEqual([]);
  });
});
