import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { MOCK_FINANCE, MOCK_MEMBER, MOCK_STAFF_ADMIN, MOCK_STAFF_MERCHANT, MOCK_SUPER_ADMIN } from '@jad/mock';

import type { SessionUser } from '../lib/session';
import { SessionProvider } from '../lib/session';
import { RequireRole } from './RequireRole';

vi.mock('../features/roles/hooks/useRoles', async () => {
  const { systemRoleRecords } = await import('@jad/contracts');
  return {
    useRoles: () => ({
      data: systemRoleRecords(),
      isPending: false,
      isError: false,
      error: null,
    }),
  };
});

function renderAt(path: string, user: SessionUser | null | undefined) {
  return render(
    <SessionProvider initialUser={user} restoreDelayMs={0}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/admin/registrations"
            element={
              <RequireRole>
                <div>registrations page</div>
              </RequireRole>
            }
          />
          <Route path="/login" element={<div>login page</div>} />
        </Routes>
      </MemoryRouter>
    </SessionProvider>,
  );
}

describe('RequireRole', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the page when the role may access the section', async () => {
    renderAt('/admin/registrations', MOCK_SUPER_ADMIN);
    expect(await screen.findByText('registrations page')).toBeInTheDocument();
  });

  it('renders Forbidden when the role cannot access the section', async () => {
    renderAt('/admin/registrations', MOCK_MEMBER);
    expect(await screen.findByText('Access denied')).toBeInTheDocument();
    expect(screen.queryByText('registrations page')).not.toBeInTheDocument();
  });

  it('enforces module access for staff roles (finance sees withdrawals, not config)', async () => {
    render(
      <SessionProvider initialUser={MOCK_FINANCE} restoreDelayMs={0}>
        <MemoryRouter initialEntries={['/admin/withdrawals']}>
          <Routes>
            <Route
              path="/admin/withdrawals"
              element={
                <RequireRole>
                  <div>withdrawals page</div>
                </RequireRole>
              }
            />
            <Route
              path="/admin/config"
              element={
                <RequireRole>
                  <div>config page</div>
                </RequireRole>
              }
            />
          </Routes>
        </MemoryRouter>
      </SessionProvider>,
    );
    expect(await screen.findByText('withdrawals page')).toBeInTheDocument();
  });

  it('denies finance the config module', async () => {
    render(
      <SessionProvider initialUser={MOCK_FINANCE} restoreDelayMs={0}>
        <MemoryRouter initialEntries={['/admin/config']}>
          <Routes>
            <Route
              path="/admin/config"
              element={
                <RequireRole>
                  <div>config page</div>
                </RequireRole>
              }
            />
          </Routes>
        </MemoryRouter>
      </SessionProvider>,
    );
    expect(await screen.findByText('Access denied')).toBeInTheDocument();
    expect(screen.queryByText('config page')).not.toBeInTheDocument();
  });

  it('denies admin the audit module but allows sales', async () => {
    const { unmount } = render(
      <SessionProvider initialUser={MOCK_STAFF_ADMIN} restoreDelayMs={0}>
        <MemoryRouter initialEntries={['/admin/audit']}>
          <Routes>
            <Route
              path="/admin/audit"
              element={
                <RequireRole>
                  <div>audit page</div>
                </RequireRole>
              }
            />
          </Routes>
        </MemoryRouter>
      </SessionProvider>,
    );
    expect(await screen.findByText('Access denied')).toBeInTheDocument();
    unmount();
    render(
      <SessionProvider initialUser={MOCK_STAFF_ADMIN} restoreDelayMs={0}>
        <MemoryRouter initialEntries={['/admin/sales']}>
          <Routes>
            <Route
              path="/admin/sales"
              element={
                <RequireRole>
                  <div>sales page</div>
                </RequireRole>
              }
            />
          </Routes>
        </MemoryRouter>
      </SessionProvider>,
    );
    expect(await screen.findByText('sales page')).toBeInTheDocument();
  });

  it('limits merchant to vouchers (denies sales and dashboard)', async () => {
    const { unmount } = render(
      <SessionProvider initialUser={MOCK_STAFF_MERCHANT} restoreDelayMs={0}>
        <MemoryRouter initialEntries={['/admin/vouchers']}>
          <Routes>
            <Route
              path="/admin/vouchers"
              element={
                <RequireRole>
                  <div>vouchers page</div>
                </RequireRole>
              }
            />
          </Routes>
        </MemoryRouter>
      </SessionProvider>,
    );
    expect(await screen.findByText('vouchers page')).toBeInTheDocument();
    unmount();
    render(
      <SessionProvider initialUser={MOCK_STAFF_MERCHANT} restoreDelayMs={0}>
        <MemoryRouter initialEntries={['/admin/sales']}>
          <Routes>
            <Route
              path="/admin/sales"
              element={
                <RequireRole>
                  <div>sales page</div>
                </RequireRole>
              }
            />
          </Routes>
        </MemoryRouter>
      </SessionProvider>,
    );
    expect(await screen.findByText('Access denied')).toBeInTheDocument();
  });

  it('keeps the legacy gate for sessions without a staff role', async () => {
    const legacyAdmin: SessionUser = { ...MOCK_STAFF_ADMIN, roleId: undefined };
    render(
      <SessionProvider initialUser={legacyAdmin} restoreDelayMs={0}>
        <MemoryRouter initialEntries={['/admin/config']}>
          <Routes>
            <Route
              path="/admin/config"
              element={
                <RequireRole>
                  <div>config page</div>
                </RequireRole>
              }
            />
          </Routes>
        </MemoryRouter>
      </SessionProvider>,
    );
    expect(await screen.findByText('config page')).toBeInTheDocument();
  });

  it('redirects unauthenticated visitors to VITE_WEB_URL/login (not Forbidden, not 404)', async () => {
    const { getValidatedWebLoginUrl } = await import('./RequireRole');
    // validated VITE_WEB_URL/login (default http://localhost:5173/login) — uses VITE_WEB_URL, not hardcoded
    const target = getValidatedWebLoginUrl();
    expect(target).toMatch(/\/login$/);
    expect(target).toContain('5173');
    expect(target.startsWith('http://') || target.startsWith('https://')).toBe(true);

    renderAt('/admin/registrations', null);

    // RedirectToWebLogin renders null (hard redirect via window.location.href), not Forbidden nor page
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText('Access denied')).not.toBeInTheDocument();
    expect(screen.queryByText('registrations page')).not.toBeInTheDocument();
    // should NOT have rendered the admin-local /login page (which would be 404 in real admin router)
    expect(screen.queryByText('login page')).not.toBeInTheDocument();
  });
});
