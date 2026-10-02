import { useMemo, useState } from 'react';

import { Dialog, EmptyState, ErrorState, Icon, PageHeader, Skeleton } from '@jad/ui';
import type { ContentKind, ForwardableContent } from '@jad/contracts';

import { ButtonLink } from '@/components/ButtonLink';
import { useContentLibrary } from '../hooks/useMember';
import { contentKindLabel, formatDate } from '../lib/presentation';
import styles from './ContentLibraryPage.module.css';

type MarketingFilter = 'ALL' | 'FLYER' | 'IMAGE' | 'VIDEO' | 'BROCHURE';

const MARKETING_FILTERS: { value: MarketingFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'FLYER', label: 'Flyers' },
  { value: 'IMAGE', label: 'Images' },
  { value: 'VIDEO', label: 'Videos' },
  { value: 'BROCHURE', label: 'Brochures' },
];

const KIND_ICON: Record<ContentKind, 'file-text' | 'image' | 'video' | 'info'> = {
  DOCUMENT: 'file-text',
  IMAGE: 'image',
  VIDEO: 'video',
  PROMO: 'info',
};

function isPdfUrl(url?: string): boolean {
  if (!url) return false;
  try {
    const u = new URL(url, 'http://mock.local');
    return u.pathname.toLowerCase().endsWith('.pdf');
  } catch {
    return url.toLowerCase().includes('.pdf');
  }
}

function decodeDataUrl(url?: string): string | null {
  if (!url || !url.startsWith('data:')) return null;
  const comma = url.indexOf(',');
  if (comma === -1) return null;
  try {
    return decodeURIComponent(url.slice(comma + 1));
  } catch {
    return url.slice(comma + 1);
  }
}

const EMPTY_SET: ReadonlySet<string> = new Set();

interface CopyLinkButtonProps {
  item: ForwardableContent;
}

/** Icon-only copy of the server-provided share link; check confirms briefly. */
function CopyLinkButton({ item }: CopyLinkButtonProps) {
  const [copied, setCopied] = useState(false);
  const url = item.share?.copyUrl;

  if (!url) return null;

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button
      type="button"
      className={styles.iconButton}
      onClick={onCopy}
      aria-label={copied ? `Copied: ${item.title}` : `Copy link: ${item.title}`}
      aria-live="polite"
      title={copied ? 'Copied' : 'Copy link'}
    >
      <Icon name={copied ? 'check' : 'copy'} size={18} />
    </button>
  );
}

/**
 * WhatsApp share target derived client-side from the server-provided link
 * (title + copy/download URL). Messenger/copy/download stay server-provided.
 */
export function buildWhatsAppUrl(item: ForwardableContent): string | undefined {
  const target = item.share?.copyUrl ?? item.downloadUrl;
  if (!target) return undefined;
  const text = item.title ? `${item.title} ${target}` : target;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

const MIME_EXTENSION: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  'application/pdf': '.pdf',
};

/** File extension (with dot) from a URL path, e.g. `/dummy.pdf` -> `.pdf`. */
function extensionFromUrl(url: string): string | undefined {
  try {
    const base = new URL(url, 'http://mock.local').pathname.split('/').pop() ?? '';
    const dot = base.lastIndexOf('.');
    if (dot > 0 && dot < base.length - 1) {
      const ext = base.slice(dot).toLowerCase();
      if (/^\.[a-z0-9]{2,5}$/.test(ext)) return ext;
    }
  } catch {
    /* unparseable URL - fall through to the content type */
  }
  return undefined;
}

/**
 * Download filename for a marketing asset: sanitized title plus the URL
 * extension, else the content-type extension. Browsers ignore the `download`
 * attribute on cross-origin anchors, so the name is applied to a
 * blob-backed anchor instead (see `downloadItem` below).
 */
export function buildDownloadFileName(
  title: string,
  url: string,
  contentType: string | null,
): string {
  const clean =
    title
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '')
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 100) || 'download';
  const fromUrl = extensionFromUrl(url);
  if (fromUrl) return `${clean}${fromUrl}`;
  const mime = (contentType ?? '').split(';')[0]?.trim().toLowerCase();
  const fromMime = (mime && MIME_EXTENSION[mime]) || '';
  return `${clean}${fromMime}`;
}

/**
 * Marketing Tools (SCR-MEM-022, FR-ADM-003). Admin-uploaded marketing assets
 * (BR-MKT-002) - posters, flyers, images, PDFs, and videos. Every item with a
 * downloadUrl is both viewable (View → Dialog) and downloadable (Download).
 * News/announcements live in Notifications, not here. All share/download URLs
 * are server-provided; external links use rel noopener. No raw HTML.
 */
