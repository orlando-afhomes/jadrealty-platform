import { z } from 'zod';

/**
 * Program — `GET /programs` (API-SPECIFICATION #78, PUBLIC, FEAT-068 / FR-PRG-001).
 * SSOT confirms two programs: Domestic (MVP) and Abroad. Program `code` values
 * are not enumerated in any SSOT, so `code` is a free string — never assume
 * `DOMESTIC`/`ABROAD` literal values. Shape is PROPOSED baseline.
 */
export const programSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
});

export type Program = z.infer<typeof programSchema>;

/**
 * Qualification question — `GET /programs/:id/qualification-questions`
 * (API-SPECIFICATION #86 PROPOSED). Content is TBD (OD-002); the shape is the
 * PROPOSED baseline only. The mock serves placeholder questions.
 */
export const qualificationQuestionSchema = z.object({
  id: z.string().min(1),
  questionText: z.string().min(1),
});

export type QualificationQuestion = z.infer<typeof qualificationQuestionSchema>;
