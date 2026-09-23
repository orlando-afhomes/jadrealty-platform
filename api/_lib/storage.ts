import { GOVERNMENT_ID_BUCKET } from './documents.js';

/**
 * Supabase Storage <-> database synchronization helpers.
 *
 * Every upload-enabled module funnels deletions/replacements through here so
 * storage files never outlive their database records:
 *
 * - `marketing-tools` (public): CMS images, content-library files, policy
 *   PDFs. URLs embed the object key - extract it with
 *   `marketingToolsObjectKey` and remove it with
 *   `removeMarketingToolsObjects`.
 * - `government-ids` (private): registration ID documents at
 *   `government-ids/<registrationId>/...`. Remove the whole prefix with
 *   `removeGovernmentIdObjects`.
 *
 * All removals are best-effort and never throw: the database row is the
 * system of record, so a storage failure is logged (and audited by the
 * caller) but never blocks or rolls back the database write. Callers must
 * order operations file-last: persist/replace the row first, remove the
 * superseded object afterwards - never the reverse.
 */

export const MARKETING_TOOLS_BUCKET = 'marketing-tools';

/** Bucket markers inside public download URLs (see `cms/upload/sign.ts`). */
const MARKETING_TOOLS_OBJECT_MARKERS = [
  '/storage/v1/object/public/marketing-tools/',
  '/storage/v1/object/authenticated/marketing-tools/',
];

/**
 * Extract the `marketing-tools` bucket object key from a download URL, or
 * null when the URL points elsewhere (external links are never touched).
 * Query strings are stripped; path traversal is rejected.
 */
export function marketingToolsObjectKey(downloadUrl: unknown): string | null {
  if (typeof downloadUrl !== 'string' || !downloadUrl) return null;
  const path = (downloadUrl.split('?')[0] ?? '').trim();
  for (const marker of MARKETING_TOOLS_OBJECT_MARKERS) {
    const at = path.indexOf(marker);
    if (at === -1) continue;
    const key = path.slice(at + marker.length).replace(/^\/+/, '');
    if (!key || key.includes('..')) return null;
    return key;
  }
  return null;
}

/** Minimal storage surface the helpers need (the real client satisfies this). */
export interface StorageBucketClient {
  remove: (paths: string[]) => Promise<{ error: { message: string } | null }>;
  list: (
    path?: string,
    options?: Record<string, unknown>,
  ) => Promise<{ data: { name: string }[] | null; error: { message: string } | null }>;
}

export interface StorageCapableClient {
  storage: { from: (bucket: string) => StorageBucketClient };
}

export interface StorageRemoval {
  /** Object keys the removal was attempted for. */
  attempted: string[];
  /** True when every attempted removal succeeded (vacuously true when none). */
  removed: boolean;
}

/**
 * Best-effort removal of exact object keys from a bucket. Keys containing
 * `..` are rejected (path traversal). Never throws.
 */
export async function removeStorageKeys(
  supabase: StorageCapableClient,
  bucket: string,
  keys: (string | null | undefined)[],
): Promise<StorageRemoval> {
  const clean = [...new Set(keys.filter((k): k is string => typeof k === 'string' && !!k))].filter(
    (k) => !k.includes('..'),
  );
  if (clean.length === 0) return { attempted: [], removed: true };
  try {
    const { error } = await supabase.storage.from(bucket).remove(clean);
    if (error) {
      console.error(
        `[storage:${bucket}] removal failed for ${clean.length} objects:`,
        error.message,
      );
      return { attempted: clean, removed: false };
    }
    return { attempted: clean, removed: true };
  } catch (e) {
    console.error(
      `[storage:${bucket}] removal error for ${clean.length} objects:`,
      (e as Error).message,
    );
    return { attempted: clean, removed: false };
  }
}

/**
 * Best-effort removal of `marketing-tools` objects referenced by download
 * URLs (policy PDFs, replaced content files). URLs that do not resolve to a
 * bucket key are silently skipped. Never throws.
 */
export async function removeMarketingToolsObjects(
  supabase: StorageCapableClient,
  downloadUrls: (string | null | undefined)[],
): Promise<StorageRemoval> {
  const keys = [
    ...new Set(downloadUrls.map(marketingToolsObjectKey).filter(Boolean)),
  ] as string[];
  return removeStorageKeys(supabase, MARKETING_TOOLS_BUCKET, keys);
}

/**
 * Best-effort removal of every ID document under
 * `government-ids/<registrationId>/...` (approval consumes the application,
 * purge destroys the identity, replays replace the file). Never throws.
 */
export async function removeGovernmentIdObjects(
  supabase: StorageCapableClient,
  registrationId: string,
): Promise<StorageRemoval> {
  if (!registrationId) return { attempted: [], removed: true };
  if (registrationId.includes('..') || registrationId.includes('/')) {
    return { attempted: [], removed: true };
  }
  try {
    const { data, error } = await supabase.storage
      .from(GOVERNMENT_ID_BUCKET)
      .list(registrationId, { limit: 1000 });
    if (error) {
      console.error(
        `[storage:${GOVERNMENT_ID_BUCKET}] list failed for ${registrationId}:`,
        error.message,
      );
      return { attempted: [], removed: false };
    }
    const keys = ((data ?? []) as { name: string }[])
      .map((entry) => (typeof entry?.name === 'string' ? entry.name : ''))
      .filter(Boolean)
      .map((name) => `${registrationId}/${name}`);
    if (keys.length === 0) return { attempted: [], removed: true };
    const { error: removeError } = await supabase.storage
      .from(GOVERNMENT_ID_BUCKET)
      .remove(keys);
    if (removeError) {
      console.error(
        `[storage:${GOVERNMENT_ID_BUCKET}] removal failed for ${registrationId}:`,
        removeError.message,
      );
      return { attempted: keys, removed: false };
    }
    return { attempted: keys, removed: true };
  } catch (e) {
    console.error(
      `[storage:${GOVERNMENT_ID_BUCKET}] removal error for ${registrationId}:`,
      (e as Error).message,
    );
    return { attempted: [], removed: false };
  }
}
