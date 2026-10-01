import { useEffect, useMemo, useRef, useState } from 'react';

import { Button, Dialog, Select } from '@jad/ui';
import type { AdminMember, Sale } from '@jad/contracts';
import {
  capitalizePersonName,
  normalizeName,
  personNameSchema,
  sanitizePersonName,
} from '@jad/contracts';
import { formatMoney } from '@jad/shared';

import { getMembers } from '../../members/repositories/memberRepository';
import { useCategories } from '../../catalog/hooks/useCategories';
import { useProperties } from '../../catalog/hooks/useProperties';
import { useCreateSale } from '../hooks/useCreateSale';
import { useUpdateSale } from '../hooks/useUpdateSale';

interface SaleFormDialogProps {
  open: boolean;
  onClose: () => void;
  sale?: Sale | null;
}

const STATUS_OPTIONS = [
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'ADMIN_APPROVED', label: 'Admin Approved' },
  { value: 'PAYMENT_VERIFIED', label: 'Payment Verified' },
  { value: 'QUALIFYING_SALE', label: 'Qualifying Sale' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'LOCKED', label: 'Locked' },
];

export function SaleFormDialog({ open, onClose, sale }: SaleFormDialogProps) {
  const isEdit = Boolean(sale);
  const createMut = useCreateSale();
  const updateMut = useUpdateSale();

  const [members, setMembers] = useState<AdminMember[]>([]);
  const { data: liveProperties } = useProperties();
  const properties = useMemo(() => liveProperties ?? [], [liveProperties]);
  const { data: liveCategories } = useCategories();
  const categories = useMemo(() => liveCategories ?? [], [liveCategories]);
  const [form, setForm] = useState({
    categoryId: '',
    propertyId: '',
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    sellerId: '',
    referrerId: '',
    status: 'SUBMITTED' as Sale['status'],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | undefined>();

  useEffect(() => {
    if (open) {
      getMembers()
        .then(setMembers)
        .catch(() => setMembers([]));
    }
  }, [open]);

  const memberOptions = useMemo(
    () =>
      members.map((m) => ({
        value: m.id,
        label: `${m.firstName} ${m.lastName}`,
      })),
    [members],
  );

  const referrerOptions = useMemo(() => {
    if (!form.sellerId) return [];
    return members
      .filter((m) => m.sponsorId === form.sellerId)
      .map((m) => ({
        value: m.id,
        label: `${m.firstName} ${m.lastName}`,
      }));
  }, [members, form.sellerId]);

  const categoryOptions = useMemo(
    () =>
      categories.map((c) => ({
        value: c.slug,
        label: c.title,
      })),
    [categories],
  );

  const propertyOptions = useMemo(
    () =>
      properties
        .filter((p) => p.status === 'ACTIVE' && (!form.categoryId || p.categoryId === form.categoryId))
        .map((p) => ({
          value: p.id,
          label: `${p.name} - ${p.price ? formatMoney(p.price) : 'Price unavailable'}`,
        })),
    [properties, form.categoryId],
  );

  const selectedProperty = useMemo(
    () => properties.find((p) => p.id === form.propertyId),
    [form.propertyId, properties],
  );

  const sellerName = useMemo(() => {
    const m = members.find((m) => m.id === form.sellerId);
    return m ? `${m.firstName} ${m.lastName}` : '';
  }, [members, form.sellerId]);

  // Reset on open / sale change, and backfill the edit-mode category once the
  // catalog arrives (the stored sale only carries propertyId). Single effect
  // with a functional update so re-running on catalog load never wipes input.
  const initRef = useRef('');
  useEffect(() => {
    if (!open) {
      initRef.current = '';
      return;
    }
    const key = sale ? `edit:${sale.id}` : 'create';
    const catalog = properties;
    setForm((prev) => {
      if (initRef.current !== key) {
        initRef.current = key;
        if (!sale) {
          return {
            categoryId: '',
            propertyId: '',
            customerName: '',
            customerPhone: '',
            customerEmail: '',
            sellerId: '',
            referrerId: '',
            status: 'SUBMITTED' as Sale['status'],
          };
        }
        return {
          categoryId: catalog.find((p) => p.id === sale.propertyId)?.categoryId ?? '',
          propertyId: sale.propertyId,
          customerName: sale.customerName,
          customerPhone: '',
          customerEmail: '',
          sellerId: sale.sellerId,
          referrerId: (sale as unknown as { referrerId?: string }).referrerId ?? '',
          status: sale.status,
        };
      }
      if (sale && prev.propertyId && !prev.categoryId) {
        const prop = catalog.find((p) => p.id === prev.propertyId);
        if (prop) return { ...prev, categoryId: prop.categoryId };
      }
      return prev;
    });
    setErrors({});
    setSubmitError(undefined);
  }, [sale, open, properties]);

  const handleCategoryChange = (nextCategoryId: string) => {
    setForm((s) => {
      const stillValid = properties.some(
        (p) => p.id === s.propertyId && p.categoryId === nextCategoryId,
      );
      return { ...s, categoryId: nextCategoryId, propertyId: stillValid ? s.propertyId : '' };
    });
  };

  const handleCustomerNameChange = (raw: string) => {
    setForm((s) => ({ ...s, customerName: capitalizePersonName(sanitizePersonName(raw)) }));
  };

  const handleCustomerPhoneChange = (raw: string) => {
    setForm((s) => ({ ...s, customerPhone: raw.replace(/[^\d\s\-()+]/g, '').slice(0, 20) }));
  };

  const handleCustomerEmailChange = (raw: string) => {
    setForm((s) => ({ ...s, customerEmail: raw.toLowerCase() }));
  };

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!form.categoryId) e.categoryId = 'Select a category';
    if (!form.propertyId) e.propertyId = 'Select a property';
    if (!normalizeName(form.customerName)) e.customerName = 'Customer name is required';
    else if (!personNameSchema.safeParse(form.customerName).success)
      e.customerName = 'Enter a valid name (letters only)';
    if (!form.customerPhone.trim()) e.customerPhone = 'Mobile number is required';
    else if (!/^\+?[\d\s\-()]{7,20}$/.test(form.customerPhone.trim()))
      e.customerPhone = 'Enter a valid mobile number';
    if (form.customerEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.customerEmail.trim()))
      e.customerEmail = 'Enter a valid email address';
    if (!form.sellerId) e.sellerId = 'Seller is required';
    return e;
  };

  const handleSubmit = async () => {
    if (isPending) return;
    const v = validate();
    setErrors(v);
    if (Object.keys(v).length > 0) return;
    setSubmitError(undefined);
    const referrerMember = members.find((m) => m.id === form.referrerId);
    const referrerName = referrerMember
      ? `${referrerMember.firstName} ${referrerMember.lastName}`
      : '';
    const prop = properties.find((p) => p.id === form.propertyId);
    try {
      if (isEdit && sale) {
        await updateMut.mutateAsync({
          id: sale.id,
          patch: {
            propertyId: form.propertyId,
            propertyName: prop?.name ?? sale.propertyName,
            propertyValue: prop?.price ?? sale.propertyValue,
            customerName: normalizeName(form.customerName),
            sellerName,
            sellerId: form.sellerId,
            status: form.status,
            referrerId: form.referrerId || null,
            referrerName: referrerName || null,
          } as unknown as Record<string, unknown>,
        });
      } else {
        await createMut.mutateAsync({
          propertyId: form.propertyId,
          propertyName: prop?.name ?? '',
          propertyValue: prop?.price ?? '',
          customerName: normalizeName(form.customerName),
          customerPhone: form.customerPhone.trim(),
          customerEmail: form.customerEmail.trim() || undefined,
          sellerName,
          sellerId: form.sellerId,
          referrerName: referrerName || undefined,
          referrerId: form.referrerId || undefined,
        });
      }
      onClose();
    } catch (e) {
      setSubmitError((e as Error).message);
    }
  };

  const isPending = createMut.isPending || updateMut.isPending;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit Sale' : 'Create Sale'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} loading={isPending}>
            {isEdit ? 'Save changes' : 'Create sale'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: 'var(--space-4)', minWidth: 320 }}>
        <div style={{ display: 'grid', gap: 6 }}>
          <label
            htmlFor="sale-categoryId"
            style={{ fontSize: 'var(--text-body-s)', fontWeight: 600 }}
          >
            Category <span style={{ color: 'var(--color-danger)' }}>*</span>
          </label>
          <Select
            aria-label="Category"
            value={form.categoryId}
            onChange={(e) => handleCategoryChange(e.target.value)}
            options={[{ value: '', label: 'Select category…' }, ...categoryOptions]}
          />
          {errors.categoryId ? (
            <span
              id="sale-categoryId-error"
              style={{ color: 'var(--color-danger)', fontSize: 'var(--text-caption)' }}
              role="alert"
            >
              {errors.categoryId}
            </span>
          ) : null}
        </div>

        <div style={{ display: 'grid', gap: 6 }}>
          <label
            htmlFor="sale-propertyId"
            style={{ fontSize: 'var(--text-body-s)', fontWeight: 600 }}
          >
            Property <span style={{ color: 'var(--color-danger)' }}>*</span>
          </label>
          <Select
            aria-label="Property"
            value={form.propertyId}
            onChange={(e) => setForm((s) => ({ ...s, propertyId: e.target.value }))}
            disabled={!form.categoryId}
            options={[
              {
                value: '',
                label: form.categoryId ? 'Select property…' : 'Select a category first…',
              },
              ...propertyOptions,
            ]}
          />
          {errors.propertyId ? (
            <span
              id="sale-propertyId-error"
              style={{ color: 'var(--color-danger)', fontSize: 'var(--text-caption)' }}
              role="alert"
            >
              {errors.propertyId}
            </span>
          ) : null}
        </div>

        <div style={{ display: 'grid', gap: 6 }}>
          <label
            htmlFor="sale-propertyValue"
            style={{ fontSize: 'var(--text-body-s)', fontWeight: 600 }}
          >
            Property Value
          </label>
          <input
            id="sale-propertyValue"
            value={selectedProperty?.price ? formatMoney(selectedProperty.price) : ''}
            readOnly
            aria-label="Property value"
            style={{
              minHeight: 44,
              padding: '10px 12px',
              border: '1px solid var(--color-border-default)',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--text-body-s)',
              background: 'var(--color-bg-surface)',
              color: selectedProperty?.price
                ? 'var(--color-text-primary)'
                : 'var(--color-text-muted)',
              cursor: 'not-allowed',
            }}
          />
          <span style={{ fontSize: 'var(--text-caption)', color: 'var(--color-text-muted)' }}>
            Auto-filled from catalog; snapshotted at submission (BI-006)
          </span>
        </div>

        <div style={{ display: 'grid', gap: 6 }}>
          <label
            htmlFor="sale-sellerId"
            style={{ fontSize: 'var(--text-body-s)', fontWeight: 600 }}
          >
            Seller Name <span style={{ color: 'var(--color-danger)' }}>*</span>
          </label>
          <Select
            aria-label="Seller"
            value={form.sellerId}
            onChange={(e) => {
              const nextSeller = e.target.value;
              setForm((s) => {
                const nextRefValid = members.some(
                  (m) => m.id === s.referrerId && m.sponsorId === nextSeller,
                );
                return { ...s, sellerId: nextSeller, referrerId: nextRefValid ? s.referrerId : '' };
              });
            }}
            options={[{ value: '', label: 'Select seller…' }, ...memberOptions]}
          />
          {errors.sellerId ? (
            <span
              id="sale-sellerId-error"
              style={{ color: 'var(--color-danger)', fontSize: 'var(--text-caption)' }}
              role="alert"
            >
              {errors.sellerId}
            </span>
          ) : null}
        </div>

        <div style={{ display: 'grid', gap: 6 }}>
          <label
            htmlFor="sale-referrerId"
            style={{ fontSize: 'var(--text-body-s)', fontWeight: 600 }}
          >
            Referrer
          </label>
          <Select
            aria-label="Referrer"
            value={form.referrerId}
            onChange={(e) => setForm((s) => ({ ...s, referrerId: e.target.value }))}
            options={[{ value: '', label: 'No referrer' }, ...referrerOptions]}
          />
          <span style={{ fontSize: 'var(--text-caption)', color: 'var(--color-text-muted)' }}>
            The member who referred this customer. Empty awards the seller&apos;s sponsor.
          </span>
        </div>

        <div style={{ display: 'grid', gap: 6 }}>
          <label
            htmlFor="sale-customerName"
            style={{ fontSize: 'var(--text-body-s)', fontWeight: 600 }}
          >
            Customer Name <span style={{ color: 'var(--color-danger)' }}>*</span>
          </label>
          <input
            id="sale-customerName"
            value={form.customerName}
            onChange={(e) => handleCustomerNameChange(e.target.value)}
            placeholder="Ramon Reyes"
            aria-label="Customer name"
            aria-invalid={Boolean(errors.customerName)}
            aria-describedby={errors.customerName ? 'sale-customerName-error' : undefined}
            style={{
              minHeight: 44,
              padding: '10px 12px',
              border: `1px solid ${errors.customerName ? 'var(--color-danger)' : 'var(--color-border-default)'}`,
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--text-body-s)',
            }}
          />
          {errors.customerName ? (
            <span
              id="sale-customerName-error"
              style={{ color: 'var(--color-danger)', fontSize: 'var(--text-caption)' }}
              role="alert"
            >
              {errors.customerName}
            </span>
          ) : null}
        </div>

        <div style={{ display: 'grid', gap: 6 }}>
          <label
            htmlFor="sale-customerPhone"
            style={{ fontSize: 'var(--text-body-s)', fontWeight: 600 }}
          >
            Mobile Number <span style={{ color: 'var(--color-danger)' }}>*</span>
          </label>
          <input
            id="sale-customerPhone"
            value={form.customerPhone}
            onChange={(e) => handleCustomerPhoneChange(e.target.value)}
            placeholder="+63 917 123 4567"
            aria-label="Customer mobile number"
            aria-invalid={Boolean(errors.customerPhone)}
            aria-describedby={errors.customerPhone ? 'sale-customerPhone-error' : undefined}
            style={{
              minHeight: 44,
              padding: '10px 12px',
              border: `1px solid ${errors.customerPhone ? 'var(--color-danger)' : 'var(--color-border-default)'}`,
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--text-body-s)',
            }}
          />
          {errors.customerPhone ? (
            <span
              id="sale-customerPhone-error"
              style={{ color: 'var(--color-danger)', fontSize: 'var(--text-caption)' }}
              role="alert"
            >
              {errors.customerPhone}
            </span>
          ) : null}
        </div>

        <div style={{ display: 'grid', gap: 6 }}>
          <label
            htmlFor="sale-customerEmail"
            style={{ fontSize: 'var(--text-body-s)', fontWeight: 600 }}
          >
            Email
          </label>
          <input
            id="sale-customerEmail"
            type="email"
            value={form.customerEmail}
            onChange={(e) => handleCustomerEmailChange(e.target.value)}
            placeholder="ramon.reyes@example.com"
            aria-label="Customer email"
            aria-invalid={Boolean(errors.customerEmail)}
            aria-describedby={errors.customerEmail ? 'sale-customerEmail-error' : undefined}
            style={{
              minHeight: 44,
              padding: '10px 12px',
              border: `1px solid ${errors.customerEmail ? 'var(--color-danger)' : 'var(--color-border-default)'}`,
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--text-body-s)',
            }}
          />
          {errors.customerEmail ? (
            <span
              id="sale-customerEmail-error"
              style={{ color: 'var(--color-danger)', fontSize: 'var(--text-caption)' }}
              role="alert"
            >
              {errors.customerEmail}
            </span>
          ) : null}
        </div>

        {isEdit ? (
          <div style={{ display: 'grid', gap: 6 }}>
            <label
              htmlFor="sale-status"
              style={{ fontSize: 'var(--text-body-s)', fontWeight: 600 }}
            >
              Status
            </label>
            <Select
              aria-label="Sale status"
              value={form.status}
              onChange={(e) => setForm((s) => ({ ...s, status: e.target.value as Sale['status'] }))}
              options={STATUS_OPTIONS}
            />
          </div>
        ) : null}

        {submitError ? (
          <p style={{ color: 'var(--color-danger)', fontSize: 'var(--text-body-s)' }} role="alert">
            {submitError}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
