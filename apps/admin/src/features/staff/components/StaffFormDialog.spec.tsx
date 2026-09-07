import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MOCK_SUPER_ADMIN } from '@jad/mock';

import { resetStaffStore } from '../../../mock/staffMockStore';
import { renderWithProviders } from '../../../test/utils';
import { StaffFormDialog } from './StaffFormDialog';

const mutateAsync = vi.hoisted(() => vi.fn());

vi.mock('../hooks/useCreateStaff', () => ({
  useCreateStaff: () => ({ mutateAsync, isPending: false }),
}));

vi.mock('../../roles/hooks/useRoles', () => ({
  useRoles: () => ({
    data: [
      { id: 'super_admin', name: 'Super Admin', permissions: ['staff'], isSystem: true },
      { id: 'admin', name: 'Admin', permissions: ['sales'], isSystem: true },
      { id: 'finance', name: 'Finance', permissions: ['sales'], isSystem: true },
    ],
  }),
}));

function renderDialog(onClose = vi.fn()) {
  renderWithProviders(<StaffFormDialog open onClose={onClose} />, { user: MOCK_SUPER_ADMIN });
  return { onClose };
}

describe('StaffFormDialog', () => {
  beforeEach(() => {
    resetStaffStore();
    mutateAsync.mockReset().mockResolvedValue({ id: 'stf-008', name: 'New Hire' });
  });

  it('renders name, email, and role fields', async () => {
    renderDialog();
    expect(await screen.findByText('Create Staff Member')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Role')).toBeInTheDocument();
    expect(screen.getByText(/start ACTIVE/i)).toBeInTheDocument();
  });

  it('requires name and email', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(await screen.findByText('Create Staff'));
    expect(await screen.findByText('Name is required.')).toBeInTheDocument();
    expect(screen.getByText('Email is required.')).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('rejects malformed emails locally and surfaces server duplicates', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.type(screen.getByLabelText('Name'), 'New Hire');
    await user.type(screen.getByLabelText('Email'), 'not-an-email');
    await user.click(screen.getByText('Create Staff'));
    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();

    // Uniqueness is enforced server-side (409) — the dialog surfaces it as
    // a submit error instead of checking mock data.
    await user.clear(screen.getByLabelText('Email'));
    await user.type(screen.getByLabelText('Email'), 'ada.admin@jad.example');
    mutateAsync.mockRejectedValueOnce(new Error('A staff member with this email already exists.'));
    await user.click(screen.getByText('Create Staff'));
    expect(
      await screen.findByText('A staff member with this email already exists.'),
    ).toBeInTheDocument();
  });

  it('creates staff with actor attribution and closes', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();
    await user.type(screen.getByLabelText('Name'), 'New Hire');
    await user.type(screen.getByLabelText('Email'), 'new.hire@jad.example');
    await user.selectOptions(screen.getByLabelText('Role'), 'finance');
    await user.click(screen.getByText('Create Staff'));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(mutateAsync).toHaveBeenCalledWith({
      name: 'New Hire',
      email: 'new.hire@jad.example',
      roleId: 'finance',
      actor: 'Saul Super',
      actorRole: 'SUPER_ADMIN',
    });
    expect(onClose).toHaveBeenCalled();
  });
});
