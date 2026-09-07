import { useEffect, useState } from 'react';

import { Button, Dialog } from '@jad/ui';

import { useCreateVoucher } from '../hooks/useCreateVoucher';
import { useUpdateVoucher } from '../hooks/useUpdateVoucher';
import type { VoucherTemplate } from '@jad/contracts';

type Props = {
  open: boolean;
  onClose: () => void;
  template?: VoucherTemplate;
};

export function VoucherFormDialog({ open, onClose, template }: Props) {
  const isEdit = Boolean(template);
  const createMutation = useCreateVoucher();
  const updateMutation = useUpdateVoucher();
  const isPending = createMutation.isPending || updateMutation.isPending;

  const [title, setTitle] = useState('');
  const [originalValue, setOriginalValue] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [validityDays, setValidityDays] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    if (template) {
      setTitle(template.title);
      setOriginalValue(template.originalValue);
      setExpiresAt(template.expiresAt ? template.expiresAt.slice(0, 10) : '');
      setValidityDays(template.validityDays ? String(template.validityDays) : '');
    } else {
      setTitle('');
      setOriginalValue('');
      setExpiresAt('');
      setValidityDays('');
    }
    setErrors({});
  }, [open, template]);

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = 'Title is required.';
    if (!isEdit) {
      if (!originalValue.trim()) e.originalValue = 'Value is required.';
      else if (!/^\d+(\.\d{1,2})?$/.test(originalValue.trim()))
        e.originalValue = 'Enter a valid amount (e.g. 500.00).';
      else if (Number(originalValue.trim()) <= 0)
        e.originalValue = 'Amount must be greater than 0.';
    }
    if (expiresAt) {
      const exp = new Date(expiresAt);
      if (isNaN(exp.getTime())) e.expiresAt = 'Invalid date.';
    }
    if (validityDays.trim()) {
      const days = Number(validityDays.trim());
      if (!Number.isInteger(days) || days <= 0) e.validityDays = 'Must be a positive whole number.';
      else if (days > 3650) e.validityDays = 'Maximum 3650 days (≈10 years).';
    }
    return e;
  };

  const handleSubmit = async () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    try {
      if (isEdit && template) {
        await updateMutation.mutateAsync({
          id: template.id,
          input: {
            title: title.trim(),
            expiresAt: expiresAt || null,
            validityDays: validityDays.trim() ? Number(validityDays.trim()) : null,
          },
        });
      } else {
        await createMutation.mutateAsync({
          title: title.trim(),
          originalValue: originalValue.trim(),
          expiresAt: expiresAt || undefined,
          validityDays: validityDays.trim() ? Number(validityDays.trim()) : undefined,
        });
      }
      onClose();
    } catch {
      setErrors({ submit: 'Something went wrong. Please try again.' });
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit Voucher Template' : 'Create Voucher Template'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={isPending}>
            {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Template'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: 'var(--space-3)', minWidth: 340 }}>
        {errors.submit ? (
          <p
            role="alert"
            style={{
              margin: 0,
              padding: '10px 12px',
              border: '1px solid var(--color-danger)',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--text-body-s)',
              color: 'var(--color-danger)',
            }}
          >
            {errors.submit}
          </p>
        ) : null}

        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 'var(--text-body-s)', fontWeight: 600 }}>
            Title <span style={{ color: 'var(--color-danger)' }}>*</span>
          </span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Welcome Gift"
            aria-invalid={Boolean(errors.title)}
            aria-describedby={errors.title ? 'voucher-title-error' : undefined}
            style={{
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
        </label>

        {!isEdit ? (
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 'var(--text-body-s)', fontWeight: 600 }}>
              Original Value <span style={{ color: 'var(--color-danger)' }}>*</span>
            </span>
            <input
              value={originalValue}
              onChange={(e) => setOriginalValue(e.target.value)}
              placeholder="e.g. 500.00"
              aria-invalid={Boolean(errors.originalValue)}
              aria-describedby={errors.originalValue ? 'voucher-value-error' : undefined}
              style={{
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
            ) : null}
          </label>
        ) : (
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 'var(--text-body-s)', fontWeight: 600 }}>Original Value</span>
            <input
              value={template?.originalValue ?? ''}
              disabled
              style={{
                padding: '10px 12px',
                border: '1px solid var(--color-border-default)',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--text-body-s)',
                opacity: 0.6,
                cursor: 'not-allowed',
              }}
            />
          </label>
        )}

        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 'var(--text-body-s)', fontWeight: 600 }}>Expiry Date</span>
          <input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            aria-invalid={Boolean(errors.expiresAt)}
            aria-describedby={errors.expiresAt ? 'voucher-expiry-error' : undefined}
            style={{
              padding: '10px 12px',
              border: `1px solid ${errors.expiresAt ? 'var(--color-danger)' : 'var(--color-border-default)'}`,
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--text-body-s)',
            }}
          />
          {errors.expiresAt ? (
            <span
              id="voucher-expiry-error"
              style={{ color: 'var(--color-danger)', fontSize: 'var(--text-caption)' }}
              role="alert"
            >
              {errors.expiresAt}
            </span>
          ) : null}
        </label>

        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 'var(--text-body-s)', fontWeight: 600 }}>
            Validity (days from issuance)
          </span>
          <input
            type="number"
            value={validityDays}
            onChange={(e) => setValidityDays(e.target.value)}
            placeholder="e.g. 30"
            min={1}
            max={3650}
            aria-invalid={Boolean(errors.validityDays)}
            aria-describedby={errors.validityDays ? 'voucher-validity-error' : undefined}
            style={{
              padding: '10px 12px',
              border: `1px solid ${errors.validityDays ? 'var(--color-danger)' : 'var(--color-border-default)'}`,
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--text-body-s)',
            }}
          />
          {errors.validityDays ? (
            <span
              id="voucher-validity-error"
              style={{ color: 'var(--color-danger)', fontSize: 'var(--text-caption)' }}
              role="alert"
            >
              {errors.validityDays}
            </span>
          ) : null}
        </label>

        {expiresAt && validityDays.trim() ? (
          <p
            style={{ margin: 0, fontSize: 'var(--text-caption)', color: 'var(--color-text-muted)' }}
          >
            Fixed date takes precedence when both are set. Member vouchers snapshot the computed
            expiry at issuance.
          </p>
        ) : (
          <p
            style={{ margin: 0, fontSize: 'var(--text-caption)', color: 'var(--color-text-muted)' }}
          >
            Member vouchers snapshot the computed expiry at issuance. Later template edits won't
            change existing assignments.
          </p>
        )}
      </div>
    </Dialog>
  );
}
