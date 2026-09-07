import { z } from 'zod';

/**
 * Forwardable content kind — PROPOSED. Managed marketing material (BR-MKT-001).
 * The vocabulary is a free-string baseline (no SSOT enumeration); kept narrow so
 * the client can present each kind without inventing labels.
 */
export const contentKindSchema = z.enum(['DOCUMENT', 'IMAGE', 'VIDEO', 'PROMO']);

export type ContentKind = z.infer<typeof contentKindSchema>;

/**
 * Forwardable content — `GET /content/forwardable` (API-SPECIFICATION #68,
 * FEAT-061, FR-ADM-003, SCR-MEM-022). Members may forward permitted content via
 * Facebook Messenger and Viber and download permitted materials (BR-MKT-002).
 * Share/download URLs are SERVER-PROVIDED — the client never guesses external
 * URLs. All link rendering is declarative React with automatic escaping; no raw
 * HTML (SECURITY.md §security-design). Shape is PROPOSED.
 */
export const forwardableContentSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  kind: contentKindSchema,
  /** Server-provided download target (present when downloadable, BR-MKT-002). */
  downloadUrl: z.string().optional(),
  /** Server-provided share targets — Messenger / Viber / copyable link. */
  share: z
    .object({
      messengerUrl: z.string().optional(),
      viberUrl: z.string().optional(),
      copyUrl: z.string().optional(),
    })
    .optional(),
  createdAt: z.string(),
});

export type ForwardableContent = z.infer<typeof forwardableContentSchema>;
