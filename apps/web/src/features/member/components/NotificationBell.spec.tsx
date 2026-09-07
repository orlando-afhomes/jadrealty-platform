import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MOCK_MEMBER } from '@jad/mock';

import { NotificationBell } from './NotificationBell';
import { renderMember } from '../test/utils';
import { mockFetchRoutes } from '../../../test/utils';

const BROADCASTS = {
  data: [
    {
      id: 'ntf-001',
      title: 'Commission cleared',
      body: 'Your commission is now available.',
      createdAt: '2026-08-16T10:00:00.000Z',
      readAt: '2026-08-17T10:00:00.000Z',
    },
    {
      id: 'ntf-002',
      title: 'New policy update',
      body: 'Please review the updated structure.',
      createdAt: '2026-08-18T10:00:00.000Z',
    },
  ],
  meta: {},
};

describe('NotificationBell', () => {
  it('renders the bell button with correct aria-label', async () => {
    mockFetchRoutes({ '/me/broadcasts': BROADCASTS });
    renderMember(<NotificationBell />, { user: MOCK_MEMBER });

    const button = await screen.findByRole('button', { name: /Notifications/ });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('aria-haspopup', 'dialog');
  });

  it('shows unread count in aria-label', async () => {
    mockFetchRoutes({ '/me/broadcasts': BROADCASTS });
    renderMember(<NotificationBell />, { user: MOCK_MEMBER });

    const button = await screen.findByRole('button', { name: /1 unread/ });
    expect(button).toBeInTheDocument();
  });

  it('opens the notification panel on click and shows notifications', async () => {
    const user = userEvent.setup();
    mockFetchRoutes({ '/me/broadcasts': BROADCASTS });
    renderMember(<NotificationBell />, { user: MOCK_MEMBER });

    await user.click(screen.getByRole('button', { name: /Notifications/ }));
    const dialog = screen.getByRole('dialog', { name: 'Notifications' });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText('Commission cleared')).toBeInTheDocument();
    expect(screen.getByText('New policy update')).toBeInTheDocument();
  });

  it('closes the panel on Escape key', async () => {
    const user = userEvent.setup();
    mockFetchRoutes({ '/me/broadcasts': BROADCASTS });
    renderMember(<NotificationBell />, { user: MOCK_MEMBER });

    await user.click(screen.getByRole('button', { name: /Notifications/ }));
    expect(screen.getByRole('dialog', { name: 'Notifications' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Notifications' })).not.toBeInTheDocument();
  });

  it('shows View all link to notifications page', async () => {
    const user = userEvent.setup();
    mockFetchRoutes({ '/me/broadcasts': BROADCASTS });
    renderMember(<NotificationBell />, { user: MOCK_MEMBER });

    await user.click(screen.getByRole('button', { name: /Notifications/ }));
    const viewAll = screen.getByText('View all');
    expect(viewAll).toHaveAttribute('href', '/member/notifications');
  });

  it('shows empty state when no notifications', async () => {
    const user = userEvent.setup();
    mockFetchRoutes({ '/me/broadcasts': { data: [], meta: {} } });
    renderMember(<NotificationBell />, { user: MOCK_MEMBER });

    await user.click(screen.getByRole('button', { name: /Notifications/ }));
    expect(screen.getByText('No notifications yet.')).toBeInTheDocument();
  });
});
