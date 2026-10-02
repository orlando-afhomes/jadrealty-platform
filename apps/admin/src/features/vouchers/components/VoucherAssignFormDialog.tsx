import { useEffect, useMemo, useRef, useState } from 'react';

import { Button, Dialog, Select } from '@jad/ui';
import { MAX_VALIDITY_DAYS } from '@jad/contracts';

import { useConfig } from '../../config/hooks/useConfig';
import { useMembers } from '../../members/hooks/useMembers';
import { useVoucherAssignments } from '../hooks/useVoucherAssignments';
import { useAssignVoucher } from '../hooks/useAssignVoucher';

interface VoucherAssignFormDialogProps {
  open: boolean;
  onClose: () => void;
  templateId: string;
}

/** Local `yyyy-mm-dd` (native date inputs are timezone-naive). */
function toIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function VoucherAssignFormDialog({
  open,
  onClose,
  templateId,
}: VoucherAssignFormDialogProps) {
  const { data: members } = useMembers();
  const { data: assigned } = useVoucherAssignments(templateId);
  const assignMutation = useAssignVoucher(templateId);
  const { data: configEntries } = useConfig();
  const [memberId, setMemberId] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [validityDays, setValidityDays] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | undefined>();
  // Tracks staff edits so a late-loading config default never clobbers input.
  const daysEditedRef = useRef(false);
  const openedRef = useRef(false);

  // Only ACTIVE members not already holding this voucher (the API enforces the
  // same rule via the (memberId, templateId) unique index - this is UX only).
  const eligibleMembers = useMemo(() => {
    const assignedIds = new Set((assigned ?? []).map((a) => a.memberId));
    return (members ?? []).filter((m) => m.accountStatus === 'ACTIVE' && !assignedIds.has(m.id));
  }, [members, assigned]);

  // Platform default from SystemConfig (VOUCHER_DEFAULT_EXPIRY_DAYS) - the
  // same value the server falls back to. Empty while loading or misconfigured
  // (the server fallback still applies, so submission stays valid).
  const defaultValidityDays = useMemo(() => {
    const raw = configEntries?.find((entry) => entry.key === 'VOUCHER_DEFAULT_EXPIRY_DAYS')?.value;
    const days = typeof raw === 'string' && raw.trim() ? Number(raw) : NaN;
    return Number.isInteger(days) && days > 0 ? String(days) : '';
  }, [configEntries]);

  useEffect(() => {
    if (open && !openedRef.current) {
      openedRef.current = true;
      setMemberId('');
      setExpiresAt('');
      setValidityDays(defaultValidityDays);
      setErrors({});
      setSubmitError(undefined);
      daysEditedRef.current = false;
    } else if (!open) {
      openedRef.current = false;
    }
  }, [open, defaultValidityDays]);

  // Backfill the default if the config arrives after the dialog opened and
  // staff haven't typed anything yet.
  useEffect(() => {
    if (open && !daysEditedRef.current && validityDays === '' && defaultValidityDays !== '') {
      setValidityDays(defaultValidityDays);
    }
  }, [open, validityDays, defaultValidityDays]);

  const today = useMemo(() => toIsoDate(new Date()), []);
  const parsedDays = /^\d+$/.test(validityDays) ? Number(validityDays) : NaN;
  // Auto-selected expiry shown in the date field: today + Valid-for-Days.
  // Display-only while the date is untouched - submission sends the explicit
  // date only, so the days path keeps working.
  const autoExpiresAt =
    !expiresAt && Number.isInteger(parsedDays) && parsedDays > 0 && parsedDays <= 36500
      ? (() => {
          const computed = new Date();
          computed.setDate(computed.getDate() + parsedDays);
          return toIsoDate(computed);
        })()
      : '';

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!memberId) e.memberId = 'Select a member.';
    if (expiresAt) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(expiresAt)) e.expiresAt = 'Enter a valid date.';
      else if (expiresAt < today) e.expiresAt = 'Expiry cannot be in the past.';
    }
    if (validityDays) {
      if (!/^\d+$/.test(validityDays) || Number(validityDays) < 1)
        e.validityDays = 'Enter a whole number of days.';
      else if (Number(validityDays) > MAX_VALIDITY_DAYS)
        e.validityDays = `Enter no more than ${MAX_VALIDITY_DAYS.toLocaleString('en-US')} days.`;
    }
    return e;
  };

  const handleSubmit = async () => {
    const v = validate();
    setErrors(v);
    if (Object.keys(v).length > 0) return;
    setSubmitError(undefined);
    try {
      await assignMutation.mutateAsync({
        templateId,
        memberId,
        expiresAt: expiresAt ? new Date(`${expiresAt}T00:00:00`).toISOString() : undefined,
        validityDays: validityDays ? Number(validityDays) : undefined,
      });
      onClose();
    } catch (e) {
      setSubmitError((e as Error).message);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Assign to Member"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={assignMutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            loading={assignMutation.isPending}
            disabled={eligibleMembers.length === 0}
          >
            Assign voucher
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
        {eligibleMembers.length === 0 ? (
          <p style={{ fontSize: 'var(--text-body-s)', color: 'var(--color-text-muted)' }}>
            All active members already hold this voucher.
          </p>
        ) : null}
        <div style={{ display: 'grid', gap: 6 }}>
          <label
            htmlFor="assign-member"
            style={{ fontSize: 'var(--text-body-s)', fontWeight: 600 }}
          >
            Member <span style={{ color: 'var(--color-danger)' }}>*</span>
          </label>
          <Select
            id="assign-member"
            aria-label="Member"
            value={memberId}
            onChange={(e) => setMemberId(e.target.value)}
            options={[
              { value: '', label: 'Select a member…' },
              ...eligibleMembers.map((m) => ({
                value: m.id,
                label: `${m.firstName} ${m.lastName}`,
              })),
            ]}
          />
          {errors.memberId ? (
            <span
              style={{ color: 'var(--color-danger)', fontSize: 'var(--text-caption)' }}
              role="alert"
            >
              {errors.memberId}
            </span>
          ) : null}
        </div>

        <div style={{ display: 'grid', gap: 6 }}>
          <label
            htmlFor="assign-expires"
            style={{ fontSize: 'var(--text-body-s)', fontWeight: 600 }}
          >
            Expiry Date
          </label>
          <input
            id="assign-expires"
            type="date"
            value={expiresAt || autoExpiresAt}
            min={today}
            onChange={(e) => setExpiresAt(e.target.value)}
            aria-label="Expiry Date"
            aria-invalid={Boolean(errors.expiresAt)}
            aria-describedby={errors.expiresAt ? 'assign-expires-error' : undefined}
            style={{
              minHeight: 44,
              padding: '10px 12px',
              border: `1px solid ${errors.expiresAt ? 'var(--color-danger)' : 'var(--color-border-default)'}`,
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--text-body-s)',
            }}
          />
          {errors.expiresAt ? (
            <span
              id="assign-expires-error"
              style={{ color: 'var(--color-danger)', fontSize: 'var(--text-caption)' }}
              role="alert"
            >
              {errors.expiresAt}
            </span>
          ) : (
            <span style={{ fontSize: 'var(--text-caption)', color: 'var(--color-text-muted)' }}>
              {expiresAt
                ? 'This fixed date overrides Valid for Days.'
                : autoExpiresAt
                  ? `Auto-selected from Valid for Days (${validityDays} days). Pick a date to override it.`
                  : 'Leave empty to use Valid for Days, the template rule, or the system default.'}
            </span>
          )}
        </div>

        <div style={{ display: 'grid', gap: 6 }}>
          <label
            htmlFor="assign-validity"
            style={{ fontSize: 'var(--text-body-s)', fontWeight: 600 }}
          >
            Valid for (days)
          </label>
          <input
            id="assign-validity"
            value={validityDays}
            onChange={(e) => {
              daysEditedRef.current = true;
              setValidityDays(e.target.value.replace(/[^\d]/g, '').slice(0, 5));
            }}
            placeholder="90"
            inputMode="numeric"
            aria-label="Valid for days"
            aria-invalid={Boolean(errors.validityDays)}
            aria-describedby={errors.validityDays ? 'assign-validity-error' : undefined}
            style={{
              minHeight: 44,
              padding: '10px 12px',
              border: `1px solid ${errors.validityDays ? 'var(--color-danger)' : 'var(--color-border-default)'}`,
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--text-body-s)',
            }}
          />
          {errors.validityDays ? (
            <span
              id="assign-validity-error"
              style={{ color: 'var(--color-danger)', fontSize: 'var(--text-caption)' }}
              role="alert"
            >
              {errors.validityDays}
            </span>
          ) : null}
        </div>

        <p style={{ fontSize: 'var(--text-caption)', color: 'var(--color-text-muted)', margin: 0 }}>
          A unique voucher code and QR code will be generated for this member.
        </p>
      </div>
    </Dialog>
  );
}
