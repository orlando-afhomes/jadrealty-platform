import { useEffect, useRef, useState } from 'react';

import { Button, Dialog, Icon, Select, notifyError, notifySuccess } from '@jad/ui';
import type { ContentKind, ForwardableContent } from '@jad/contracts';
import { CONTENT_TITLE_MAX, validateContentTitle } from '@jad/contracts';

import { useUpdateContent } from '../hooks/useUpdateContent';
import {
  KIND_ACCEPT,
  KIND_MAX_SIZE,
  fetchRemoteFileSize,
  formatBytes,
  matchesAccept,
  uploadContentFile,
} from '../services/uploads';
import { CONTENT_KIND_META, CONTENT_KIND_OPTIONS } from '../status';
import styles from '../pages/ContentPage.module.css';

const KIND_ICON: Record<ContentKind, 'file-text' | 'image' | 'video' | 'grid'> = {
  DOCUMENT: 'file-text',
  IMAGE: 'image',
  VIDEO: 'video',
  PROMO: 'grid',
};

const MIME_EXTENSION: Record<string, string> = {
  'text/plain': 'TXT',
  'image/jpeg': 'JPG',
  'image/png': 'PNG',
  'image/webp': 'WEBP',
  'image/gif': 'GIF',
  'video/mp4': 'MP4',
  'video/webm': 'WEBM',
  'video/quicktime': 'MOV',
  'application/pdf': 'PDF',
};

/** Display filename for an attached URL (data: URLs carry no filename). */
function fileNameFromUrl(url: string, fallback: string): string {
  try {
    const parsed = new URL(url, 'http://mock.local');
    if (parsed.protocol === 'data:') return fallback;
    const base = decodeURIComponent(parsed.pathname.split('/').pop() ?? '');
    return base || fallback;
  } catch {
    return fallback;
  }
}

/** Display file type for an attached URL: extension, data: mime, else kind. */
function fileTypeFromUrl(url: string, kind: ContentKind): string {
  try {
    const parsed = new URL(url, 'http://mock.local');
    if (parsed.protocol === 'data:') {
      const mime = parsed.pathname.split(',')[0]?.split(';')[0]?.trim().toLowerCase() ?? '';
      const mapped = MIME_EXTENSION[mime];
      if (mapped) return mapped;
    } else {
      const base = parsed.pathname.split('/').pop() ?? '';
      const dot = base.lastIndexOf('.');
      if (dot > 0 && dot < base.length - 1) {
        const ext = base.slice(dot + 1).toLowerCase();
        if (/^[a-z0-9]{2,5}$/.test(ext)) return ext.toUpperCase();
      }
    }
  } catch {
    /* fall through to the kind label */
  }
  return CONTENT_KIND_META[kind].label;
}

/** Display file type for a staged File: extension, else mime, else kind. */
function fileTypeFromFile(file: File, kind: ContentKind): string {
  const base = file.name.split('/').pop() ?? file.name;
  const dot = base.lastIndexOf('.');
  if (dot > 0 && dot < base.length - 1) {
    const ext = base.slice(dot + 1).toLowerCase();
    if (/^[a-z0-9]{2,5}$/.test(ext)) return ext.toUpperCase();
  }
  const mapped = MIME_EXTENSION[file.type.toLowerCase()];
  if (mapped) return mapped;
  return CONTENT_KIND_META[kind].label;
}

/**
 * Edit dialog for a marketing tool (FR-ADM-003): title, description, type,
 * and optional file replacement (uploaded via the same signed-URL flow as
 * create; the server swaps the download URL and removes the superseded
 * bucket object). Shared by the list and detail pages.
 */
