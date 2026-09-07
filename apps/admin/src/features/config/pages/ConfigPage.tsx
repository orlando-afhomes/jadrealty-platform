import { useState } from 'react';

import { Button, Dialog, EmptyState, ErrorState, IconButton, Icon, PageHeader, Skeleton } from '@jad/ui';
import { formatMoney } from '@jad/shared';

import type { MockConfigEntry } from '../../../mock/data';
import { useConfig } from '../hooks/useConfig';
import { usePrograms } from '../hooks/usePrograms';
import styles from './ConfigPage.module.css';

function formatValue(key: string, value: string): string {
  if (key.includes('COMMISSION') || key.includes('RATE')) {
    const num = Number(value);
    if (!Number.isNaN(num)) return `${(num * 100).toFixed(2)}%`;
  }
  if (key.includes('WITHDRAWAL_AMOUNT')) {
    const num = Number(value);
    if (!Number.isNaN(num)) return formatMoney(value);
  }
  if (key.includes('EXPIRY')) return `${value} days`;
  return value;
}

function parseDisplayValue(key: string, value: string): string {
  if (key.includes('COMMISSION') || key.includes('RATE')) {
    const num = Number(value);
    if (!Number.isNaN(num)) return (num * 100).toFixed(2);
  }
  return value;
}

function validateEntry(key: string, rawValue: string): string | null {
  const trimmed = rawValue.trim();
  if (!trimmed) return 'Value is required';
  const num = Number(trimmed);
  if (Number.isNaN(num)) return 'Must be a number';

  if (key.includes('COMMISSION') || key.includes('RATE')) {
    if (num < 0 || num > 100) return 'Rate must be between 0 and 100';
  }
  if (key.includes('WITHDRAWAL_AMOUNT')) {
    if (num < 0) return 'Amount cannot be negative';
  }
  if (key.includes('MIN_AGE')) {
    if (!Number.isInteger(num) || num < 1) return 'Must be a positive integer';
  }
  if (key.includes('SALES') || key.includes('ATTEMPTS')) {
    if (!Number.isInteger(num) || num < 1) return 'Must be a positive integer';
  }
  if (key.includes('EXPIRY')) {
    if (!Number.isInteger(num) || num < 1) return 'Must be a positive integer';
  }
  return null;
}

function formatSaveValue(key: string, rawValue: string): string {
  const num = Number(rawValue.trim());
  if (key.includes('COMMISSION') || key.includes('RATE')) {
    return (num / 100).toFixed(4);
  }
  if (key.includes('WITHDRAWAL_AMOUNT')) {
    return num.toFixed(2);
  }
  return rawValue.trim();
}

const CATEGORY_ICONS: Record<string, 'wallet' | 'user-check' | 'check' | 'info'> = {
  Commissions: 'wallet',
  Withdrawals: 'wallet',
  Qualification: 'user-check',
  Sales: 'check',
  Vouchers: 'info',
};

function ConfigSkeleton() {
  return (
    <div className={styles.grid}>
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className={styles.categoryCard}>
          <Skeleton className={styles.skeletonTitle} />
          {Array.from({ length: 3 }, (_, j) => (
            <Skeleton key={j} className={styles.skeletonRow} />
          ))}
        </div>
      ))}
    </div>
  );
}

function ProgramsSkeleton() {
  return (
    <div className={styles.programsGrid}>
      {Array.from({ length: 2 }, (_, i) => (
        <div key={i} className={styles.programCard}>
          <Skeleton className={styles.skeletonTitle} />
          <Skeleton className={styles.skeletonRow} />
        </div>
      ))}
    </div>
  );
}

