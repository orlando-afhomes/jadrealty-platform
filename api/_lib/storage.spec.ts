import { describe, expect, it, vi } from 'vitest';

import {
  marketingToolsObjectKey,
  removeGovernmentIdObjects,
  removeMarketingToolsObjects,
  removeStorageKeys,
  type StorageCapableClient,
} from './storage.js';

const PUBLIC_PDF =
  'https://ref.supabase.co/storage/v1/object/public/marketing-tools/cms/1756000000-ab12cd-showcase.pdf';

function bucketClient(script: {
  removeError?: { message: string } | null;
  listEntries?: { name: string }[] | null;
  listError?: { message: string } | null;
  throwOn?: 'remove' | 'list' | null;
}) {
  const calls: { op: string; bucket: string; arg: unknown }[] = [];
  const client: StorageCapableClient = {
    storage: {
      from: (bucket: string) => ({
        remove: async (paths: string[]) => {
          calls.push({ op: 'remove', bucket, arg: paths });
          if (script.throwOn === 'remove') throw new Error('storage down');
          return { error: script.removeError ?? null };
        },
        list: async (path?: string) => {
          calls.push({ op: 'list', bucket, arg: path });
          if (script.throwOn === 'list') throw new Error('storage down');
          if (script.listError) return { data: null, error: script.listError };
          return { data: script.listEntries ?? [], error: null };
        },
      }),
    },
  };
  return { client, calls };
}

describe('marketingToolsObjectKey', () => {
  it('extracts the bucket key from public marketing-tools URLs', () => {
    expect(marketingToolsObjectKey(PUBLIC_PDF)).toBe('cms/1756000000-ab12cd-showcase.pdf');
  });

  it('strips query strings', () => {
    expect(marketingToolsObjectKey(`${PUBLIC_PDF}?t=123`)).toBe(
      'cms/1756000000-ab12cd-showcase.pdf',
    );
  });

  it('returns null for external URLs and non-strings', () => {
    expect(marketingToolsObjectKey('https://example.com/files/flyer.pdf')).toBeNull();
    expect(
      marketingToolsObjectKey('https://ref.supabase.co/storage/v1/object/public/other/a.pdf'),
    ).toBeNull();
    expect(marketingToolsObjectKey(null)).toBeNull();
    expect(marketingToolsObjectKey(undefined)).toBeNull();
    expect(marketingToolsObjectKey('')).toBeNull();
  });

  it('rejects path traversal', () => {
    expect(
      marketingToolsObjectKey(
        'https://ref.supabase.co/storage/v1/object/public/marketing-tools/../secret.txt',
      ),
    ).toBeNull();
  });
});

describe('removeMarketingToolsObjects', () => {
  it('removes each referenced object once (deduplicated)', async () => {
    const { client, calls } = bucketClient({});
    const result = await removeMarketingToolsObjects(client, [PUBLIC_PDF, `${PUBLIC_PDF}?t=1`]);
    expect(result).toEqual({
      attempted: ['cms/1756000000-ab12cd-showcase.pdf'],
      removed: true,
    });
    expect(calls).toEqual([
      {
        op: 'remove',
        bucket: 'marketing-tools',
        arg: ['cms/1756000000-ab12cd-showcase.pdf'],
      },
    ]);
  });

  it('skips non-bucket URLs without touching storage', async () => {
    const { client, calls } = bucketClient({});
    const result = await removeMarketingToolsObjects(client, [
      'https://example.com/files/flyer.pdf',
      null,
      undefined,
    ]);
    expect(result).toEqual({ attempted: [], removed: true });
    expect(calls).toEqual([]);
  });

  it('reports failure without throwing when storage errors', async () => {
    const { client } = bucketClient({ removeError: { message: 'bucket unavailable' } });
    const result = await removeMarketingToolsObjects(client, [PUBLIC_PDF]);
    expect(result.removed).toBe(false);
    expect(result.attempted).toEqual(['cms/1756000000-ab12cd-showcase.pdf']);
  });

  it('reports failure without throwing when storage throws', async () => {
    const { client } = bucketClient({ throwOn: 'remove' });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const result = await removeMarketingToolsObjects(client, [PUBLIC_PDF]);
      expect(result.removed).toBe(false);
    } finally {
      consoleSpy.mockRestore();
    }
  });
});

describe('removeStorageKeys', () => {
  it('removes exact keys and rejects traversal', async () => {
    const { client, calls } = bucketClient({});
    const result = await removeStorageKeys(client, 'government-ids', [
      'reg-001/1756000000-id.png',
      '../escape.txt',
      null,
    ]);
    expect(result).toEqual({ attempted: ['reg-001/1756000000-id.png'], removed: true });
    expect(calls).toEqual([
      { op: 'remove', bucket: 'government-ids', arg: ['reg-001/1756000000-id.png'] },
    ]);
  });

  it('is a vacuous success with no keys', async () => {
    const { client, calls } = bucketClient({});
    expect(await removeStorageKeys(client, 'government-ids', [])).toEqual({
      attempted: [],
      removed: true,
    });
    expect(calls).toEqual([]);
  });
});

describe('removeGovernmentIdObjects', () => {
  it('lists the registration prefix and removes every file', async () => {
    const { client, calls } = bucketClient({
      listEntries: [{ name: '1756000000-id.png' }, { name: '1756111111-id2.png' }],
    });
    const result = await removeGovernmentIdObjects(client, 'reg-001');
    expect(result).toEqual({
      attempted: ['reg-001/1756000000-id.png', 'reg-001/1756111111-id2.png'],
      removed: true,
    });
    expect(calls).toEqual([
      { op: 'list', bucket: 'government-ids', arg: 'reg-001' },
      {
        op: 'remove',
        bucket: 'government-ids',
        arg: ['reg-001/1756000000-id.png', 'reg-001/1756111111-id2.png'],
      },
    ]);
  });

  it('succeeds vacuously when the folder is already empty', async () => {
    const { client, calls } = bucketClient({ listEntries: [] });
    const result = await removeGovernmentIdObjects(client, 'reg-001');
    expect(result).toEqual({ attempted: [], removed: true });
    expect(calls).toEqual([{ op: 'list', bucket: 'government-ids', arg: 'reg-001' }]);
  });

  it('rejects unsafe registration ids without touching storage', async () => {
    const { client, calls } = bucketClient({ listEntries: [{ name: 'x.png' }] });
    expect(await removeGovernmentIdObjects(client, '../evil')).toEqual({
      attempted: [],
      removed: true,
    });
    expect(await removeGovernmentIdObjects(client, '')).toEqual({
      attempted: [],
      removed: true,
    });
    expect(calls).toEqual([]);
  });

  it('reports failure without throwing on list/remove errors', async () => {
    const listFail = bucketClient({ listError: { message: 'denied' } });
    expect((await removeGovernmentIdObjects(listFail.client, 'reg-001')).removed).toBe(false);

    const removeFail = bucketClient({
      listEntries: [{ name: 'a.png' }],
      removeError: { message: 'denied' },
    });
    const result = await removeGovernmentIdObjects(removeFail.client, 'reg-001');
    expect(result.removed).toBe(false);
    expect(result.attempted).toEqual(['reg-001/a.png']);

    const throwing = bucketClient({ throwOn: 'list' });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect((await removeGovernmentIdObjects(throwing.client, 'reg-001')).removed).toBe(false);
    } finally {
      consoleSpy.mockRestore();
    }
  });
});
