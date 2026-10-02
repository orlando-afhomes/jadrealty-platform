import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MOCK_MEMBER } from '@jad/mock';

import { ProfilePage } from './ProfilePage';
import styles from './ProfilePage.module.css';
import { renderMember } from '../test/utils';
import { mockFetchRoutes } from '../../../test/utils';

const PROFILE = {
  id: 'mem-001',
  memberCode: 'JAD-MEM-0001',
  firstName: 'Juan',
  lastName: 'Dela Cruz',
  dateOfBirth: '1990-01-01',
  age: 36,
  gender: 'Male',
  countryCode: 'PH',
  countryName: 'Philippines',
  phone: '+639171234567',
  email: 'juan@example.com',
  referralCode: 'JAD-ABC1',
  status: 'APPROVED_ACTIVE',
  isQualified: true,
  program: { id: 'prg-domestic', code: 'DOMESTIC', name: 'Domestic Program' },
};

const PAYOUT_ACCOUNTS = {
  data: [
    {
      id: 'pa-001',
      method: 'GCASH',
      accountName: 'Juan Dela Cruz',
      accountIdentifier: '09175550199',
      accountIdentifierMasked: '•••• 0199',
      status: 'CONFIRMED',
      isPrimary: true,
      createdAt: '2026-07-20T10:00:00.000Z',
    },
  ],
  meta: {},
};

const VOUCHERS = {
  data: [
    {
      id: 'vch-001',
      code: 'JAD-VCH-0001',
      title: 'Welcome voucher',
      originalValue: '5000.00',
      remainingValue: '5000.00',
      status: 'ACTIVE',
      createdAt: '2026-07-20T10:00:00.000Z',
    },
  ],
  meta: {},
};

const MEMBER_NODE = {
  id: 'mem-001',
  name: 'Juan Dela Cruz',
  status: 'APPROVED_ACTIVE',
  isQualified: true,
  joinedAt: '2026-06-01T00:00:00.000Z',
  children: [],
};

const SPONSOR_NODE = {
  id: 'mem-000',
  name: 'Sponsor Sam',
  status: 'APPROVED_ACTIVE',
  isQualified: true,
  joinedAt: '2026-01-01T00:00:00.000Z',
  children: [],
};

const GENEALOGY = {
  root: MEMBER_NODE,
  sponsor: SPONSOR_NODE,
  ancestors: [],
};

const DIRECT_REFERRALS = {
  data: [
    {
      id: 'mem-002',
      name: 'Maria Santos',
      status: 'APPROVED_ACTIVE',
      isQualified: true,
      joinedAt: '2026-07-01T00:00:00.000Z',
    },
    {
      id: 'mem-003',
      name: 'Pedro Pendiente',
      status: 'PENDING',
      isQualified: false,
      joinedAt: '2026-07-05T00:00:00.000Z',
    },
  ],
  meta: {},
};

function primeMocks(overrides: Record<string, unknown> = {}) {
  mockFetchRoutes({
    '/members/mem-001': PROFILE,
    '/me/payout-accounts': PAYOUT_ACCOUNTS,
    '/me/vouchers': VOUCHERS,
    '/me/genealogy': GENEALOGY,
    '/me/direct-referrals': DIRECT_REFERRALS,
    ...overrides,
  });
}

describe('member ProfilePage linked accounts', () => {
  it('lays personal info and linked accounts side by side on desktop', async () => {
    primeMocks();
    const { container } = renderMember(<ProfilePage />, { user: MOCK_MEMBER });

    await screen.findByText('09175550199');
    const grid = container.querySelector(`.${styles.profileGrid}`);
    expect(grid).not.toBeNull();
    const columns = grid ? [...grid.children] : [];
    expect(columns).toHaveLength(2);
    // Left: personal info. Right: payout account, voucher, network.
    expect(columns[0]?.textContent).toContain('juan@example.com');
    expect(columns[1]?.textContent).toContain('Payout account');
  });

  it('shows the primary payout account with a manage link', async () => {
    primeMocks();
    renderMember(<ProfilePage />, { user: MOCK_MEMBER });

    expect(await screen.findByText('09175550199')).toBeInTheDocument();
    expect(screen.getByText('Primary')).toBeInTheDocument();
    expect(screen.queryByText('CONFIRMED')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Manage payout accounts' })).toHaveAttribute(
      'href',
      '/member/payouts',
    );
  });

  it('masks the account number through the eye toggle', async () => {
    primeMocks();
    const user = userEvent.setup();
    renderMember(<ProfilePage />, { user: MOCK_MEMBER });

    await screen.findByText('09175550199');
    const toggle = screen.getByRole('button', { name: 'Hide account number' });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(toggle.textContent).toBe('');
    await user.click(toggle);
    expect(screen.getByRole('button', { name: 'Show account number' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByText('•••• 0199')).toBeInTheDocument();
    expect(screen.queryByText('09175550199')).not.toBeInTheDocument();
  });

  it('shows the active voucher QR code with a vouchers link', async () => {
    primeMocks();
    renderMember(<ProfilePage />, { user: MOCK_MEMBER });

    expect(await screen.findByAltText('QR code for voucher JAD-VCH-0001')).toBeInTheDocument();
    expect(screen.getByText('JAD-VCH-0001')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View vouchers' })).toHaveAttribute(
      'href',
      '/member/vouchers',
    );
  });

  it('shows the sponsor and direct-referral count with a network link', async () => {
    primeMocks();
    renderMember(<ProfilePage />, { user: MOCK_MEMBER });

    expect(await screen.findByText(/Sponsored by/)).toBeInTheDocument();
    expect(screen.getByText('Sponsor Sam')).toBeInTheDocument();
    expect(screen.getByText(/2 direct referrals/)).toBeInTheDocument();
    expect(screen.getByText(/2 direct referrals/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View network' })).toHaveAttribute(
      'href',
      '/member/referrals/network',
    );
  });

  it('invites action on empty states', async () => {
    primeMocks({
      '/me/payout-accounts': { data: [], meta: {} },
      '/me/vouchers': { data: [], meta: {} },
      '/me/direct-referrals': { data: [], meta: {} },
      '/me/genealogy': {
        root: MEMBER_NODE,
        sponsor: null,
        ancestors: [],
      },
    });
    renderMember(<ProfilePage />, { user: MOCK_MEMBER });

    expect(await screen.findByText('No payout account yet.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add a payout account' })).toBeInTheDocument();
    expect(screen.getByText(/No active vouchers/)).toBeInTheDocument();
    expect(screen.getByText(/No sponsor linked/)).toBeInTheDocument();
  });

  it('keeps the other blocks when one query fails', async () => {
    primeMocks({
      '/me/payout-accounts': {
        body: { error: { code: 'INTERNAL', message: 'boom' } },
        status: 500,
      },
    });
    renderMember(<ProfilePage />, { user: MOCK_MEMBER });

    expect(await screen.findByText('Could not load your payout accounts.')).toBeInTheDocument();
    // Voucher and network blocks still render.
    expect(await screen.findByAltText('QR code for voucher JAD-VCH-0001')).toBeInTheDocument();
    expect(screen.getByText(/2 direct referrals/)).toBeInTheDocument();
    // The profile itself is unaffected.
    expect(screen.getByText('juan@example.com')).toBeInTheDocument();
  });
});
