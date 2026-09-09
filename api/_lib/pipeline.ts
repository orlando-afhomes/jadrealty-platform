import {
  adjustmentSchema,
  adminMemberSchema,
  catalogPropertySchema,
  customerSchema,
  memberProfileSchema,
  payoutAccountSchema,
  registrationSchema,
  saleSchema,
  voucherSchema,
  voucherAssignmentSchema,
  voucherTemplateSchema,
} from '@jad/contracts';
import { maskIdentifier } from './money.js';

/**
 * Shared member-pipeline logic for api/ handlers (Phase B3).
 * Pure functions — unit-tested. Handlers own Supabase I/O; all state-machine
 * rules live here so admin and member surfaces cannot drift apart.
 */

/** Allowed admin-driven status transitions (member resubmit/reopen handled separately). */
export const SALE_TRANSITIONS: Record<string, string[]> = {
  SUBMITTED: ['ADMIN_APPROVED', 'REJECTED'],
  ADMIN_APPROVED: ['PAYMENT_VERIFIED', 'REJECTED'],
  PAYMENT_VERIFIED: ['QUALIFYING_SALE', 'REJECTED'],
  REJECTED: [],
  LOCKED: [],
  QUALIFYING_SALE: [],
};

/** Validate an admin PATCH transition. Returns an error message or null. */
export function validateSaleTransition(
  currentStatus: string,
  patch: { status?: string; rejectionReason?: string },
): string | null {
  if (patch.status === undefined) return null;
  const allowed = SALE_TRANSITIONS[currentStatus] ?? [];
  if (!allowed.includes(patch.status)) {
    return `Cannot transition sale from ${currentStatus} to ${patch.status}.`;
  }
  if (patch.status === 'REJECTED' && !(patch.rejectionReason ?? '').trim()) {
    return 'A rejection reason is required.';
  }
  return null;
}

/** Member resubmit outcome: increments, locks at max, or rejects illegal states. */
export function applyResubmit(
  currentStatus: string,
  resubmissionCount: number,
  maxAttempts: number,
): { status: string; resubmissionCount: number } | { error: string } {
  if (currentStatus !== 'REJECTED') {
    return { error: 'Only a rejected sale can be resubmitted.' };
  }
  if (resubmissionCount >= maxAttempts) {
    return { error: 'This sale has reached the maximum resubmission attempts and is locked.' };
  }
  const next = resubmissionCount + 1;
  if (next >= maxAttempts) {
    return { status: 'LOCKED', resubmissionCount: next };
  }
  return { status: 'SUBMITTED', resubmissionCount: next };
}

export function calculateAge(dateOfBirth: string, now = new Date()): number {
  const birth = new Date(dateOfBirth);
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return Math.max(0, age);
}

