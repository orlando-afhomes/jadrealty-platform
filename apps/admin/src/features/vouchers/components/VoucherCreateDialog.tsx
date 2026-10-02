import { useEffect, useState } from 'react';

import { Button, Dialog } from '@jad/ui';
import {
  capitalizePersonName,
  normalizeName,
  personNameSchema,
  sanitizePersonName,
} from '@jad/contracts';
import { useQueryClient } from '@tanstack/react-query';

import { createVoucher } from '../services/vouchers';

interface VoucherCreateDialogProps {
  open: boolean;
  onClose: () => void;
}

const MONEY_RE = /^\d+(\.\d{1,2})?$/;

/** Hard cap on whole-point digits (UX guard; the exact-decimal check still applies). */
const MAX_INTEGER_DIGITS = 12;

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Live points shaping: digits + one dot only, max two decimals, thousand
 * separators as typed (`5000` → `5,000`). Submitted comma-stripped.
 */
function shapePoints(raw: string): string {
  const cleaned = raw.replace(/[^0-9.]/g, '');
  if (cleaned === '') return '';
  const dotIndex = cleaned.indexOf('.');
  const hasDot = dotIndex !== -1;
  const headRaw = (hasDot ? cleaned.slice(0, dotIndex) : cleaned).slice(0, MAX_INTEGER_DIGITS);
  const fracRaw = hasDot ? cleaned.slice(dotIndex + 1).replace(/\./g, '') : '';
  const head = headRaw.replace(/^0+(?=\d)/, '') || '0';
  if (!hasDot) return groupThousands(head);
  return `${groupThousands(head)}.${fracRaw.slice(0, 2)}`;
}

/** Display string → exact-decimal for validation and submission. */
function normalizePoints(display: string): string {
  return display.replace(/,/g, '').trim();
}

/** Create a voucher definition (title + value). Members are assigned afterwards. */
export function VoucherCreateDialog({ open, onClose }: VoucherCreateDialogProps) {
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [originalValue, setOriginalValue] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | undefined>();
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle('');
      setOriginalValue('');
      setErrors({});
      setSubmitError(undefined);
    }
  }, [open]);

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!normalizeName(title)) e.title = 'Enter a voucher title.';
    else if (!personNameSchema.safeParse(title).success)
      e.title = 'Enter a valid title (letters only).';
    const value = normalizePoints(originalValue);
    if (!value) e.originalValue = 'Enter the points for this voucher.';
    else if (!MONEY_RE.test(value) || Number(value) <= 0)
      e.originalValue = 'Enter valid points (e.g. 500).';
    return e;
  };

  const handleSubmit = async () => {
    const v = validate();
    setErrors(v);
    if (Object.keys(v).length > 0) return;
    setSubmitError(undefined);
    setIsPending(true);
    try {
      await createVoucher({ title: normalizeName(title), originalValue: normalizePoints(originalValue) });
      await qc.invalidateQueries({ queryKey: ['admin', 'vouchers'] });
      onClose();
    } catch (e) {
      setSubmitError((e as Error).message);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Create Voucher"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} loading={isPending}>
            Create voucher
          </Button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: 'var(--space-3)', minWidth: 'min(320px, 100%)' }}>
        {submitError ? (
          <p role="alert" style={{ color: 'var(--color-danger)', fontSize: 'var(--text-body-s)' }}>
            {submitError}
          </p>
        ) : null}
        <div style={{ display: 'grid', gap: 6 }}>
          <label
            htmlFor="voucher-title"
            style={{ fontSize: 'var(--text-body-s)', fontWeight: 600 }}
          >
            Title <span style={{ color: 'var(--color-danger)' }}>*</span>
          </label>
          <input
            id="voucher-title"
            value={title}
            onChange={(e) => setTitle(capitalizePersonName(sanitizePersonName(e.target.value)))}
            placeholder="Welcome Gift"
            aria-label="Title"
            aria-invalid={Boolean(errors.title)}
            aria-describedby={errors.title ? 'voucher-title-error' : undefined}
            style={{
              minHeight: 44,
              padding: '10px 12px',
              border: `1px solid ${errors.title ? 'var(--color-danger)' : 'var(--color-border-default)'}`,
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--text-body-s)',
            }}
          />
          {errors.title ? (
            <span
              id="voucher-title-error"
              style={{ color: 'var(--color-danger)', fontSize: 'var(--text-caption)' }}
              role="alert"
            >
              {errors.title}
            </span>
          ) : null}
        </div>

        <div style={{ display: 'grid', gap: 6 }}>
          <label
            htmlFor="voucher-value"
            style={{ fontSize: 'var(--text-body-s)', fontWeight: 600 }}
          >
            Points <span style={{ color: 'var(--color-danger)' }}>*</span>
          </label>
          <input
            id="voucher-value"
            value={originalValue}
            onChange={(e) => setOriginalValue(shapePoints(e.target.value))}
            placeholder="5,000"
            inputMode="decimal"
            aria-label="Points"
            aria-invalid={Boolean(errors.originalValue)}
            aria-describedby={errors.originalValue ? 'voucher-value-error' : undefined}
            style={{
              minHeight: 44,
              padding: '10px 12px',
              border: `1px solid ${errors.originalValue ? 'var(--color-danger)' : 'var(--color-border-default)'}`,
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--text-body-s)',
            }}
          />
          {errors.originalValue ? (
            <span
              id="voucher-value-error"
              style={{ color: 'var(--color-danger)', fontSize: 'var(--text-caption)' }}
              role="alert"
            >
              {errors.originalValue}
            </span>
          ) : (
            <span style={{ fontSize: 'var(--text-caption)', color: 'var(--color-text-muted)' }}>
              Assign members to this voucher afterwards - each assignment gets a unique code and QR
              with its own expiry.
            </span>
          )}
        </div>
      </div>
    </Dialog>
  );
}
