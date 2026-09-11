import { ApiError } from './errors';

/** Friendly message for a valid Auth session whose Member row is gone (deleted/purged). */
export const ORPHAN_ACCOUNT_MESSAGE =
  'Your account no longer exists. It may have been removed by an administrator. Please contact support if you believe this is a mistake.';

type MaybeError = {
  code?: unknown;
  message?: unknown;
  status?: unknown;
};

/** True when the error means "authenticated but the Member row has 0 rows". */
export function isOrphanMemberError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const rec = error as MaybeError;
  const code = typeof rec.code === 'string' ? rec.code : '';
  const message = typeof rec.message === 'string' ? rec.message : '';
  if (code === 'PGRST116') return true;
  if (/cannot coerce the result to a single json object/i.test(message)) return true;
  if (error instanceof ApiError && error.status === 404) {
    return code === 'NOT_FOUND' && /member not found|not found/i.test(message);
  }
  if (code === 'NOT_FOUND' && /member not found/i.test(message)) return true;
  return false;
}

/**
 * Friendly `ErrorState` message override for orphaned accounts. Returns
 * `undefined` for all other errors so callers fall back to the server message.
 */
export function orphanMessageFor(error: unknown): string | undefined {
  return isOrphanMemberError(error) ? ORPHAN_ACCOUNT_MESSAGE : undefined;
}
