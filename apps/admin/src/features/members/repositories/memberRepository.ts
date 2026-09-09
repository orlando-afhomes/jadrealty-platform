import { z } from 'zod';

import {
  adminMemberSchema,
  purgeMemberResponseSchema,
  type AdminMember,
  type MemberProfile,
} from '@jad/contracts';

import { request, requestList } from '../../../lib/api/client';

/**
 * Member repository — REST over api/v1 (Phase B3 cutover).
 * Centralizes transitions: ACTIVE ↔ INACTIVE, → ARCHIVED.
 */
export async function getMembers(): Promise<AdminMember[]> {
  return requestList('/admin/members', adminMemberSchema);
}

export async function getMemberById(id: string): Promise<AdminMember | undefined> {
  try {
    return await request(`/admin/members/${id}`, adminMemberSchema);
  } catch {
    return undefined;
  }
}

export async function updateMember(id: string, data: Partial<MemberProfile>): Promise<AdminMember> {
  return request(`/admin/members/${id}`, adminMemberSchema, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function deactivateMember(id: string): Promise<AdminMember> {
  return updateMember(id, { accountStatus: 'INACTIVE' } as Partial<MemberProfile>);
}

export async function activateMember(id: string): Promise<AdminMember> {
  return updateMember(id, { accountStatus: 'ACTIVE' } as Partial<MemberProfile>);
}

/**
 * Grant/revoke qualification (super_admin + admin; approved members only —
 * enforced server-side). Qualification is the Active + Qualified gate that
 * unlocks sales submission and sponsorship.
 */
export async function setMemberQualified(id: string, isQualified: boolean): Promise<AdminMember> {
  return updateMember(id, { isQualified } as Partial<MemberProfile>);
}

export interface CreateMemberInput {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  gender: string;
  address?: string;
  countryCode: string;
  countryName: string;
  programCode: string;
  dateOfBirth: string;
  temporaryPassword: string;
}

export async function createMember(input: CreateMemberInput): Promise<AdminMember> {
  return request('/admin/members', adminMemberSchema, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export async function archiveMember(id: string): Promise<{ archivedId: string }> {
  return request(`/admin/members/${id}/archive`, z.object({ archivedId: z.string() }), {
    method: 'POST',
  });
}

/**
 * Permanently delete a member and their entire record graph (super_admin
 * only, enforced server-side). Irreversible — prefer `archiveMember` unless
 * the record must be destroyed (e.g. test data, lawful erasure requests).
 */
export async function deleteMemberPermanently(
  id: string,
  reason: string,
): Promise<{ purgedId: string }> {
  return request(`/admin/members/${id}`, purgeMemberResponseSchema, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
}
