import type { ButtonHTMLAttributes } from 'react';

import { Icon, type IconName } from './Icon';
import styles from './IconButton.module.css';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  label: string;
  size?: number;
}

/** Icon-only button with an accessible name (44px target, DESIGN-SYSTEM §7.4). */
export function IconButton({ icon, label, size = 20, ...rest }: IconButtonProps) {
  return (
    <button type="button" className={styles.iconButton} aria-label={label} {...rest}>
      <Icon name={icon} size={size} />
    </button>
  );
}
