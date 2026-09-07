import { programSchema, systemConfigEntrySchema } from '@jad/contracts';
import type { Program, SystemConfigEntry } from '@jad/contracts';

import { requestList } from '../../../lib/api/client';

/** GET /admin/config — full parameter list (mock server serves fixtures in dev/test). */
export function getConfig(): Promise<SystemConfigEntry[]> {
  return requestList('/admin/config', systemConfigEntrySchema);
}

/** GET /programs — shared program list (mock server serves fixtures in dev/test). */
export function getPrograms(): Promise<Program[]> {
  return requestList('/programs', programSchema);
}
