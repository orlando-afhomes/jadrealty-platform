import { createClient } from '@supabase/supabase-js';

import { getSupabaseEnv } from './env.js';
import { toErrorEnvelope } from './envelope.js';
import type { VercelRequest } from './http.js';

export type StaffAuthError = { error: ReturnType<typeof toErrorEnvelope> };
export type StaffAuthSuccess = { userId: string; slugs: string[] };

/** Normalize a role slug for comparison (case/separator-insensitive). */
export function canonicalSlug(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[-_\s]/g, '_');
}

/** True when any slug matches the allow-list (compact `superadmin` also matches `super_admin`). */
export function slugsAllowed(slugs: string[], allowed: string[]): boolean {
  const forms = new Set<string>();
  for (const a of allowed.map(canonicalSlug)) {
    forms.add(a);
    forms.add(a.replace(/_/g, ''));
  }
  return slugs.some((s) => {
    const c = canonicalSlug(s);
    return forms.has(c) || forms.has(c.replace(/_/g, ''));
  });
}

/**
 * True when a Supabase Auth admin error is a duplicate-identity conflict.
 * GoTrue's message is "A user with this email address has already been
 * registered" (NOT "already exists" — a substring guard on the latter misses
 * every real conflict and leaks the raw message as INTERNAL 500). Matches
 * status, code, and message broadly so wording drift can't reopen the hole.
 */
export function isAuthConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const rec = error as Record<string, unknown>;
  const code = String((rec as { code?: unknown }).code ?? '').toLowerCase();
  if (['email_exists', 'phone_exists', 'user_already_exists'].includes(code)) return true;
  const message = String((rec as { message?: unknown }).message ?? '');
  return /already been registered|already exists|duplicate|email_exists|phone_exists/i.test(
    message,
  );
}

type AdminListUsers = {
  auth: {
    admin: {
      listUsers: (params?: { page?: number; perPage?: number }) => Promise<{
        data: { users: { id: string; email?: string; phone?: string }[] };
        error: unknown;
      }>;
    };
  };
};

/**
 * Find an existing auth user by email or phone (orphan adoption after an
 * `isAuthConflict`). Paginates wide (perPage 1000) — the default 50-user
 * page can miss the account and falsely report it unresolvable.
 */
export async function findAuthUserId(
  svc: AdminListUsers,
  identity: { email?: string; phone?: string },
): Promise<string | null> {
  try {
    const { data, error } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error || !data) return null;
    const hit = data.users.find((u) =>
      identity.email ? u.email === identity.email : u.phone === identity.phone,
    );
    return hit?.id ?? null;
  } catch {
    return null;
  }
}

function headerValue(headers: VercelRequest['headers'], name: string): string | undefined {
  const raw = headers[name.toLowerCase()] ?? headers[name];
  if (Array.isArray(raw)) return raw[0];
  if (typeof raw === 'string') return raw;
  return undefined;
}

/** Bearer token from `Authorization` header, else the Supabase auth cookie. */
export function extractBearerToken(req: VercelRequest): string | undefined {
  const authHeader = headerValue(req.headers, 'authorization') ?? '';
  if (authHeader.startsWith('Bearer ')) return authHeader.slice(7);
  const cookie = headerValue(req.headers, 'cookie') ?? '';
  const match = cookie.match(/sb-[^-]+-auth-token=([^;]+)/);
  if (!match) return undefined;
  try {
    const decoded = decodeURIComponent(match[1]);
    const parsed: unknown = JSON.parse(decoded);
    if (parsed && typeof parsed === 'object') {
      const rec = parsed as Record<string, unknown>;
      if (typeof rec.access_token === 'string') return rec.access_token;
      const first = Array.isArray(parsed)
        ? (parsed[0] as Record<string, unknown> | undefined)
        : undefined;
      if (first && typeof first.access_token === 'string') return first.access_token;
    }
    return decoded;
  } catch {
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return undefined;
    }
  }
}

type SupaClient = {
  auth: { getUser: (token: string) => Promise<{ data: { user: unknown }; error: unknown }> };
};

export type VerifyStaffDeps = {
  anonClient?: SupaClient;
  serviceClient?: { from: (table: string) => unknown };
};

/**
 * Authenticated-member gate for `/me/*` endpoints: validates the caller JWT
 * and returns the auth user id (which equals `Member.id` per the auth
 * foundation). No role check — RLS scopes rows to self + broadcasts.
 */
