import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';

import {
  Button,
  ConfirmDialog,
  Dialog,
  EmptyState,
  ErrorState,
  Icon,
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
  notifyError,
  notifySuccess,
} from '@jad/ui';
import type { ContentKind, ForwardableContent } from '@jad/contracts';
import { CONTENT_TITLE_MAX, validateContentTitle } from '@jad/contracts';

import { formatDate } from '../../../lib/format';
import { useContent } from '../hooks/useContent';
import { useCreateContent } from '../hooks/useCreateContent';
import { useDeleteContent } from '../hooks/useDeleteContent';
import { ContentEditDialog } from '../components/ContentEditDialog';
import {
  formatBytes,
  KIND_ACCEPT,
  KIND_MAX_SIZE,
  matchesAccept,
  uploadContentFile,
} from '../services/uploads';
import {
  CONTENT_KIND_LABEL,
  CONTENT_KIND_META,
  CONTENT_KIND_OPTIONS,
  CONTENT_KIND_TONE,
} from '../status';
import styles from './ContentPage.module.css';

type ContentFilter = 'ALL' | ContentKind;

const CONTENT_FILTERS: { value: ContentFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'DOCUMENT', label: 'Documents' },
  { value: 'IMAGE', label: 'Images' },
  { value: 'VIDEO', label: 'Videos' },
  { value: 'PROMO', label: 'Promos' },
];

const PAGE_SIZE = 10;

const KIND_ICON: Record<ContentKind, 'file-text' | 'image' | 'video' | 'grid'> = {
  DOCUMENT: 'file-text',
  IMAGE: 'image',
  VIDEO: 'video',
  PROMO: 'grid',
};

