import type { Policy } from '@jad/contracts';

/**
 * Policies static fallback (Q6). When the public `GET /policies` endpoint is
 * unreachable, the public Policies pages render these contract-valid rows so
 * visitors — and the registration consent links — always resolve to the real
 * documents. Mirrors `POLICY_SEEDS` (supabase/seed.ts); never invented copy.
 *
 * Each policy additionally carries its uploaded PDF (`documentUrl`), which the
 * detail page prefers over the plain-text summary.
 */

export const POLICIES_PATH = '/policies';

/** `/policies/{policyId}` */
export function policyPath(policyId: string): string {
  return `${POLICIES_PATH}/${policyId}`;
}

/** Canonical policy ids used by deep links (registration consent, login note). */
export const TERMS_POLICY_ID = 'pol-001';
export const PRIVACY_POLICY_ID = 'pol-003';

export const POLICY_FALLBACK: Policy[] = [
  {
    id: 'pol-001',
    title: 'Terms and Conditions',
    type: 'terms',
    content:
      'By registering for JA&D membership you agree to abide by the JA&D terms and conditions as published on the official website. Membership has no purchase requirement.',
    updatedAt: '2026-08-18T10:00:00.000Z',
  },
  {
    id: 'pol-002',
    title: 'Program Guidelines',
    type: 'guidelines',
    content:
      'These guidelines describe how qualifying sales and referrals work within the JA&D membership program.',
    updatedAt: '2026-08-18T10:00:00.000Z',
  },
  {
    id: 'pol-003',
    title: 'Privacy Policy',
    type: 'privacy',
    content:
      'JA&D collects only the personal information needed to operate the membership platform. Personal data is never sold. Full details are published on the official website.',
    updatedAt: '2026-08-18T10:00:00.000Z',
  },
];
