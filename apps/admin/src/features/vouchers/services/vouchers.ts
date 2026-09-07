import {
  voucherAssignmentSchema,
  voucherTemplateSchema,
  type VoucherAssignment,
  type VoucherTemplate,
} from '@jad/contracts';
import { z } from 'zod';

import { request, requestList } from '../../../lib/api/client';

const deleteResultSchema = z.object({ id: z.string(), deleted: z.boolean() });

export type CreateTemplateInput = {
  title: string;
  originalValue: string;
  expiresAt?: string;
  validityDays?: number;
};

export type UpdateTemplateInput = {
  title?: string;
  expiresAt?: string | null;
  validityDays?: number | null;
};

export type AssignVoucherInput = {
  templateId: string;
  memberId: string;
};

/**
 * Voucher template + assignment service — pure API calls, no mock fallback.
 * The backend is the system of record; failures surface to the caller.
 */

export function getTemplates(): Promise<VoucherTemplate[]> {
  return requestList('/admin/voucher-templates', voucherTemplateSchema);
}

export function getTemplate(id: string): Promise<VoucherTemplate> {
  return request(`/admin/voucher-templates/${id}`, voucherTemplateSchema);
}

export function createTemplate(input: CreateTemplateInput): Promise<VoucherTemplate> {
  return request('/admin/voucher-templates', voucherTemplateSchema, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateTemplate(id: string, input: UpdateTemplateInput): Promise<VoucherTemplate> {
  const body: Record<string, unknown> = {};
  if (input.title !== undefined) body.title = input.title;
  if (input.expiresAt !== undefined) body.expiresAt = input.expiresAt;
  if (input.validityDays !== undefined) body.validityDays = input.validityDays;
  return request(`/admin/voucher-templates/${id}`, voucherTemplateSchema, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export async function deleteTemplate(id: string): Promise<boolean> {
  await request(`/admin/voucher-templates/${id}`, deleteResultSchema, { method: 'DELETE' });
  return true;
}

export function getAssignments(templateId: string): Promise<VoucherAssignment[]> {
  return requestList(
    `/admin/vouchers?templateId=${encodeURIComponent(templateId)}`,
    voucherAssignmentSchema,
  );
}

export function getAllAssignments(): Promise<VoucherAssignment[]> {
  return requestList('/admin/vouchers', voucherAssignmentSchema);
}

export function assignVoucher(input: AssignVoucherInput): Promise<VoucherAssignment> {
  return request('/admin/vouchers/assign', voucherAssignmentSchema, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function deleteAssignment(id: string): Promise<boolean> {
  await request(`/admin/vouchers/${id}`, deleteResultSchema, { method: 'DELETE' });
  return true;
}
