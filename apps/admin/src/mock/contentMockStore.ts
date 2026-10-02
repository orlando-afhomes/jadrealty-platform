import type { ContentKind, ForwardableContent } from '@jad/contracts';

import { MOCK_CONTENT } from './data';

/**
 * In-memory mock store for Marketing Tools (FR-ADM-003). Mutations write
 * through here so the mock list stays consistent across GET + detail reads
 * within a dev/test session. Mirrors `POST /admin/content` (share targets
 * server-provided). Production reads/writes the real endpoint - this is a
 * test double only.
 */

const MT_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/**
 * Browser-safe random 6-char suffix mirroring the server's
 * `marketingToolReferenceId` (`JAD-MT-XXXXXX`). Mock-only: collisions are
 * irrelevant in a dev/test store.
 */
function randomMarketingSuffix(): string {
  const values = new Uint32Array(6);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(values);
  } else {
    for (let i = 0; i < values.length; i++) {
      values[i] = Math.floor(Math.random() * 0xffffffff);
    }
  }
  return Array.from(values, (n) => MT_ALPHABET.charAt(n % MT_ALPHABET.length)).join('');
}

export const contentStore: { items: ForwardableContent[] } = {
  items: MOCK_CONTENT.map((item) => ({
    ...item,
    share: item.share ? { ...item.share } : undefined,
  })),
};

/** Remove an item by id; returns true when an item was removed. */
export function deleteStoreContent(id: string): boolean {
  const index = contentStore.items.findIndex((item) => item.id === id);
  if (index === -1) return false;
  contentStore.items.splice(index, 1);
  return true;
}

/** Restore seed state (specs call this to isolate mutation tests). */
export function resetContentStore(): void {
  contentStore.items = MOCK_CONTENT.map((item) => ({
    ...item,
    share: item.share ? { ...item.share } : undefined,
  }));
}

export function createStoreContent(input: {
  title: string;
  description?: string;
  kind: ContentKind;
  downloadUrl: string;
}): ForwardableContent {
  const title = input.title.trim();
  if (!title) throw new Error('A title is required.');
  if (!input.downloadUrl) throw new Error('An uploaded file is required.');
  const downloadUrl = input.downloadUrl;
  const item: ForwardableContent = {
    id: `JAD-MT-${randomMarketingSuffix()}`,
    title,
    ...(input.description?.trim() && { description: input.description.trim() }),
    kind: input.kind,
    downloadUrl,
    share: {
      messengerUrl: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(downloadUrl)}`,
      viberUrl: `https://www.viber.com/forward?text=${encodeURIComponent(title)}`,
      copyUrl: downloadUrl,
    },
    createdAt: new Date().toISOString(),
  };
  contentStore.items.unshift(item);
  return item;
}
