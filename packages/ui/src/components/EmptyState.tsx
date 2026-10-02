import type { ReactNode } from 'react';

import { Icon, type IconName } from './Icon';
import styles from './EmptyState.module.css';

export interface EmptyStateProps {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  /** Optional illustrative badge shown above the title (decorative). */
  icon?: IconName;
}

/** Dense empty state for operational screens (UI-UX §10 "Empty"). */
export function EmptyState({ title, description, action, icon }: EmptyStateProps) {
  return (
    <div className={styles.empty}>
      {icon ? (
        <span className={styles.iconWrap} aria-hidden="true">
          <Icon name={icon} size={28} />
        </span>
      ) : null}
      <h3 className={styles.title}>{title}</h3>
      {description ? <p className={styles.description}>{description}</p> : null}
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
