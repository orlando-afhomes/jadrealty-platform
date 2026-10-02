import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MOCK_MEMBER } from '@jad/mock';

import { WithdrawalRequestPage } from './WithdrawalRequestPage';
import { renderMember } from '../test/utils';
import { mockFetchRoutes } from '../../../test/utils';

const WALLET = { availableBalance: '140000.00', pendingAmount: '636000.00' };

const CONFIRMED_ACCOUNTS = {
  data: [
    {
      id: 'pa-001',
      method: 'TRADITIONAL_BANK',
      accountName: 'Juan Dela Cruz',
      accountIdentifierMasked: '•••• 7890',
      status: 'CONFIRMED',
      isPrimary: true,
      createdAt: '2026-07-20T10:00:00.000Z',
    },
    {
      id: 'pa-002',
      method: 'DIGITAL_BANK',
      accountName: 'Juan Dela Cruz',
      accountIdentifierMasked: '•••• 3210',
      status: 'CONFIRMED',
      isPrimary: false,
      createdAt: '2026-07-25T10:00:00.000Z',
    },
  ],
  meta: {},
};

const PENDING_ONLY = {
  data: [
    {
      id: 'pa-003',
      method: 'GCASH',
      accountName: 'Juan Dela Cruz',
      accountIdentifierMasked: '•••• 0199',
      status: 'PENDING',
      isPrimary: false,
      createdAt: '2026-08-17T10:00:00.000Z',
    },
  ],
  meta: {},
};

