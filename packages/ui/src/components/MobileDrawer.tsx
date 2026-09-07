import { createPortal } from 'react-dom';
import { useRef, type ReactNode } from 'react';

import { useDialogShell } from '../hooks/useDialogShell';
import styles from './MobileDrawer.module.css';

export interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  label?: string;
}

/** Side navigation drawer for tablet/mobile (UI-UX §4.6). Focus trap + Escape. */
export function MobileDrawer({ open, onClose, children, label = 'Navigation' }: MobileDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useDialogShell({ open, onClose, panelRef });

  if (!open) return null;

  return createPortal(
    <div className={styles.root}>
      <div className={styles.backdrop} onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
      >
        <div className={styles.content}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}
