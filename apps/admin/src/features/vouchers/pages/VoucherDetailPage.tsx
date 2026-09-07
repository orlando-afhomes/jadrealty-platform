import { useState } from 'react';
import { useParams, useNavigate } from 'react-router';

import {
  Button,
  ConfirmDialog,
  Dialog,
  EmptyState,
  ErrorState,
  PageHeader,
  Pagination,
  Skeleton,
  StatusChip,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@jad/ui';
import { formatMoney, isExpired } from '@jad/shared';
import type { VoucherAssignment } from '@jad/contracts';

import { formatDate } from '../../../lib/format';
import { useVoucherAssignments } from '../hooks/useVoucherAssignments';
import { useVoucherTemplate } from '../hooks/useVoucherTemplate';
import { useDeleteAssignment } from '../hooks/useDeleteAssignment';
import { VoucherAssignFormDialog } from '../components/VoucherAssignFormDialog';
import { VOUCHER_STATUS_LABEL, VOUCHER_STATUS_TONE } from '../status';
import styles from './VoucherDetailPage.module.css';

const PAGE_SIZE = 10;

export function VoucherDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data: template, isPending: templatePending } = useVoucherTemplate(id);
  const { data: assignments, isPending, isError, error, refetch } = useVoucherAssignments(id);
  const deleteAssignmentMutation = useDeleteAssignment(id);

  const [page, setPage] = useState(1);
  const [assignOpen, setAssignOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<VoucherAssignment | null>(null);
  const [detailTarget, setDetailTarget] = useState<VoucherAssignment | null>(null);
  const [copied, setCopied] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);

  const allAssignments = assignments ?? [];
  const total = allAssignments.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rows = allAssignments.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (templatePending) {
    return (
      <section>
        <PageHeader title="Voucher template" description="Loading template details…" />
        <Skeleton />
      </section>
    );
  }

  if (!template) {
    return (
      <section>
        <PageHeader title="Voucher not found" />
        <ErrorState
          error={new Error('Template not found')}
          title="Voucher template not found"
          onRetry={() => navigate('/admin/vouchers')}
        />
      </section>
    );
  }

  const handleDeleteAssignment = () => {
    if (!deleteTarget) return;
    deleteAssignmentMutation.mutate(deleteTarget.id);
    setDeleteTarget(null);
    if (detailTarget?.id === deleteTarget.id) setDetailTarget(null);
  };

  return (
    <section>
      <PageHeader
        title={template.title}
        description="Voucher template details and member assignments"
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate('/admin/vouchers')}>
              All Templates
            </Button>
            <Button variant="primary" onClick={() => setAssignOpen(true)}>
              Assign to Member
            </Button>
          </>
        }
      />

      <div className={styles.templateInfo}>
        <DetailRow label="Title" value={template.title} />
        <DetailRow
          label="Original Value"
          value={
            <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
              {formatMoney(template.originalValue)}
            </span>
          }
        />
        <DetailRow
          label="Expiry Rule"
          value={
            template.expiresAt
              ? `Fixed date: ${formatDate(template.expiresAt)}`
              : template.validityDays
                ? `Valid ${template.validityDays} days from issuance`
                : 'No expiry'
          }
        />
        <DetailRow label="Created" value={formatDate(template.createdAt)} />
        <DetailRow
          label="Total Assigned"
          value={<span style={{ fontWeight: 600 }}>{total}</span>}
        />
      </div>

      <h3 className={styles.sectionTitle}>Assigned Members</h3>

      {isPending ? (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Member</TableHeaderCell>
              <TableHeaderCell>Code</TableHeaderCell>
              <TableHeaderCell align="right">Remaining</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell>Assigned</TableHeaderCell>
              <TableHeaderCell>Actions</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {Array.from({ length: 3 }, (_, i) => (
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
      ) : isError ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : total === 0 ? (
        <EmptyState
          title="No assignments yet"
          description="Assign this voucher template to members to generate unique codes and QR codes."
          action={
            <Button variant="primary" onClick={() => setAssignOpen(true)}>
              Assign to Member
            </Button>
          }
        />
      ) : (
        <>
          <div className="table-scroll">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Member</TableHeaderCell>
                  <TableHeaderCell>Code</TableHeaderCell>
                  <TableHeaderCell align="right">Remaining</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                  <TableHeaderCell>Assigned</TableHeaderCell>
                  <TableHeaderCell>Actions</TableHeaderCell>
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
                    aria-label={`View voucher for ${row.memberName}`}
                  >
                    <TableCell label="Member">
                      <span style={{ fontWeight: 600 }}>{row.memberName}</span>
                    </TableCell>
                    <TableCell label="Code">
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 'var(--text-body-s)',
                          letterSpacing: '0.02em',
                        }}
                      >
                        {row.code}
                      </span>
                    </TableCell>
                    <TableCell label="Remaining" align="right">
                      <span
                        style={{
                          fontVariantNumeric: 'tabular-nums',
                          fontWeight: 700,
                          color:
                            row.remainingValue === '0.00'
                              ? 'var(--color-text-muted)'
                              : 'var(--color-brand-primary)',
                        }}
                      >
                        {formatMoney(row.remainingValue)}
                      </span>
                    </TableCell>
                    <TableCell label="Status">
                      <div
                        style={{
                          display: 'flex',
                          gap: 'var(--space-2)',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                        }}
                      >
                        <StatusChip
                          label={VOUCHER_STATUS_LABEL[row.status]}
                          tone={VOUCHER_STATUS_TONE[row.status]}
                        />
                        {row.status === 'ACTIVE' && isExpired(row.expiresAt) ? (
                          <StatusChip label="Expired" tone="warning" />
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell label="Assigned">{formatDate(row.createdAt)}</TableCell>
                    <TableCell label="Actions">
                      <div
                        style={{ display: 'flex', gap: 'var(--space-2)' }}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <Button variant="danger" onClick={() => setDeleteTarget(row)}>
                          Revoke
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className={styles.tableFooter}>
            <span className={styles.captionText} role="status" aria-live="polite">
              {total} assignment{total === 1 ? '' : 's'} page {page} of {pageCount}
            </span>
            <Pagination page={page} pageCount={pageCount} onChange={setPage} />
          </div>
        </>
      )}

      <VoucherAssignFormDialog
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        templateId={id}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDeleteAssignment}
        title="Revoke voucher?"
        message={`This will permanently revoke the voucher (${deleteTarget?.code ?? ''}) assigned to ${deleteTarget?.memberName ?? ''}. This action cannot be undone.`}
        confirmLabel="Revoke"
        cancelLabel="Cancel"
      />

      <Dialog
        open={detailTarget !== null}
        onClose={() => {
          setDetailTarget(null);
          setCopied(false);
        }}
        title="Voucher Details"
        footer={
          <Button
            variant="secondary"
            onClick={() => {
              setDetailTarget(null);
              setCopied(false);
            }}
          >
            Close
          </Button>
        }
      >
        {detailTarget ? (
          <div style={{ display: 'grid', gap: 'var(--space-3)', minWidth: 340 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
              <button
                type="button"
                onClick={() => setQrOpen(true)}
                style={{
                  background: 'none',
                  border: '1px solid var(--color-border-default)',
                  borderRadius: 'var(--radius-md)',
                  padding: 4,
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
                aria-label={`View QR code for ${detailTarget.code} enlarged`}
              >
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(detailTarget.code)}`}
                  alt={`QR code for ${detailTarget.code}`}
                  style={{
                    display: 'block',
                    width: 120,
                    height: 120,
                    borderRadius: 'var(--radius-sm)',
                  }}
                  loading="lazy"
                />
              </button>
              <div style={{ display: 'grid', gap: 4 }}>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--text-body-s)',
                    fontWeight: 600,
                    letterSpacing: '0.02em',
                  }}
                >
                  {detailTarget.code}
                </span>
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(detailTarget.code);
                        setCopied(true);
                        window.setTimeout(() => setCopied(false), 1600);
                      } catch {
                        /* noop */
                      }
                    }}
                    style={{
                      padding: '4px 10px',
                      border: '1px solid var(--color-border-default)',
                      borderRadius: 'var(--radius-sm)',
                      background: 'transparent',
                      fontSize: 'var(--text-caption)',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {copied ? 'Copied' : 'Copy code'}
                  </button>
                  <a
                    href={`https://api.qrserver.com/v1/create-qr-code/?size=360x360&data=${encodeURIComponent(detailTarget.code)}`}
                    download={`${detailTarget.code}.png`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      padding: '4px 10px',
                      border: '1px solid var(--color-border-default)',
                      borderRadius: 'var(--radius-sm)',
                      background: 'transparent',
                      fontSize: 'var(--text-caption)',
                      fontWeight: 600,
                      textDecoration: 'none',
                      color: 'var(--color-text-primary)',
                    }}
                  >
                    Download QR
                  </a>
                </div>
              </div>
            </div>

            <div
              style={{
                borderTop: '1px solid var(--color-border-default)',
                margin: 'var(--space-2) 0',
              }}
            />

            <DetailRow label="Member" value={detailTarget.memberName} />
            <DetailRow label="Title" value={detailTarget.title} />
            <DetailRow
              label="Original Value"
              value={
                <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                  {formatMoney(detailTarget.originalValue)}
                </span>
              }
            />
            <DetailRow
              label="Remaining Value"
              value={
                <span
                  style={{
                    fontVariantNumeric: 'tabular-nums',
                    fontWeight: 700,
                    color:
                      detailTarget.remainingValue === '0.00'
                        ? 'var(--color-text-muted)'
                        : 'var(--color-brand-primary)',
                  }}
                >
                  {formatMoney(detailTarget.remainingValue)}
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
              label="Status"
              value={
                <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                  <StatusChip
                    label={VOUCHER_STATUS_LABEL[detailTarget.status]}
                    tone={VOUCHER_STATUS_TONE[detailTarget.status]}
                  />
                  {detailTarget.status === 'ACTIVE' && isExpired(detailTarget.expiresAt) ? (
                    <StatusChip label="Expired" tone="warning" />
                  ) : null}
                </div>
              }
            />
            <DetailRow label="Assigned" value={formatDate(detailTarget.createdAt)} />
            <DetailRow
              label="Expires"
              value={detailTarget.expiresAt ? formatDate(detailTarget.expiresAt) : 'No expiry'}
            />
          </div>
        ) : null}
      </Dialog>

      <Dialog
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        title={`QR code — ${detailTarget?.code ?? 'Voucher'}`}
        footer={
          detailTarget ? (
            <a
              href={`https://api.qrserver.com/v1/create-qr-code/?size=360x360&data=${encodeURIComponent(detailTarget.code)}`}
              download={`${detailTarget.code}.png`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: '8px 16px',
                border: '1px solid var(--color-border-default)',
                borderRadius: 'var(--radius-md)',
                background: 'transparent',
                fontSize: 'var(--text-body-s)',
                fontWeight: 600,
                textDecoration: 'none',
                color: 'var(--color-text-primary)',
                display: 'inline-block',
              }}
            >
              Download QR
            </a>
          ) : undefined
        }
      >
        {detailTarget ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 'var(--space-3)',
            }}
          >
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=360x360&data=${encodeURIComponent(detailTarget.code)}`}
              alt={`QR code for ${detailTarget.code} large`}
              style={{ width: 360, height: 360, borderRadius: 'var(--radius-md)' }}
            />
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-body-s)',
                fontWeight: 600,
                letterSpacing: '0.02em',
              }}
            >
              {detailTarget.code}
            </span>
          </div>
        ) : null}
      </Dialog>
    </section>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
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
      <span style={{ fontSize: 'var(--text-body-s)' }}>{value}</span>
    </div>
  );
}