export function ContentLibraryPage() {
  const contentQuery = useContentLibrary();
  const [filter, setFilter] = useState<MarketingFilter>('ALL');
  const [viewer, setViewer] = useState<ForwardableContent | null>(null);
  const [shareItem, setShareItem] = useState<ForwardableContent | null>(null);
  const [downloadingIds, setDownloadingIds] = useState<ReadonlySet<string>>(EMPTY_SET);

  const items = contentQuery.data ?? [];
  const filtered = useMemo(() => {
    if (filter === 'ALL') return items;
    if (filter === 'IMAGE') return items.filter((i) => i.kind === 'IMAGE');
    if (filter === 'VIDEO') return items.filter((i) => i.kind === 'VIDEO');
    if (filter === 'BROCHURE')
      return items.filter((i) => i.kind === 'DOCUMENT' && isPdfUrl(i.downloadUrl));
    if (filter === 'FLYER')
      return items.filter((i) => i.kind === 'DOCUMENT' && !isPdfUrl(i.downloadUrl));
    return items;
  }, [items, filter]);
  const total = items.length;
  const visibleCount = filtered.length;

  const filterLabel =
    filter === 'ALL' ? null : (MARKETING_FILTERS.find((f) => f.value === filter)?.label ?? filter);

  /**
   * Automatic download: fetch the file as a blob and trigger a same-origin
   * object-URL anchor so the save dialog opens instead of a new tab. A plain
   * `download` attribute is ignored by browsers on cross-origin links, which
   * is why the click previously opened the file. CORS-blocked hosts fall
   * back to a new tab so the file still reaches the member.
   */
  const downloadItem = async (item: ForwardableContent) => {
    const url = item.downloadUrl;
    if (!url || downloadingIds.has(item.id)) return;
    setDownloadingIds((prev) => new Set(prev).add(item.id));
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Download failed with status ${res.status}`);
      const blob = await res.blob();
      const filename = buildDownloadFileName(item.title, url, res.headers.get('content-type'));
      const objectUrl = URL.createObjectURL(blob);
      try {
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    } catch {
      window.open(url, '_blank', 'noopener,noreferrer');
    } finally {
      setDownloadingIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  return (
    <section>
      <PageHeader
        title="Marketing Tools"
        description="Ready-to-share posters, flyers, images, PDFs, and videos - preview before you share or download."
        actions={
          <div className={styles.headerActions}>
            <ButtonLink to="/member/vouchers" variant="secondary">
              View Vouchers
            </ButtonLink>
          </div>
        }
      />

      <div className={styles.filters} role="group" aria-label="Filter by category">
        {MARKETING_FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={filter === option.value ? styles.filterActive : styles.filter}
            aria-pressed={filter === option.value}
            onClick={() => setFilter(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <p className={styles.count} aria-live="polite">
        {contentQuery.isLoading
          ? 'Loading materials…'
          : `Showing ${visibleCount} of ${total} ${total === 1 ? 'item' : 'items'}${filterLabel ? ` · ${filterLabel}` : ''}`}
      </p>

      {contentQuery.isLoading ? (
        <div className={styles.loading} role="status" aria-live="polite" aria-busy="true">
          <Skeleton />
          <Skeleton />
          <Skeleton />
        </div>
      ) : contentQuery.isError ? (
        <ErrorState
          error={contentQuery.error}
          title="Could not load marketing tools"
          onRetry={() => void contentQuery.refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          title="No marketing tools yet"
          description="Approved JA&D marketing materials will appear here."
          icon="image"
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No matches"
          description={`No ${filterLabel?.toLowerCase() ?? 'materials'} match this filter.`}
          icon="search"
          action={
            <button
              type="button"
              className={styles.clearButton}
              onClick={() => setFilter('ALL')}
            >
              <Icon name="close" size={16} aria-hidden="true" />
              Clear filter
            </button>
          }
        />
      ) : (
        <ul className={styles.list}>
          {filtered.map((item) => {
            const isViewable = Boolean(item.downloadUrl);
            const isImage = item.kind === 'IMAGE' && Boolean(item.downloadUrl);
            const isVideo = item.kind === 'VIDEO' && Boolean(item.downloadUrl);
            const isPdf = isPdfUrl(item.downloadUrl);

            return (
              <li key={item.id} className={styles.card}>
                <div className={styles.coverWrap}>
                  {isImage ? (
                    <img
                      src={item.downloadUrl}
                      alt=""
                      aria-hidden="true"
                      className={styles.cover}
                    />
                  ) : isVideo ? (
                    <div className={styles.coverVideo}>
                      <img
                        src="https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800&h=450&fit=crop&auto=format"
                        alt=""
                        aria-hidden="true"
                        className={styles.cover}
                      />
                      <span className={styles.playBadge} aria-hidden="true">
                        <Icon name="video" size={18} />
                      </span>
                    </div>
                  ) : isPdf ? (
                    <div className={styles.coverPdf}>
                      <Icon name="file-text" size={28} aria-hidden="true" />
                      <span className={styles.coverLabel}>PDF</span>
                    </div>
                  ) : (
                    <div className={styles.coverDoc}>
                      <Icon name="file-text" size={28} aria-hidden="true" />
                      <span className={styles.coverLabel}>DOC</span>
                    </div>
                  )}
                  <span className={styles.coverBadge}>{contentKindLabel(item.kind)}</span>
                </div>

                <div className={styles.cardMain}>
                  <span className={styles.kind}>
                    <Icon
                      name={KIND_ICON[item.kind]}
                      size={14}
                      className={styles.kindIcon}
                      aria-hidden="true"
                    />
                    {contentKindLabel(item.kind)}
                  </span>
                  <span className={styles.title}>{item.title}</span>
                  {item.description ? (
                    <span className={styles.description}>{item.description}</span>
                  ) : null}
                  <span className={styles.meta}>Published {formatDate(item.createdAt)}</span>
                </div>
                <div className={styles.actions}>
                  {isViewable ? (
                    <button
                      type="button"
                      className={styles.viewButton}
                      onClick={() => setViewer(item)}
                    >
                      <Icon name="eye" size={16} aria-hidden="true" />
                      View
                    </button>
                  ) : null}
                  {item.downloadUrl ? (
                    <button
                      type="button"
                      className={styles.downloadButton}
                      onClick={() => void downloadItem(item)}
                      disabled={downloadingIds.has(item.id)}
                    >
                      <Icon name="download" size={16} aria-hidden="true" />
                      {downloadingIds.has(item.id) ? 'Downloading…' : 'Download'}
                    </button>
                  ) : null}
                  {item.share?.messengerUrl || buildWhatsAppUrl(item) ? (
                    <button
                      type="button"
                      className={styles.iconButton}
                      onClick={() => setShareItem(item)}
                      aria-label={`Share ${item.title}`}
                      title="Share"
                    >
                      <Icon name="share" size={18} />
                    </button>
                  ) : null}
                  <CopyLinkButton item={item} />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className={styles.note}>Materials are for approved member use only.</p>

      <Dialog
        open={Boolean(viewer)}
        onClose={() => setViewer(null)}
        title={viewer ? `Preview: ${viewer.title}` : 'Preview'}
        footer={
          viewer?.downloadUrl ? (
            <button
              type="button"
              className={styles.downloadButton}
              onClick={() => void downloadItem(viewer)}
              disabled={downloadingIds.has(viewer.id)}
            >
              <Icon name="download" size={16} aria-hidden="true" />
              {downloadingIds.has(viewer.id) ? 'Downloading…' : 'Download'}
            </button>
          ) : undefined
        }
      >
        {viewer ? (
          <div className={styles.viewerBody}>
            {viewer.kind === 'IMAGE' && viewer.downloadUrl ? (
              <img src={viewer.downloadUrl} alt={viewer.title} className={styles.viewerImage} />
            ) : viewer.kind === 'VIDEO' && viewer.downloadUrl ? (
              <video
                controls
                autoPlay
                src={viewer.downloadUrl}
                className={styles.viewerMedia}
                aria-label={viewer.title}
              />
            ) : isPdfUrl(viewer.downloadUrl) ? (
              <iframe src={viewer.downloadUrl} title={viewer.title} className={styles.viewerPdf} />
            ) : viewer.downloadUrl?.startsWith('data:') ? (
              <pre className={styles.viewerText}>{decodeDataUrl(viewer.downloadUrl) ?? ''}</pre>
            ) : viewer.downloadUrl ? (
              <iframe src={viewer.downloadUrl} title={viewer.title} className={styles.viewerPdf} />
            ) : null}
            {viewer.description ? (
              <p className={styles.viewerDescription}>{viewer.description}</p>
            ) : null}
          </div>
        ) : null}
      </Dialog>

      <Dialog
        open={shareItem !== null}
        onClose={() => setShareItem(null)}
        title={shareItem ? `Share “${shareItem.title}”` : 'Share'}
      >
        {shareItem ? (
          <div className={styles.shareBody}>
            <p className={styles.shareHint}>Choose where to share this material.</p>
            <div className={styles.shareOptions}>
              {shareItem.share?.messengerUrl ? (
                <a
                  className={`${styles.shareOption} ${styles.shareMessenger}`}
                  href={shareItem.share.messengerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Icon name="messenger" size={18} data-testid="messenger-icon" />
                  Messenger
                </a>
              ) : null}
              {buildWhatsAppUrl(shareItem) ? (
                <a
                  className={`${styles.shareOption} ${styles.shareWhatsApp}`}
                  href={buildWhatsAppUrl(shareItem)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Icon name="whatsapp" size={18} data-testid="whatsapp-icon" />
                  WhatsApp
                </a>
              ) : null}
            </div>
          </div>
        ) : null}
      </Dialog>
    </section>
  );
}
