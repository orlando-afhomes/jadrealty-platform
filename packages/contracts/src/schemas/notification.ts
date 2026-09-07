import { z } from 'zod';

/**
 * Member notification feed — `GET /me/broadcasts` (API-SPECIFICATION #73,
 * FEAT-063, FR-ADM-005). Derived from `broadcasts`/`notifications`
 * (DATABASE-DESIGN §7.25/§7.26). Titles/labels come from the API, never
 * invented in the UI.
 */
export const notificationSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  body: z.string().optional(),
  createdAt: z.string(),
  readAt: z.string().optional(),
});

export type Notification = z.infer<typeof notificationSchema>;
