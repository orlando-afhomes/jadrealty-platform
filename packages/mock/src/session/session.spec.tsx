import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import {
  MockSessionProvider,
  MOCK_MEMBER,
  MOCK_MEMBER_NOT_QUALIFIED,
  MOCK_SUPER_ADMIN,
  useMockSession,
} from '../index';

function SessionProbe() {
  const { status, user, role, isQualified, loginAs, logout } = useMockSession();
  return (
    <>
      <p>
        {status} | {user?.name ?? 'none'} | {role ?? 'none'} | {String(isQualified)}
      </p>
      <button onClick={() => loginAs(MOCK_SUPER_ADMIN)}>login as admin</button>
      <button onClick={() => loginAs(MOCK_MEMBER_NOT_QUALIFIED)}>login as unqualified</button>
      <button onClick={logout}>logout</button>
    </>
  );
}

function renderSession(initialUser?: Parameters<typeof MockSessionProvider>[0]['initialUser']) {
  return render(
    <MockSessionProvider initialUser={initialUser} restoreDelayMs={0}>
      <SessionProbe />
    </MockSessionProvider>,
  );
}

describe('MockSessionProvider', () => {
  it('starts loading then restores the authenticated session', async () => {
    renderSession(MOCK_MEMBER);
    expect(screen.getByText(/^loading/)).toBeInTheDocument();
    expect(await screen.findByText(/^authenticated/)).toBeInTheDocument();
    expect(screen.getByText(/Juan Dela Cruz/)).toBeInTheDocument();
    expect(screen.getByText(/user/)).toBeInTheDocument();
    expect(screen.getByText(/true$/)).toBeInTheDocument();
  });

  it('restores unauthenticated when no user is configured', async () => {
    renderSession(undefined);
    expect(await screen.findByText(/^unauthenticated/)).toBeInTheDocument();
  });

  it('loginAs switches the active user and role without storage', async () => {
    const user = userEvent.setup();
    renderSession(MOCK_MEMBER);
    await screen.findByText(/^authenticated/);

    await user.click(screen.getByRole('button', { name: 'login as admin' }));
    expect(screen.getByText(/Saul Super/)).toBeInTheDocument();
    expect(screen.getByText(/\| admin \|/)).toBeInTheDocument();
    expect(screen.getByText(/false$/)).toBeInTheDocument();
  });

  it('exposes member eligibility as a separate flag, not a role', async () => {
    const user = userEvent.setup();
    renderSession(MOCK_MEMBER);
    await screen.findByText(/^authenticated/);

    await user.click(screen.getByRole('button', { name: 'login as unqualified' }));
    expect(screen.getByText(/user/)).toBeInTheDocument();
    expect(screen.getByText(/false$/)).toBeInTheDocument();
  });

  it('logout clears the session', async () => {
    const user = userEvent.setup();
    renderSession(MOCK_MEMBER);
    await screen.findByText(/^authenticated/);

    await user.click(screen.getByRole('button', { name: 'logout' }));
    expect(screen.getByText(/^unauthenticated/)).toBeInTheDocument();
    expect(screen.getByText(/none/)).toBeInTheDocument();
  });
});
