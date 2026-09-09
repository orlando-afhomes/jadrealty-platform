import { ADMIN_STAFF } from '../../../_lib/access.js';
import { appendAudit } from '../../../_lib/audit.js';
import { verifyStaff } from '../../../_lib/auth.js';
import type { VercelRequest, VercelResponse } from '../../../_lib/http.js';
import { methodNotAllowed, requireService } from '../../../_lib/rest.js';
import { toErrorEnvelope } from '../../../_lib/envelope.js';

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

/**
 * DELETE /admin/content/:id (super_admin + admin, FR-ADM-003) — permanently
 * remove a marketing tool: its `ContentItem` row plus the uploaded object
 * when the download URL lives in the `marketing-tools` bucket. Row deletion
 * is authoritative: a storage failure still deletes the row
 * (`fileRemoved: false`, noted in the audit detail). Nothing references
 * `ContentItem`, so no cascade handling is needed.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'DELETE') {
    methodNotAllowed(res, req.method);
    return;
  }
  const auth = await verifyStaff(req, [...ADMIN_STAFF]);
  if ('error' in auth) {
    const { error, status } = auth.error;
    res.status(status).json({ error });
    return;
  }
  const rawId = req.query.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id) {
    const { error, status } = toErrorEnvelope('VALIDATION_ERROR', 'Content id is required', 400);
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const { data: found, error: readError } = await supabase
    .from('ContentItem')
    .select('id, title, download_url')
    .eq('id', id)
    .maybeSingle();
  if (readError || !found) {
    const { error, status } = toErrorEnvelope('NOT_FOUND', 'Marketing tool not found', 404);
    res.status(status).json({ error });
    return;
  }
  const current = found as Record<string, unknown>;

  // Best-effort bucket cleanup — never blocks the row delete.
  let fileRemoved = false;
  const objectKey = marketingToolsObjectKey(current.download_url);
  if (objectKey) {
    try {
      const { error: storageError } = await supabase.storage
        .from('marketing-tools')
        .remove([objectKey]);
      fileRemoved = !storageError;
    } catch {
      fileRemoved = false;
    }
  }
  const { error: deleteError } = await supabase.from('ContentItem').delete().eq('id', id);
  if (deleteError) {
    const { error, status } = toErrorEnvelope('INTERNAL', deleteError.message, 500);
    res.status(status).json({ error });
    return;
  }
  await appendAudit(supabase, {
    action: 'CONTENT_DELETED',
    actorId: auth.userId,
    actorRole: auth.slugs[0] ?? 'admin',
    targetType: 'ContentItem',
    targetId: id,
    targetName: String(current.title ?? id),
    detail:
      `Permanently deleted marketing tool ${String(current.title ?? id)}` +
      (objectKey
        ? fileRemoved
          ? ' (uploaded file removed)'
          : ' (uploaded file removal failed)'
        : ''),
  });
  res.status(200).json({ id, deleted: true, fileRemoved });
}
