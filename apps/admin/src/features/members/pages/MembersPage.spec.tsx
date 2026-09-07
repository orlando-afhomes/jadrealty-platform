import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { MOCK_ADMIN } from '@jad/mock';

import { installMockApi, renderWithProviders } from '../../../test/utils';
import { MembersPage } from './MembersPage';

describe('MembersPage', () => {
  let server: ReturnType<typeof installMockApi>;

  beforeEach(() => {
    server = installMockApi();
    server.install();
  });

  afterEach(() => {
    server.restore();
  });

  it('renders page header', async () => {
    renderWithProviders(<MembersPage />, { user: MOCK_ADMIN });
    expect(await screen.findByText('Members')).toBeInTheDocument();
    expect(screen.getByText(/Member management edit, deactivate, archive/)).toBeInTheDocument();
  });

  it('renders members table with data', async () => {
    renderWithProviders(<MembersPage />, { user: MOCK_ADMIN });
    expect(await screen.findByText('Juan Dela Cruz')).toBeInTheDocument();
    expect(screen.getByText('juan.delacruz@example.com')).toBeInTheDocument();
    expect(screen.getAllByText('DOMESTIC').length).toBeGreaterThanOrEqual(1);
  });

  it('shows status chips', async () => {
    renderWithProviders(<MembersPage />, { user: MOCK_ADMIN });
    await screen.findByText('Juan Dela Cruz');
    // Membership column (Active for approved members) and Qualified column.
    expect(screen.getAllByText('Active').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Qualified/).length).toBeGreaterThanOrEqual(1);
  });

  it('shows qualified status', async () => {
    renderWithProviders(<MembersPage />, { user: MOCK_ADMIN });
    await screen.findByText('Juan Dela Cruz');
    expect(screen.getAllByText('Active').length).toBeGreaterThanOrEqual(1);
  });

  it('filters members by search', async () => {
    renderWithProviders(<MembersPage />, { user: MOCK_ADMIN });
    await screen.findByText('Juan Dela Cruz');

    const searchInput = screen.getByLabelText('Search members');
    await userEvent.type(searchInput, 'Kevin');

    expect(screen.queryByText('Juan Dela Cruz')).not.toBeInTheDocument();
    expect(screen.getByText('Kevin Kintanar')).toBeInTheDocument();
  });

  it('renders modern filter dropdowns with accessible labels', async () => {
    renderWithProviders(<MembersPage />, { user: MOCK_ADMIN });
    await screen.findByText('Juan Dela Cruz');
    expect(screen.getByLabelText('Filter by program')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter by country')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter by membership status')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter by account status')).toBeInTheDocument();
  });
});
