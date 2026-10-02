import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';

import { compareMoney, formatMoney, isExactDecimal, subtractMoney } from '@jad/shared';
import {
  ConfirmDialog,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
  notifySuccess,
} from '@jad/ui';

import { Alert } from '../../../components/Alert';
import { Button } from '../../../components/Button';
import { ApiError } from '../../../lib/api/errors';
import { apiErrorMessage } from '../../../lib/api/errorMessage';
import { usePayoutAccounts, useWallet } from '../hooks/useMember';
import { usePublicConfig } from '../../public/hooks/usePublicConfig';
import { createWithdrawal, getWallet } from '../services/member';
import { SelectField } from '../../auth/components/SelectField';
import { TextField } from '../../auth/components/TextField';
import { payoutMethodLabel } from '../lib/presentation';
import styles from './WithdrawalRequestPage.module.css';

const AMOUNT_RE = /^\d+(\.\d{1,2})?$/;

/** Hard cap on whole-peso digits (UX guard; the server still enforces balance). */
const MAX_INTEGER_DIGITS = 12;

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Live amount shaping: digits + one dot only, max two decimals, thousand
 * separators as typed (`10000` → `10,000`). Letters, commas, currency
 * symbols and extra dots never enter state. Callers strip commas via
 * `normalizeAmount` before validating or submitting.
 */
function shapeAmount(raw: string): string {
  const cleaned = raw.replace(/[^0-9.]/g, '');
  if (cleaned === '') return '';
  const dotIndex = cleaned.indexOf('.');
  const hasDot = dotIndex !== -1;
  const headRaw = (hasDot ? cleaned.slice(0, dotIndex) : cleaned).slice(0, MAX_INTEGER_DIGITS);
  const fracRaw = hasDot ? cleaned.slice(dotIndex + 1).replace(/\./g, '') : '';
  const head = headRaw.replace(/^0+(?=\d)/, '') || '0';
  if (!hasDot) return groupThousands(head);
  return `${groupThousands(head)}.${fracRaw.slice(0, 2)}`;
}

/** Display string → exact-decimal for validation, math, and submission. */
function normalizeAmount(display: string): string {
  return display.replace(/,/g, '').trim();
}

function toCents(value: string): bigint | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match || match[1] === undefined) return null;
  return BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0'));
}

function fromCents(cents: bigint): string {
  return `${(cents / 100n).toString()}.${(cents % 100n).toString().padStart(2, '0')}`;
}

/** Mint and persist a fresh idempotency key (module scope: impure by design). */
function mintIdempotencyKey(): string {
  const fresh =
    typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `idem-${Date.now()}`;
  try {
    sessionStorage.setItem('jad:withdrawal:idempotency', fresh);
  } catch {
    // sessionStorage unavailable (SSR/test)
  }
  return fresh;
}

/**
 * Request a withdrawal (SCR-MEM-012, FR-WDR-001..005). Requires at least one
 * verified payout account (BR-PAY-005) and a positive amount ≤ Available
 * Balance. Submission is irreversible - the amount is reserved immediately
 * (BR-WDR-001/002) - so it goes through a ConfirmDialog. `Idempotency-Key`
 * (API-SPECIFICATION §5.3) is held in state for the attempt and reused on retry;
 * the server remains authoritative for balance checks (409/422).
 */
