import {
  deleteContentItemResponseSchema,
  forwardableContentSchema,
  type ContentKind,
  type CreateContentItemRequest,
  type ForwardableContent,
} from '@jad/contracts';

import { request, requestList } from '../../../lib/api/client';

export type CreateContentInput = {
  title: string;
  description?: string;
  kind: ContentKind;
  downloadUrl: string;
};

/** GET /admin/content — full library (mock server serves fixtures in dev/test). */
export function getContent(): Promise<ForwardableContent[]> {
  return requestList('/admin/content', forwardableContentSchema);
}

/** POST /admin/content — publish marketing content (id/share server-generated). */
export function createContent(input: CreateContentInput): Promise<ForwardableContent> {
  const body: CreateContentItemRequest = {
    title: input.title,
    ...(input.description !== undefined && { description: input.description }),
    kind: input.kind,
    downloadUrl: input.downloadUrl,
    published: true,
  };
  return request('/admin/content', forwardableContentSchema, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * DELETE /admin/content/:id — permanently remove a marketing tool (row plus
 * its bucket object when the download URL lives in `marketing-tools`).
 * Irreversible — callers confirm first.
 */
export function deleteContentItem(
  id: string,
): Promise<{ id: string; deleted: true; fileRemoved: boolean }> {
  return request(`/admin/content/${id}`, deleteContentItemResponseSchema, { method: 'DELETE' });
}
