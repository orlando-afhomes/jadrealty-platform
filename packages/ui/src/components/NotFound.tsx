import type { ReactNode } from 'react';

import { Icon } from './Icon';
import styles from './NotFound.module.css';

export interface NotFoundProps {
  title?: string;
  message?: ReactNode;
  action?: ReactNode;
}

/** Not-found (404) state (UI-UX §10). */
export function NotFound({
  title = 'Page not found',
  message = 'The page you are looking for does not exist or may have moved.',
  action,
}: NotFoundProps) {
  return (
    <div className={styles.state}>
      <span className={styles.icon} aria-hidden="true">
        <Icon name="info" size={24} />
      </span>
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.message}>{message}</p>
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