export function WithdrawalRequestPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const walletQuery = useWallet();
  const accountsQuery = usePayoutAccounts();
  // Configured withdrawal bounds (MIN/MAX_WITHDRAWAL_AMOUNT via GET
  // /config/public). The DB function remains authoritative; these only
  // validate inline. Unknown until loaded - then the checks are skipped.
  const configQuery = usePublicConfig();
  const limits = configQuery.data?.withdrawalLimits;
  const [amount, setAmount] = useState('');
  const [payoutAccountId, setPayoutAccountId] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | undefined>();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => {
    try {
      const stored = sessionStorage.getItem('jad:withdrawal:idempotency');
      if (stored) return stored;
    } catch {
      // sessionStorage unavailable (SSR/test)
    }
    return mintIdempotencyKey();
  });

  const verifiedAccounts = useMemo(
    () => (accountsQuery.data ?? []).filter((account) => account.status === 'CONFIRMED'),
    [accountsQuery.data],
  );

  const regenerateKey = () => {
    const fresh = mintIdempotencyKey();
    setIdempotencyKey(fresh);
    return fresh;
  };

  /**
   * Payload the active idempotency key was minted for. A replayed key always
   * returns the FIRST stored withdrawal, so a key must never be reused for a
   * different amount/account (cross-tab or edited retry would otherwise land
   * on the wrong withdrawal). Unchanged retries keep the key for safe dedup.
   */
  const keyPayloadRef = useRef<{ amount: string; payoutAccountId: string } | null>(null);

  const keyForAttempt = (attemptAmount: string, attemptAccountId: string): string => {
    const current = keyPayloadRef.current;
    if (
      current &&
      current.amount === attemptAmount &&
      current.payoutAccountId === attemptAccountId
    ) {
      return idempotencyKey;
    }
    const fresh = regenerateKey();
    keyPayloadRef.current = { amount: attemptAmount, payoutAccountId: attemptAccountId };
    return fresh;
  };

  const createMutation = useMutation({
    mutationFn: ({
      amount: mutationAmount,
      payoutAccountId: mutationAccountId,
      key,
    }: {
      amount: string;
      payoutAccountId: string;
      key: string;
    }) =>
      createWithdrawal({ amount: mutationAmount, payoutAccountId: mutationAccountId }, key),
    onSuccess: (withdrawal) => {
      try {
        sessionStorage.removeItem('jad:withdrawal:idempotency');
      } catch {
        // ignore
      }
      keyPayloadRef.current = null;
      regenerateKey();
      // Await the refetches so the destination page (detail + eWallet) shows
      // the server truth (deducted Available, raised Pending reservation).
      void (async () => {
        await Promise.allSettled([
          queryClient.invalidateQueries({ queryKey: ['member', 'wallet'] }),
          queryClient.invalidateQueries({ queryKey: ['member', 'withdrawals'] }),
          queryClient.invalidateQueries({ queryKey: ['member', 'ledger', 'page'] }),
        ]);
        notifySuccess({
          title: 'Withdrawal reserved',
          message: `${formatMoney(withdrawal.amount)} moved from Available to your reserved withdrawals.`,
        });
      })();
      navigate(`/member/withdrawals/${withdrawal.id}`, { replace: true });
    },
  });

  const balance = walletQuery.data?.availableBalance ?? '0.00';

  /**
   * Quick-pick amounts: a fixed ladder (10,000 / 20,000 / 40,000 / 50,000),
   * filtered to what the member can actually withdraw (within minimum and
   * the affordable cap). Cards are always submittable as-is; typing in the
   * field below stays fully custom and deselects the card.
   */
  const suggestions = useMemo(() => {
    const LADDER = [10000n * 100n, 20000n * 100n, 40000n * 100n, 50000n * 100n];
    const balanceCents = toCents(balance);
    if (balanceCents === null || balanceCents <= 0n) return [];
    if (limits) {
      const minCents = toCents(limits.min);
      const maxCents = toCents(limits.max);
      if (minCents === null || maxCents === null) return [];
      const cap = balanceCents < maxCents ? balanceCents : maxCents;
      if (cap < minCents) return [];
      const valid = LADDER.filter((cents) => cents >= minCents && cents <= cap);
      if (valid.length > 0) return valid.map(fromCents);
      return [fromCents(minCents)];
    }
    const valid = LADDER.filter((cents) => cents <= balanceCents);
    if (valid.length > 0) return valid.map(fromCents);
    return [fromCents(balanceCents)];
  }, [balance, limits]);

  const normalizedAmount = normalizeAmount(amount);

  const onReview = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!normalizedAmount) nextErrors.amount = 'Enter an amount.';
    else if (!AMOUNT_RE.test(normalizedAmount))
      nextErrors.amount = 'Enter a valid amount with up to two decimal places.';
    else if (compareMoney(normalizedAmount, '0.00') <= 0)
      nextErrors.amount = 'Enter an amount greater than zero.';
    else if (limits && compareMoney(normalizedAmount, limits.min) < 0)
      nextErrors.amount = `Enter at least ${formatMoney(limits.min)}.`;
    else if (compareMoney(normalizedAmount, balance) > 0)
      nextErrors.amount = 'The amount exceeds your Available Balance.';
    else if (limits && compareMoney(normalizedAmount, limits.max) > 0)
      nextErrors.amount = `Enter no more than ${formatMoney(limits.max)}.`;
    if (!payoutAccountId) nextErrors.payoutAccountId = 'Choose a verified payout account.';
    setErrors(nextErrors);
    if (nextErrors.amount) document.getElementById('withdrawal-amount')?.focus();
    else if (nextErrors.payoutAccountId)
      document.getElementById('withdrawal-payoutAccountId')?.focus();
    if (Object.keys(nextErrors).length > 0) return;
    setServerError(undefined);
    setConfirmOpen(true);
  };

  const onConfirm = async () => {
    setConfirmOpen(false);
    setServerError(undefined);
    try {
      const fresh = await queryClient.fetchQuery({
        queryKey: ['member', 'wallet'],
        queryFn: getWallet,
      });
      const freshBalance = fresh.availableBalance;
      if (compareMoney(normalizedAmount, freshBalance) > 0) {
        setServerError(
          'The withdrawal amount exceeds your Available Balance. Enter a lower amount.',
        );
        return;
      }
    } catch {
      // If fresh fetch fails, rely on server 409 and show generic error below
    }
    createMutation.mutate(
      { amount: normalizedAmount, payoutAccountId, key: keyForAttempt(normalizedAmount, payoutAccountId) },
      {
        onError: (error) => {
          if (error instanceof ApiError && error.code === 'INSUFFICIENT_BALANCE') {
            setServerError(
              'The withdrawal amount exceeds your Available Balance. Enter a lower amount.',
            );
          } else if (error instanceof ApiError && error.code === 'PAYOUT_ACCOUNT_UNVERIFIED') {
            setServerError('Choose a verified payout account to continue.');
          } else {
            setServerError(
              apiErrorMessage(error, 'We could not process the withdrawal. Please try again.'),
            );
          }
          void queryClient.invalidateQueries({ queryKey: ['member', 'wallet'] });
          void queryClient.invalidateQueries({ queryKey: ['member', 'payout-accounts'] });
        },
      },
    );
  };

  if (walletQuery.isLoading || accountsQuery.isLoading) {
    return (
      <section>
        <PageHeader
          title="Request a withdrawal"
          actions={
            <Link
              className={styles.backLink}
              to="/member/withdrawals"
              aria-label="Back to withdrawals"
            >
              ← Back to withdrawals
            </Link>
          }
        />

        <div className={styles.loading} role="status">
          <Skeleton />
          <Skeleton />
          <Skeleton />
        </div>
      </section>
    );
  }

  if (walletQuery.isError) {
    return (
      <section>
        <PageHeader
          title="Request a withdrawal"
          actions={
            <Link
              className={styles.backLink}
              to="/member/withdrawals"
              aria-label="Back to withdrawals"
            >
              ← Back to withdrawals
            </Link>
          }
        />

        <ErrorState
          error={walletQuery.error}
          title="Could not load your wallet"
          onRetry={() => void walletQuery.refetch()}
        />
      </section>
    );
  }

  if (accountsQuery.isError) {
    return (
      <section>
        <PageHeader
          title="Request a withdrawal"
          actions={
            <Link
              className={styles.backLink}
              to="/member/withdrawals"
              aria-label="Back to withdrawals"
            >
              ← Back to withdrawals
            </Link>
          }
        />

        <ErrorState
          error={accountsQuery.error}
          title="Could not load your payout accounts"
          onRetry={() => void accountsQuery.refetch()}
        />
      </section>
    );
  }

  if (verifiedAccounts.length === 0) {
    return (
      <section>
        <PageHeader
          title="Request a withdrawal"
          actions={
            <Link
              className={styles.backLink}
              to="/member/withdrawals"
              aria-label="Back to withdrawals"
            >
              ← Back to withdrawals
            </Link>
          }
        />

        <EmptyState
          title="No verified payout account"
          description="Add and confirm a payout account before requesting a withdrawal. Verification typically takes 24-48 hours."
          action={
            <Link to="/member/payouts/new" className={styles.inlineLink}>
              Add a payout account
            </Link>
          }
        />
      </section>
    );
  }

  const accountOptions = verifiedAccounts.map((account) => ({
    value: account.id,
    label: `${payoutMethodLabel(account.method)} · ${account.accountIdentifier ?? account.accountIdentifierMasked}`,
  }));

  const selectedAccount = verifiedAccounts.find((account) => account.id === payoutAccountId);

  return (
    <section>
      <PageHeader
        title="Request a withdrawal"
        actions={
          <Link
            className={styles.backLink}
            to="/member/withdrawals"
            aria-label="Back to withdrawals"
          >
            ← Back to withdrawals
          </Link>
        }
      />

      <p className={styles.balance}>
        Available Balance: <strong>{formatMoney(balance)}</strong>
      </p>

      {serverError ? (
        <Alert variant="danger" title="We could not process the withdrawal">
          {serverError}
        </Alert>
      ) : null}

      <form className={styles.form} noValidate onSubmit={onReview}>
        {suggestions.length > 0 ? (
          <div>
            <p className={styles.suggestLabel} id="withdrawal-suggestions-label">
              Suggested amounts
            </p>
            <div
              className={styles.suggestions}
              role="group"
              aria-labelledby="withdrawal-suggestions-label"
            >
              {suggestions.map((suggestion) => {
                const selected = normalizedAmount !== '' && normalizedAmount === suggestion;
                return (
                  <button
                    key={suggestion}
                    type="button"
                    className={`${styles.suggestion}${selected ? ` ${styles.suggestionActive}` : ''}`}
                    aria-pressed={selected}
                    onClick={() => {
                      setAmount(shapeAmount(suggestion));
                      setErrors((current) => {
                        if (current.amount === undefined) return current;
                        const next = { ...current };
                        delete next.amount;
                        return next;
                      });
                    }}
                  >
                    {formatMoney(suggestion)}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
        <TextField
          id="withdrawal-amount"
          name="amount"
          label="Amount (PHP)"
          value={amount}
          onChange={(value) => setAmount(shapeAmount(value))}
          error={errors.amount}
          hint={
            limits
              ? `Withdraw between ${formatMoney(limits.min)} and ${formatMoney(limits.max)}. The full amount is reserved immediately and cannot be edited after submission.`
              : 'The full amount is reserved immediately and cannot be edited after submission.'
          }
          inputMode="decimal"
          placeholder="0.00"
        />
        {(() => {
          if (!normalizedAmount || !isExactDecimal(normalizedAmount)) return null;
          let availableAfter: string;
          try {
            if (compareMoney(normalizedAmount, '0.00') <= 0 || compareMoney(normalizedAmount, balance) > 0)
              return null;
            if (
              limits &&
              (compareMoney(normalizedAmount, limits.min) < 0 ||
                compareMoney(normalizedAmount, limits.max) > 0)
            )
              return null;
            availableAfter = formatMoney(subtractMoney(balance, normalizedAmount));
          } catch {
            return null;
          }
          return (
            <p className={styles.preview} aria-live="polite">
              Available after: <strong>{availableAfter}</strong>
            </p>
          );
        })()}
        <SelectField
          id="withdrawal-payoutAccountId"
          name="payoutAccountId"
          label="Payout account"
          value={payoutAccountId}
          onChange={setPayoutAccountId}
          options={accountOptions}
          error={errors.payoutAccountId}
          hint="Only verified payout accounts can be used."
        />
        <div className={styles.actions}>
          <Button type="submit" disabled={createMutation.isPending}>
            Review withdrawal
          </Button>
        </div>
      </form>

      <ConfirmDialog
        open={confirmOpen}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={onConfirm}
        title="Request this withdrawal?"
        confirmLabel="Request withdrawal"
        message={
          <>
            <p className={styles.confirmText}>
              Request a withdrawal of{' '}
              <strong>{formatMoney(isExactDecimal(normalizedAmount) ? normalizedAmount : '0.00')}</strong> to your{' '}
              <strong>
                {selectedAccount ? payoutMethodLabel(selectedAccount.method) : 'payout account'}
              </strong>
              ?
            </p>
            <p className={styles.confirmText}>
              The amount will be reserved from your Available Balance and cannot be edited.
            </p>
          </>
        }
      />
    </section>
  );
}
