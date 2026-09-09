import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { MemberStatus, Role } from '@jad/contracts';
import { normalizeRole } from '@jad/contracts';
import { MockSessionProvider, setMockSessionUser, useMockSession } from '@jad/mock';

import { staffSessionSchema } from '@jad/contracts';

import { env } from './env';
import { getSupabaseClient, isSupabaseConfigured } from './supabase';

export type SessionStatus = 'loading' | 'authenticated' | 'unauthenticated';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  /**
   * Admin-shell role id (exactly one role per staff user; system id or
   * custom role id). Present for mock staff principals; the real backend
   * resolves it server-side later, so it stays optional here. `RequireRole`
   * enforces module checks only when set.
   */
  roleId?: string | null;
  isQualified?: boolean;
  status?: MemberStatus;
}

export interface SessionContextValue {
  status: SessionStatus;
  user: SessionUser | null;
  role: Role | null;
  roleId: string | null | undefined;
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
      roleId: undefined,
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
      roleId: mock.roleId ?? null,
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
    const client = getSupabaseClient() as unknown as {
      auth: {
        getSession: () => Promise<{
          data: {
            session: {
              access_token?: string;
              user: { id: string; email: string; user_metadata: Record<string, unknown> };
            } | null;
          };
        }>;
        onAuthStateChange: (
          cb: (e: string, s: { user: { id: string; email: string; user_metadata: Record<string, unknown> } | null }) => void,
        ) => { data: { subscription: { unsubscribe: () => void } } };
        signOut: () => Promise<void>;
      };
      from: (t: string) => { select: (...args: unknown[]) => unknown };
    } | null;
    if (!client) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus('unauthenticated');
      setMockSessionUser(null);
      return;
    }

    /**
     * Own staff session via the service-role endpoint (Phase 6 — the admin
     * client never reads Role tables with the anon key). Returns the role
     * slugs, or an empty array when the caller holds no staff identity.
     * Explicit Bearer (not cookies) so it works in every storage mode.
     */
    const resolveRoleSlugs = async (accessToken: string | undefined): Promise<string[]> => {
      if (!accessToken) return [];
      try {
        const res = await fetch(`${env.VITE_API_BASE_URL}/admin/session`, {
          headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
          credentials: 'same-origin',
        });
        if (!res.ok) return [];
        const parsed = staffSessionSchema.safeParse(await res.json().catch(() => null));
        return parsed.success ? [...parsed.data.slugs] : [];
      } catch {
        return [];
      }
    };

    /**
     * Direct slug → shell role id. Priority: super_admin, admin, finance,
     * merchant, then the first custom (non-member) slug. A stale `admin` row
     * left beside `super_admin` stays harmless. Member/user slugs resolve to
     * null (no staff access).
     */
    const slugToRoleId = (slugs: string[]): string | null => {
      const normalized = slugs.map((s) => String(s ?? '').trim().toLowerCase().replace(/[-_\s]/g, '_'));
      const compact = normalized.map((s) => s.replace(/_/g, ''));
      if (normalized.includes('super_admin') || compact.includes('superadmin')) return 'super_admin';
      if (normalized.includes('admin')) return 'admin';
      if (normalized.includes('finance')) return 'finance';
      if (normalized.includes('merchant')) return 'merchant';
      const custom = slugs.find((s) => {
        const c = String(s ?? '').trim().toLowerCase();
        return (
          c !== '' &&
          !['member_basic', 'member_qualified', 'member', 'user'].includes(c.replace(/[-_\s]/g, '_'))
        );
      });
      return custom ?? null;
    };

    const buildSessionUser = async (
      supaUser: { id: string; email: string; user_metadata: Record<string, unknown> },
      accessToken?: string,
    ): Promise<SessionUser> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supaAny = client as any;
      let member: { firstName: string; lastName: string; isQualified: boolean; status: string } | null = null;
      try {
        // Prefer quoted "Member" (auth foundation) with correct columns: id, email, name, status, "isQualified"
        // Fallback to legacy "members" for compat
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
          // Handle both new "name" and legacy "firstName"/"lastName"
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
      const slugs = await resolveRoleSlugs(accessToken);
      let role: Role | null =
        slugs.length === 0
          ? null
          : slugs.some((s) => normalizeRole(s) === 'admin')
            ? 'admin'
            : 'user';
      if (role === null) {
        // No staff assignment: member-tier session. user_metadata is
        // client-writable and must never confer privilege.
        role = 'user';
      }
      return {
        id: supaUser.id,
        name: member?.firstName && member?.lastName ? `${member.firstName} ${member.lastName}` : ((supaUser.user_metadata['full_name'] as string) ?? supaUser.email ?? ''),
        email: supaUser.email ?? '',
        role,
        roleId: slugToRoleId(slugs),
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
      const next = await buildSessionUser(supaUser, data.session?.access_token);
      setUser(next);
      setStatus('authenticated');
      setMockSessionUser(next as unknown as import('@jad/mock').MockUser);
    });
    const { data: sub } = client.auth.onAuthStateChange(async (_event, session) => {
      const typed = session as {
        access_token?: string;
        user: { id: string; email: string; user_metadata: Record<string, unknown> } | null;
      } | null;
      const supaUser = typed?.user ?? null;
      if (!supaUser) {
        setUser(null);
        setStatus('unauthenticated');
        setMockSessionUser(null);
        return;
      }
      const next = await buildSessionUser(supaUser, typed?.access_token);
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
      // roleId comes from MemberRole slugs (null = no staff access, in
      // which case module checks fall back to the legacy session-role gate).
      roleId: user?.roleId ?? null,
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
        // Preserve null (resolved: no staff access) distinctly from undefined
        // (unresolved) — navItemsForRole treats them differently.
        roleId: initialUser.roleId,
        isQualified: initialUser.isQualified ?? false,
        loginAs: () => {},
        logout: () => {},
      };
    }
    return {
      status: 'unauthenticated' as const,
      user: null,
      role: null,
      roleId: undefined,
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
  // Vitest: keep mock path to avoid real Supabase network in tests.
  if ((import.meta.env as Record<string, string | undefined>).MODE === 'test') {
    return (
      <MockSessionProvider initialUser={initialUser} restoreDelayMs={restoreDelayMs}>
        <MockSessionBridge>{children}</MockSessionBridge>
      </MockSessionProvider>
    );
  }
  // Supabase SSOT when configured — fixes cross-origin 5173 vs 5174 via cookie storage
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
