import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { Icon, PageHeader, useScrollToLatest } from '@jad/ui';
import type { Message } from '@jad/contracts';

import { Alert } from '@/components/Alert';
import { ButtonLink } from '@/components/ButtonLink';
import { apiErrorMessage } from '../../../lib/api/errorMessage';
import { useSession } from '../../../lib/session';
import {
  useMarkMessagesRead,
  useMessagesPage,
  useMessagesSummary,
  useSendMessage,
} from '../hooks/useMember';
import { MessageComposer } from '../components/MessageComposer';
import { MessageThread } from '../components/MessageThread';
import styles from './MessagesPage.module.css';

/**
 * Messages (SCR-MEM Messages, FEAT-072, ADR-013). One thread with the JA&D
 * admin team, newest-first via the API but rendered oldest→newest (standard
 * chat). Live staff replies arrive via `useMessagesRealtime`; opening the
 * thread marks it read (member watermark). Sends are optimistic-free: the
 * mutation posts, then the thread + summary queries invalidate.
 */
export function MessagesPage() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const threadQuery = useMessagesPage();
  const summaryQuery = useMessagesSummary();
  const sendMutation = useSendMessage();
  const markReadMutation = useMarkMessagesRead();
  const [draft, setDraft] = useState('');
  const [sendError, setSendError] = useState<string | undefined>();
  const threadRef = useRef<HTMLDivElement | null>(null);
  const markedRef = useRef(false);

  // Mark the thread read on first successful load when there are unread
  // staff replies (idempotent server-side; ref-guard prevents repeats).
  useEffect(() => {
    if (markedRef.current) return;
    if (!threadQuery.isSuccess || threadQuery.data.pages.length === 0) return;
    if (summaryQuery.data && summaryQuery.data.unreadCount > 0) {
      markedRef.current = true;
      markReadMutation.mutate(undefined, {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: ['member', 'messages', 'summary', user?.id],
          });
        },
      });
    }
  }, [
    threadQuery.isSuccess,
    threadQuery.data,
    summaryQuery.data,
    markReadMutation,
    queryClient,
    user?.id,
  ]);

  // Scroll to the newest message on open; follow new arrivals only while
  // the reader is near the bottom; always jump after the user's own send.
  const messages: Message[] = (threadQuery.data?.pages.flatMap((page) => page.items) ?? [])
    .slice()
    .reverse();
  const { scrollToLatest } = useScrollToLatest(threadRef, messages.length);

  const canSend = draft.trim().length > 0 && draft.length <= 4000;

  const submit = () => {
    if (!canSend || sendMutation.isPending) return;
    setSendError(undefined);
    sendMutation.mutate(
      { body: draft },
      {
        onSuccess: () => {
          setDraft('');
          scrollToLatest();
        },
        onError: (error) => {
          setSendError(apiErrorMessage(error, 'We could not send your message.'));
        },
      },
    );
  };
  return (
    <section>
      <PageHeader
        title="Messages"
        description="One-to-one chat with the JA&D admin team."
        actions={
          <ButtonLink to="/member" variant="ghost">
            ← Back to Dashboard
          </ButtonLink>
        }
      />

      {sendError ? (
        <Alert variant="danger" title="Something went wrong">
          {sendError}
        </Alert>
      ) : null}

      <div className={styles.conversation}>
        <header className={styles.conversationHeader}>
          <span className={styles.teamAvatar} aria-hidden="true">
            <Icon name="message" size={18} />
          </span>
          <div className={styles.identity}>
            <h2 className={styles.identityName}>JA&D Admin Team</h2>
            <p className={styles.identityNote}>Support from the JA&D admin team.</p>
          </div>
        </header>

        <MessageThread
          messages={messages}
          threadRef={threadRef}
          hasNextPage={threadQuery.hasNextPage ?? false}
          isLoading={threadQuery.isLoading}
          isError={threadQuery.isError}
          error={threadQuery.error}
          isFetchingNextPage={threadQuery.isFetchingNextPage}
          onLoadOlder={() => void threadQuery.fetchNextPage()}
          onRetry={() => void threadQuery.refetch()}
          className={styles.threadSize}
        />

        <MessageComposer
          draft={draft}
          onDraftChange={setDraft}
          onSend={submit}
          sending={sendMutation.isPending}
        />
      </div>
    </section>
  );
}
