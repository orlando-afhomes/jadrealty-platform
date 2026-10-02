import { Fragment, type RefObject } from 'react';

import { Button, EmptyState, ErrorState, Skeleton } from '@jad/ui';
import type { Message } from '@jad/contracts';

import { formatDate, formatTime } from '../lib/presentation';
import styles from './MessageThread.module.css';

const dayOf = (iso: string): string => new Date(iso).toDateString();

/** Day divider label for the thread - Today / Yesterday / full date. */
export function dayLabel(iso: string, now: Date): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return formatDate(iso);
  const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((dayStart(now) - dayStart(date)) / 86_400_000);
  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return formatDate(iso);
}

export interface MessageThreadProps {
  messages: Message[];
  threadRef: RefObject<HTMLDivElement | null>;
  hasNextPage: boolean;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  isFetchingNextPage: boolean;
  onLoadOlder: () => void;
  onRetry: () => void;
  /** Extra class on the scroll container (e.g. compact panel sizing). */
  className?: string;
}

/**
 * Chat thread body shared by the Messages page and the floating chat panel:
 * loading skeletons, error, load-older, empty state, and the oldest→newest
 * bubble list with day dividers. Data + scroll ownership stays with the host.
 */
export function MessageThread({
  messages,
  threadRef,
  hasNextPage,
  isLoading,
  isError,
  error,
  isFetchingNextPage,
  onLoadOlder,
  onRetry,
  className,
}: MessageThreadProps) {
  const now = new Date();

  return (
    <div
      className={`${styles.thread} ${className ?? ''}`}
      ref={threadRef}
      aria-live="polite"
      data-testid="message-thread"
    >
      {isLoading ? (
        <div className={styles.loading} role="status" aria-live="polite" aria-busy="true">
          <div className={styles.skeletonRow}>
            <Skeleton className={styles.skeletonBubble} style={{ width: '55%' }} />
          </div>
          <div className={styles.skeletonRowOwn}>
            <Skeleton className={styles.skeletonBubble} style={{ width: '40%' }} />
          </div>
          <div className={styles.skeletonRow}>
            <Skeleton className={styles.skeletonBubble} style={{ width: '68%' }} />
          </div>
        </div>
      ) : isError ? (
        <ErrorState error={error} title="Could not load messages" onRetry={onRetry} />
      ) : (
        <>
          {hasNextPage ? (
            <div className={styles.loadOlder}>
              <Button variant="ghost" onClick={onLoadOlder} disabled={isFetchingNextPage}>
                {isFetchingNextPage ? 'Loading…' : 'Load earlier messages'}
              </Button>
            </div>
          ) : null}
          {messages.length === 0 ? (
            <div className={styles.empty}>
              <EmptyState
                title="No messages yet"
                description="Ask the JA&D admin team anything - they will reply right here."
              />
            </div>
          ) : (
            <ul className={styles.list}>
              {messages.map((message, index) => {
                const own = message.senderType === 'MEMBER';
                const previous = messages[index - 1];
                const showDay = !previous || dayOf(previous.createdAt) !== dayOf(message.createdAt);
                return (
                  <Fragment key={message.id}>
                    {showDay ? (
                      <li className={styles.dayDivider}>
                        <span>{dayLabel(message.createdAt, now)}</span>
                      </li>
                    ) : null}
                    <li className={`${styles.row} ${own ? styles.rowOwn : styles.rowStaff}`}>
                      {!own ? (
                        <span className={styles.threadAvatar} aria-hidden="true">
                          {(message.senderName.trim()[0] ?? 'A').toUpperCase()}
                        </span>
                      ) : null}
                      <div className={`${styles.bubble} ${own ? styles.bubbleOwn : styles.bubbleStaff}`}>
                        <p className={styles.sender}>{own ? 'You' : message.senderName}</p>
                        <p className={styles.body}>{message.body}</p>
                        <time className={styles.meta} dateTime={message.createdAt}>
                          {formatTime(message.createdAt)}
                        </time>
                      </div>
                    </li>
                  </Fragment>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
