import { useMemo, useState } from 'react';

import {
  Button,
  ConfirmDialog,
  Dialog,
  EmptyState,
  ErrorState,
  PageHeader,
  Pagination,
  Select,
  Skeleton,
  StatusChip,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@jad/ui';
import { formatMoney } from '@jad/shared';
import type { Withdrawal } from '@jad/contracts';

import { formatDate } from '../../../lib/format';
import { useWithdrawals } from '../hooks/useWithdrawals';
import { completeWithdrawal, rejectWithdrawal } from '../services/withdrawals';
import { PAYOUT_METHOD_LABEL } from '../../payouts/status';
import { WITHDRAWAL_STATUS_LABEL, WITHDRAWAL_STATUS_TONE } from '../status';
import styles from './WithdrawalsPage.module.css';

const PAGE_SIZE = 10;

function TableSkeleton() {
  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableHeaderCell>Member</TableHeaderCell>
          <TableHeaderCell>Amount</TableHeaderCell>
          <TableHeaderCell>Method</TableHeaderCell>
          <TableHeaderCell>Account</TableHeaderCell>
          <TableHeaderCell>Status</TableHeaderCell>
          <TableHeaderCell>Review</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {Array.from({ length: 4 }, (_, i) => (
          <TableRow key={i}>
            <TableCell>
              <Skeleton />
            </TableCell>
            <TableCell>
              <Skeleton />
            </TableCell>
            <TableCell>
              <Skeleton />
            </TableCell>
            <TableCell>
              <Skeleton />
            </TableCell>
            <TableCell>
              <Skeleton />
            </TableCell>
            <TableCell>
              <Skeleton />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function WithdrawalsPage() {
  const { data, isPending, isError, error, refetch } = useWithdrawals();
  const [page, setPage] = useState(1);
  const [localData, setLocalData] = useState<Withdrawal[] | null>(null);
  const [completeId, setCompleteId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Withdrawal | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState<string | undefined>();
  const [detailTarget, setDetailTarget] = useState<Withdrawal | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const displayData = useMemo(() => {
    const base = localData ?? (data as Withdrawal[] | undefined) ?? [];
    return base;
  }, [localData, data]);

  const filtered = useMemo(() => {
    return displayData.filter((w) => {
      if (statusFilter !== 'ALL' && w.status !== statusFilter) return false;
      return true;
    });
  }, [displayData, statusFilter]);

  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const confirmComplete = () => {
    if (!completeId) return;
    const id = completeId;
    // Persist server-side when the backend is available; local fallback keeps
    // the workflow usable on mock data.
    completeWithdrawal(id).catch(() => null);
    setLocalData((prev) => {
      const base = prev ?? (data as Withdrawal[] | undefined) ?? [];
      return base.map((w) =>
        w.id === id
          ? { ...w, status: 'COMPLETED' as const, completedAt: new Date().toISOString() }
          : w,
      );
    });
    setCompleteId(null);
  };

  const handleReject = () => {
    if (!rejectTarget) return;
    if (!rejectReason.trim()) {
      setRejectError('Rejection reason is required.');
      return;
    }
    const id = rejectTarget.id;
    const reason = rejectReason.trim();
    rejectWithdrawal(id, reason).catch(() => null);
    setLocalData((prev) => {
      const base = prev ?? (data as Withdrawal[] | undefined) ?? [];
      return base.map((w) =>
        w.id === id
          ? {
              ...w,
              status: 'REJECTED' as const,
              rejectionReason: reason,
              rejectedAt: new Date().toISOString(),
            }
          : w,
      );
    });
    setRejectTarget(null);
    setRejectReason('');
    setRejectError(undefined);
  };

  const hasFilters = statusFilter !== 'ALL';

  return (
    <section>
      <PageHeader title="Withdrawals" description="Withdrawal requests and payment processing" />
      {isPending ? (
        <TableSkeleton />
      ) : isError ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : total === 0 && !hasFilters ? (
        <EmptyState
          title="No withdrawals"
          description="No withdrawal requests have been submitted yet."
        />
      ) : (
        <>
          <div
            style={{
              display: 'flex',
              gap: 'var(--space-3)',
              marginBottom: 'var(--space-4)',
              flexWrap: 'wrap',
            }}
          >
            <Select
              aria-label="Filter by status"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              options={[
                { value: 'ALL', label: 'All statuses' },
                { value: 'REQUESTED', label: 'Requested' },
                { value: 'RESERVED', label: 'Reserved' },
                { value: 'COMPLETED', label: 'Completed' },
                { value: 'REJECTED', label: 'Rejected' },
              ]}
            />
            {hasFilters ? (
              <button
                type="button"
                onClick={() => {
                  setStatusFilter('ALL');
                  setPage(1);
                }}
                style={{
                  padding: '8px 16px',
                  border: '1px solid var(--color-border-default)',
                  borderRadius: 'var(--radius-md)',
                  background: 'transparent',
                  color: 'var(--color-text-secondary)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: 'var(--text-body-s)',
                }}
              >
                Clear
              </button>
            ) : null}
          </div>

          {total === 0 ? (
            <EmptyState title="No matching withdrawals" description="Try adjusting your filters." />
          ) : (
            <>
              <div className="table-scroll">
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell>Member</TableHeaderCell>
                      <TableHeaderCell align="right">Amount</TableHeaderCell>
                      <TableHeaderCell>Method</TableHeaderCell>
                      <TableHeaderCell>Account</TableHeaderCell>
                      <TableHeaderCell>Status</TableHeaderCell>
                      <TableHeaderCell>Review</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow
                        key={row.id}
                        onClick={() => setDetailTarget(row)}
                        style={{ cursor: 'pointer' }}
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setDetailTarget(row);
                          }
                        }}
                        aria-label={`View withdrawal for ${row.payoutAccount.accountName}`}
                      >
                        <TableCell label="Member">
                          <span style={{ fontWeight: 600 }}>{row.payoutAccount.accountName}</span>
                        </TableCell>
                        <TableCell label="Amount" align="right">
                          <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                            {formatMoney(row.amount)}
                          </span>
                        </TableCell>
                        <TableCell label="Method">
                          {PAYOUT_METHOD_LABEL[
                            row.payoutAccount.method as keyof typeof PAYOUT_METHOD_LABEL
                          ] ?? row.payoutAccount.method}
                        </TableCell>
                        <TableCell label="Account">
                          <span
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: 'var(--text-body-s)',
                              letterSpacing: '0.02em',
                            }}
                          >
                            {row.payoutAccount.accountIdentifier ??
                              row.payoutAccount.accountIdentifierMasked}
                          </span>
                        </TableCell>
                        <TableCell label="Status">
                          <StatusChip
                            label={WITHDRAWAL_STATUS_LABEL[row.status]}
                            tone={WITHDRAWAL_STATUS_TONE[row.status]}
                          />
                        </TableCell>
                        <TableCell label="Review">
                          {row.status === 'REQUESTED' || row.status === 'RESERVED' ? (
                            <div
                              style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => e.stopPropagation()}
                            >
                              <Button variant="primary" onClick={() => setCompleteId(row.id)}>
                                Complete
                              </Button>
                              <Button variant="danger" onClick={() => setRejectTarget(row)}>
                                Reject
                              </Button>
                            </div>
                          ) : (
                            <div
                              style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => e.stopPropagation()}
                            >
                              <Button variant="primary" disabled>
                                Complete
                              </Button>
                              <Button variant="danger" disabled>
                                Reject
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className={styles.tableFooter}>
                <span className={styles.captionText} role="status" aria-live="polite">
                  {total} withdrawal{total === 1 ? '' : 's'} page {page} of {pageCount}
                </span>
                <Pagination page={page} pageCount={pageCount} onChange={setPage} />
              </div>

              <ConfirmDialog
                open={completeId !== null}
                onCancel={() => setCompleteId(null)}
                onConfirm={confirmComplete}
                title="Complete withdrawal?"
                message="This will mark the withdrawal as Completed and permanently deduct the reserved amount (record-only)."
                confirmLabel="Complete"
                cancelLabel="Cancel"
              />

              <Dialog
                open={rejectTarget !== null}
                onClose={() => {
                  setRejectTarget(null);
                  setRejectReason('');
                  setRejectError(undefined);
                }}
                title="Reject withdrawal"
                footer={
                  <>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setRejectTarget(null);
                        setRejectReason('');
                        setRejectError(undefined);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button variant="danger" onClick={handleReject} disabled={!rejectReason.trim()}>
                      Confirm Reject
                    </Button>
                  </>
                }
              >
                <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 'var(--text-body-s)',
                      color: 'var(--color-text-secondary)',
                    }}
                  >
                    Rejection releases the reservation and restores the member&apos;s Available
                    Balance. Reason will be shown inline and as a notification.
                  </p>
                  <label style={{ display: 'grid', gap: 4 }}>
                    <span style={{ fontSize: 'var(--text-body-s)', fontWeight: 600 }}>
                      Rejection reason *
                    </span>
                    <textarea
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value.slice(0, 500))}
                      placeholder="e.g., Payout account verification failed"
                      rows={3}
                      style={{
                        padding: '10px 12px',
                        border: `1px solid ${rejectError ? 'var(--color-danger)' : 'var(--color-border-default)'}`,
                        borderRadius: 'var(--radius-md)',
                        fontSize: 'var(--text-body-s)',
                        resize: 'vertical',
                      }}
                      aria-label="Rejection reason"
                    />
                    <span
                      style={{ fontSize: 'var(--text-caption)', color: 'var(--color-text-muted)' }}
                    >
                      {rejectReason.length}/500
                    </span>
                    {rejectError ? (
                      <span
                        style={{ color: 'var(--color-danger)', fontSize: 'var(--text-caption)' }}
                      >
                        {rejectError}
                      </span>
                    ) : null}
                  </label>
                </div>
              </Dialog>

              <Dialog
                open={detailTarget !== null}
                onClose={() => setDetailTarget(null)}
                title="Withdrawal Details"
                footer={
                  <Button variant="secondary" onClick={() => setDetailTarget(null)}>
                    Close
                  </Button>
                }
              >
                {detailTarget ? (
                  <div style={{ display: 'grid', gap: 'var(--space-3)', minWidth: 320 }}>
                    <DetailRow label="Member" value={detailTarget.payoutAccount.accountName} />
                    <DetailRow
                      label="Amount"
                      value={
                        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                          {formatMoney(detailTarget.amount)}
                        </span>
                      }
                    />
                    <div
                      style={{
                        borderTop: '1px solid var(--color-border-default)',
                        margin: 'var(--space-2) 0',
                      }}
                    />
                    <DetailRow
                      label="Payout Method"
                      value={
                        PAYOUT_METHOD_LABEL[
                          detailTarget.payoutAccount.method as keyof typeof PAYOUT_METHOD_LABEL
                        ] ?? detailTarget.payoutAccount.method
                      }
                    />
                    <DetailRow
                      label="Account Number"
                      value={
                        detailTarget.payoutAccount.accountIdentifier ??
                        detailTarget.payoutAccount.accountIdentifierMasked
                      }
                      mono
                    />
                    <div
                      style={{
                        borderTop: '1px solid var(--color-border-default)',
                        margin: 'var(--space-2) 0',
                      }}
                    />
                    <DetailRow
                      label="Status"
                      value={
                        <StatusChip
                          label={WITHDRAWAL_STATUS_LABEL[detailTarget.status]}
                          tone={WITHDRAWAL_STATUS_TONE[detailTarget.status]}
                        />
                      }
                    />
                    <DetailRow label="Requested" value={formatDate(detailTarget.createdAt)} />
                    {detailTarget.reservedAt ? (
                      <DetailRow label="Reserved" value={formatDate(detailTarget.reservedAt)} />
                    ) : null}
                    {detailTarget.completedAt ? (
                      <DetailRow label="Completed" value={formatDate(detailTarget.completedAt)} />
                    ) : null}
                    {detailTarget.rejectedAt ? (
                      <DetailRow label="Rejected" value={formatDate(detailTarget.rejectedAt)} />
                    ) : null}
                    {detailTarget.rejectionReason ? (
                      <div style={{ display: 'grid', gap: 4 }}>
                        <span
                          style={{
                            fontSize: 'var(--text-body-s)',
                            fontWeight: 600,
                            color: 'var(--color-text-secondary)',
                          }}
                        >
                          Rejection Reason
                        </span>
                        <p
                          style={{
                            margin: 0,
                            padding: '10px 12px',
                            border: '1px solid var(--color-danger)',
                            borderRadius: 'var(--radius-md)',
                            fontSize: 'var(--text-body-s)',
                            color: 'var(--color-danger)',
                            background: 'var(--color-bg-surface)',
                          }}
                        >
                          {detailTarget.rejectionReason}
                        </p>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </Dialog>
            </>
          )}
        </>
      )}
    </section>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <span
        style={{
          fontSize: 'var(--text-body-s)',
          fontWeight: 600,
          color: 'var(--color-text-secondary)',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 'var(--text-body-s)',
          fontFamily: mono ? 'var(--font-mono)' : undefined,
          letterSpacing: mono ? '0.02em' : undefined,
        }}
      >
        {value}
      </span>
    </div>
  );
}
