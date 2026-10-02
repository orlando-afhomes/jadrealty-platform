import { useState } from 'react';
import { useLocation } from 'react-router';

import { Icon } from '@jad/ui';

import { useMessagesSummary } from '../hooks/useMember';
import { MessageChatPanel } from './MessageChatPanel';
import styles from './MessageFab.module.css';

const UNREAD_DISPLAY_CAP = 99;

/**
 * Floating message button (member panel) + in-place chat panel
 * (chatbot-style). The button toggles the panel - it never navigates, so the
 * member keeps their place. The unread badge mirrors the thread summary.
 * Hidden on the Messages page itself (the full thread owns the viewport
 * there) and lifted above the mobile bottom nav.
 */
export function MessageFab() {
  const location = useLocation();
  const summary = useMessagesSummary();
  const [open, setOpen] = useState(false);
  const unread = summary.data?.unreadCount ?? 0;
  const unreadLabel = unread > UNREAD_DISPLAY_CAP ? `${UNREAD_DISPLAY_CAP}+` : String(unread);

  if (location.pathname.startsWith('/member/messages')) return null;

  return (
    <>
      <button
        type="button"
        className={styles.fab}
        aria-label={`Messages${unread > 0 ? `, ${unreadLabel} unread` : ''}`}
        aria-expanded={open}
        aria-controls="member-chat-panel"
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name={open ? 'close' : 'message'} size={22} />
        {!open && unread > 0 ? (
          <span className={styles.badge} aria-hidden="true">
            {unreadLabel}
          </span>
        ) : null}
      </button>
      <MessageChatPanel open={open} onClose={() => setOpen(false)} />
    </>
  );
}
