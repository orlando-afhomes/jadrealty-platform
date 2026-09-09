import {
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
