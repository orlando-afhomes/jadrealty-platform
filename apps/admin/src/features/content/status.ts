import type { ContentKind } from '@jad/contracts';
import type { StatusTone } from '@jad/ui';

export const CONTENT_KIND_LABEL: Record<ContentKind, string> = {
  DOCUMENT: 'Document',
  IMAGE: 'Image',
  VIDEO: 'Video',
  PROMO: 'Promo',
};

export const CONTENT_KIND_TONE: Record<ContentKind, StatusTone> = {
  DOCUMENT: 'info',
  IMAGE: 'success',
  VIDEO: 'warning',
  PROMO: 'danger',
};

/** Per-type helper for the create/edit Type dropdowns: friendly formats + size cap. */
export const CONTENT_KIND_META: Record<ContentKind, { label: string; hint: string }> = {
  DOCUMENT: { label: 'Document', hint: 'PDF, Word, PowerPoint, Excel · 20.0 MB or less' },
  IMAGE: { label: 'Image', hint: 'JPEG, PNG, WebP · 20.0 MB or less' },
  VIDEO: { label: 'Video', hint: 'MP4, WebM, QuickTime · 100.0 MB or less' },
  PROMO: { label: 'Promo', hint: 'Any file type · 50.0 MB or less' },
};

export const CONTENT_KIND_OPTIONS: { value: ContentKind; label: string }[] = (
  Object.keys(CONTENT_KIND_META) as ContentKind[]
).map((value) => ({ value, label: CONTENT_KIND_META[value].label }));
