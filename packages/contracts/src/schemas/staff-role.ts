import { z } from 'zod';

/**
 * Staff roles for admin-shell RBAC — frontend/UI-UX pass (static mocks).
 * Distinct from the session `Role` (`admin`/`user` in `./role.js`), which
 * remains the authentication gate. `StaffRole` drives per-module visibility
 * in the admin shell. Exactly one staff role per staff user.
 *
 * SSOT: docs/business/BUSINESS-RULES.md #3 (Admin / Finance / Super Admin /
 * Merchant capabilities), docs/ui-ux/UI-UX.md #6.2 screen register,
 * docs/architecture/API-SPECIFICATION.md #6 endpoint inventory. Frontend
 * visibility is never authorization — the real backend enforces every
 * request server-side.
 */
export const staffRoleSchema = z.enum(['super_admin', 'admin', 'finance', 'merchant']);

export type StaffRole = z.infer<typeof staffRoleSchema>;

export const STAFF_ROLE_LABEL: Record<StaffRole, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  finance: 'Finance',
  merchant: 'Merchant',
};

/**
 * Admin-shell modules (one key per nav destination family). Keys are stable
 * module identifiers — they intentionally do not embed route paths, which
 * are still PROPOSED (no SSOT defines admin route paths yet).
 */
export const staffModuleSchema = z.enum([
  'dashboard',
  'registrations',
  'members',
  'sales',
  'payouts',
  'withdrawals',
  'vouchers',
  'properties',
  'marketing_tools',
  'config',
  'programs',
  'audit',
  'staff',
  'cms',
]);

export type StaffModule = z.infer<typeof staffModuleSchema>;

/**
 * Permission matrix: modules visible to each system staff role. This is the
 * system-role seed — the single source for default permissions. Custom
 * roles are `RoleRecord`s whose permissions start as a copy of (or a blank
 * set edited from) these rows; the seed itself never changes at runtime.
 *
 * - super_admin: everything (BUSINESS-RULES #3: all Admin/Finance +
 *   configure params + financial adjustments + recovery).
 * - admin: operational modules + content/catalog + CMS + staff-facing queues.
 *   NOT config/programs (SUP-only configure params, PATCH /config SUP),
 *   NOT audit (GET /audit-log SUP), NOT staff (governance, SUP-only).
 * - finance: sales queue + payouts + withdrawals only (UI-UX #6.2: Finance
 *   sees Sales queue + Withdrawals, NOT Adjustments/Config).
 * - merchant: vouchers redemption scope only (BUSINESS-RULES #3 Merchant:
 *   redeem vouchers online via JAD only).
 */
export const STAFF_PERMISSIONS: Record<StaffRole, readonly StaffModule[]> = {
  super_admin: [
    'dashboard',
    'registrations',
    'members',
    'sales',
    'payouts',
    'withdrawals',
    'vouchers',
    'properties',
    'marketing_tools',
    'config',
    'programs',
    'audit',
    'staff',
    'cms',
  ],
  admin: [
    'dashboard',
    'registrations',
    'members',
    'sales',
    'payouts',
    'withdrawals',
    'vouchers',
    'properties',
    'marketing_tools',
    'cms',
  ],
  finance: ['dashboard', 'sales', 'payouts', 'withdrawals'],
  merchant: ['vouchers'],
};

/** Module visibility check for a staff role (`null` role sees nothing). */
export function canStaffAccess(staffRole: StaffRole | null, module: StaffModule): boolean {
  if (staffRole === null) return false;
  return STAFF_PERMISSIONS[staffRole].includes(module);
}

/**
 * Role record: the permission unit of true RBAC. One staff member holds
 * exactly one role; many members may share a role; permissions belong to
 * the role, never to individual users (no per-user overrides).
 *
 * System roles (`isSystem`, ids equal to the `StaffRole` enum values) seed
 * from `STAFF_PERMISSIONS` and carry the SSOT guarantees; custom roles
 * (`role-<slug>` ids) are administrator-defined and always audited.
 */
export const roleRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(60),
  permissions: z.array(staffModuleSchema).min(1),
  isSystem: z.boolean(),
});

