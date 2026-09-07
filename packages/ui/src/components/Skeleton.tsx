import type { HTMLAttributes } from 'react';

import styles from './Skeleton.module.css';

/** Structured loading placeholder (UI-UX §10 "Loading"). Pure presentational. */
export function Skeleton({ className, style, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`${styles.skeleton} ${className ?? ''}`}
      style={style}
      aria-hidden="true"
      {...rest}
    />
  );
}
