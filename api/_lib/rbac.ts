import { staffModuleSchema } from '@jad/contracts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbQuery = any;

type Db = {
  from: (table: string) => {
    select: (cols: string) => DbQuery;
  };
};

/** Slugs that never confer shell access. */
export const MEMBER_SLUGS = ['member_basic', 'member_qualified', 'user'];

/** Priority order when a member holds several staff-capable roles. */
const STAFF_PRIORITY = ['super_admin', 'admin', 'finance', 'merchant'];

function canonical(s: unknown): string {
  return String(s ?? '').trim().toLowerCase();
}

/** Pick the effective staff role id from a member's slugs (null = no access). */
export function pickStaffRoleId(slugs: string[]): string | null {
  const lowered = slugs.map(canonical);
  for (const want of STAFF_PRIORITY) {
    if (lowered.includes(want)) return want;
  }
  const custom = slugs.find((s) => {
    const c = canonical(s);
    return c !== '' && !MEMBER_SLUGS.includes(c) && !STAFF_PRIORITY.includes(c);
  });
  return custom ?? null;
}

export type DbRole = { id: string; key: string | null; slug: string; name: string; permissions: unknown; is_system: boolean };

async function roleRows(svc: Db): Promise<DbRole[]> {
  const { data, error } = await svc.from('Role').select('id,key,slug,name,permissions,is_system');
  if (error || !Array.isArray(data)) return [];
  return data as DbRole[];
}

/** All roles as records (key preferred, slug fallback). */
export async function listRoleRecords(svc: Db) {
  const rows = await roleRows(svc);
  return rows.map((r) => ({
    id: typeof r.key === 'string' && r.key ? r.key : r.slug,
    name: r.name,
    permissions: (Array.isArray(r.permissions) ? r.permissions : []).filter(
      (p): p is string => typeof p === 'string' && (staffModuleSchema.options as readonly string[]).includes(p),
    ),
    isSystem: r.is_system === true,
    _uuid: r.id,
  }));
}

/** Staff slugs held by a member (via MemberRole links). */
export async function memberRoleSlugs(svc: Db, memberId: string): Promise<string[]> {
  const { data: links, error } = await svc.from('MemberRole').select('roleId').eq('memberId', memberId);
  if (error || !Array.isArray(links)) return [];
  const ids = (links as { roleId?: string; role_id?: string }[])
    .map((l) => l.roleId ?? l.role_id ?? '')
    .filter(Boolean);
  if (ids.length === 0) return [];
  const { data: matched } = await svc.from('Role').select('id,slug');
  const slugs: string[] = [];
  for (const row of ((matched as { id: string; slug: string }[] | null) ?? [])) {
    if (ids.includes(row.id) && typeof row.slug === 'string') slugs.push(row.slug);
  }
  return slugs;
}

/** Effective staff role id for a member, or null. */
export async function memberStaffRoleId(svc: Db, memberId: string): Promise<string | null> {
  return pickStaffRoleId(await memberRoleSlugs(svc, memberId));
}

export type StaffEntry = {
  id: string;
  name: string;
  email: string;
  roleId: string;
  status: 'ACTIVE' | 'DISABLED';
  createdAt: string;
  createdBy: string;
};

/**
 * All members holding at least one staff role, mapped to the directory
 * shape. `createdBy` is not stored — reported as `System` (documented).
 */
export async function listStaffEntries(svc: Db): Promise<StaffEntry[]> {
  const { data: members, error } = await svc.from('Member').select('*');
  if (error || !Array.isArray(members)) return [];
  const { data: links } = await svc.from('MemberRole').select('memberId,roleId');
  const { data: roles } = await svc.from('Role').select('id,slug');
  const slugById = new Map(
    (((roles as { id: string; slug: string }[] | null) ?? []).map((r) => [r.id, r.slug])),
  );
  const slugsByMember = new Map<string, string[]>();
  for (const l of ((links as { memberId?: string; member_id?: string; roleId?: string; role_id?: string }[] | null) ?? [])) {
    const mid = l.memberId ?? l.member_id ?? '';
    const slug = slugById.get(l.roleId ?? l.role_id ?? '') ?? '';
    if (!mid || !slug) continue;
    const list = slugsByMember.get(mid) ?? [];
    list.push(slug);
    slugsByMember.set(mid, list);
  }
  const entries: StaffEntry[] = [];
  for (const m of (members as Record<string, unknown>[])) {
    const id = String(m.id ?? '');
    const roleId = pickStaffRoleId(slugsByMember.get(id) ?? []);
    if (!roleId) continue;
    entries.push({
      id,
      name: String(m.name ?? ''),
      email: String(m.email ?? ''),
      roleId,
      status: m.accountStatus === 'INACTIVE' ? 'DISABLED' : 'ACTIVE',
      createdAt: typeof m.createdAt === 'string' ? m.createdAt : new Date().toISOString(),
      createdBy: 'System',
    });
  }
  return entries;
}
