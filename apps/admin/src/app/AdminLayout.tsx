import { useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation } from 'react-router';

import { useSession } from '../lib/session';
import { AppShell, Breadcrumbs, ConfirmDialog, UserMenu } from '@jad/ui';

import { findNavItem, findNavSubItem, navItemsForRole, ROLE_LABELS } from './navigation';
import { roleNameFor } from '@jad/contracts';
import { useRegistrations } from '../features/registrations/hooks/useRegistrations';
import { useRoles } from '../features/roles/hooks/useRoles';
import styles from './AdminLayout.module.css';

/**
 * Admin app shell: persistent sidebar on desktop, drawer on tablet/mobile
 * (UI-UX §4), topbar with the signed-in staff identity, breadcrumbs, and the
 * routed page content. Navigation is filtered by the session role and
 * role id (resolved against role records, matrix seed as fallback).
 */
export function AdminLayout() {
  const { user, role, roleId, logout, status } = useSession();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const location = useLocation();
  const { data: roles } = useRoles();
  const baseItems = navItemsForRole(role, roleId, roles);
  const { data: registrations } = useRegistrations();
  const pendingCount = (registrations ?? []).filter((r) => r.status === 'PENDING').length;
  const items = baseItems.map((item) =>
    item.to === '/admin/members' ? { ...item, badge: pendingCount > 0 ? pendingCount : undefined } : item,
  );
  const current = findNavItem(location.pathname);

  const crumbs = useMemo(() => {
    if (!current || current.to === '/admin') return [{ label: 'Dashboard' }];
    const subMatch = findNavSubItem(location.pathname);
    if (subMatch) {
      // Detail route: parent category > sub-page with link back to list
      if (location.pathname !== subMatch.sub.to) {
        return [
          { label: 'Dashboard', to: '/admin' },
          { label: current.label },
          { label: subMatch.sub.label, to: subMatch.sub.to },
        ];
      }
      // List route inside a category: show parent + sub
      if (subMatch.sub.label !== current.label) {
        return [
          { label: 'Dashboard', to: '/admin' },
          { label: current.label },
          { label: subMatch.sub.label },
        ];
      }
    }
    return [{ label: 'Dashboard', to: '/admin' }, { label: current.label }];
  }, [current, location.pathname]);

  // Fail loud (not silent): a staff session with zero navigation modules
  // means role resolution failed (missing MemberRole link or role lookup
  // error). Links stay hidden (deny by default); the notice tells the user
  // what happened instead of rendering a mysteriously empty sidebar.
  const roleUnresolved =
    status === 'authenticated' && role === 'admin' && items.length === 0;

  useEffect(() => {
    if (roleUnresolved) {
      console.warn(
        '[AdminLayout] staff role unresolved — sidebar hidden (roleId=%s, roleRecords=%s)',
        String(roleId ?? null),
        roles === undefined ? 'loading' : String(roles.length),
      );
    }
  }, [roleUnresolved, roleId, roles]);

  return (
    <>
      <AppShell
        brand={
          <div className={styles.brandBlock}>
            <img src="/ja-d-logo.png" alt="JA&D" width={120} height={75} />
            <div className={styles.brandTextBlock}>
              <span className={styles.brandName}>JA&D Realty</span>
              <span className={styles.brandText}>Admin Panel</span>
            </div>
          </div>
        }
        navItems={items}
        navLabel="Admin navigation"
        topbarActions={
          <UserMenu
            name={user?.name}
            role={roleId ? roleNameFor(roles, roleId) : role ? ROLE_LABELS[role] : undefined}
            items={[
              { label: 'My Account', icon: 'user', to: '/admin/profile' },
              { label: '-', icon: '', onClick: undefined },
              { label: 'Logout', icon: 'logout', danger: true, onClick: () => setShowLogoutConfirm(true) },
            ]}
          />
        }
        topbarLeading={
          <div className={styles.topbarBrand}>
            <img src="/ja-d-logo.png" alt="" width={120} height={75} />
          </div>
        }
        menuLabel="Open navigation"
        menuPosition="right"
      >
        <div className={styles.content}>
          {roleUnresolved && (
            <div className={styles.roleNotice} role="alert">
              <p className={styles.roleNoticeTitle}>Navigation unavailable</p>
              <p className={styles.roleNoticeText}>
                Your staff role could not be resolved, so navigation links are hidden.
                Try reloading — if this persists, an administrator needs to check
                your role assignment.
              </p>
              <button
                type="button"
                className={styles.roleNoticeAction}
                onClick={() => window.location.reload()}
              >
                Reload
              </button>
            </div>
          )}
          <Breadcrumbs items={crumbs} />
          <Outlet />
        </div>
      </AppShell>
      <ConfirmDialog
        open={showLogoutConfirm}
        onCancel={() => setShowLogoutConfirm(false)}
        onConfirm={() => {
          setShowLogoutConfirm(false);
          logout();
          const rawWebUrl =
            (import.meta.env as Record<string, string | undefined>).VITE_WEB_URL ??
            'http://localhost:5173';
          const base = rawWebUrl.replace(/\/$/, '');
          window.location.href = base.endsWith('/login') ? base : `${base}/login`;
        }}
        title="Sign out?"
        message="Are you sure you want to sign out? You will need to sign in again to access your account."
        confirmLabel="Sign out"
        cancelLabel="Cancel"
      />
    </>
  );
}