export async function verifyUser(
  req: VercelRequest,
  anonClient?: SupaClient,
): Promise<{ userId: string } | StaffAuthError> {
  const { url, anonKey } = getSupabaseEnv();
  if (!url || !anonKey) {
    return { error: toErrorEnvelope('INTERNAL', 'Supabase not configured', 500) };
  }
  const token = extractBearerToken(req);
  if (!token) {
    return { error: toErrorEnvelope('UNAUTHORIZED', 'Missing authentication', 401) };
  }
  const anon = anonClient ?? createClient(url, anonKey, { auth: { autoRefreshToken: false } });
  const { data, error } = await anon.auth.getUser(token);
  const authedUser = data?.user as { id?: string } | null;
  if (error || !authedUser?.id) {
    return { error: toErrorEnvelope('UNAUTHORIZED', 'Invalid session', 401) };
  }
  return { userId: authedUser.id };
}

const LINK_TABLES = ['MemberRole', 'member_roles', 'memberrole'] as const;
const ROLE_TABLES = ['Role', 'roles', 'role'] as const;

async function queryRoleSlugs(
  svc: { from: (table: string) => unknown },
  userId: string,
): Promise<string[]> {
  const from = svc.from.bind(svc) as (table: string) => {
    select: (cols: string) => {
      eq: (k: string, v: string) => Promise<{ data: unknown[] | null; error: unknown }>;
      in: (k: string, v: string[]) => Promise<{ data: unknown[] | null; error: unknown }>;
    };
  };
  for (const linkTable of LINK_TABLES) {
    let roleIds: string[] = [];
    try {
      const { data: rows, error } = await from(linkTable).select('roleId').eq('memberId', userId);
      if (!error && Array.isArray(rows)) {
        roleIds = (rows as Record<string, string>[])
          .map((r) => r.roleId ?? r.role_id ?? '')
          .filter(Boolean);
      }
    } catch {
      continue;
    }
    if (roleIds.length === 0) continue;
    for (const roleTable of ROLE_TABLES) {
      try {
        const { data: roles, error } = await from(roleTable).select('slug').in('id', roleIds);
        if (!error && Array.isArray(roles) && roles.length > 0) {
          return (roles as { slug: string }[]).map((r) => r.slug);
        }
      } catch {
        continue;
      }
    }
    // Links exist but slugs unreadable — fall through to next link table.
  }
  return [];
}

/**
 * Staff gate for admin Functions: validates the caller JWT, resolves
 * MemberRole → Role slugs via service_role, and requires a slug match
 * against `allowed` (e.g. `['super_admin', 'admin']`).
 *
 * Legacy compat, preserved from the CMS handlers: when the DB yields no
 * links at all, an explicit `user_metadata.role = admin` still passes.
 * Returns the resolved slugs so callers can audit with the actor role.
 */
export async function verifyStaff(
  req: VercelRequest,
  allowed: string[],
  deps?: VerifyStaffDeps,
): Promise<StaffAuthSuccess | StaffAuthError> {
  const { url, anonKey, serviceKey } = getSupabaseEnv();
  if (!url || !anonKey) {
    return { error: toErrorEnvelope('INTERNAL', 'Supabase not configured', 500) };
  }
  const token = extractBearerToken(req);
  if (!token) {
    return { error: toErrorEnvelope('UNAUTHORIZED', 'Missing authentication', 401) };
  }
  const anon =
    deps?.anonClient ?? createClient(url, anonKey, { auth: { autoRefreshToken: false } });
  const { data, error } = await anon.auth.getUser(token);
  const authedUser = data?.user as { id?: string; user_metadata?: Record<string, unknown> } | null;
  if (error || !authedUser?.id) {
    return { error: toErrorEnvelope('UNAUTHORIZED', 'Invalid session', 401) };
  }
  if (!serviceKey) {
    return { error: toErrorEnvelope('INTERNAL', 'Service role not configured', 500) };
  }
  const svc =
    deps?.serviceClient ?? createClient(url, serviceKey, { auth: { autoRefreshToken: false } });
  const slugs = await queryRoleSlugs(svc, authedUser.id);
  if (slugs.length > 0) {
    if (slugsAllowed(slugs, allowed)) return { userId: authedUser.id, slugs };
    return { error: toErrorEnvelope('FORBIDDEN', 'Insufficient role', 403) };
  }
  const metaRole = authedUser.user_metadata?.role;
  if (typeof metaRole === 'string' && slugsAllowed([metaRole], allowed)) {
    return { userId: authedUser.id, slugs: [metaRole] };
  }
  return { error: toErrorEnvelope('FORBIDDEN', 'Admin access required', 403) };
}
