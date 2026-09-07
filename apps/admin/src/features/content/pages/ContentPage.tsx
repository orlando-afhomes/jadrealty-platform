import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';

import {
  Button,
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
} from '@jad/ui';
import type { ContentKind, ForwardableContent } from '@jad/contracts';

import { formatDate } from '../../../lib/format';
import { getSupabaseClient } from '../../../lib/supabase';
import { useContent } from '../hooks/useContent';
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
            <TableCell><Skeleton /></TableCell>
            <TableCell><Skeleton /></TableCell>
            <TableCell><Skeleton /></TableCell>
            <TableCell><Skeleton /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** Admin Marketing Tools — CRUD list for forwardable content (FR-ADM-003, BR-MKT-002). */
export function ContentPage() {
  const { data, isPending, isError, error, refetch } = useContent();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<ContentFilter>('ALL');
  const [showCreate, setShowCreate] = useState(false);
  const [localItems, setLocalItems] = useState<ForwardableContent[]>([]);
  const [form, setForm] = useState({
    title: '',
    description: '',
    kind: 'DOCUMENT' as ContentKind,
  });
  const [files, setFiles] = useState<File[]>([]);
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allItems = useMemo(
    () => [...(data ?? []), ...localItems],
    [data, localItems],
  );

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
    const valid: File[] = [];
    const errors: string[] = [];

    for (const f of selected) {
      if (f.size > maxSize) {
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

  const uploadFile = async (selectedFile: File): Promise<string | null> => {
    const supabase = getSupabaseClient();
    if (!supabase) return null;

    let token: string | undefined;
    try {
      const sess = await supabase.auth.getSession();
      token = sess?.data?.session?.access_token ?? undefined;
    } catch {
      /* proceed without token — sign endpoint handles missing auth */
    }

    const signRes = await fetch('/api/v1/cms/upload/sign', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ name: selectedFile.name, type: selectedFile.type, size: selectedFile.size }),
    });

    if (!signRes.ok) return null;

    const signJson = (await signRes.json()) as { signedUrl: string; publicUrl: string };
    if (!signJson.signedUrl) return null;

    const putRes = await fetch(signJson.signedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': selectedFile.type },
      body: selectedFile,
    });

    return putRes.ok ? signJson.publicUrl : null;
  };

  const handleCreate = async () => {
    if (!form.title.trim() || files.length === 0) return;
    setSaving(true);
    setFileErrors([]);

    const newItems: ForwardableContent[] = [];
    const failed: string[] = [];

    for (const file of files) {
      const downloadUrl = await uploadFile(file);
      if (!downloadUrl) {
        failed.push(file.name);
        continue;
      }
      newItems.push({
        id: `cnt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title: form.title,
        description: form.description || undefined,
        kind: form.kind,
        downloadUrl,
        createdAt: new Date().toISOString(),
      });
    }

    if (failed.length > 0) {
      setFileErrors(failed.map((n) => `"${n}" failed to upload. Remove and try again.`));
      if (newItems.length === 0) {
        setSaving(false);
        return;
      }
    }

    setLocalItems((prev) => [...newItems, ...prev]);
    setForm({ title: '', description: '', kind: 'DOCUMENT' });
    setFiles([]);
    setFileErrors([]);
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
            <button type="button" className={styles.inlineLink} onClick={() => handleFilterChange('ALL')}>
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
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => (
                  <TableRow
                    key={row.id}
                    className={styles.row}
                    onClick={() => navigate(`/admin/marketing-tools/${row.id}`)}
                  >
                    <TableCell label="Title">
                      <span className={styles.title}>{row.title}</span>
                    </TableCell>
                    <TableCell label="Kind">
                      <StatusChip
                        label={CONTENT_KIND_LABEL[row.kind]}
                        tone={CONTENT_KIND_TONE[row.kind]}
                        icon={KIND_ICON[row.kind]}
                      />
                    </TableCell>
                    <TableCell label="Description">
                      <span className={styles.description}>
                        {row.description ?? '\u2014'}
                      </span>
                    </TableCell>
                    <TableCell label="Created">
                      <span className={styles.meta}>{formatDate(row.createdAt)}</span>
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
              <span className={styles.fileHint}>
                Click to browse or drag files here
              </span>
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
              <ul className={styles.fileList}>
                {files.map((f, i) => (
                  <li key={`${f.name}-${i}`} className={styles.fileItem}>
                    <span className={styles.fileItemName}>{f.name}</span>
                    <span className={styles.fileItemSize}>{formatBytes(f.size)}</span>
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
                  <span key={i} className={styles.fileError}>{err}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      </Dialog>
    </section>
  );
}