export function ConfigPage() {
  const { data, isPending, isError, error, refetch } = useConfig();
  const { data: programs, isPending: programsPending } = usePrograms();

  const [localEntries, setLocalEntries] = useState<MockConfigEntry[]>([]);
  const [editing, setEditing] = useState<MockConfigEntry | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [hasInteracted, setHasInteracted] = useState(false);

  const allEntries = (() => {
    const overridden = new Set(localEntries.map((e) => e.key));
    const base = (data ?? []).filter((e) => !overridden.has(e.key));
    return [...base, ...localEntries];
  })();

  const categories = (() => {
    const grouped = new Map<string, MockConfigEntry[]>();
    for (const entry of allEntries) {
      const list = grouped.get(entry.category) ?? [];
      list.push(entry);
      grouped.set(entry.category, list);
    }
    return Array.from(grouped.entries());
  })();

  function openEdit(entry: MockConfigEntry) {
    setEditing(entry);
    setEditValue(parseDisplayValue(entry.key, entry.value));
    setEditError(null);
    setHasInteracted(false);
  }

  function handleSave() {
    if (!editing) return;
    const error = validateEntry(editing.key, editValue);
    if (error) {
      setEditError(error);
      return;
    }
    const savedValue = formatSaveValue(editing.key, editValue);
    setLocalEntries((prev) => {
      const exists = prev.find((e) => e.key === editing.key);
      if (exists) return prev.map((e) => (e.key === editing.key ? { ...e, value: savedValue } : e));
      return [...prev, { ...editing, value: savedValue }];
    });
    setEditing(null);
  }

  return (
    <section>
      <PageHeader
        title="System Configuration"
        description="Manage platform parameters, commission rates, and qualification programs."
      />

      {isPending ? (
        <ConfigSkeleton />
      ) : isError ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : data?.length === 0 ? (
        <EmptyState
          title="No configuration"
          description="No system parameters have been configured yet."
        />
      ) : (
        <div className={styles.grid}>
          {categories.map(([category, entries]) => (
            <div key={category} className={styles.categoryCard}>
              <div className={styles.categoryHeader}>
                <Icon
                  name={CATEGORY_ICONS[category] ?? 'info'}
                  size={18}
                  className={styles.categoryIcon}
                  aria-hidden="true"
                />
                <h2 className={styles.categoryTitle}>{category}</h2>
              </div>
              <dl className={styles.definitionList}>
                {entries.map((entry) => (
                  <div key={entry.key} className={styles.entry}>
                    <div className={styles.entryRow}>
                      <div className={styles.entryContent}>
                        <dt className={styles.entryLabel}>{entry.label}</dt>
                        <dd className={styles.entryValue}>
                          {formatValue(entry.key, entry.value)}
                        </dd>
                      </div>
                      <IconButton
                        icon="pencil"
                        label={`Edit ${entry.label}`}
                        onClick={() => openEdit(entry)}
                      />
                    </div>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      )}

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Programs</h2>
        <p className={styles.sectionDescription}>
          Qualification programs that define registration tracks and member eligibility.
        </p>

        {programsPending ? (
          <ProgramsSkeleton />
        ) : programs && programs.length > 0 ? (
          <div className={styles.programsGrid}>
            {programs.map((program) => (
              <div key={program.id} className={styles.programCard}>
                <div className={styles.programHeader}>
                  <h3 className={styles.programName}>{program.name}</h3>
                  <span className={styles.programCode}>{program.code}</span>
                </div>
                {program.description && (
                  <p className={styles.programDescription}>{program.description}</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No programs"
            description="No qualification programs have been configured."
          />
        )}
      </div>

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={`Edit ${editing?.label ?? ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={hasInteracted && editError !== null}
            >
              Save
            </Button>
          </>
        }
      >
        {editing && (
          <label className={styles.editField}>
            <span className={styles.editLabel}>Value</span>
            <input
              value={editValue}
              onChange={(e) => {
                setEditValue(e.target.value);
                setHasInteracted(true);
                setEditError(validateEntry(editing.key, e.target.value));
              }}
              className={styles.editInput}
              data-autofocus
            />
            {editError && <span className={styles.editError}>{editError}</span>}
            <span className={styles.editHint}>
              {editing.key.includes('COMMISSION') || editing.key.includes('RATE')
                ? 'Enter as percentage (e.g. 8 for 8%)'
                : editing.key.includes('WITHDRAWAL_AMOUNT')
                  ? 'Enter amount in PHP'
                  : 'Enter the numeric value'}
            </span>
          </label>
        )}
      </Dialog>
    </section>
  );
}
