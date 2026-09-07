import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { MOCK_ADMIN } from '@jad/mock';

import { installMockApi, renderWithProviders } from '../../../test/utils';
import { VouchersPage } from './VouchersPage';

describe('VouchersPage', () => {
  let server: ReturnType<typeof installMockApi>;

  beforeEach(() => {
    server = installMockApi();
    server.install();
  });

  afterEach(() => {
    server.restore();
  });

  it('renders page header', async () => {
    renderWithProviders(<VouchersPage />, { user: MOCK_ADMIN });
    expect(await screen.findByText('Vouchers')).toBeInTheDocument();
    expect(screen.getByText(/create voucher templates/i)).toBeInTheDocument();
  });

  it('renders voucher templates table with data', async () => {
    renderWithProviders(<VouchersPage />, { user: MOCK_ADMIN });
    expect(await screen.findByText('Welcome Gift')).toBeInTheDocument();
    expect(screen.getByText('Referral Rewards')).toBeInTheDocument();
    expect(screen.getByText('Season Promo')).toBeInTheDocument();
  });

  it('shows formatted currency values', async () => {
    renderWithProviders(<VouchersPage />, { user: MOCK_ADMIN });
    await screen.findByText('Welcome Gift');
    expect(screen.getAllByText('₱500.00').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('₱1,000.00')).toBeInTheDocument();
  });

  it('shows assignment counts', async () => {
    renderWithProviders(<VouchersPage />, { user: MOCK_ADMIN });
    await screen.findByText('Welcome Gift');
    expect(screen.getAllByText('2').length).toBeGreaterThanOrEqual(1);
  });
});
