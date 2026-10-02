import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MOCK_STAFF_ADMIN } from '@jad/mock';
import type { SessionUser } from '../../../lib/session';
import { renderWithProviders } from '../../../test/utils';
import { VoucherAssignFormDialog } from './VoucherAssignFormDialog';

const { mockUseMembers, mockUseAssignments, mockAssignMutate, mockUseConfig } = vi.hoisted(() => ({
  mockUseMembers: vi.fn(),
  mockUseAssignments: vi.fn(),
  mockAssignMutate: vi.fn(),
  mockUseConfig: vi.fn(),
}));

vi.mock('../../members/hooks/useMembers', () => ({
  useMembers: (...args: unknown[]) => mockUseMembers(...args),
}));

vi.mock('../hooks/useVoucherAssignments', () => ({
  useVoucherAssignments: (...args: unknown[]) => mockUseAssignments(...args),
}));

vi.mock('../hooks/useAssignVoucher', () => ({
  useAssignVoucher: () => ({ mutateAsync: mockAssignMutate, isPending: false }),
}));

vi.mock('../../config/hooks/useConfig', () => ({
  useConfig: (...args: unknown[]) => mockUseConfig(...args),
}));

const MEMBERS = [
  {
    id: 'mem-uuid-1',
    firstName: 'Juan',
    lastName: 'Dela Cruz',
    email: 'juan@example.com',
    accountStatus: 'ACTIVE',
  },
  {
    id: 'mem-uuid-2',
    firstName: 'Ana',
    lastName: 'Anay',
    email: 'ana@example.com',
    accountStatus: 'INACTIVE',
  },
];

const CONFIG = [
  {
    key: 'VOUCHER_DEFAULT_EXPIRY_DAYS',
    label: 'Voucher Expiry (days)',
    value: '90',
    category: 'Vouchers',
  },
];

function primeMocks() {
  mockUseMembers.mockReturnValue({ data: MEMBERS });
  mockUseAssignments.mockReturnValue({ data: [] });
  mockUseConfig.mockReturnValue({ data: CONFIG });
  mockAssignMutate.mockResolvedValue({ id: 'vch-1' });
}

function renderDialog() {
  return renderWithProviders(
    <VoucherAssignFormDialog open onClose={() => {}} templateId="vtpl-1" />,
    { user: MOCK_STAFF_ADMIN as SessionUser },
  );
}

function toIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

describe('VoucherAssignFormDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    primeMocks();
  });

  it('lists members by name only, without emails', async () => {
    renderDialog();
    const select = (await screen.findByLabelText('Member')) as HTMLSelectElement;
    expect(select.textContent).toContain('Juan Dela Cruz');
    expect(select.textContent).not.toContain('juan@example.com');
    expect(select.textContent).not.toContain('mem-uuid-1');
    // Inactive members are not eligible.
    expect(select.textContent).not.toContain('Ana Anay');
  });

  it('prefills Valid for Days from the system configuration', async () => {
    renderDialog();
    const days = (await screen.findByLabelText('Valid for days')) as HTMLInputElement;
    expect(days.value).toBe('90');
  });

  it('auto-selects the expiry date from Valid for Days', async () => {
    renderDialog();
    const expiry = (await screen.findByLabelText('Expiry Date')) as HTMLInputElement;
    const expected = new Date();
    expected.setDate(expected.getDate() + 90);
    expect(expiry.value).toBe(toIsoDate(expected));
    // The picker itself blocks past dates too.
    expect(expiry.min).toBe(toIsoDate(new Date()));
  });

  it('rejects a past expiry date', async () => {
    const user = userEvent.setup();
    renderDialog();
    const expiry = (await screen.findByLabelText('Expiry Date')) as HTMLInputElement;
    // Native date inputs don't take keystrokes in jsdom - set the value directly.
    fireEvent.change(expiry, { target: { value: '2020-01-01' } });
    await user.selectOptions(screen.getByLabelText('Member'), 'mem-uuid-1');
    await user.click(screen.getByRole('button', { name: 'Assign voucher' }));
    expect(await screen.findByText('Expiry cannot be in the past.')).toBeInTheDocument();
    expect(mockAssignMutate).not.toHaveBeenCalled();
  });

  it('rejects a validity window above the platform bound', async () => {
    const user = userEvent.setup();
    renderDialog();
    const days = (await screen.findByLabelText('Valid for days')) as HTMLInputElement;
    await user.clear(days);
    // Input shaping caps at 5 digits, so the bound trips at 99999.
    await user.type(days, '99999');
    await user.selectOptions(screen.getByLabelText('Member'), 'mem-uuid-1');
    await user.click(screen.getByRole('button', { name: 'Assign voucher' }));
    expect(await screen.findByText('Enter no more than 36,500 days.')).toBeInTheDocument();
    expect(mockAssignMutate).not.toHaveBeenCalled();
  });

  it('sends the configured days without an explicit date by default', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.selectOptions(await screen.findByLabelText('Member'), 'mem-uuid-1');
    await user.click(screen.getByRole('button', { name: 'Assign voucher' }));
    await waitFor(() => expect(mockAssignMutate).toHaveBeenCalledTimes(1));
    expect(mockAssignMutate).toHaveBeenCalledWith({
      templateId: 'vtpl-1',
      memberId: 'mem-uuid-1',
      expiresAt: undefined,
      validityDays: 90,
    });
  });

  it('sends an explicitly picked date, which wins over the days', async () => {
    const user = userEvent.setup();
    renderDialog();
    const expiry = (await screen.findByLabelText('Expiry Date')) as HTMLInputElement;
    const picked = new Date();
    picked.setDate(picked.getDate() + 30);
    const pickedIso = toIsoDate(picked);
    fireEvent.change(expiry, { target: { value: pickedIso } });
    await user.selectOptions(screen.getByLabelText('Member'), 'mem-uuid-1');
    await user.click(screen.getByRole('button', { name: 'Assign voucher' }));
    await waitFor(() => expect(mockAssignMutate).toHaveBeenCalledTimes(1));
    const payload = mockAssignMutate.mock.calls[0]?.[0] as Record<string, unknown>;
    // Local-midnight pick serialized to UTC (same instant, timezone-shifted date).
    expect(payload.expiresAt).toBe(new Date(`${pickedIso}T00:00:00`).toISOString());
    expect(payload.validityDays).toBe(90);
  });
});
