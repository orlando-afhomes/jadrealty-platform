import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { MemberStatus, Role } from '@jad/contracts';
import { normalizeRole } from '@jad/contracts';
import { MockSessionProvider, setMockSessionUser, useMockSession } from '@jad/mock';

import { getSupabaseClient, isSupabaseConfigured } from './supabase';

/**
 * App-owned session context — Supabase Auth (JWT + RLS) is the SSOT when
 * VITE_SUPABASE_URL is set (fixes cross-origin localStorage bug 5173 vs 5174
 * via cookie storage in supabase.ts). Mock remains fallback when env missing
 * (tests, offline dev).
 */
export type SessionStatus = 'loading' | 'authenticated' | 'unauthenticated';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  isQualified?: boolean;
  status?: MemberStatus;
}

export interface SessionContextValue {
  status: SessionStatus;
  user: SessionUser | null;
  role: Role | null;
  isQualified: boolean;
  loginAs: (user: SessionUser) => void;
  logout: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within <SessionProvider>');
  return ctx;
}

function UnauthenticatedSessionProvider({ children }: { children: ReactNode }) {
  const value = useMemo<SessionContextValue>(
    () => ({
      status: 'unauthenticated',
      user: null,
      role: null,
      isQualified: false,
      loginAs: () => {},
      logout: () => {},
    }),
    [],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

function MockSessionBridge({ children }: { children: ReactNode }) {
  const mock = useMockSession();
  const value = useMemo<SessionContextValue>(
    () => ({
      status: mock.status,
      user: mock.user,
      role: mock.role,
      isQualified: mock.isQualified,
      loginAs: (user) => mock.loginAs(user),
      logout: mock.logout,
    }),
    [mock],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function SupabaseSessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    // Use 'any' for Supabase client queries to keep DB column names explicit (memberId, roleId, slug).
    const client = getSupabaseClient() as unknown as {
      auth: {
        getSession: () => Promise<{
          data: { session: { user: { id: string; email: string; user_metadata: Record<string, unknown> } } | null };
        }>;
        onAuthStateChange: (
          cb: (e: string, s: { user: { id: string; email: string; user_metadata: Record<string, unknown> } | null }) => void,
        ) => { data: { subscription: { unsubscribe: () => void } } };
        signOut: () => Promise<void>;
      };
      from: (t: string) => { select: (...args: unknown[]) => unknown; single?: unknown };
    } | null;
    if (!client) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- initialize session status when Supabase is not configured
      setStatus('unauthenticated');
      setMockSessionUser(null);
      return;
    }

    // Authoritative role resolution: member_roles → roles → normalizeRole (no metadata fallback for privilege).
    // Phase 1: admin / user only; maps legacy SUPER_ADMIN → admin for compat.
    const resolveRole = async (c: unknown, memberId: string): Promise<Role | null> => {
      try {
        const supa = c as {
          from: (t: string) => {
            select: (c: string) => {
              eq: (k: string, v: string) => Promise<{ data: unknown[] | null; error: unknown }>;
              in: (k: string, v: string[]) => Promise<{ data: unknown[] | null; error: unknown }>;
            };
          };
        };
        const tryResolve = async (tableRoles: string, tableLinks: string) => {
          const { data: links, error: linkErr } = await supa.from(tableLinks).select('roleId').eq('memberId', memberId);
          if (linkErr || !Array.isArray(links) || links.length === 0) return null as Role | null;
          const ids = (links as { roleId: string }[]).map((l) => l.roleId);
          const { data: roles, error: roleErr } = await supa.from(tableRoles).select('slug,name').in('id', ids);
          if (!roleErr && Array.isArray(roles) && roles.length > 0) {
            const slugs = (roles as { slug: string }[]).map((r) => r.slug);
            if (slugs.some((s) => normalizeRole(s) === 'admin')) return 'admin' as Role;
            return 'user' as Role;
          }
          const collected: string[] = [];
          for (const rid of ids) {
            const { data: one } = await supa.from(tableRoles).select('slug,name').eq('id', rid);
            if (Array.isArray(one)) for (const row of one as { slug: string }[]) collected.push(row.slug);
          }
          if (collected.some((s) => normalizeRole(s) === 'admin')) return 'admin' as Role;
          if (collected.length > 0) return 'user' as Role;
          return null;
        };
        // Try new quoted "MemberRole"/"Role" first (Phase 1), then legacy lowercase
        const r1 = await tryResolve('Role', 'MemberRole');
        if (r1) return r1;
        const r2 = await tryResolve('roles', 'member_roles');
        if (r2) return r2;
        // Also try lowercase variants for Supabase case handling
        const r3 = await tryResolve('role', 'memberrole');
        if (r3) return r3;
        return null;
      } catch {
        return null;
      }
    };

    const buildSessionUser = async (supaUser: { id: string; email: string; user_metadata: Record<string, unknown> }): Promise<SessionUser> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supaAny = client as any;
      let member: { firstName: string; lastName: string; isQualified: boolean; status: string } | null = null;
      try {
        let res: { data: Record<string, unknown> | null; error: unknown } | null = null;
        try {
          const r = (await supaAny.from('Member').select('*').eq('id', supaUser.id).single()) as {
            data: Record<string, unknown> | null;
            error: unknown;
          };
          if (!r.error && r.data) res = r as { data: Record<string, unknown> | null; error: unknown };
          else throw r.error;
        } catch {
          const r2 = (await supaAny.from('members').select('*').eq('id', supaUser.id).single()) as {
            data: Record<string, unknown> | null;
            error: unknown;
          };
          res = r2;
        }
        if (res?.data) {
          const d = res.data as Record<string, unknown>;
          const name = (d['name'] as string) ?? '';
          const firstName = (d['firstName'] as string) ?? name.split(' ')[0] ?? '';
          const lastName = (d['lastName'] as string) ?? name.split(' ').slice(1).join(' ') ?? '';
          const isQualified = (d['isQualified'] as boolean) ?? (d['is_qualified'] as boolean) ?? false;
          const status = (d['status'] as string) ?? 'PENDING';
          member = { firstName, lastName, isQualified, status };
        }
      } catch {
        member = null;
      }
      let role = await resolveRole(client, supaUser.id);
      // Fallback to user_metadata only if DB has no entry (null) — covers fresh DB with no tables yet
      if (role === null) {
        const meta = supaUser.user_metadata['role'];
        if (typeof meta === 'string' && normalizeRole(meta) === 'admin') role = 'admin';
        else role = 'user';
      }
      return {
        id: supaUser.id,
        name: member?.firstName && member?.lastName ? `${member.firstName} ${member.lastName}` : ((supaUser.user_metadata['full_name'] as string) ?? supaUser.email ?? ''),
        email: supaUser.email ?? '',
        role,
        isQualified: (member?.isQualified as boolean) ?? false,
        status: (member?.status as MemberStatus) ?? 'PENDING',
      };
    };

    client.auth.getSession().then(async ({ data }) => {
      const supaUser = data.session?.user;
      if (!supaUser) {
        setStatus('unauthenticated');
        setMockSessionUser(null);
        return;
      }
      const next = await buildSessionUser(supaUser);
      setUser(next);
      setStatus('authenticated');
      setMockSessionUser(next as unknown as import('@jad/mock').MockUser);
    });
    const { data: sub } = client.auth.onAuthStateChange(async (_event, session) => {
      const supaUser = (session as { user: { id: string; email: string; user_metadata: Record<string, unknown> } | null } | null)?.user ?? null;
      if (!supaUser) {
        setUser(null);
        setStatus('unauthenticated');
        setMockSessionUser(null);
        return;
      }
      const next = await buildSessionUser(supaUser);
      setUser(next);
      setStatus('authenticated');
      setMockSessionUser(next as unknown as import('@jad/mock').MockUser);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const loginAs = (next: SessionUser) => {
    setUser(next);
    setStatus('authenticated');
    setMockSessionUser(next as unknown as import('@jad/mock').MockUser);
  };
  const logout = async () => {
    const client = getSupabaseClient() as { auth: { signOut: () => Promise<void> } } | null;
    if (client) await client.auth.signOut();
    setUser(null);
    setStatus('unauthenticated');
    setMockSessionUser(null);
  };

  const value = useMemo<SessionContextValue>(
    () => ({
      status,
      user,
      role: user?.role ?? null,
      isQualified: user?.isQualified ?? false,
      loginAs,
      logout,
    }),
    [status, user],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export interface SessionProviderProps {
  initialUser?: SessionUser | null;
  restoreDelayMs?: number;
  children: ReactNode;
}

function TestSessionProvider({
  initialUser,
  children,
}: {
  initialUser?: SessionUser | null;
  children: ReactNode;
}) {
  const value = useMemo<SessionContextValue>(() => {
    if (initialUser) {
      return {
        status: 'authenticated' as const,
        user: initialUser,
        role: initialUser.role,
        isQualified: initialUser.isQualified ?? false,
        loginAs: () => {},
        logout: () => {},
      };
    }
    return {
      status: 'unauthenticated' as const,
      user: null,
      role: null,
      isQualified: false,
      loginAs: () => {},
      logout: () => {},
    };
  }, [initialUser]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function SessionProvider({ initialUser, restoreDelayMs, children }: SessionProviderProps) {
  if (initialUser !== undefined) {
    return <TestSessionProvider initialUser={initialUser}>{children}</TestSessionProvider>;
  }
  // Vitest: keep mock path to avoid real Supabase network in tests (LoginPage also
  // guards with MODE==='test'). Supabase remains SSOT in DEV/PROD when configured.
  if ((import.meta.env as Record<string, string | undefined>).MODE === 'test') {
    return (
      <MockSessionProvider initialUser={initialUser} restoreDelayMs={restoreDelayMs}>
        <MockSessionBridge>{children}</MockSessionBridge>
      </MockSessionProvider>
    );
  }
  // Supabase SSOT when configured — fixes cross-origin localStorage bug (5173 vs 5174)
  // via cookie storage in supabase.ts (docs/database/DATABASE-DESIGN.md §4.7).
  // Mock remains fallback for offline dev when VITE_SUPABASE_URL missing.
  if (isSupabaseConfigured()) {
    return <SupabaseSessionProvider>{children}</SupabaseSessionProvider>;
  }
  if (import.meta.env.DEV) {
    return (
      <MockSessionProvider initialUser={initialUser} restoreDelayMs={restoreDelayMs}>
        <MockSessionBridge>{children}</MockSessionBridge>
      </MockSessionProvider>
    );
  }
  return <UnauthenticatedSessionProvider>{children}</UnauthenticatedSessionProvider>;
}