export function ContentEditDialog({
  open,
  item,
  onClose,
}: {
  open: boolean;
  item: ForwardableContent | null;
  onClose: () => void;
}) {
  const updateContent = useUpdateContent();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState<ContentKind>('DOCUMENT');
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [uploadPhase, setUploadPhase] = useState<string | null>(null);
  // Best-effort size of the currently attached remote file (null = unknown).
  const [remoteSize, setRemoteSize] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && item) {
      setTitle(item.title);
      setDescription(item.description ?? '');
      setKind(item.kind);
      setFile(null);
      setFileError(undefined);
      setSaving(false);
      setUploadPhase(null);
      setRemoteSize(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      // Best-effort size for the file card (silent when unknown/blocked).
      const url = item.downloadUrl;
      if (url) {
        let cancelled = false;
        void fetchRemoteFileSize(url).then((size) => {
          if (!cancelled) setRemoteSize(size);
        });
        return () => {
          cancelled = true;
        };
      }
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item]);

  if (!item) return null;
  const current: ForwardableContent = item;

  const accept = KIND_ACCEPT[kind];
  const titleError = validateContentTitle(title);
  const titleChanged = title.trim() !== current.title;
  const descriptionChanged = (description.trim() || '') !== (current.description ?? '');
  const kindChanged = kind !== current.kind;
  const dirty = titleChanged || descriptionChanged || kindChanged || file !== null;
  const canSave = dirty && titleError === null && !saving;

  const clearSelection = () => {
    setFile(null);
    setFileError(undefined);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? [])[0];
    setFileError(undefined);
    if (!selected) {
      setFile(null);
      return;
    }
    if (accept !== '*/*' && !matchesAccept(selected, accept)) {
      setFileError(`"${selected.name}" is not a supported ${kind.toLowerCase()} file.`);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    if (selected.size > KIND_MAX_SIZE[kind]) {
      setFileError(`"${selected.name}" must be ${formatBytes(KIND_MAX_SIZE[kind])} or less.`);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setFile(selected);
  };

  const handleSave = async () => {
    if (titleError !== null || saving) return;
    setSaving(true);
    setFileError(undefined);
    try {
      let downloadUrl: string | undefined;
      if (file) {
        setUploadPhase('Uploading');
        const uploaded = await uploadContentFile(file, kind, (phase) => {
          setUploadPhase(
            phase === 'done' ? 'Finishing' : phase === 'signing' ? 'Signing' : 'Uploading',
          );
        });
        if ('error' in uploaded) {
          setFileError(uploaded.error);
          setSaving(false);
          return;
        }
        downloadUrl = uploaded.downloadUrl;
      }
      await updateContent.mutateAsync({
        id: current.id,
        patch: {
          ...(titleChanged && { title: title.trim() }),
          ...(descriptionChanged && { description: description.trim() }),
          ...(kindChanged && { kind }),
          ...(downloadUrl !== undefined && { downloadUrl }),
        },
      });
      notifySuccess({
        title: 'Marketing tool updated',
        message: `"${title.trim()}" was saved${
          typeof downloadUrl === 'string' ? ', including its replacement file' : ''
        }.`,
      });
      onClose();
    } catch (e) {
      notifyError({ title: 'Update failed', message: (e as Error).message });
    } finally {
      setUploadPhase(null);
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!saving) onClose();
      }}
      title={`Edit ${current.title}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} loading={saving} disabled={!canSave}>
            Save
          </Button>
        </>
      }
    >
      <div className={styles.form} aria-busy={saving}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="JA&D Project Showcase"
            className={styles.input}
            maxLength={CONTENT_TITLE_MAX}
            aria-label="Title"
            aria-invalid={titleError !== null}
            aria-describedby={titleError !== null ? 'content-edit-title-error' : undefined}
            disabled={saving}
          />
          {titleError !== null && (
            <span id="content-edit-title-error" role="alert" className={styles.fieldError}>
              {titleError}
            </span>
          )}
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="High-resolution image for social posts"
            className={styles.textarea}
            aria-label="Description"
          />
        </label>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="content-edit-kind">
            Type
          </label>
          <div className={styles.typeSelect}>
            <Select
              id="content-edit-kind"
              aria-label="Type"
              aria-describedby="content-edit-kind-hint"
              options={CONTENT_KIND_OPTIONS}
              value={kind}
              onChange={(e) => setKind(e.target.value as ContentKind)}
              disabled={saving}
            />
          </div>
          <span id="content-edit-kind-hint" className={styles.typeHint}>
            <Icon name={KIND_ICON[kind]} size={14} aria-hidden="true" />
            {CONTENT_KIND_META[kind].hint}
          </span>
        </div>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>File</span>
          {file ? (
            <ul className={styles.fileList} aria-live="polite">
              <li className={styles.fileItem}>
                <span className={styles.fileItemName}>{file.name}</span>
                <span className={styles.fileItemType}>{fileTypeFromFile(file, kind)}</span>
                <span className={styles.fileItemSize}>{formatBytes(file.size)}</span>
                <button
                  type="button"
                  onClick={clearSelection}
                  className={styles.fileItemRemove}
                  aria-label={`Remove ${file.name}`}
                  disabled={saving}
                >
                  <Icon name="close" size={14} />
                </button>
              </li>
            </ul>
          ) : current.downloadUrl ? (
            <ul className={styles.fileList}>
              <li className={styles.fileItem}>
                <span className={styles.fileItemName}>
                  {fileNameFromUrl(current.downloadUrl, current.title)}
                </span>
                <span className={styles.fileItemType}>
                  {fileTypeFromUrl(current.downloadUrl, current.kind)}
                </span>
                <span className={styles.fileItemSize}>
                  {remoteSize !== null ? formatBytes(remoteSize) : '—'}
                </span>
              </li>
            </ul>
          ) : (
            <span style={{ fontSize: 'var(--text-caption)', color: 'var(--color-text-muted)' }}>
              No file attached - upload one below to add it.
            </span>
          )}
          <label className={styles.fileDropzone}>
            <Icon name="download" size={20} className={styles.fileDropzoneIcon} />
            <span className={styles.fileHint}>
              {current.downloadUrl
                ? 'Click to browse or drag a replacement file here'
                : 'Click to browse or drag a file here'}
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept={accept}
              onChange={handleFileChange}
              className={styles.fileInput}
              aria-label="Replacement file"
              disabled={saving}
            />
          </label>
          {saving && uploadPhase && file ? (
            <div className={styles.progressWrap} role="status" aria-live="polite">
              <progress
                className={styles.progressBar}
                aria-label={`Replacing file: ${uploadPhase}`}
              />
              <span className={styles.progressText}>
                Replacing {file.name} — {uploadPhase}…
              </span>
            </div>
          ) : null}
          {fileError ? (
            <div className={styles.fileErrors}>
              <span className={styles.fileError}>{fileError}</span>
            </div>
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}
