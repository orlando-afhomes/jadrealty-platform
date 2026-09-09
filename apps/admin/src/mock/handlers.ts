import type { AdminQueues, ContentKind } from '@jad/contracts';
import { CMS_PROPERTIES_SEED, STAFF_MODULE_LABEL, roleNameFor } from '@jad/contracts';
import type { MockRequestContext, MockRoute } from '@jad/mock';
import { contentStore, createStoreContent } from './contentMockStore';

import {
  MOCK_SALES,
  MOCK_PAYOUT_ACCOUNTS,
  MOCK_WITHDRAWALS,
  MOCK_VOUCHERS,
  MOCK_VOUCHER_ASSIGNMENTS,
  MOCK_PROPERTIES,
  MOCK_ADJUSTMENTS,
  MOCK_CONFIG,
  MOCK_AUDIT,
  MOCK_PROGRAMS,
} from './data';
import {
  appendStaffAudit,
  createRole as createStoreRole,
  createStaffMember as createStoreStaffMember,
  deleteRole as deleteStoreRole,
  deleteStaffMember as deleteStoreStaffMember,
  getRoleById,
  staffStore,
  STAFF_AUDIT_ACTIONS,
  updateRole as updateStoreRole,
  updateStaffMember,
} from './staffMockStore';
import { guardRolePermissions } from '../features/roles/guards';
import { registrationStore } from './registrationMockStore';

function idFromPath(url: string, pattern: RegExp): string | undefined {
  return pattern.exec(new URL(url, 'http://mock.local').pathname)?.[1];
}

function notFound(entity: string) {
  return {
    body: {
      error: {
        code: 'NOT_FOUND',
        message: `${entity} not found`,
        timestamp: new Date().toISOString(),
      },
    },
    status: 404 as const,
  };
}

function fail(message: string) {
  const status = /not found|does not exist/i.test(message)
    ? 404
    : /already exists|reassign|last role|super admin/i.test(message)
      ? 409
      : 400;
  return {
    body: {
      error: {
        code: status === 404 ? 'NOT_FOUND' : status === 409 ? 'CONFLICT' : 'VALIDATION_ERROR',
        message,
        timestamp: new Date().toISOString(),
      },
    },
    status: status as 400 | 404 | 409,
  };
}

/**
 * Admin mock API (API-shaped, F0). Each handler returns contract-valid JSON
 * exactly as the real endpoint would. Detail routes use `match:'prefix'` with
 * regex id extraction from the URL — the mock server passes `MockRequestContext`
 * (not a `params` object) to response/handler functions.
 */
