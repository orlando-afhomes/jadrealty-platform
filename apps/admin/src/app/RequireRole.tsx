import { useEffect, type ReactNode } from 'react';
import { useLocation } from 'react-router';

import { useSession } from '../lib/session';
import { Forbidden, Skeleton } from '@jad/ui';

import {
  canAccess,
  canAccessModule,
  canAccessSubModule,
  findNavItem,
  findNavSubItem,
} from './navigation';
import { useRoles } from '../features/roles/hooks/useRoles';
import styles from './RequireRole.module.css';

export function getValidatedWebLoginUrl(): string {
  const raw =
    (import.meta.env as Record<string, string | undefined>).VITE_WEB_URL ?? 'http://localhost:5173';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('invalid protocol');
    const base = url.toString().replace(/\/$/, '');
    return base.endsWith('/login') ? base : `${base}/login`;
  } catch {
    return 'http://localhost:5173/login';
  }
}

function RedirectToWebLogin() {
  useEffect(() => {
    window.location.href = getValidatedWebLoginUrl();
  }, []);
  return (
    <div className={styles.loading} role="status" aria-live="polite" aria-busy="true">
      <Skeleton />
      <Skeleton />
      <Skeleton />
    </div>
  );
}

function LoadingState() {
  return (
    <div className={styles.loading} role="status">
      <Skeleton />
      <Skeleton />
      <Skeleton />
    </div>
  );
}

/**
 * Route guard. Authenticated staff with an entry in the nav registry render the
 * page; authenticated staff without access see Forbidden; unauthenticated
 * visitors also see Forbidden (the real backend enforces authorization —
 * FRONTEND-ARCHITECTURE; visibility is never authorization). Unknown paths pass
 * through so the NotFound route handles them.
 */
export function RequireRole({ children }: { children: ReactNode }) {
  const { status, role, roleId } = useSession();
  const { data: roles, isPending: rolesPending } = useRoles();
  const location = useLocation();

  if (status === 'loading') return <LoadingState />;
  if (status !== 'authenticated') {
    return <RedirectToWebLogin />;
  }
  // Sessions carrying a role id enforce per-module access resolved against
  // role records (matrix seed as fallback). A matched sub-item (dropdown
  // link) is authoritative for its destination; the item module check
  // additionally covers flat pages (dashboard, properties) and category
  // headers with no matching child. Sessions without a role id (real backend
  // until it resolves roles server-side) keep the legacy top-level gate.
  if (roleId !== undefined && roleId !== null && rolesPending) return <LoadingState />;
  const enforcedId = roleId ?? null;
  const sub = roleId ? findNavSubItem(location.pathname) : undefined;
  if (sub !== undefined && !canAccessSubModule(enforcedId, roles, sub.sub)) {
    return <Forbidden />;
  }
  const item = findNavItem(location.pathname);
  if (item !== undefined) {
    if (!canAccess(role, item)) {
      return <Forbidden />;
    }
    if (roleId && sub === undefined && !canAccessModule(enforcedId, roles, item)) {
      return <Forbidden />;
    }
  }
  return <>{children}</>;
}
