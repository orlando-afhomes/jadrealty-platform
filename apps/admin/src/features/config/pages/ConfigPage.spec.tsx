import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MOCK_ADMIN } from '@jad/mock';

import { installMockApi, renderWithProviders } from '../../../test/utils';
import { ConfigPage } from './ConfigPage';

describe('ConfigPage', () => {
  let server: ReturnType<typeof installMockApi>;

  beforeEach(() => {
    server = installMockApi();
    server.install();
  });

  afterEach(() => {
    server.restore();
  });

  it('renders page header with production copy', async () => {
    renderWithProviders(<ConfigPage />, { user: MOCK_ADMIN });
    expect(await screen.findByText('System Configuration')).toBeInTheDocument();
    expect(
      screen.getByText(/Manage platform parameters, commission rates, and qualification programs/),
    ).toBeInTheDocument();
  });

  it('renders config grouped by category', async () => {
    renderWithProviders(<ConfigPage />, { user: MOCK_ADMIN });
    expect(await screen.findByText('Commissions')).toBeInTheDocument();
    expect(screen.getByText('Withdrawals')).toBeInTheDocument();
    expect(screen.getByText('Qualification')).toBeInTheDocument();
    expect(screen.getByText('Sales')).toBeInTheDocument();
    expect(screen.getByText('Vouchers')).toBeInTheDocument();
  });

  it('formats config values without showing raw keys', async () => {
    renderWithProviders(<ConfigPage />, { user: MOCK_ADMIN });
    expect(await screen.findByText('Direct Commission Rate')).toBeInTheDocument();
    expect(screen.getByText('8.00%')).toBeInTheDocument();
    expect(screen.getByText('Minimum Withdrawal Amount')).toBeInTheDocument();
    expect(screen.getByText('₱100.00')).toBeInTheDocument();
    expect(screen.queryByText('COMMISSION_DIRECT_RATE')).not.toBeInTheDocument();
  });

  it('renders Programs section with Domestic and Abroad', async () => {
    renderWithProviders(<ConfigPage />, { user: MOCK_ADMIN });
    expect(await screen.findByText('Programs')).toBeInTheDocument();
    expect(await screen.findByText('Domestic Program')).toBeInTheDocument();
    expect(screen.getByText('Abroad Program')).toBeInTheDocument();
    expect(screen.getByText('DOMESTIC')).toBeInTheDocument();
    expect(screen.getByText('ABROAD')).toBeInTheDocument();
  });

  it('shows program descriptions', async () => {
    renderWithProviders(<ConfigPage />, { user: MOCK_ADMIN });
    await screen.findByText('Domestic Program');
    expect(screen.getByText(/For members based in the Philippines/)).toBeInTheDocument();
    expect(screen.getByText(/Overseas Filipino Workers/)).toBeInTheDocument();
  });

  it('opens edit dialog and saves updated value locally', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ConfigPage />, { user: MOCK_ADMIN });
    await screen.findByText('Direct Commission Rate');

    const editButtons = screen.getAllByRole('button', { name: /Edit/ });
    await user.click(editButtons[0]!);

    expect(await screen.findByText('Edit Direct Commission Rate')).toBeInTheDocument();
    const input = screen.getByRole('textbox', { name: /value/i });
    expect(input).toHaveValue('8.00');

    fireEvent.change(input, { target: { value: '10' } });
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('10.00%')).toBeInTheDocument();
    });
  });

  it('cancels edit without persisting changes', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ConfigPage />, { user: MOCK_ADMIN });
    await screen.findByText('Direct Commission Rate');

    const editButtons = screen.getAllByRole('button', { name: /Edit/ });
    await user.click(editButtons[0]!);

    const input = screen.getByRole('textbox', { name: /value/i });
    await user.clear(input);
    await user.type(input, '99');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('8.00%')).toBeInTheDocument();
  });

  it('validates non-numeric input and disables Save', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ConfigPage />, { user: MOCK_ADMIN });
    await screen.findByText('Direct Commission Rate');

    const editButtons = screen.getAllByRole('button', { name: /Edit/ });
    await user.click(editButtons[0]!);

    const input = screen.getByRole('textbox', { name: /value/i });
    fireEvent.change(input, { target: { value: 'abc' } });

    await waitFor(() => {
      expect(screen.getByText('Must be a number')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('validates rate out of range and shows error', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ConfigPage />, { user: MOCK_ADMIN });
    await screen.findByText('Direct Commission Rate');

    const editButtons = screen.getAllByRole('button', { name: /Edit/ });
    await user.click(editButtons[0]!);

    const input = screen.getByRole('textbox', { name: /value/i });
    fireEvent.change(input, { target: { value: '150' } });

    await waitFor(() => {
      expect(screen.getByText('Rate must be between 0 and 100')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });
});
