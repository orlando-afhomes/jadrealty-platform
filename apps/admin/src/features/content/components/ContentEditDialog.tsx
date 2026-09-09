import { useEffect, useRef, useState } from 'react';

import { Button, Dialog, useToast } from '@jad/ui';
import type { ContentKind, ForwardableContent } from '@jad/contracts';

import { useUpdateContent } from '../hooks/useUpdateContent';
import {
  KIND_ACCEPT,
  KIND_MAX_SIZE,
  formatBytes,
  matchesAccept,
  uploadContentFile,
} from '../services/uploads';
import styles from '../pages/ContentPage.module.css';

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
  const { toast } = useToast();
  const updateContent = useUpdateContent();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState<ContentKind>('DOCUMENT');
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && item) {
      setTitle(item.title);
      setDescription(item.description ?? '');
      setKind(item.kind);
      setFile(null);
      setFileError(undefined);
      setSaving(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [open, item]);

  if (!item) return null;
  const current: ForwardableContent = item;

  const accept = KIND_ACCEPT[kind];
  const titleChanged = title.trim() !== current.title;
  const descriptionChanged = (description.trim() || '') !== (current.description ?? '');
  const kindChanged = kind !== current.kind;
  const dirty = titleChanged || descriptionChanged || kindChanged || file !== null;
  const canSave = dirty && title.trim().length > 0 && !saving;

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
    if (!title.trim() || saving) return;
    setSaving(true);
    setFileError(undefined);
    try {
      let downloadUrl: string | undefined;
      if (file) {
        const uploaded = await uploadContentFile(file, kind);
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
      toast({
        title: 'Marketing tool updated',
        message: `"${title.trim()}" was saved${downloadUrl ? ', including its replacement file' : ''}.`,
        tone: 'success',
      });
      onClose();
    } catch (e) {
      toast({ title: 'Update failed', message: (e as Error).message, tone: 'danger' });
    } finally {
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
      <div className={styles.form}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="JA&D Project Showcase"
            className={styles.input}
            aria-label="Title"
          />
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
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Type</span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as ContentKind)}
            className={styles.select}
            aria-label="Type"
          >
            <option value="DOCUMENT">Document</option>
            <option value="IMAGE">Image</option>
            <option value="VIDEO">Video</option>
            <option value="PROMO">Promo</option>
          </select>
        </label>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Replace file (optional)</span>
          {current.downloadUrl ? (
            <span style={{ fontSize: 'var(--text-caption)', color: 'var(--color-text-muted)' }}>
              Current file:{' '}
              <a href={current.downloadUrl} target="_blank" rel="noopener noreferrer">
                {current.downloadUrl.split('/').pop() ?? current.downloadUrl}
              </a>{' '}
              — uploading a replacement swaps it and removes the old object.
            </span>
          ) : (
            <span style={{ fontSize: 'var(--text-caption)', color: 'var(--color-text-muted)' }}>
              No file attached — upload one to add it.
            </span>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept={accept}
            onChange={handleFileChange}
            className={styles.fileInput}
            aria-label="Replacement file"
          />
          {file ? (
            <span style={{ fontSize: 'var(--text-caption)' }}>
              {file.name} ({formatBytes(file.size)})
            </span>
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
