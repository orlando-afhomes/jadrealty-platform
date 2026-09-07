import { z } from 'zod';

/**
 * Policy — `GET /policies` (API-SPECIFICATION #69, PUBLIC, FEAT-062 / FR-ADM-004).
 * Admins manage policies, program guidelines, Terms and Conditions, and company
 * rules (FR-ADM-004). The `type` vocabulary is not enumerated in any SSOT, so it
 * is a free string. Shape is PROPOSED baseline.
 */
export const policySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  type: z.string(),
  content: z.string().optional(),
  updatedAt: z.string(),
});

export type Policy = z.infer<typeof policySchema>;
