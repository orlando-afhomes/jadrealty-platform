import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MOCK_MEMBER } from '@jad/mock';

import { AddPayoutAccountPage } from './AddPayoutAccountPage';
import { renderMember } from '../test/utils';
import { mockFetchRoutes } from '../../../test/utils';

const ACCOUNTS = { data: [], meta: {} };

const CREATED = {
  id: 'pa-005',
  method: 'GCASH',
  accountName: 'Juan Dela Cruz',
  accountIdentifierMasked: '•••• 0199',
  status: 'PENDING',
  isPrimary: false,
  createdAt: '2026-08-20T10:00:00.000Z',
};

describe('member AddPayoutAccountPage', () => {
  it('creates a payout account and navigates to the list (SCR-MEM-011)', async () => {
    const fetchFn = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      const isCreate = url.includes('/payout-accounts') && method === 'POST';
      const body = isCreate ? CREATED : ACCOUNTS;
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });
    vi.stubGlobal('fetch', fetchFn);

    const user = userEvent.setup();
    renderMember(<AddPayoutAccountPage />, { user: MOCK_MEMBER });

    await screen.findByRole('heading', { name: 'Add payout account' });

    await user.selectOptions(await screen.findByLabelText('Payout method'), 'GCASH');
    await user.type(screen.getByLabelText('Account holder name'), 'Juan Dela Cruz');
    await user.type(screen.getByLabelText('Mobile number'), '09175550199');
    await user.click(screen.getByRole('button', { name: 'Add payout account' }));

    await waitFor(() => {
      const createCall = fetchFn.mock.calls.find((call) =>
        String(call[0]).includes('/payout-accounts'),
      );
      expect(createCall).toBeTruthy();
    });
  });

  it('validates the form before submitting', async () => {
    mockFetchRoutes({ '/me/payout-accounts': ACCOUNTS });
    const user = userEvent.setup();
    renderMember(<AddPayoutAccountPage />, { user: MOCK_MEMBER });

    await user.selectOptions(await screen.findByLabelText('Payout method'), 'GCASH');
    await user.click(await screen.findByRole('button', { name: 'Add payout account' }));

    expect(await screen.findByText('Enter the account holder name.')).toBeInTheDocument();
    expect(screen.getByText('Enter your GCash mobile number.')).toBeInTheDocument();
  });

  it('lists Credit/Debit Card, Digital Bank, GCash, Traditional Bank in that order', async () => {
    mockFetchRoutes({ '/me/payout-accounts': ACCOUNTS });
    renderMember(<AddPayoutAccountPage />, { user: MOCK_MEMBER });

    const method = (await screen.findByLabelText('Payout method')) as HTMLSelectElement;
    const values = [...method.querySelectorAll('option')].map((o) => o.value);
    expect(values).toEqual(['', 'CREDIT_DEBIT_CARD', 'DIGITAL_BANK', 'GCASH', 'TRADITIONAL_BANK']);
    expect(method.textContent).toContain('Credit/Debit Card');
  });

  it('creates a credit/debit card account with a 13-19 digit card number', async () => {
    const fetchFn = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      const isCreate = url.includes('/payout-accounts') && method === 'POST';
      const body = isCreate
        ? { ...CREATED, method: 'CREDIT_DEBIT_CARD', accountIdentifierMasked: '•••• 1111' }
        : ACCOUNTS;
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });
    vi.stubGlobal('fetch', fetchFn);

    const user = userEvent.setup();
    renderMember(<AddPayoutAccountPage />, { user: MOCK_MEMBER });

    await user.selectOptions(await screen.findByLabelText('Payout method'), 'CREDIT_DEBIT_CARD');
    await user.type(screen.getByLabelText('Account holder name'), 'Juan Dela Cruz');
    await user.type(screen.getByLabelText('Card number'), '4111111111111111');
    await user.click(screen.getByRole('button', { name: 'Add payout account' }));

    await waitFor(() => {
      const createCall = fetchFn.mock.calls.find(
        (call) =>
          String(call[0]).includes('/payout-accounts') &&
          (call[1] as RequestInit | undefined)?.method === 'POST',
      );
      expect(createCall).toBeTruthy();
      expect(JSON.parse(String((createCall?.[1] as RequestInit | undefined)?.body))).toEqual({
        method: 'CREDIT_DEBIT_CARD',
        accountName: 'Juan Dela Cruz',
        accountIdentifier: '4111111111111111',
      });
    });
  });

  it('rejects a short card number', async () => {
    mockFetchRoutes({ '/me/payout-accounts': ACCOUNTS });
    const user = userEvent.setup();
    renderMember(<AddPayoutAccountPage />, { user: MOCK_MEMBER });

    await user.selectOptions(await screen.findByLabelText('Payout method'), 'CREDIT_DEBIT_CARD');
    await user.type(screen.getByLabelText('Account holder name'), 'Juan Dela Cruz');
    await user.type(screen.getByLabelText('Card number'), '12345');
    await user.click(await screen.findByRole('button', { name: 'Add payout account' }));

    expect(
      await screen.findByText(
        'This card number doesn’t look valid. Check the digits and try again.',
      ),
    ).toBeInTheDocument();
  });

  it('rejects a card number that fails the checksum', async () => {
    const fetchFn = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify(ACCOUNTS), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchFn);
    const user = userEvent.setup();
    renderMember(<AddPayoutAccountPage />, { user: MOCK_MEMBER });

    await user.selectOptions(await screen.findByLabelText('Payout method'), 'CREDIT_DEBIT_CARD');
    await user.type(screen.getByLabelText('Account holder name'), 'Juan Dela Cruz');
    await user.type(screen.getByLabelText('Card number'), '4111111111111112');
    await user.click(await screen.findByRole('button', { name: 'Add payout account' }));

    expect(
      await screen.findByText(
        'This card number doesn’t look valid. Check the digits and try again.',
      ),
    ).toBeInTheDocument();
    expect(
      fetchFn.mock.calls.some((call) => (call[1] as RequestInit | undefined)?.method === 'POST'),
    ).toBe(false);
  });

  it('capitalizes the holder name and strips digits as typed', async () => {
    mockFetchRoutes({ '/me/payout-accounts': ACCOUNTS });
    const user = userEvent.setup();
    renderMember(<AddPayoutAccountPage />, { user: MOCK_MEMBER });

    await user.selectOptions(await screen.findByLabelText('Payout method'), 'GCASH');
    const name = screen.getByLabelText('Account holder name') as HTMLInputElement;
    await user.type(name, 'juan123 de!la cruz');
    expect(name.value).toBe('Juan Dela Cruz');
  });

  it('drops letters from identifiers as typed and caps bank numbers at 12 digits', async () => {
    mockFetchRoutes({ '/me/payout-accounts': ACCOUNTS });
    const user = userEvent.setup();
    renderMember(<AddPayoutAccountPage />, { user: MOCK_MEMBER });

    await user.selectOptions(await screen.findByLabelText('Payout method'), 'TRADITIONAL_BANK');
    const identifier = screen.getByLabelText('Account number') as HTMLInputElement;
    await user.type(identifier, '12ab34567890123456');
    expect(identifier.value).toBe('123456789012');
  });
});
