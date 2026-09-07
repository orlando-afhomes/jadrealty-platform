import type {
  ReactNode,
  TableHTMLAttributes,
  HTMLAttributes,
  ThHTMLAttributes,
  TdHTMLAttributes,
} from 'react';

import styles from './Table.module.css';

/**
 * Responsive table primitives (DESIGN-SYSTEM §6, UI-UX §11). Proper table
 * semantics (caption/thead/tbody/th scope); on small viewports rows collapse to
 * stacked cards using the `label` passed to `TableCell` (never truncating
 * money values). Dense, operational, keyboard/navigation neutral.
 */

export function Table({ className, ...rest }: TableHTMLAttributes<HTMLTableElement>) {
  return <table className={`${styles.table} ${className ?? ''}`} {...rest} />;
}

export function TableHead({ className, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={`${styles.head} ${className ?? ''}`} {...rest} />;
}

export function TableBody({ className, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={`${styles.body} ${className ?? ''}`} {...rest} />;
}

export function TableRow({ className, ...rest }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={`${styles.row} ${className ?? ''}`} {...rest} />;
}

export interface TableHeaderCellProps extends ThHTMLAttributes<HTMLTableCellElement> {
  align?: 'left' | 'center' | 'right';
}

export function TableHeaderCell({ align = 'left', className, ...rest }: TableHeaderCellProps) {
  return (
    <th
      scope="col"
      className={`${styles.header} ${styles[`align-${align}`]} ${className ?? ''}`}
      {...rest}
    />
  );
}

export interface TableCellProps extends TdHTMLAttributes<HTMLTableCellElement> {
  align?: 'left' | 'center' | 'right';
  /** Field label used when the row collapses to a card on small viewports. */
  label?: string;
}

export function TableCell({ align = 'left', label, className, ...rest }: TableCellProps) {
  return (
    <td
      className={`${styles.cell} ${styles[`align-${align}`]} ${className ?? ''}`}
      data-label={label}
      {...rest}
    />
  );
}

export function TableCaption({ className, ...rest }: HTMLAttributes<HTMLTableCaptionElement>) {
  return <caption className={`${styles.caption} ${className ?? ''}`} {...rest} />;
}

export function EmptyRow({ columns, children }: { columns: number; children: ReactNode }) {
  return (
    <TableRow>
      <TableCell colSpan={columns} align="center">
        {children}
      </TableCell>
    </TableRow>
  );
}