function TableSkeleton() {
  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableHeaderCell>Title</TableHeaderCell>
          <TableHeaderCell>Kind</TableHeaderCell>
          <TableHeaderCell>Description</TableHeaderCell>
          <TableHeaderCell>Created</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {Array.from({ length: 5 }, (_, i) => (
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
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** Admin Marketing Tools - CRUD list for forwardable content (FR-ADM-003, BR-MKT-002). */
export function ContentPage() {
  const { data, isPending, isError, error, refetch } = useContent();
  const createContent = useCreateContent();
  const deleteContent = useDeleteContent();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<ContentFilter>('ALL');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    kind: 'DOCUMENT' as ContentKind,
  });
  const [files, setFiles] = useState<File[]>([]);
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    current: number;
    total: number;
    fileName: string;
    phase: string;
  } | null>(null);
  const [titleTouched, setTitleTouched] = useState(false);
  const [activeFile, setActiveFile] = useState<{ name: string; phase: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ForwardableContent | null>(null);
  const [editTarget, setEditTarget] = useState<ForwardableContent | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const titleError = validateContentTitle(form.title);
  const showTitleError = titleTouched && titleError !== null;
  // Publish stays disabled until the title is valid, at least one file is
  // staged, and no upload/publish run is in flight (`saving` covers the
  // whole sign -> PUT -> create loop, so a click can never race an import).
  const canPublish = titleError === null && files.length > 0 && !saving;

  const allItems = useMemo(() => [...(data ?? [])], [data]);

  const filtered = useMemo(() => {
    if (filter === 'ALL') return allItems;
    return allItems.filter((i) => i.kind === filter);
  }, [allItems, filter]);

  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const filterLabel =
    filter === 'ALL' ? null : (CONTENT_FILTERS.find((f) => f.value === filter)?.label ?? filter);

  const handleFilterChange = (value: ContentFilter) => {
    setFilter(value);
    setPage(1);
  };

  const handleFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    if (selected.length === 0) return;
    setFileErrors([]);

    const maxSize = KIND_MAX_SIZE[form.kind];
    const accept = KIND_ACCEPT[form.kind];
    const seen = new Set(files.map((f) => `${f.name}::${f.size}::${f.lastModified}`));
    const valid: File[] = [];
    const errors: string[] = [];

    for (const f of selected) {
      // The file picker enforces `accept`, but drag-drop and mobile galleries
      // can still deliver mismatched files - reject them with a clear message
      // instead of silently ignoring the selection.
      if (accept !== '*/*' && !matchesAccept(f, accept)) {
        errors.push(`"${f.name}" is not a supported ${form.kind.toLowerCase()} file.`);
      } else if (f.size > maxSize) {
        errors.push(`"${f.name}" must be ${formatBytes(maxSize)} or less.`);
      } else {
        const key = `${f.name}::${f.size}::${f.lastModified}`;
        if (!seen.has(key)) {
          seen.add(key);
          valid.push(f);
        }
      }
    }

    setFiles((prev) => [...prev, ...valid]);
    setFileErrors(errors);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveFile = (index: number) => {
    if (saving) return;
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleKindChange = (kind: ContentKind) => {
    if (saving) return;
    setForm((f) => ({ ...f, kind }));
    setFiles([]);
    setFileErrors([]);
    setUploadProgress(null);
    setActiveFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const result = await deleteContent.mutateAsync(deleteTarget.id);
      notifySuccess({
        title: 'Marketing tool deleted',
        message: result.fileRemoved
          ? `"${deleteTarget.title}" was permanently removed, including its uploaded file.`
          : `"${deleteTarget.title}" was permanently removed.`,
      });
    } catch (e) {
      notifyError({ title: 'Delete failed', message: (e as Error).message });
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleCreate = async () => {
    if (!canPublish) return;
    setSaving(true);
    setFileErrors([]);

    const failed: string[] = [];
    let created = 0;

    try {
      for (let i = 0; i < files.length; i += 1) {
        const file = files[i];
        if (!file) continue;
        setActiveFile({ name: file.name, phase: 'Uploading' });
        setUploadProgress({
          current: i + 1,
          total: files.length,
          fileName: file.name,
          phase: 'Uploading',
        });
        const uploaded = await uploadContentFile(file, form.kind, (phase) => {
          setUploadProgress({
            current: i + 1,
            total: files.length,
            fileName: file.name,
            phase: phase === 'done' ? 'Finishing' : phase === 'signing' ? 'Signing' : 'Uploading',
          });
        });
        if ('error' in uploaded) {
          failed.push(uploaded.error);
          continue;
        }
        setActiveFile({ name: file.name, phase: 'Publishing' });
        setUploadProgress({
          current: i + 1,
          total: files.length,
          fileName: file.name,
          phase: 'Publishing',
        });
        try {
          await createContent.mutateAsync({
            title: form.title.trim(),
            ...(form.description.trim() && { description: form.description.trim() }),
            kind: form.kind,
            downloadUrl: uploaded.downloadUrl,
          });
          created += 1;
        } catch {
          failed.push(`"${file.name}" failed to publish. Remove and try again.`);
        }
      }
    } finally {
      setActiveFile(null);
      setUploadProgress(null);
      setSaving(false);
    }

    if (failed.length > 0) {
      setFileErrors(failed);
    }
    if (created === 0) {
      return;
    }

    setForm({ title: '', description: '', kind: 'DOCUMENT' });
    setTitleTouched(false);
    setFiles([]);
    if (failed.length === 0) setFileErrors([]);
    // New items sort newest-first, so return to page 1 with no kind filter -
    // otherwise a stale page/filter keeps the just-published item out of view.
    setPage(1);
    setFilter('ALL');
    setShowCreate(false);
  };

  const closeCreate = () => {
    // Never tear down mid-upload: the sign -> PUT -> create loop holds
    // `saving` until it settles, and resetting files/form underneath it
    // would orphan uploads and corrupt the next open.
    if (saving) return;
    setShowCreate(false);
    setForm({ title: '', description: '', kind: 'DOCUMENT' });
    setTitleTouched(false);
    setFiles([]);
    setFileErrors([]);
    setUploadProgress(null);
    setActiveFile(null);
  };

  return (
    <section>
      <PageHeader
        title="Marketing Tools"
        description="Ready-to-share posters, flyers, images, PDFs, and videos for member forwarding"
        actions={<Button onClick={() => setShowCreate(true)}>New Content</Button>}
      />

      <div className={styles.filters} role="group" aria-label="Filter by type">
        {CONTENT_FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={filter === option.value ? styles.filterActive : styles.filter}
            aria-pressed={filter === option.value}
            onClick={() => handleFilterChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {isPending ? (
        <TableSkeleton />
      ) : isError ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : allItems.length === 0 ? (
        <EmptyState
          title="No marketing tools"
          description="No marketing materials have been published yet."
        />
      ) : total === 0 ? (
        <EmptyState
          title="No matches"
          description={`No ${filterLabel?.toLowerCase() ?? 'items'} match this filter.`}
          action={
            <button
              type="button"
              className={styles.inlineLink}
              onClick={() => handleFilterChange('ALL')}
            >
              Clear filter
            </button>
          }
        />
      ) : (
        <>
          <div className="table-scroll">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Title</TableHeaderCell>
                  <TableHeaderCell>Kind</TableHeaderCell>
                  <TableHeaderCell>Description</TableHeaderCell>
                  <TableHeaderCell>Created</TableHeaderCell>
                  <TableHeaderCell>Actions</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => (
                  <TableRow
                    key={row.id}
                    className={styles.row}
                    tabIndex={0}
                    onClick={() => navigate(`/admin/marketing-tools/${row.id}`)}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter' && e.key !== ' ') return;
                      if ((e.target as HTMLElement).closest('a')) return;
                      e.preventDefault();
                      navigate(`/admin/marketing-tools/${row.id}`);
                    }}
                  >
                    <TableCell label="Title">
                      <Link
                        to={`/admin/marketing-tools/${row.id}`}
                        className={styles.titleLink}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {row.title}
                      </Link>
                    </TableCell>
                    <TableCell label="Kind">
                      <StatusChip
                        label={CONTENT_KIND_LABEL[row.kind]}
                        tone={CONTENT_KIND_TONE[row.kind]}
                        icon={KIND_ICON[row.kind]}
                      />
                    </TableCell>
                    <TableCell label="Description">
                      <span className={styles.description}>{row.description ?? '-'}</span>
                    </TableCell>
                    <TableCell label="Created">
                      <span className={styles.meta}>{formatDate(row.createdAt)}</span>
                    </TableCell>
                    <TableCell label="Actions">
                      <div
                        style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <Button variant="secondary" onClick={() => setEditTarget(row)}>
                          Edit
                        </Button>
                        <Button
                          variant="danger"
                          onClick={() => setDeleteTarget(row)}
                          aria-label={`Delete ${row.title}`}
                        >
                          Delete
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
              {total} item{total === 1 ? '' : 's'} page {page} of {pageCount}
            </span>
            <Pagination page={page} pageCount={pageCount} onChange={setPage} />
          </div>
        </>
      )}

      <Dialog
        open={showCreate}
        onClose={closeCreate}
        title="New Marketing Tool"
        footer={
          <>
            <Button variant="secondary" onClick={closeCreate} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleCreate} loading={saving} disabled={!canPublish}>
              Publish
            </Button>
          </>
        }
      >
        <div className={styles.form} aria-busy={saving}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Title</span>
            <input
              value={form.title}
              onChange={(e) => {
                setTitleTouched(true);
                setForm((f) => ({ ...f, title: e.target.value }));
              }}
              onBlur={() => setTitleTouched(true)}
              placeholder="JA&D Project Showcase"
              className={styles.input}
              maxLength={CONTENT_TITLE_MAX}
              aria-invalid={showTitleError}
              aria-describedby={showTitleError ? 'content-title-error' : undefined}
              disabled={saving}
            />
            {showTitleError && (
              <span id="content-title-error" role="alert" className={styles.fieldError}>
                {titleError}
              </span>
            )}
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Description</span>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="High-resolution image for social posts"
              className={styles.textarea}
              disabled={saving}
            />
          </label>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="content-kind">
              Type
            </label>
            <div className={styles.typeSelect}>
              <Select
                id="content-kind"
                aria-label="Type"
                aria-describedby="content-kind-hint"
                options={CONTENT_KIND_OPTIONS}
                value={form.kind}
                onChange={(e) => handleKindChange(e.target.value as ContentKind)}
                disabled={saving}
              />
            </div>
            <span id="content-kind-hint" className={styles.typeHint}>
              <Icon name={KIND_ICON[form.kind]} size={14} aria-hidden="true" />
              {CONTENT_KIND_META[form.kind].hint}
            </span>
          </div>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Files (required)</span>
            <label className={styles.fileDropzone}>
              <Icon name="download" size={20} className={styles.fileDropzoneIcon} />
              <span className={styles.fileHint}>Click to browse or drag files here</span>
              <input
                ref={fileInputRef}
                type="file"
                accept={KIND_ACCEPT[form.kind]}
                multiple
                onChange={handleFilesChange}
                className={styles.fileInput}
                disabled={saving}
              />
            </label>
            {saving && uploadProgress && (
              <div className={styles.progressWrap} role="status" aria-live="polite">
                <progress
                  className={styles.progressBar}
                  max={uploadProgress.total}
                  value={uploadProgress.current - 1}
                  aria-label={`Uploading ${uploadProgress.current} of ${uploadProgress.total}`}
                />
                <span className={styles.progressText}>
                  Uploading {uploadProgress.current} of {uploadProgress.total}:{' '}
                  {uploadProgress.fileName} — {uploadProgress.phase}…
                </span>
              </div>
            )}
            {files.length > 0 && (
              <ul className={styles.fileList} aria-live="polite">
                {files.map((f, i) => (
                  <li key={`${f.name}-${i}`} className={styles.fileItem}>
                    <span className={styles.fileItemName}>{f.name}</span>
                    <span className={styles.fileItemSize}>{formatBytes(f.size)}</span>
                    {saving && activeFile?.name === f.name && (
                      <span className={styles.fileItemStatus}>{activeFile.phase}…</span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleRemoveFile(i)}
                      className={styles.fileItemRemove}
                      aria-label={`Remove ${f.name}`}
                      disabled={saving}
                    >
                      <Icon name="close" size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {fileErrors.length > 0 && (
              <div className={styles.fileErrors}>
                {fileErrors.map((err, i) => (
                  <span key={i} className={styles.fileError}>
                    {err}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onCancel={() => {
          // Never tear down mid-delete: the confirm button holds the
          // mutation's pending spinner until it settles.
          if (deleteContent.isPending) return;
          setDeleteTarget(null);
        }}
        onConfirm={handleDelete}
        title="Delete marketing tool?"
        message={`This will permanently remove "${deleteTarget?.title ?? ''}" and its uploaded file. This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        danger
        confirmDisabled={deleteContent.isPending}
        confirmLoading={deleteContent.isPending}
      />

      <ContentEditDialog
        open={editTarget !== null}
        item={editTarget}
        onClose={() => setEditTarget(null)}
      />
    </section>
  );
}
