import { useMemo, useRef, useState } from 'react';

export interface MemberLocationOption {
  value: string;
  label: string;
}

interface MemberLocationSelectProps {
  id: string;
  label: string;
  /** Selected code ('' = none). */
  value: string;
  options: MemberLocationOption[];
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  required?: boolean;
}

/**
 * Searchable location combobox - the same contract as `/register`'s
 * `SearchableSelect`: only a listed option is ever committed; free text
 * reverts on blur (never submitted), focus clears the field for browsing,
 * Escape reverts, arrows + Enter pick. Keyboard accessible
 * (`combobox` + `listbox` roles).
 */
export function MemberLocationSelect({
  id,
  label,
  value,
  options,
  onChange,
  error,
  hint,
  placeholder = 'Type to search…',
  disabled,
  loading,
  required,
}: MemberLocationSelectProps) {
  const selected = options.find((option) => option.value === value);
  const [text, setText] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const shown = text ?? selected?.label ?? '';
  const filtered = useMemo(() => {
    const q = shown.trim().toLowerCase();
    const matches = q
      ? options.filter((option) => option.label.toLowerCase().includes(q))
      : options;
    return matches.slice(0, 100);
  }, [options, shown]);

  const commit = (next: string) => {
    onChange(next);
    setText(null);
    setOpen(false);
  };

  const revert = () => {
    setText(null);
    setOpen(false);
  };

  const errorId = error ? `${id}-error` : undefined;
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <label htmlFor={id} style={{ fontSize: 'var(--text-body-s)', fontWeight: 600 }}>
        {label} <span style={{ color: 'var(--color-danger)' }}>*</span>
      </label>
      <div
        ref={boxRef}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) revert();
        }}
      >
        <input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-listbox`}
          aria-autocomplete="list"
          aria-required={required}
          aria-invalid={Boolean(error)}
          aria-activedescendant={
            open && filtered.length > 0 ? `${id}-option-${highlight}` : undefined
          }
          aria-describedby={error ? errorId : hint ? `${id}-hint` : undefined}
          value={loading ? 'Loading…' : shown}
          placeholder={placeholder}
          disabled={disabled || loading}
          autoComplete="off"
          onFocus={() => {
            // Clear a filled field so admins can browse the full list; the
            // committed value restores on blur when nothing is picked.
            setText('');
            setOpen(true);
            setHighlight(0);
          }}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
            setHighlight(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              revert();
            } else if (
              e.key === 'ArrowDown' ||
              e.key === 'ArrowUp' ||
              e.key === 'Home' ||
              e.key === 'End'
            ) {
              e.preventDefault();
              setOpen(true);
              setHighlight((h) => {
                if (e.key === 'Home') return 0;
                if (e.key === 'End') return Math.max(0, filtered.length - 1);
                const next = e.key === 'ArrowDown' ? h + 1 : h - 1;
                return Math.max(0, Math.min(filtered.length - 1, next));
              });
            } else if (e.key === 'Enter') {
              const pick = filtered[highlight];
              if (open && pick) {
                // Picking an option must not bubble up to the form's
                // Enter-to-submit handler below.
                e.preventDefault();
                e.stopPropagation();
                commit(pick.value);
              }
            }
          }}
          style={{
            minHeight: 44,
            width: '100%',
            boxSizing: 'border-box',
            padding: '10px 12px',
            border: `1px solid ${error ? 'var(--color-danger)' : 'var(--color-border-default)'}`,
            borderRadius: 'var(--radius-md)',
            fontSize: 'var(--text-body-s)',
          }}
        />
        {open && filtered.length > 0 ? (
          <ul
            id={`${id}-listbox`}
            role="listbox"
            aria-label={label}
            style={{
              margin: '4px 0 0',
              padding: 4,
              listStyle: 'none',
              border: '1px solid var(--color-border-default)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--color-bg-surface-raised)',
              maxHeight: 220,
              overflowY: 'auto',
            }}
          >
            {filtered.map((option, index) => (
              <li
                key={option.value}
                id={`${id}-option-${index}`}
                role="option"
                aria-selected={option.value === value}
                onMouseDown={(e) => {
                  // Commit before blur reverts.
                  e.preventDefault();
                  commit(option.value);
                }}
                onMouseEnter={() => setHighlight(index)}
                style={{
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-sm)',
                  background: index === highlight ? 'var(--color-bg-surface)' : 'transparent',
                  fontWeight: option.value === value ? 600 : 400,
                  cursor: 'pointer',
                  fontSize: 'var(--text-body-s)',
                }}
              >
                {option.label}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {error ? (
        <span
          id={errorId}
          style={{ color: 'var(--color-danger)', fontSize: 'var(--text-caption)' }}
          role="alert"
        >
          {error}
        </span>
      ) : hint ? (
        <span
          id={`${id}-hint`}
          style={{ fontSize: 'var(--text-caption)', color: 'var(--color-text-muted)' }}
        >
          {hint}
        </span>
      ) : null}
    </div>
  );
}
