import { useId, useRef } from 'react';

import styles from './Tabs.module.css';

export interface TabItem {
  value: string;
  label: string;
}

export interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (value: string) => void;
  /** Base id for tab/panel wiring (`aria-controls`). */
  baseId?: string;
  ariaLabel?: string;
}

/**
 * Horizontal tab strip (UI-UX §4.3 in-page tabs). Keyboard: Left/Right/Home/End
 * move selection (roving tabindex); `aria-selected` and panel wiring handled by
 * the caller via `aria-controls` = `${baseId}-${value}-tab`.
 */
export function Tabs({ items, value, onChange, baseId, ariaLabel = 'Tabs' }: TabsProps) {
  const generatedId = useId();
  const id = baseId ?? generatedId;
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const select = (next: string, focus: boolean): void => {
    onChange(next);
    if (focus) refs.current[next]?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>): void => {
    const currentIndex = items.findIndex((item) => item.value === value);
    let next: TabItem | undefined;
    if (event.key === 'ArrowRight') next = items[currentIndex + 1];
    else if (event.key === 'ArrowLeft') next = items[currentIndex - 1];
    else if (event.key === 'Home') next = items[0];
    else if (event.key === 'End') next = items[items.length - 1];

    if (!next) return;
    event.preventDefault();
    select(next.value, true);
  };

  return (
    <div role="tablist" className={styles.tabs} aria-label={ariaLabel}>
      {items.map((item) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            ref={(el) => {
              refs.current[item.value] = el;
            }}
            id={`${id}-${item.value}-tab`}
            role="tab"
            aria-selected={selected}
            aria-controls={`${id}-${item.value}-panel`}
            tabIndex={selected ? 0 : -1}
            className={`${styles.tab} ${selected ? styles.active : ''}`}
            onKeyDown={onKeyDown}
            onClick={() => select(item.value, false)}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
