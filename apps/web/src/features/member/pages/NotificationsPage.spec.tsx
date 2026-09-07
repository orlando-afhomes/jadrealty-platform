import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MOCK_MEMBER, setMockSessionUser } from '@jad/mock';
import { createMemberMockServer } from '../../../mock';

import { NotificationsPage } from './NotificationsPage';
import { renderMember } from '../test/utils';
import { mockFetchRoutes } from '../../../test/utils';

describe('member NotificationsPage', () => {
  let server: ReturnType<typeof createMemberMockServer>;

  beforeEach(() => {
    server = createMemberMockServer();
    server.install();
    setMockSessionUser(MOCK_MEMBER);
  });

  afterEach(() => {
    server.restore();
    setMockSessionUser(null);
  });

  it('renders the notification feed with Breadcrumbs, filters and read state (SCR-MEM-024)', async () => {
    renderMember(<NotificationsPage />, { user: MOCK_MEMBER });

    expect(await screen.findByText('Welcome to JA&D')).toBeInTheDocument();
    expect(screen.getByText('Commission cleared')).toBeInTheDocument();
    expect(screen.getByText('New: Join the JA&D Community')).toBeInTheDocument();

    // Breadcrumbs + timeframe + header ring
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Resources')).toBeInTheDocument();
    expect(screen.getAllByText('Notifications')).toHaveLength(2);
    expect(screen.getByText(/Latest first/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View Marketing Tools' })).toHaveAttribute(
      'href',
      '/member/marketing-tools',
    );

    // Filters + count
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/Showing 5 of 5 notifications/)).toBeInTheDocument();
    expect(screen.getAllByText('Read').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Unread').length).toBeGreaterThanOrEqual(2);
  });

  it('filters by read/unread and resets', async () => {
    const user = userEvent.setup();
    renderMember(<NotificationsPage />, { user: MOCK_MEMBER });

    expect(await screen.findByText('Welcome to JA&D')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Unread' }));
    expect(screen.getByRole('button', { name: 'Unread' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/Showing 4 of 5 notifications · Unread/)).toBeInTheDocument();
    expect(screen.queryByText('Welcome to JA&D')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Read' }));
    expect(screen.getByText(/Showing 1 of 5 notifications · Read/)).toBeInTheDocument();
    expect(screen.getByText('Welcome to JA&D')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByText(/Showing 5 of 5 notifications/)).toBeInTheDocument();
  });

  it('opens a dialog to read the full notification on View click', async () => {
    const user = userEvent.setup();
    renderMember(<NotificationsPage />, { user: MOCK_MEMBER });

    expect(await screen.findByText('Welcome to JA&D')).toBeInTheDocument();
    // Cards are not clickable themselves — explicit View button opens dialog
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /View notification/ }).length).toBe(5);

    const welcomeCard = screen.getByText('Welcome to JA&D').closest('li')!;
    await user.click(within(welcomeCard).getByRole('button', { name: /View notification/ }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Your membership is now Active \+ Qualified/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close dialog' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows an empty state when there are no notifications', async () => {
    server.restore();
    mockFetchRoutes({ '/me/broadcasts': { data: [], meta: {} } });
    renderMember(<NotificationsPage />, { user: MOCK_MEMBER });

    expect(await screen.findByText('No notifications')).toBeInTheDocument();
  });
});