export type RoleRecord = z.infer<typeof roleRecordSchema>;

/** Staff access standing — mirrors the mock roster; stored on Member.accountStatus. */
export const staffStatusSchema = z.enum(['ACTIVE', 'DISABLED']);

export type StaffStatus = z.infer<typeof staffStatusSchema>;

/**
 * Staff directory entry — a Member holding exactly one role.
 * Served by `GET /admin/staff[/:id]`; `roleId` is the role key (system id or
 * custom `role-<slug>`).
 */
export const staffMemberSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email(),
  roleId: z.string().min(1),
  status: staffStatusSchema,
  createdAt: z.string(),
  createdBy: z.string().min(1),
});

export type StaffMember = z.infer<typeof staffMemberSchema>;

/**
 * Audit log entry — served by `GET /admin/audit-log`, written by
 * `api/_lib/audit.ts` on every mutating admin call.
 */
export const auditLogEntrySchema = z.object({
  id: z.string().min(1),
  action: z.string().min(1),
  actor: z.string().min(1),
  actorRole: z.string().min(1),
  targetType: z.string().min(1),
  targetId: z.string().min(1),
  targetName: z.string().min(1),
  detail: z.string(),
  createdAt: z.string(),
});

export type AuditLogEntry = z.infer<typeof auditLogEntrySchema>;

/** System role records built from the matrix seed (single source). */
export function systemRoleRecords(): RoleRecord[] {
  return (staffRoleSchema.options as readonly StaffRole[]).map((id) => ({
    id,
    name: STAFF_ROLE_LABEL[id],
    permissions: [...STAFF_PERMISSIONS[id]],
    isSystem: true,
  }));
}

/** Derive a stable custom-role id from a display name (`Finance Reviewer` → `role-finance-reviewer`). */
export function slugifyRoleName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `role-${slug || 'custom'}`;
}

/** Case-insensitive name uniqueness across role records (optionally ignoring one id, for renames). */
export function isRoleNameUnique(
  roles: Pick<RoleRecord, 'id' | 'name'>[],
  name: string,
  excludeId?: string,
): boolean {
  const wanted = name.trim().toLowerCase();
  return !roles.some((r) => r.id !== excludeId && r.name.trim().toLowerCase() === wanted);
}

/**
 * Resolve the effective modules for a role id against role records.
 * Falls back to the matrix seed for system ids when records are absent, so
 * the shell can render synchronously before the mock records load.
 * Unknown ids resolve to no modules (deny by default).
 */
export function resolveRoleModules(
  roles: readonly RoleRecord[] | undefined,
  roleId: string | null | undefined,
): StaffModule[] {
  if (!roleId) return [];
  const record = roles?.find((r) => r.id === roleId);
  if (record) return [...record.permissions];
  const systemIds = staffRoleSchema.options as readonly string[];
  if (systemIds.includes(roleId)) {
    return [...STAFF_PERMISSIONS[roleId as StaffRole]];
  }
  return [];
}

/** Display names for modules (mirror the admin nav labels). */
export const STAFF_MODULE_LABEL: Record<StaffModule, string> = {
  dashboard: 'Dashboard',
  registrations: 'Registration',
  members: 'Members',
  sales: 'Sales',
  payouts: 'Payouts',
  withdrawals: 'Withdrawals',
  vouchers: 'Vouchers',
  properties: 'Properties',
  marketing_tools: 'Marketing Tools',
  config: 'System Configuration',
  programs: 'Programs',
  audit: 'Audit Log',
  staff: 'Staff',
  cms: 'Website CMS',
};

/** Display name for a role id (record name, else system label, else the raw id). */
export function roleNameFor(
  roles: readonly Pick<RoleRecord, 'id' | 'name'>[] | undefined,
  roleId: string,
): string {
  const record = roles?.find((r) => r.id === roleId);
  if (record) return record.name;
  const systemIds = staffRoleSchema.options as readonly string[];
  if (systemIds.includes(roleId)) return STAFF_ROLE_LABEL[roleId as StaffRole];
  return roleId;
}