export const adminMockHandlers: MockRoute[] = [
  {
    path: '/admin/queues',
    response: (): AdminQueues => ({
      registrations: registrationStore.registrations.filter((row) => row.status === 'PENDING')
        .length,
      sales: MOCK_SALES.length,
      payouts: MOCK_PAYOUT_ACCOUNTS.length,
      withdrawals: MOCK_WITHDRAWALS.length,
    }),
  },
  {
    path: '/admin/registrations',
    response: () => {
      const data = registrationStore.registrations;
      return {
        data,
        meta: {
          page: 1,
          pageSize: 10,
          total: data.length,
        },
      };
    },
  },
  {
    path: '/admin/registrations/',
    match: 'prefix',
    handler: (ctx: MockRequestContext) => {
      const id = idFromPath(ctx.url, /\/admin\/registrations\/([^/?#]+)/);
      if (!id) return notFound('Registration');
      const reg = registrationStore.registrations.find((r) => r.id === id);
      if (!reg) return notFound('Registration');
      return reg;
    },
  },
  {
    path: '/admin/members',
    response: () => {
      const data = registrationStore.members;
      return {
        data,
        meta: {
          page: 1,
          pageSize: 10,
          total: data.length,
        },
      };
    },
  },
  {
    path: '/admin/members/',
    match: 'prefix',
    handler: (ctx: MockRequestContext) => {
      const id = idFromPath(ctx.url, /\/admin\/members\/([^/?#]+)/);
      if (!id) return notFound('Member');
      const member = registrationStore.members.find((m) => m.id === id);
      if (!member) return notFound('Member');
      return member;
    },
  },
  {
    path: '/admin/sales',
    response: () => ({
      data: MOCK_SALES,
      meta: {
        page: 1,
        pageSize: 10,
        total: MOCK_SALES.length,
      },
    }),
  },
  {
    path: '/admin/sales/',
    match: 'prefix',
    handler: (ctx: MockRequestContext) => {
      const id = idFromPath(ctx.url, /\/admin\/sales\/([^/?#]+)/);
      if (!id) return notFound('Sale');
      const sale = MOCK_SALES.find((s) => s.id === id);
      if (!sale) return notFound('Sale');
      return sale;
    },
  },
  {
    path: '/admin/properties',
    response: {
      data: MOCK_PROPERTIES,
      meta: {
        page: 1,
        pageSize: 10,
        total: MOCK_PROPERTIES.length,
      },
    },
  },
  {
    path: '/admin/properties/',
    match: 'prefix',
    handler: (ctx: MockRequestContext) => {
      const id = idFromPath(ctx.url, /\/admin\/properties\/([^/?#]+)/);
      if (!id) return notFound('Property');
      const prop = MOCK_PROPERTIES.find((p) => p.id === id);
      if (!prop) return notFound('Property');
      return prop;
    },
  },
  {
    // Merged category view mirroring GET /admin/property-categories
    // (test double only — production reads the real endpoint).
    path: '/admin/property-categories',
    response: () => {
      const data = CMS_PROPERTIES_SEED.categories.map((cat) => ({
        ...cat,
        listingCount: MOCK_PROPERTIES.filter((p) => p.categoryId === cat.slug).length,
      }));
      return {
        data,
        meta: { page: 1, pageSize: data.length, total: data.length },
      };
    },
  },
  {
    path: '/admin/payouts',
    response: {
      data: MOCK_PAYOUT_ACCOUNTS,
      meta: {
        page: 1,
        pageSize: 10,
        total: MOCK_PAYOUT_ACCOUNTS.length,
      },
    },
  },
  {
    path: '/admin/withdrawals',
    response: {
      data: MOCK_WITHDRAWALS,
      meta: {
        page: 1,
        pageSize: 10,
        total: MOCK_WITHDRAWALS.length,
      },
    },
  },
  {
    // Test double mirroring GET /admin/voucher-templates (list envelope).
    path: '/admin/voucher-templates',
    response: {
      data: MOCK_VOUCHERS,
      meta: {
        page: 1,
        pageSize: 10,
        total: MOCK_VOUCHERS.length,
      },
    },
  },
  {
    // Without templateId: all assignments (backs the list-page counts).
    // With ?templateId=: that template's assignments (detail page).
    path: '/admin/vouchers',
    handler: (ctx: MockRequestContext) => {
      const templateId = new URL(ctx.url, 'http://mock.local').searchParams.get('templateId');
      const items = templateId
        ? MOCK_VOUCHER_ASSIGNMENTS.filter((a) => a.templateId === templateId)
        : MOCK_VOUCHER_ASSIGNMENTS;
      return {
        data: items,
        meta: { page: 1, pageSize: items.length, total: items.length },
      };
    },
  },
  {
    path: '/admin/content',
    method: 'POST',
    handler: (ctx: MockRequestContext) => {
      const input = (ctx.body ?? {}) as Record<string, unknown>;
      try {
        const item = createStoreContent({
          title: String(input.title ?? ''),
          description: typeof input.description === 'string' ? input.description : undefined,
          kind: (input.kind ?? 'DOCUMENT') as ContentKind,
          downloadUrl: String(input.downloadUrl ?? ''),
        });
        return { body: item, status: 201 };
      } catch (e) {
        return fail((e as Error).message);
      }
    },
  },
  {
    path: '/admin/content',
    response: () => {
      const data = contentStore.items;
      return {
        data,
        meta: {
          page: 1,
          pageSize: 10,
          total: data.length,
        },
      };
    },
  },
  {
    path: '/admin/adjustments',
    response: {
      data: MOCK_ADJUSTMENTS,
      meta: {
        page: 1,
        pageSize: 10,
        total: MOCK_ADJUSTMENTS.length,
      },
    },
  },
  {
    path: '/admin/config',
    response: {
      data: MOCK_CONFIG,
      meta: {
        page: 1,
        pageSize: 50,
        total: MOCK_CONFIG.length,
      },
    },
  },
  {
    path: '/programs',
    response: {
      data: MOCK_PROGRAMS,
      meta: {
        page: 1,
        pageSize: 10,
        total: MOCK_PROGRAMS.length,
      },
    },
  },
  {
    path: '/admin/audit',
    response: {
      data: MOCK_AUDIT,
      meta: {
        page: 1,
        pageSize: 10,
        total: MOCK_AUDIT.length,
      },
    },
  },
  {
    path: '/admin/staff',
    method: 'GET',
    response: () => {
      const data = staffStore.members;
      return {
        data,
        meta: {
          page: 1,
          pageSize: 10,
          total: data.length,
        },
      };
    },
  },
  {
    path: '/admin/staff/',
    match: 'prefix',
    method: 'GET',
    handler: (ctx: MockRequestContext) => {
      const id = idFromPath(ctx.url, /\/admin\/staff\/([^/?#]+)/);
      if (!id) return notFound('Staff member');
      const member = staffStore.members.find((s) => s.id === id);
      if (!member) return notFound('Staff member');
      return member;
    },
  },
  {
    path: '/admin/roles',
    method: 'GET',
    response: () => {
      const data = staffStore.roles;
      return {
        data,
        meta: {
          page: 1,
          pageSize: 20,
          total: data.length,
        },
      };
    },
  },
  {
    path: '/admin/roles/',
    match: 'prefix',
    method: 'GET',
    handler: (ctx: MockRequestContext) => {
      const id = idFromPath(ctx.url, /\/admin\/roles\/([^/?#]+)/);
      if (!id) return notFound('Role');
      const role = staffStore.roles.find((r) => r.id === id);
      if (!role) return notFound('Role');
      return role;
    },
  },
  {
    path: '/admin/roles',
    method: 'POST',
    handler: (ctx: MockRequestContext) => {
      const input = (ctx.body ?? {}) as Record<string, unknown>;
      try {
        const role = createStoreRole({
          name: String(input.name ?? ''),
          permissions: (Array.isArray(input.permissions) ? input.permissions : []) as never,
          createdBy: String(input.actor ?? 'Unknown'),
        });
        appendStaffAudit({
          action: STAFF_AUDIT_ACTIONS.ROLE_CREATED,
          actor: String(input.actor ?? 'Unknown'),
          actorRole: String(input.actorRole ?? 'ADMIN'),
          targetType: 'Role',
          targetId: role.id,
          targetName: role.name,
          detail: `Created role with modules: ${role.permissions.map((m) => STAFF_MODULE_LABEL[m as keyof typeof STAFF_MODULE_LABEL] ?? m).join(', ')}`,
        });
        return { body: role, status: 201 };
      } catch (e) {
        return fail((e as Error).message);
      }
    },
  },
  {
    path: '/admin/roles/',
    match: 'prefix',
    method: 'PATCH',
    handler: (ctx: MockRequestContext) => {
      const id = idFromPath(ctx.url, /\/admin\/roles\/([^/?#]+)/);
      const input = (ctx.body ?? {}) as Record<string, unknown>;
      try {
        if (!id) throw new Error('Role does not exist');
        const current = getRoleById(id);
        if (!current) throw new Error('Role does not exist');
        if (input.permissions !== undefined) {
          const governance = guardRolePermissions(staffStore.roles, id, input.permissions as never);
          if (!governance.ok) throw new Error(governance.reason);
        }
        const previousName = current.name;
        const previousPermissions = [...current.permissions];
        const updated = updateStoreRole(id, {
          ...(input.name !== undefined ? { name: String(input.name) } : {}),
          ...(input.permissions !== undefined ? { permissions: input.permissions as never } : {}),
        })!;
        const changes: string[] = [];
        if (input.name !== undefined && previousName !== updated.name) {
          changes.push(`renamed from ${previousName} to ${updated.name}`);
        }
        if (input.permissions !== undefined) {
          const label = (m: string) =>
            STAFF_MODULE_LABEL[m as keyof typeof STAFF_MODULE_LABEL] ?? m;
          const added = updated.permissions.filter((m) => !previousPermissions.includes(m));
          const removed = previousPermissions.filter((m) => !updated.permissions.includes(m));
          const parts: string[] = [];
          if (added.length > 0) parts.push(`granted ${added.map(label).join(', ')}`);
          if (removed.length > 0) parts.push(`revoked ${removed.map(label).join(', ')}`);
          if (parts.join('; ')) changes.push(parts.join('; '));
        }
        appendStaffAudit({
          action: STAFF_AUDIT_ACTIONS.ROLE_PERMISSIONS_UPDATED,
          actor: String(input.actor ?? 'Unknown'),
          actorRole: String(input.actorRole ?? 'ADMIN'),
          targetType: 'Role',
          targetId: updated.id,
          targetName: updated.name,
          detail: changes.length > 0 ? changes.join('; ') : 'No changes',
        });
        return updated;
      } catch (e) {
        return fail((e as Error).message);
      }
    },
  },
  {
    path: '/admin/roles/',
    match: 'prefix',
    method: 'DELETE',
    handler: (ctx: MockRequestContext) => {
      const id = idFromPath(ctx.url, /\/admin\/roles\/([^/?#]+)/);
      const input = (ctx.body ?? {}) as Record<string, unknown>;
      try {
        if (!id) throw new Error('Role does not exist');
        if (String(input.actorRole ?? '').toUpperCase() !== 'SUPER_ADMIN') {
          throw new Error('Only super admins can delete roles.');
        }
        const current = getRoleById(id);
        if (!current) throw new Error('Role does not exist');
        deleteStoreRole(id);
        appendStaffAudit({
          action: STAFF_AUDIT_ACTIONS.ROLE_DELETED,
          actor: String(input.actor ?? 'Unknown'),
          actorRole: String(input.actorRole ?? 'ADMIN'),
          targetType: 'Role',
          targetId: current.id,
          targetName: current.name,
          detail: `Deleted role ${current.name}`,
        });
        return { id: current.id, deleted: true };
      } catch (e) {
        return fail((e as Error).message);
      }
    },
  },
  {
    path: '/admin/staff',
    method: 'POST',
    handler: (ctx: MockRequestContext) => {
      const input = (ctx.body ?? {}) as Record<string, unknown>;
      try {
        const member = createStoreStaffMember({
          name: String(input.name ?? ''),
          email: String(input.email ?? ''),
          roleId: String(input.roleId ?? ''),
          createdBy: String(input.actor ?? 'Unknown'),
        });
        appendStaffAudit({
          action: STAFF_AUDIT_ACTIONS.CREATED,
          actor: String(input.actor ?? 'Unknown'),
          actorRole: String(input.actorRole ?? 'ADMIN'),
          targetType: 'Staff',
          targetId: member.id,
          targetName: member.name,
          detail: `Created staff account with role ${roleNameFor(staffStore.roles, member.roleId)}`,
        });
        return { body: member, status: 201 };
      } catch (e) {
        return fail((e as Error).message);
      }
    },
  },
  {
    path: '/admin/staff/',
    match: 'prefix',
    method: 'PATCH',
    handler: (ctx: MockRequestContext) => {
      const id = idFromPath(ctx.url, /\/admin\/staff\/([^/?#]+)/);
      const input = (ctx.body ?? {}) as Record<string, unknown>;
      try {
        if (!id) throw new Error('Staff member not found');
        const current = staffStore.members.find((m) => m.id === id);
        if (!current) throw new Error('Staff member not found');
        if (input.roleId !== undefined) {
          if (!getRoleById(String(input.roleId))) throw new Error('Selected role does not exist');
        }
        const previousRoleId = current.roleId;
        const updated = updateStaffMember(id, {
          ...(input.roleId !== undefined ? { roleId: String(input.roleId) } : {}),
          ...(input.status !== undefined ? { status: input.status as 'ACTIVE' | 'DISABLED' } : {}),
        })!;
        if (input.roleId !== undefined) {
          appendStaffAudit({
            action: STAFF_AUDIT_ACTIONS.ROLE_ASSIGNED,
            actor: String(input.actor ?? 'Unknown'),
            actorRole: String(input.actorRole ?? 'ADMIN'),
            targetType: 'Staff',
            targetId: updated.id,
            targetName: updated.name,
            detail: `Changed role from ${roleNameFor(staffStore.roles, previousRoleId)} to ${roleNameFor(staffStore.roles, updated.roleId)}`,
          });
        }
        if (input.status !== undefined) {
          appendStaffAudit({
            action:
              input.status === 'ACTIVE'
                ? STAFF_AUDIT_ACTIONS.ENABLED
                : STAFF_AUDIT_ACTIONS.DISABLED,
            actor: String(input.actor ?? 'Unknown'),
            actorRole: String(input.actorRole ?? 'ADMIN'),
            targetType: 'Staff',
            targetId: updated.id,
            targetName: updated.name,
            detail: input.status === 'ACTIVE' ? 'Re-enabled staff access' : 'Disabled staff access',
          });
        }
        return updated;
      } catch (e) {
        return fail((e as Error).message);
      }
    },
  },
  {
    path: '/admin/staff/',
    match: 'prefix',
    method: 'DELETE',
    handler: (ctx: MockRequestContext) => {
      const id = idFromPath(ctx.url, /\/admin\/staff\/([^/?#]+)/);
      const input = (ctx.body ?? {}) as Record<string, unknown>;
      try {
        if (!id) throw new Error('Staff member not found');
        const removed = deleteStoreStaffMember(id);
        if (!removed) throw new Error('Staff member not found');
        appendStaffAudit({
          action: STAFF_AUDIT_ACTIONS.DELETED,
          actor: String(input.actor ?? 'Unknown'),
          actorRole: String(input.actorRole ?? 'ADMIN'),
          targetType: 'Staff',
          targetId: removed.id,
          targetName: removed.name,
          detail: `Deleted staff account ${removed.name} (${removed.email})`,
        });
        return { id: removed.id, deleted: true };
      } catch (e) {
        return fail((e as Error).message);
      }
    },
  },
  {
    path: '/admin/audit-log',
    response: () => {
      const data = [...MOCK_AUDIT, ...staffStore.auditEntries].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      return {
        data,
        meta: {
          page: 1,
          pageSize: data.length,
          total: data.length,
        },
      };
    },
  },
];