const RESERVED = {
  id: 'wdr-004',
  amount: '25000.00',
  status: 'RESERVED',
  payoutAccount: {
    id: 'pa-001',
    method: 'TRADITIONAL_BANK',
    accountName: 'Juan Dela Cruz',
    accountIdentifierMasked: '•••• 7890',
  },
  reservedAt: '2026-08-20T10:00:00.000Z',
  createdAt: '2026-08-20T10:00:00.000Z',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('member WithdrawalRequestPage', () => {
  it('requires a confirmed payout account before requesting (SCR-MEM-012)', async () => {
    mockFetchRoutes({
      '/me/wallet': WALLET,
      '/me/payout-accounts': PENDING_ONLY,
    });
    renderMember(<WithdrawalRequestPage />, { user: MOCK_MEMBER });

    expect(await screen.findByText('No verified payout account')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add a payout account' })).toHaveAttribute(
      'href',
      '/member/payouts/new',
    );
  });

  it('validates the amount against the Available Balance before submission', async () => {
    mockFetchRoutes({
      '/me/wallet': WALLET,
      '/me/payout-accounts': CONFIRMED_ACCOUNTS,
    });
    const user = userEvent.setup();
    renderMember(<WithdrawalRequestPage />, { user: MOCK_MEMBER });

    await user.type(await screen.findByLabelText('Amount (PHP)'), '150000.00');
    await user.selectOptions(screen.getByLabelText('Payout account'), 'pa-001');
    await user.click(screen.getByRole('button', { name: 'Review withdrawal' }));

    expect(
      await screen.findByText('The amount exceeds your Available Balance.'),
    ).toBeInTheDocument();
  });

  it('reserves a withdrawal through the confirm dialog with an Idempotency-Key', async () => {
    const fetchFn = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      if (url.endsWith('/me/withdrawals') && method === 'POST') {
        return Promise.resolve(json(RESERVED));
      }
      if (url.endsWith('/me/payout-accounts')) return Promise.resolve(json(CONFIRMED_ACCOUNTS));
      return Promise.resolve(json(WALLET));
    });
    vi.stubGlobal('fetch', fetchFn);

    const user = userEvent.setup();
    renderMember(<WithdrawalRequestPage />, { user: MOCK_MEMBER });

    await user.type(await screen.findByLabelText('Amount (PHP)'), '25000.00');
    await user.selectOptions(screen.getByLabelText('Payout account'), 'pa-001');
    await user.click(screen.getByRole('button', { name: 'Review withdrawal' }));

    expect(await screen.findByText('Request this withdrawal?')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Request withdrawal' }));

    await waitFor(() => {
      const createCall = fetchFn.mock.calls.find((call) =>
        String(call[0]).endsWith('/me/withdrawals'),
      );
      expect(createCall).toBeTruthy();
      const init = createCall?.[1] as RequestInit | undefined;
      const headers = init?.headers as Record<string, string> | undefined;
      expect(headers?.['Idempotency-Key'] ?? headers?.['idempotency-key']).toBeTruthy();
    });
  });

  it('surfaces a 409 INSUFFICIENT_BALANCE from the server', async () => {
    mockFetchRoutes({
      '/me/wallet': WALLET,
      '/me/payout-accounts': CONFIRMED_ACCOUNTS,
      '/me/withdrawals': {
        body: {
          error: {
            code: 'INSUFFICIENT_BALANCE',
            message: 'The withdrawal amount exceeds your Available Balance.',
          },
        },
        status: 409,
      },
    });
    const user = userEvent.setup();
    renderMember(<WithdrawalRequestPage />, { user: MOCK_MEMBER });

    await user.type(await screen.findByLabelText('Amount (PHP)'), '25000.00');
    await user.selectOptions(screen.getByLabelText('Payout account'), 'pa-001');
    await user.click(screen.getByRole('button', { name: 'Review withdrawal' }));
    await user.click(await screen.findByRole('button', { name: 'Request withdrawal' }));

    expect(
      await screen.findByText(
        'The withdrawal amount exceeds your Available Balance. Enter a lower amount.',
      ),
    ).toBeInTheDocument();
  });

  it('rejects amounts below the configured minimum (SCR-MEM-012)', async () => {
    mockFetchRoutes({
      '/me/wallet': WALLET,
      '/me/payout-accounts': CONFIRMED_ACCOUNTS,
      '/config/public': {
        minimumAge: 18,
        genders: ['Male', 'Female', 'Others'],
        withdrawalLimits: { min: '100.00', max: '50000.00' },
      },
    });
    const user = userEvent.setup();
    renderMember(<WithdrawalRequestPage />, { user: MOCK_MEMBER });

    await screen.findByText(/Withdraw between ₱100\.00 and ₱50,000\.00/);
    await user.type(await screen.findByLabelText('Amount (PHP)'), '50.00');
    await user.selectOptions(screen.getByLabelText('Payout account'), 'pa-001');
    await user.click(screen.getByRole('button', { name: 'Review withdrawal' }));

    expect(await screen.findByText('Enter at least ₱100.00.')).toBeInTheDocument();
  });

  it('rejects amounts above the configured maximum (SCR-MEM-012)', async () => {
    mockFetchRoutes({
      '/me/wallet': WALLET,
      '/me/payout-accounts': CONFIRMED_ACCOUNTS,
      '/config/public': {
        minimumAge: 18,
        genders: ['Male', 'Female', 'Others'],
        withdrawalLimits: { min: '100.00', max: '50000.00' },
      },
    });
    const user = userEvent.setup();
    renderMember(<WithdrawalRequestPage />, { user: MOCK_MEMBER });

    await screen.findByText(/Withdraw between ₱100\.00 and ₱50,000\.00/);
    await user.type(await screen.findByLabelText('Amount (PHP)'), '60000.00');
    await user.selectOptions(screen.getByLabelText('Payout account'), 'pa-001');
    await user.click(screen.getByRole('button', { name: 'Review withdrawal' }));

    expect(await screen.findByText('Enter no more than ₱50,000.00.')).toBeInTheDocument();
  });

  it('formats the amount with thousand separators and drops non-numeric input', async () => {
    mockFetchRoutes({
      '/me/wallet': WALLET,
      '/me/payout-accounts': CONFIRMED_ACCOUNTS,
    });
    const user = userEvent.setup();
    renderMember(<WithdrawalRequestPage />, { user: MOCK_MEMBER });

    const amount = (await screen.findByLabelText('Amount (PHP)')) as HTMLInputElement;
    await user.type(amount, 'abc10000.5');
    expect(amount.value).toBe('10,000.5');
    await user.type(amount, '0');
    expect(amount.value).toBe('10,000.50');
  });

  it('offers suggestion cards from minimum to the affordable maximum', async () => {
    const fetchFn = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      if (url.endsWith('/me/withdrawals') && method === 'POST') {
        return Promise.resolve(json(RESERVED));
      }
      if (url.endsWith('/me/payout-accounts')) return Promise.resolve(json(CONFIRMED_ACCOUNTS));
      if (url.endsWith('/config/public'))
        return Promise.resolve(
          json({
            minimumAge: 18,
            genders: ['Male', 'Female', 'Others'],
            withdrawalLimits: { min: '100.00', max: '50000.00' },
          }),
        );
      return Promise.resolve(json(WALLET));
    });
    vi.stubGlobal('fetch', fetchFn);

    const user = userEvent.setup();
    renderMember(<WithdrawalRequestPage />, { user: MOCK_MEMBER });

    // Fixed ladder filtered to the affordable range.
    const group = await screen.findByRole('group', { name: 'Suggested amounts' });
    const cards = [...group.querySelectorAll('button')].map((b) => b.textContent);
    expect(cards).toEqual(['₱10,000.00', '₱20,000.00', '₱40,000.00', '₱50,000.00']);

    await user.click(screen.getByRole('button', { name: '₱50,000.00' }));
    expect((screen.getByLabelText('Amount (PHP)') as HTMLInputElement).value).toBe('50,000.00');

    await user.selectOptions(screen.getByLabelText('Payout account'), 'pa-001');
    await user.click(screen.getByRole('button', { name: 'Review withdrawal' }));
    await user.click(await screen.findByRole('button', { name: 'Request withdrawal' }));

    await waitFor(() => {
      const createCall = fetchFn.mock.calls.find(
        (call) =>
          String(call[0]).endsWith('/me/withdrawals') &&
          (call[1] as RequestInit | undefined)?.method === 'POST',
      );
      expect(createCall).toBeTruthy();
      // Exact-decimal on the wire - never the comma display format.
      expect(JSON.parse(String((createCall?.[1] as RequestInit | undefined)?.body))).toMatchObject({
        amount: '50000.00',
      });
    });
  });

  it('hides suggestion cards when the balance is below the minimum', async () => {
    mockFetchRoutes({
      '/me/wallet': { availableBalance: '50.00', pendingAmount: '0.00' },
      '/me/payout-accounts': CONFIRMED_ACCOUNTS,
      '/config/public': {
        minimumAge: 18,
        genders: ['Male', 'Female', 'Others'],
        withdrawalLimits: { min: '100.00', max: '50000.00' },
      },
    });
    renderMember(<WithdrawalRequestPage />, { user: MOCK_MEMBER });

    await screen.findByLabelText('Amount (PHP)');
    expect(screen.queryByRole('group', { name: 'Suggested amounts' })).not.toBeInTheDocument();
  });

  it('reuses the idempotency key for an unchanged retry', async () => {
    let posts = 0;
    const fetchFn = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      if (url.endsWith('/me/withdrawals') && method === 'POST') {
        posts += 1;
        if (posts === 1) return Promise.resolve(json({ error: { code: 'INTERNAL' } }, 500));
        return Promise.resolve(json(RESERVED));
      }
      if (url.endsWith('/me/payout-accounts')) return Promise.resolve(json(CONFIRMED_ACCOUNTS));
      return Promise.resolve(json(WALLET));
    });
    vi.stubGlobal('fetch', fetchFn);

    const user = userEvent.setup();
    renderMember(<WithdrawalRequestPage />, { user: MOCK_MEMBER });

    await user.type(await screen.findByLabelText('Amount (PHP)'), '25000.00');
    await user.selectOptions(screen.getByLabelText('Payout account'), 'pa-001');
    await user.click(screen.getByRole('button', { name: 'Review withdrawal' }));
    await user.click(await screen.findByRole('button', { name: 'Request withdrawal' }));
    await screen.findByText('We could not process the withdrawal');

    await user.click(screen.getByRole('button', { name: 'Review withdrawal' }));
    await user.click(await screen.findByRole('button', { name: 'Request withdrawal' }));

    const keys = fetchFn.mock.calls
      .filter(
        (call) =>
          String(call[0]).endsWith('/me/withdrawals') &&
          (call[1] as RequestInit | undefined)?.method === 'POST',
      )
      .map((call) => {
        const headers = (call[1] as RequestInit | undefined)?.headers as
          Record<string, string> | undefined;
        return headers?.['Idempotency-Key'] ?? headers?.['idempotency-key'];
      });
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBe(keys[0]);
  });

  it('mints a fresh idempotency key when the amount changes after a failure', async () => {
    const fetchFn = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      if (url.endsWith('/me/withdrawals') && method === 'POST') {
        return Promise.resolve(json({ error: { code: 'INTERNAL' } }, 500));
      }
      if (url.endsWith('/me/payout-accounts')) return Promise.resolve(json(CONFIRMED_ACCOUNTS));
      return Promise.resolve(json(WALLET));
    });
    vi.stubGlobal('fetch', fetchFn);

    const user = userEvent.setup();
    renderMember(<WithdrawalRequestPage />, { user: MOCK_MEMBER });

    const amount = (await screen.findByLabelText('Amount (PHP)')) as HTMLInputElement;
    await user.type(amount, '25000.00');
    await user.selectOptions(screen.getByLabelText('Payout account'), 'pa-001');
    await user.click(screen.getByRole('button', { name: 'Review withdrawal' }));
    await user.click(await screen.findByRole('button', { name: 'Request withdrawal' }));
    await screen.findByText('We could not process the withdrawal');

    await user.clear(amount);
    await user.type(amount, '26000.00');
    await user.click(screen.getByRole('button', { name: 'Review withdrawal' }));
    await user.click(await screen.findByRole('button', { name: 'Request withdrawal' }));
    await screen.findByText('We could not process the withdrawal');

    const keys = fetchFn.mock.calls
      .filter(
        (call) =>
          String(call[0]).endsWith('/me/withdrawals') &&
          (call[1] as RequestInit | undefined)?.method === 'POST',
      )
      .map((call) => {
        const headers = (call[1] as RequestInit | undefined)?.headers as
          Record<string, string> | undefined;
        return headers?.['Idempotency-Key'] ?? headers?.['idempotency-key'];
      });
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBeTruthy();
    expect(keys[1]).not.toBe(keys[0]);
  });
});
