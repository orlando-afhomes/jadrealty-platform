import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { useDialogShell, useScrollToLatest } from '@jad/ui';
import { Icon } from '@jad/ui';
import type { Message } from '@jad/contracts';

import { Alert } from '@/components/Alert';
import { apiErrorMessage } from '../../../lib/api/errorMessage';
import { useSession } from '../../../lib/session';
import {
  useMarkMessagesRead,
  useMessagesPage,
  useMessagesSummary,
  useSendMessage,
} from '../hooks/useMember';
import { MessageComposer } from './MessageComposer';
import { MessageThread } from './MessageThread';
import styles from './MessageChatPanel.module.css';

/**
 * Floating chat panel opened by the member MessageFab (chatbot-style): the
 * same admin thread + composer as the Messages page, without navigating.
 * Escape or the close button dismisses it; body scroll stays unlocked so the
 * page behind remains usable. Opening with unread staff replies marks the
 * thread read, mirroring the page.
 */
export function MessageChatPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const threadQuery = useMessagesPage();
  const summaryQuery = useMessagesSummary();
  const sendMutation = useSendMessage();
  const markReadMutation = useMarkMessagesRead();
  const [draft, setDraft] = useState('');
  const [sendError, setSendError] = useState<string | undefined>();
  const threadRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const markedRef = useRef(false);

  useDialogShell({ open, onClose, panelRef, lockScroll: false });

  // Mark the thread read on open when there are unread staff replies
  // (idempotent server-side; the guard resets on close so reopening re-checks).
  useEffect(() => {
    if (!open) {
      markedRef.current = false;
      return;
    }
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
    open,
    threadQuery.isSuccess,
    threadQuery.data,
    summaryQuery.data,
    markReadMutation,
    queryClient,
    user?.id,
  ]);

  const messages: Message[] = (threadQuery.data?.pages.flatMap((page) => page.items) ?? [])
    .slice()
    .reverse();
  const { scrollToLatest } = useScrollToLatest(threadRef, messages.length);

  const submit = () => {
    if (draft.trim().length === 0 || draft.length > 4000 || sendMutation.isPending) return;
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

  if (!open) return null;

  return (
    <section
      ref={panelRef}
      id="member-chat-panel"
      role="dialog"
      aria-label="Chat with JA&D Admin Team"
      className={styles.panel}
    >
      <header className={styles.header}>
        <span className={styles.avatar} aria-hidden="true">
          <Icon name="message" size={18} />
        </span>
        <div className={styles.identity}>
          <h2 className={styles.name}>JA&D Admin Team</h2>
          <p className={styles.note}>Support from the JA&D admin team.</p>
        </div>
        <button
          type="button"
          className={styles.closeButton}
          onClick={onClose}
          aria-label="Close chat"
        >
          <Icon name="close" size={18} />
        </button>
      </header>

      {sendError ? (
        <div className={styles.alertWrap}>
          <Alert variant="danger" title="Something went wrong">
            {sendError}
          </Alert>
        </div>
      ) : null}

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
        inputId="message-chat-draft"
        compact
      />
    </section>
  );
}
