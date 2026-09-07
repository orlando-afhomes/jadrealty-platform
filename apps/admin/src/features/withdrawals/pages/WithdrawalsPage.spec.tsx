import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MOCK_ADMIN } from '@jad/mock';

import { installMockApi, renderWithProviders } from '../../../test/utils';
import { WithdrawalsPage } from './WithdrawalsPage';

describe('WithdrawalsPage', () => {
  let server: ReturnType<typeof installMockApi>;

  beforeEach(() => {
    server = installMockApi();
    server.install();
  });

  afterEach(() => {
    server.restore();
  });

  it('renders page header', async () => {
    renderWithProviders(<WithdrawalsPage />, { user: MOCK_ADMIN });
    expect(await screen.findByText('Withdrawals')).toBeInTheDocument();
    expect(screen.getByText(/withdrawal requests/i)).toBeInTheDocument();
  });

  it('renders withdrawals table with data', async () => {
    renderWithProviders(<WithdrawalsPage />, { user: MOCK_ADMIN });
    expect(await screen.findByText('Maria Santos')).toBeInTheDocument();
    expect(screen.getByText('Pedro Reyes')).toBeInTheDocument();
    expect(screen.getAllByText('Juan Dela Cruz').length).toBe(4);
  });

  it('shows formatted currency values', async () => {
    renderWithProviders(<WithdrawalsPage />, { user: MOCK_ADMIN });
    await screen.findByText('Maria Santos');
    expect(screen.getByText('₱50,000.00')).toBeInTheDocument();
    expect(screen.getByText('₱1,200.00')).toBeInTheDocument();
  });

  it('shows status chips', async () => {
    renderWithProviders(<WithdrawalsPage />, { user: MOCK_ADMIN });
    await screen.findByText('Maria Santos');
    expect(screen.getAllByText('Reserved').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Completed').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Rejected').length).toBeGreaterThanOrEqual(1);
  });

  it('shows the full number in the table and details dialog', async () => {
    const row = {
      id: 'wdr-900',
      amount: '1200.00',
      status: 'RESERVED',
      payoutAccount: {
        id: 'pa-900',
        method: 'GCASH',
        accountName: 'Dialog Case',
        accountIdentifierMasked: '•••• 0199',
        accountIdentifier: '09175550199',
      },
      reservedAt: '2026-08-20T10:00:00.000Z',
      createdAt: '2026-08-20T10:00:00.000Z',
    };
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(JSON.stringify({ data: [row], meta: { page: 1, pageSize: 1, total: 1 } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    const user = userEvent.setup();
    renderWithProviders(<WithdrawalsPage />, { user: MOCK_ADMIN });

    expect(await screen.findByText('09175550199')).toBeInTheDocument();
    expect(screen.queryByText('•••• 0199')).not.toBeInTheDocument();
    await user.click(screen.getByText('09175550199'));
    expect(await screen.findByText('Withdrawal Details')).toBeInTheDocument();
    expect(screen.getAllByText('09175550199').length).toBeGreaterThanOrEqual(1);
    vi.unstubAllGlobals();
  });
});
