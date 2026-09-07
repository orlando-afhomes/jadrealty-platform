import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';

import {
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  PageHeader,
  Pagination,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@jad/ui';
import { formatMoney } from '@jad/shared';
import type { VoucherTemplate } from '@jad/contracts';

import { formatDate } from '../../../lib/format';
import { useVouchers } from '../hooks/useVouchers';
import { useAllVoucherAssignments } from '../hooks/useVoucherAssignments';
import { useDeleteVoucher } from '../hooks/useDeleteVoucher';
import { VoucherFormDialog } from '../components/VoucherFormDialog';
import styles from './VouchersPage.module.css';

const PAGE_SIZE = 10;

function TableSkeleton() {
  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableHeaderCell>Title</TableHeaderCell>
          <TableHeaderCell align="right">Value</TableHeaderCell>
          <TableHeaderCell align="right">Assigned</TableHeaderCell>
          <TableHeaderCell>Expires</TableHeaderCell>
          <TableHeaderCell>Created</TableHeaderCell>
          <TableHeaderCell>Actions</TableHeaderCell>
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

export function VouchersPage() {
  const navigate = useNavigate();
  const { data, isPending, isError, error, refetch } = useVouchers();
  const { data: allAssignments } = useAllVoucherAssignments();
  const assignmentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of allAssignments ?? [])
      counts.set(a.templateId, (counts.get(a.templateId) ?? 0) + 1);
    return counts;
  }, [allAssignments]);
  const deleteMutation = useDeleteVoucher();
  const [page, setPage] = useState(1);
  const [localData, setLocalData] = useState<VoucherTemplate[] | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<VoucherTemplate | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<VoucherTemplate | null>(null);

  const displayData = useMemo(() => {
    return localData ?? (data as VoucherTemplate[] | undefined) ?? [];
  }, [localData, data]);

  const total = displayData.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rows = displayData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleDelete = () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setLocalData((prev) => {
      const base = prev ?? (data as VoucherTemplate[] | undefined) ?? [];
      return base.filter((t) => t.id !== id);
    });
    deleteMutation.mutate(id);
    setDeleteTarget(null);
  };

  const handleFormClose = () => {
    setFormOpen(false);
    setEditTarget(null);
  };

  return (
    <section>
      <PageHeader
        title="Vouchers"
        description="Create voucher templates and assign them to members"
        actions={
          <Button variant="primary" onClick={() => setFormOpen(true)}>
            Create Template
          </Button>
        }
      />
      {isPending ? (
        <TableSkeleton />
      ) : isError ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : total === 0 ? (
        <EmptyState
          title="No voucher templates"
          description="Create a voucher template to start issuing vouchers to members."
          action={
            <Button variant="primary" onClick={() => setFormOpen(true)}>
              Create First Template
            </Button>
          }
        />
      ) : (
        <>
          <div className="table-scroll">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Title</TableHeaderCell>
                  <TableHeaderCell align="right">Value</TableHeaderCell>
                  <TableHeaderCell align="right">Assigned</TableHeaderCell>
                  <TableHeaderCell>Expires</TableHeaderCell>
                  <TableHeaderCell>Created</TableHeaderCell>
                  <TableHeaderCell>Actions</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => {
                  const count = assignmentCounts.get(row.id) ?? 0;
                  return (
                    <TableRow
                      key={row.id}
                      onClick={() => navigate(`/admin/vouchers/${row.id}`)}
                      style={{ cursor: 'pointer' }}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          navigate(`/admin/vouchers/${row.id}`);
                        }
                      }}
                      aria-label={`View ${row.title}`}
                    >
                      <TableCell label="Title">
                        <span style={{ fontWeight: 600 }}>{row.title}</span>
                      </TableCell>
                      <TableCell label="Value" align="right">
                        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                          {formatMoney(row.originalValue)}
                        </span>
                      </TableCell>
                      <TableCell label="Assigned" align="right">
                        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{count}</span>
                      </TableCell>
                      <TableCell label="Expires">
                        {row.expiresAt
                          ? formatDate(row.expiresAt)
                          : row.validityDays
                            ? `${row.validityDays}d`
                            : '—'}
                      </TableCell>
                      <TableCell label="Created">{formatDate(row.createdAt)}</TableCell>
                      <TableCell label="Actions">
                        <div
                          style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          <Button variant="secondary" onClick={() => setEditTarget(row)}>
                            Edit
                          </Button>
                          <Button variant="danger" onClick={() => setDeleteTarget(row)}>
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <div className={styles.tableFooter}>
            <span className={styles.captionText} role="status" aria-live="polite">
              {total} template{total === 1 ? '' : 's'} page {page} of {pageCount}
            </span>
            <Pagination page={page} pageCount={pageCount} onChange={setPage} />
          </div>

          <VoucherFormDialog
            open={formOpen || editTarget !== null}
            onClose={handleFormClose}
            template={editTarget ?? undefined}
          />

          <ConfirmDialog
            open={deleteTarget !== null}
            onCancel={() => setDeleteTarget(null)}
            onConfirm={handleDelete}
            title="Delete voucher template?"
            message={`This will permanently remove "${deleteTarget?.title ?? ''}" and all its assignments. This action cannot be undone.`}
            confirmLabel="Delete"
            cancelLabel="Cancel"
          />
        </>
      )}
    </section>
  );
}
