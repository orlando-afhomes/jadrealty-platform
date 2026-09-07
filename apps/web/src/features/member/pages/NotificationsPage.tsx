import { useMemo, useState } from 'react';

import {
  Breadcrumbs,
  Dialog,
  EmptyState,
  ErrorState,
  Icon,
  PageHeader,
  Skeleton,
  StatusChip,
} from '@jad/ui';
import type { Notification } from '@jad/contracts';

import { ButtonLink } from '@/components/ButtonLink';
import { useBroadcasts } from '../hooks/useMember';
import { formatDate } from '../lib/presentation';
import styles from './NotificationsPage.module.css';

type ReadFilter = 'ALL' | 'READ' | 'UNREAD';

const READ_FILTERS: { value: ReadFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'UNREAD', label: 'Unread' },
  { value: 'READ', label: 'Read' },
];

/**
 * Notifications (SCR-MEM-024, FR-ADM-005). The member's broadcast/announcement
 * feed (same data as the dashboard card, full list). Read state is derived from
 * the server-provided `readAt` only. There is no mark-read endpoint, so no
 * client-side read toggling is offered. Production static mock, no dev preview.
 */
export function NotificationsPage() {
  const broadcastsQuery = useBroadcasts();
  const [filter, setFilter] = useState<ReadFilter>('ALL');
  const [viewer, setViewer] = useState<Notification | null>(null);

  const items = broadcastsQuery.data ?? [];
  const filtered = useMemo(() => {
    if (filter === 'ALL') return items;
    if (filter === 'READ') return items.filter((n) => Boolean(n.readAt));
    return items.filter((n) => !n.readAt);
  }, [items, filter]);

  const total = items.length;
  const visible = filtered.length;

  return (
    <section>
      <PageHeader
        title="Notifications"
        description="Updates and announcements from JA&D — latest first."
        actions={
          <div className={styles.headerActions}>
            <ButtonLink to="/member/marketing-tools" variant="secondary">
              View Marketing Tools
            </ButtonLink>
          </div>
        }
      />
      <Breadcrumbs
        items={[
          { label: 'Dashboard', to: '/member' },
          { label: 'Resources' },
          { label: 'Notifications' },
        ]}
      />
      <p className={styles.timeframe}>Latest first · Announcements</p>

      <div className={styles.filters} role="group" aria-label="Filter by read state">
        {READ_FILTERS.map((option) => (
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
        {broadcastsQuery.isLoading
          ? 'Loading notifications…'
          : `Showing ${visible} of ${total} ${total === 1 ? 'notification' : 'notifications'}${filter !== 'ALL' ? ` · ${filter === 'READ' ? 'Read' : 'Unread'}` : ''}`}
      </p>

      {broadcastsQuery.isLoading ? (
        <div className={styles.loading} role="status" aria-live="polite" aria-busy="true">
          <Skeleton />
          <Skeleton />
          <Skeleton />
        </div>
      ) : broadcastsQuery.isError ? (
        <ErrorState
          error={broadcastsQuery.error}
          title="Could not load notifications"
          onRetry={() => void broadcastsQuery.refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState title="No notifications" description="Updates from JA&D will appear here." />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No matches"
          description={`No ${filter === 'READ' ? 'read' : 'unread'} notifications match this filter.`}
          action={
            <button type="button" className={styles.inlineLink} onClick={() => setFilter('ALL')}>
              Clear filter
            </button>
          }
        />
      ) : (
        <ul className={styles.list}>
          {filtered.map((notification) => (
            <li key={notification.id} className={styles.card}>
              <span className={styles.iconWrap} aria-hidden="true">
                <Icon name="bell" size={18} className={styles.icon} />
              </span>
              <div className={styles.cardMain}>
                <span className={styles.title}>{notification.title}</span>
                {notification.body ? (
                  <span className={styles.body}>{notification.body}</span>
                ) : null}
                <span className={styles.meta}>{formatDate(notification.createdAt)}</span>
              </div>
              <div className={styles.cardActions}>
                <StatusChip
                  label={notification.readAt ? 'Read' : 'Unread'}
                  tone={notification.readAt ? 'neutral' : 'info'}
                />
                <button
                  type="button"
                  className={styles.viewButton}
                  onClick={() => setViewer(notification)}
                  aria-label={`View notification: ${notification.title}`}
                >
                  View
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={Boolean(viewer)}
        onClose={() => setViewer(null)}
        title={viewer ? `Notification: ${viewer.title}` : 'Notification'}
      >
        {viewer ? (
          <div className={styles.viewerBody}>
            <p className={styles.viewerTitle}>{viewer.title}</p>
            {viewer.body ? <pre className={styles.viewerText}>{viewer.body}</pre> : null}
            <p className={styles.viewerMeta}>Published {formatDate(viewer.createdAt)}</p>
            <StatusChip
              label={viewer.readAt ? 'Read' : 'Unread'}
              tone={viewer.readAt ? 'neutral' : 'info'}
            />
          </div>
        ) : null}
      </Dialog>
    </section>
  );
}
