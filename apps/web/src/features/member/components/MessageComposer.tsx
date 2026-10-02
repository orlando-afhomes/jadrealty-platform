import { Button } from '@jad/ui';

import styles from './MessageComposer.module.css';

export interface MessageComposerProps {
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  sending: boolean;
  /** Unique input id (the panel and the page never share one). */
  inputId?: string;
  /** Compact mode for the floating panel: tighter padding, capped textarea. */
  compact?: boolean;
}

/**
 * Chat composer shared by the Messages page and the floating chat panel:
 * draft textarea with Enter-to-send, Send button with pending state, and the
 * hint + character counter footer. Draft ownership stays with the host so
 * send success/error handling (clear-on-success) is unchanged.
 */
export function MessageComposer({
  draft,
  onDraftChange,
  onSend,
  sending,
  inputId = 'message-draft',
  compact = false,
}: MessageComposerProps) {
  const canSend = draft.trim().length > 0 && draft.length <= 4000;

  const submit = () => {
    if (!canSend || sending) return;
    onSend();
  };

  return (
    <div className={`${styles.composer} ${compact ? styles.composerCompact : ''}`}>
      <label className={styles.composerLabel} htmlFor={inputId}>
        New message
      </label>
      <div className={styles.composerRow}>
        <textarea
          id={inputId}
          className={styles.composerInput}
          value={draft}
          maxLength={4000}
          rows={1}
          placeholder="Write a message…"
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <Button onClick={submit} disabled={!canSend || sending}>
          {sending ? 'Sending…' : 'Send'}
        </Button>
      </div>
      {compact ? null : (
        <div className={styles.composerFooter}>
          <span className={styles.hint}>Enter to send · Shift+Enter for a new line</span>
          <span className={styles.counter}>{draft.length}/4000</span>
        </div>
      )}
    </div>
  );
}
