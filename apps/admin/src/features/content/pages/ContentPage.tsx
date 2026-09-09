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
  Skeleton,
  StatusChip,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  useToast,
} from '@jad/ui';
import type { ContentKind, ForwardableContent } from '@jad/contracts';

import { env } from '../../../lib/env';
import { formatDate } from '../../../lib/format';
import { getSupabaseClient } from '../../../lib/supabase';
import { useContent } from '../hooks/useContent';
import { useCreateContent } from '../hooks/useCreateContent';
import { useDeleteContent } from '../hooks/useDeleteContent';
import { CONTENT_KIND_LABEL, CONTENT_KIND_TONE } from '../status';
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

const KIND_ACCEPT: Record<ContentKind, string> = {
  DOCUMENT: '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx',
  IMAGE: 'image/jpeg,image/png,image/webp',
  VIDEO: 'video/mp4,video/webm,video/quicktime',
  PROMO: '*/*',
};

const KIND_MAX_SIZE: Record<ContentKind, number> = {
  DOCUMENT: 20 * 1024 * 1024,
  IMAGE: 20 * 1024 * 1024,
  VIDEO: 100 * 1024 * 1024,
  PROMO: 50 * 1024 * 1024,
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Build a specific message for a failed direct-to-Storage PUT. Supabase
 * answers with a JSON `{message}` (e.g. bucket MIME/size rejections) — pass
 * it through so a bucket misconfiguration is diagnosable instead of a dead
 * end; fall back to raw text, then the generic message.
 */
async function putErrorMessage(fileName: string, putRes: Response): Promise<string> {
  const fallback = `"${fileName}" failed to upload. Remove and try again.`;
  try {
    const text = await putRes.text();
    if (!text) return fallback;
    try {
      const parsed = JSON.parse(text) as { message?: unknown; error?: unknown };
      const detail =
        (typeof parsed.message === 'string' && parsed.message) ||
        (typeof parsed.error === 'string' && parsed.error) ||
        '';
      return detail
        ? `"${fileName}": storage rejected the upload (${detail.slice(0, 200)})`
        : fallback;
    } catch {
      return text ? `"${fileName}": storage rejected the upload (${text.slice(0, 200)})` : fallback;
    }
  } catch {
    return fallback;
  }
}

/** Mirror the input `accept` filter so mismatched drops get an explicit error. */
function matchesAccept(file: File, accept: string): boolean {
  const tokens = accept
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  const mime = file.type.toLowerCase();
  const ext = file.name.toLowerCase().split('.').pop() ?? '';
  return tokens.some((token) => {
    if (token.startsWith('.')) return `.${ext}` === token;
    if (token.endsWith('/*')) return mime.startsWith(token.slice(0, -1));
    return mime === token;
  });
}

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

/** Admin Marketing Tools — CRUD list for forwardable content (FR-ADM-003, BR-MKT-002). */
export function ContentPage() {
  const { data, isPending, isError, error, refetch } = useContent();
  const createContent = useCreateContent();
  const deleteContent = useDeleteContent();
  const { toast } = useToast();
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
  const [activeFile, setActiveFile] = useState<{ name: string; phase: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ForwardableContent | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    setFileErrors([]);
    if (selected.length === 0) return;

    const maxSize = KIND_MAX_SIZE[form.kind];
    const accept = KIND_ACCEPT[form.kind];
    const valid: File[] = [];
    const errors: string[] = [];

    for (const f of selected) {
      // The file picker enforces `accept`, but drag-drop and mobile galleries
      // can still deliver mismatched files — reject them with a clear message
      // instead of silently ignoring the selection.
      if (accept !== '*/*' && !matchesAccept(f, accept)) {
        errors.push(`"${f.name}" is not a supported ${form.kind.toLowerCase()} file.`);
      } else if (f.size > maxSize) {
        errors.push(`"${f.name}" must be ${formatBytes(maxSize)} or less.`);
      } else {
        valid.push(f);
      }
    }

    setFiles((prev) => [...prev, ...valid]);
    setFileErrors(errors);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleKindChange = (kind: ContentKind) => {
    setForm((f) => ({ ...f, kind }));
    setFiles([]);
    setFileErrors([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const uploadFile = async (
    selectedFile: File,
    kind: ContentKind,
  ): Promise<{ downloadUrl: string } | { error: string }> => {
    const supabase = getSupabaseClient();
    if (!supabase) return { error: 'Upload unavailable — please reload and try again.' };

    let token: string | undefined;
    try {
      const sess = await supabase.auth.getSession();
      token = sess?.data?.session?.access_token ?? undefined;
    } catch {
      /* proceed without token — sign endpoint handles missing auth */
    }

    let signRes: Response;
    try {
      signRes = await fetch(`${env.VITE_API_BASE_URL}/cms/upload/sign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name: selectedFile.name,
          type: selectedFile.type,
          size: selectedFile.size,
          kind,
        }),
      });
    } catch {
      return { error: `"${selectedFile.name}" could not reach the upload service.` };
    }

    if (!signRes.ok) {
      let message = `"${selectedFile.name}" was rejected for upload.`;
      try {
        const errJson = (await signRes.json()) as { error?: { message?: string } };
        if (errJson?.error?.message) message = `"${selectedFile.name}": ${errJson.error.message}`;
      } catch {
        // keep the generic message when the body is not JSON
      }
      return { error: message };
    }

    const signJson = (await signRes.json()) as { signedUrl: string; publicUrl: string };
    if (!signJson.signedUrl || !signJson.publicUrl) {
      return { error: `"${selectedFile.name}" failed to upload. Remove and try again.` };
    }

    try {
      const putRes = await fetch(signJson.signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': selectedFile.type },
        body: selectedFile,
      });
      if (!putRes.ok) return { error: await putErrorMessage(selectedFile.name, putRes) };
    } catch {
      return { error: `"${selectedFile.name}" failed to upload. Remove and try again.` };
    }

    return { downloadUrl: signJson.publicUrl };
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const result = await deleteContent.mutateAsync(deleteTarget.id);
      toast({
        title: 'Marketing tool deleted',
        message: result.fileRemoved
          ? `"${deleteTarget.title}" was permanently removed, including its uploaded file.`
          : `"${deleteTarget.title}" was permanently removed.`,
        tone: 'success',
      });
    } catch (e) {
      toast({ title: 'Delete failed', message: (e as Error).message, tone: 'danger' });
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleCreate = async () => {
    if (!form.title.trim() || files.length === 0) return;
    setSaving(true);
    setFileErrors([]);

    const failed: string[] = [];
    let created = 0;

    for (const file of files) {
      setActiveFile({ name: file.name, phase: 'Uploading' });
      const uploaded = await uploadFile(file, form.kind);
      if ('error' in uploaded) {
        failed.push(uploaded.error);
        continue;
      }
      setActiveFile({ name: file.name, phase: 'Publishing' });
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

    setActiveFile(null);
    if (failed.length > 0) {
      setFileErrors(failed);
    }
    if (created === 0) {
      setSaving(false);
      return;
    }

    setForm({ title: '', description: '', kind: 'DOCUMENT' });
    setFiles([]);
    if (failed.length === 0) setFileErrors([]);
    // New items sort newest-first, so return to page 1 with no kind filter —
    // otherwise a stale page/filter keeps the just-published item out of view.
    setPage(1);
    setFilter('ALL');
    setSaving(false);
    setShowCreate(false);
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
                      <span className={styles.description}>{row.description ?? '\u2014'}</span>
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
        onClose={() => {
          setShowCreate(false);
          setForm({ title: '', description: '', kind: 'DOCUMENT' });
          setFiles([]);
          setFileErrors([]);
          setActiveFile(null);
        }}
        title="New Marketing Tool"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              loading={saving}
              disabled={!form.title.trim() || files.length === 0 || saving}
            >
              Publish
            </Button>
          </>
        }
      >
        <div className={styles.form}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Title</span>
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="JA&D Project Showcase"
              className={styles.input}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Description</span>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="High-resolution image for social posts"
              className={styles.textarea}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Type</span>
            <select
              value={form.kind}
              onChange={(e) => handleKindChange(e.target.value as ContentKind)}
              className={styles.select}
            >
              <option value="DOCUMENT">Document</option>
              <option value="IMAGE">Image</option>
              <option value="VIDEO">Video</option>
              <option value="PROMO">Promo</option>
            </select>
          </label>
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
              />
            </label>
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
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete marketing tool?"
        message={`This will permanently remove "${deleteTarget?.title ?? ''}" and its uploaded file. This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        danger
      />
    </section>
  );
}
