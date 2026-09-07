import { useEffect, useMemo, useState } from 'react';

import { Button, Dialog, Select } from '@jad/ui';

import { useMembers } from '../../members/hooks/useMembers';
import { useVoucherAssignments } from '../hooks/useVoucherAssignments';
import { useAssignVoucher } from '../hooks/useAssignVoucher';

type Props = {
  open: boolean;
  onClose: () => void;
  templateId: string;
};

export function VoucherAssignFormDialog({ open, onClose, templateId }: Props) {
  const assignMutation = useAssignVoucher(templateId);
  const { data: members } = useMembers();
  const { data: assignments } = useVoucherAssignments(templateId);
  const [memberId, setMemberId] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const assignedIds = useMemo(() => (assignments ?? []).map((a) => a.memberId), [assignments]);

  const memberOptions = useMemo(() => {
    return (members ?? [])
      .filter((m) => m.accountStatus === 'ACTIVE' && !assignedIds.includes(m.id))
      .map((m) => ({
        value: m.id,
        label: `${m.firstName} ${m.lastName} (${m.email})`,
      }));
  }, [members, assignedIds]);

  useEffect(() => {
    if (!open) return;
    setMemberId('');
    setErrors({});
  }, [open]);

  const handleSubmit = async () => {
    const e: Record<string, string> = {};
    if (!memberId) e.memberId = 'Select a member.';
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    try {
      await assignMutation.mutateAsync({ templateId, memberId });
      onClose();
    } catch {
      setErrors({ submit: 'Something went wrong. Please try again.' });
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Assign Voucher to Member"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={assignMutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={assignMutation.isPending || memberOptions.length === 0}
          >
            {assignMutation.isPending ? 'Assigning…' : 'Assign Voucher'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: 'var(--space-3)', minWidth: 380 }}>
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

        {memberOptions.length === 0 ? (
          <p
            style={{
              margin: 0,
              fontSize: 'var(--text-body-s)',
              color: 'var(--color-text-secondary)',
            }}
          >
            All active members have already been assigned this voucher.
          </p>
        ) : (
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 'var(--text-body-s)', fontWeight: 600 }}>
              Member <span style={{ color: 'var(--color-danger)' }}>*</span>
            </span>
            <Select
              aria-label="Select member"
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
              options={[{ value: '', label: '— Select a member —' }, ...memberOptions]}
              aria-invalid={Boolean(errors.memberId)}
              aria-describedby={errors.memberId ? 'assign-member-error' : undefined}
            />
            {errors.memberId ? (
              <span
                id="assign-member-error"
                style={{ color: 'var(--color-danger)', fontSize: 'var(--text-caption)' }}
                role="alert"
              >
                {errors.memberId}
              </span>
            ) : null}
          </label>
        )}

        <p style={{ margin: 0, fontSize: 'var(--text-caption)', color: 'var(--color-text-muted)' }}>
          A unique voucher code and QR code will be generated for this member.
        </p>
      </div>
    </Dialog>
  );
}