export function prefixedId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}`;
}

/**
 * Resolve a catalog listing from CMS `properties` content. Returns null when
 * the listing is missing or has no usable price (mirrors the mock catalog
 * guard; INACTIVE enforcement arrives with the B5 Property table).
 */
export function findCatalogPrice(
  content: unknown,
  propertyId: string,
): { name: string; price: string } | null {
  const root = content as {
    properties?: { id?: unknown; name?: unknown; price?: unknown }[];
  } | null;
  const props = root?.properties;
  if (!Array.isArray(props)) return null;
  const found = props.find((p) => p?.id === propertyId);
  if (!found || typeof found.name !== 'string' || !found.name) return null;
  const price = typeof found.price === 'string' ? found.price : '';
  if (!price || price === '0.00') return null;
  return { name: found.name, price };
}

function splitName(
  firstName: unknown,
  lastName: unknown,
  fallback: unknown,
): { firstName: string; lastName: string } {
  if (typeof firstName === 'string' && firstName && typeof lastName === 'string' && lastName) {
    return { firstName, lastName };
  }
  const parts = String(fallback ?? '').split(' ');
  return { firstName: parts[0] ?? '', lastName: parts.slice(1).join(' ') };
}

const PROGRAM_NAMES: Record<string, { code: string; name: string }> = {
  'prg-domestic': { code: 'DOMESTIC', name: 'Domestic Program' },
  'prg-abroad': { code: 'ABROAD', name: 'Abroad Program' },
};

export function mapMemberRow(
  row: Record<string, unknown>,
  programs?: Map<string, { code: string; name: string }>,
) {
  const names = splitName(row.firstName, row.lastName, row.name);
  const programId = typeof row.programId === 'string' ? row.programId : 'prg-domestic';
  const program =
    programs?.get(programId) ??
    PROGRAM_NAMES[programId] ??
    ({ id: programId, code: 'DOMESTIC', name: 'Domestic Program' } as const);
  return {
    id: row.id,
    ...names,
    dateOfBirth: row.dateOfBirth ?? '1990-01-01',
    age: calculateAge(typeof row.dateOfBirth === 'string' ? row.dateOfBirth : '1990-01-01'),
    gender: row.gender ?? 'Male',
    // Nullable text columns normalize to undefined so optional schema
    // fields validate (a null address must not hide the whole row).
    address: (row.address as string | null | undefined) ?? undefined,
    countryCode: row.countryCode ?? 'PH',
    countryName: row.countryName ?? 'Philippines',
    phone: row.phone ?? '',
    email: row.email ?? '',
    referralCode: row.referralCode ?? '',
    status: row.status,
    isQualified: row.isQualified ?? false,
    program: { id: programId, ...program },
    accountStatus: row.accountStatus ?? 'ACTIVE',
    registeredAt: row.createdAt ?? new Date().toISOString(),
    registrationId: row.registrationId ?? '',
  };
}

export function isValidMemberRow(row: Record<string, unknown>): boolean {
  return memberProfileSchema.safeParse(mapMemberRow(row)).success;
}

export function mapAdminMemberRow(
  row: Record<string, unknown>,
  programs?: Map<string, { code: string; name: string }>,
) {
  return {
    ...mapMemberRow(row, programs),
    accountStatus: row.accountStatus ?? 'ACTIVE',
    registeredAt:
      typeof row.registeredAt === 'string'
        ? row.registeredAt
        : typeof row.createdAt === 'string'
          ? row.createdAt
          : new Date().toISOString(),
    registrationId: typeof row.registrationId === 'string' ? row.registrationId : undefined,
  };
}

export function isValidAdminMemberRow(row: Record<string, unknown>): boolean {
  return adminMemberSchema.safeParse(mapAdminMemberRow(row)).success;
}

export function mapRegistrationRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    status: row.status,
    firstName: row.firstName,
    middleInitial: row.middleInitial ?? undefined,
    lastName: row.lastName,
    nameSuffix: row.nameSuffix ?? undefined,
    email: typeof row.email === 'string' && row.email ? row.email : undefined,
    phone: row.phone,
    dateOfBirth: row.dateOfBirth,
    gender: row.gender,
    countryCode: row.countryCode,
    countryName: row.countryName,
    address: row.address,
    programId: row.programId,
    programCode: row.programCode,
    referralCode: row.referralCode ?? undefined,
    qualificationAnswers: row.qualificationAnswers ?? [],
    governmentId: row.governmentId ?? undefined,
    submittedAt: row.submittedAt,
    createdAt: row.createdAt ?? row.submittedAt,
    updatedAt: row.updatedAt ?? row.submittedAt,
    reviewedAt: row.reviewedAt ?? undefined,
    reviewedBy: row.reviewedBy ?? undefined,
    rejectionNote: row.rejectionNote ?? undefined,
  };
}

export function isValidRegistrationRow(row: Record<string, unknown>): boolean {
  return registrationSchema.safeParse(mapRegistrationRow(row)).success;
}

export function mapCustomerRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    // Idempotent: accept already-mapped keys so validate-after-map in list
    // handlers never drops valid rows on the second pass.
    sellerId: row.memberId ?? row.sellerId,
    fullName: row.name ?? row.fullName,
    // Phone is contract-required: fall back to an explicit placeholder so a
    // missing number never drops the row from admin lists.
    phone: row.phone ?? '—',
    email: row.email ?? undefined,
  };
}

export function isValidCustomerRow(row: Record<string, unknown>): boolean {
  return customerSchema.safeParse(mapCustomerRow(row)).success;
}

export function mapSaleRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    status: row.status,
    propertyId: row.propertyId,
    propertyName: row.propertyName,
    propertyValue: row.propertyValue,
    customerId: row.customerId,
    customerName: row.customerName,
    sellerId: row.sellerId,
    sellerName: row.sellerName,
    submittedAt: row.submittedAt,
    resubmissionCount: row.resubmissionCount ?? 0,
    approvedAt: row.approvedAt ?? undefined,
    paymentVerifiedAt: row.paymentVerifiedAt ?? undefined,
    lockedAt: row.lockedAt ?? undefined,
    rejectionReason: row.rejectionReason ?? undefined,
  };
}

export function isValidSaleRow(row: Record<string, unknown>): boolean {
  return saleSchema.safeParse(mapSaleRow(row)).success;
}

/**
 * B5 money-list mappers. DB columns are camelCase (quoted) to match the
 * contract shapes; `categorySlug` is the only rename (`categoryId` on the
 * wire). Timestamptz columns arrive as ISO strings; numeric-as-text amounts
 * pass through untouched (no float math — exact-decimal strings end to end).
 */

export function mapPropertyRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    // Idempotent: accept the already-mapped key (see mapCustomerRow).
    categoryId: row.categorySlug ?? row.categoryId,
    price: row.price ?? undefined,
    status: row.status,
  };
}

export function isValidPropertyRow(row: Record<string, unknown>): boolean {
  return catalogPropertySchema.safeParse(mapPropertyRow(row)).success;
}

export function mapPayoutAccountRow(row: Record<string, unknown>) {
  const raw =
    typeof row.accountIdentifier === 'string' && row.accountIdentifier
      ? row.accountIdentifier
      : undefined;
  return {
    id: row.id,
    method: row.method,
    accountName: row.accountName,
    // Tables render the masked value; detail modals render the raw value
    // when present (owner/staff reads). Rows that only carry a pre-masked
    // value (legacy admin seeds) pass through, defaulting to full mask.
    accountIdentifierMasked: raw
      ? maskIdentifier(raw)
      : ((row.accountIdentifierMasked as string | undefined) ?? '••••'),
    ...(raw ? { accountIdentifier: raw } : {}),
    status: row.status,
    isPrimary: row.isPrimary ?? false,
    createdAt: row.createdAt,
    rejectionReason: row.rejectionReason ?? undefined,
  };
}

export function isValidPayoutAccountRow(row: Record<string, unknown>): boolean {
  return payoutAccountSchema.safeParse(mapPayoutAccountRow(row)).success;
}

export function mapVoucherTemplateRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    title: row.title,
    originalValue: row.originalValue,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt ?? undefined,
    validityDays: typeof row.validityDays === 'number' ? row.validityDays : undefined,
  };
}

export function isValidVoucherTemplateRow(row: Record<string, unknown>): boolean {
  return voucherTemplateSchema.safeParse(mapVoucherTemplateRow(row)).success;
}

export function mapVoucherRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    originalValue: row.originalValue,
    remainingValue: row.remainingValue,
    status: row.status,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt ?? undefined,
  };
}

export function isValidVoucherRow(row: Record<string, unknown>): boolean {
  return voucherSchema.safeParse(mapVoucherRow(row)).success;
}

/** Admin assignment view — voucher plus template/member linkage. */
export function mapVoucherAssignmentRow(row: Record<string, unknown>) {
  return {
    ...mapVoucherRow(row),
    templateId: row.templateId,
    memberId: row.memberId,
    memberName: row.memberName,
  };
}

export function isValidVoucherAssignmentRow(row: Record<string, unknown>): boolean {
  return voucherAssignmentSchema.safeParse(mapVoucherAssignmentRow(row)).success;
}

export function mapAdjustmentRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    memberId: row.memberId,
    memberName: row.memberName,
    entryType: row.entryType,
    direction: row.direction,
    amount: row.amount,
    reason: row.reason,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  };
}

export function isValidAdjustmentRow(row: Record<string, unknown>): boolean {
  return adjustmentSchema.safeParse(mapAdjustmentRow(row)).success;
}
