import { forwardableContentSchema, type ForwardableContent } from '@jad/contracts';
import { requestList } from '../../../lib/api/client';

/** GET /admin/content — full library (mock server serves fixtures in dev/test). */
export function getContent(): Promise<ForwardableContent[]> {
  return requestList('/admin/content', forwardableContentSchema);
}
