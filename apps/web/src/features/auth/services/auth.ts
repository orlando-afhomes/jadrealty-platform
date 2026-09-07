import {
  loginResponseSchema,
  qualificationQuestionSchema,
  registerResponseSchema,
  resendVerificationResponseSchema,
  verifyEmailResponseSchema,
} from '@jad/contracts';
import type {
  LoginRequest,
  LoginResponse,
  QualificationQuestion,
  RegisterRequest,
  RegisterResponse,
  ResendVerificationResponse,
  VerifyEmailRequest,
  VerifyEmailResponse,
} from '@jad/contracts';

import { request, requestList } from '../../../lib/api/client';

/**
 * Member auth services (SCR-AUTH-001..005) — typed wrappers over the API client.
 * All calls go through `lib/api/client` (no ad-hoc fetch) and validate
 * responses against the `@jad/contracts` schemas.
 */

/** `POST /auth/login` — establish a session (FR-AUTH-004, SCR-AUTH-001). */
export function login(credentials: LoginRequest): Promise<LoginResponse> {
  return request('/auth/login', loginResponseSchema, {
    method: 'POST',
    body: JSON.stringify(credentials),
  });
}

/** `POST /auth/register` — create a `Pending` application (FR-REG-001..013, SCR-AUTH-002). */
export function registerApplication(input: RegisterRequest): Promise<RegisterResponse> {
  return request('/auth/register', registerResponseSchema, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** `POST /auth/verify-email` — one-time code verification (FEAT-009, SCR-AUTH-003). */
export function verifyEmail(input: VerifyEmailRequest): Promise<VerifyEmailResponse> {
  return request('/auth/verify-email', verifyEmailResponseSchema, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/**
 * `POST /auth/verify-email/resend` — re-issue the one-time code. MOCK-ONLY:
 * the dev mock returns `devOnlyCode` (shown in a clearly-labeled simulated
 * email banner); the real API emails the code and returns none.
 */
export function resendVerificationCode(email: string): Promise<ResendVerificationResponse> {
  return request('/auth/verify-email/resend', resendVerificationResponseSchema, {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

/** `POST /me/resubmit` — corrected data for a REJECTED application (FR-REG-005, SCR-AUTH-005). */
export function resubmitApplication(input: Partial<RegisterRequest>): Promise<RegisterResponse> {
  return request('/me/resubmit', registerResponseSchema, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** `GET /programs/:id/qualification-questions` (API-SPECIFICATION #86 PROPOSED; content TBD OD-002). */
export function getQualificationQuestions(programId: string): Promise<QualificationQuestion[]> {
  return requestList(`/programs/${programId}/qualification-questions`, qualificationQuestionSchema);
}
