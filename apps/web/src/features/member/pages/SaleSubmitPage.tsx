import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router';

import { formatMoney, multiplyMoney } from '@jad/shared';
import { ErrorState, PageHeader, Skeleton } from '@jad/ui';

import { Alert } from '../../../components/Alert';
import { Button } from '../../../components/Button';
import { apiErrorMessage } from '../../../lib/api/errorMessage';
import { PROPERTY_CATEGORIES, PROPERTY_RECORDS } from '../../public/content/properties';
import {
  useCommissionPreview,
  useCustomers,
  useDirectReferrals,
  useGenealogy,
} from '../hooks/useMember';
import { createCustomer, submitSale } from '../services/member';
import { SelectField } from '../../auth/components/SelectField';
import { TextField } from '../../auth/components/TextField';
import styles from './SaleSubmitPage.module.css';

const PHONE_RE = /^\+?[\d\s().-]{7,}$/;

/** Compact percent label for an exact-decimal rate string ('0.0800' → '8%'). */
function percentLabel(rate: string): string {
  const num = Number(rate);
  if (!Number.isFinite(num)) return rate;
  return `${Number((num * 100).toFixed(2))}%`;
}

/** Fixed-value catalog units eligible for sale submission (OD-003 pending; mock baseline). */
function submittableProperties() {
  return PROPERTY_RECORDS.filter((property) => property.price !== undefined);
}

/**
 * Submit a qualifying sale (SCR-MEM-006, FR-SAL-002). Picks an existing
 * customer or records a new one, picks a property from the catalog, and posts
 * `POST /sales` with an `Idempotency-Key` (API-SPECIFICATION §5.3) - held in
 * component state for the attempt and never persisted. The property value is
 * snapshotted server-side (BI-006); the UI only sends ids.
 */
export function SaleSubmitPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const customersQuery = useCustomers();
  const referralsQuery = useDirectReferrals();
  const genealogyQuery = useGenealogy();
  const [customerId, setCustomerId] = useState('');
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ fullName: '', phone: '', email: '' });
  const [categoryId, setCategoryId] = useState('');
  const [propertyId, setPropertyId] = useState('');
  // Referrer: sponsor (default when linked) or a direct referral; None is explicit opt-out.
  const [referrerId, setReferrerId] = useState('');
  const hasAutoSelectedSponsor = useRef(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | undefined>();
  const [idempotencyKey] = useState(() =>
    typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `idem-${Date.now()}`,
  );

  const properties = useMemo(() => submittableProperties(), []);
  const categoryOptions = useMemo(
    () =>
      PROPERTY_CATEGORIES.filter((category) =>
        properties.some((property) => property.categoryId === category.slug),
      ).map((category) => ({ value: category.slug, label: category.title })),
    [properties],
  );
  const visibleProperties = useMemo(
    () =>
      categoryId ? properties.filter((property) => property.categoryId === categoryId) : [],
    [properties, categoryId],
  );
  const selectedProperty = useMemo(
    () => properties.find((property) => property.id === propertyId),
    [properties, propertyId],
  );
  const previewQuery = useCommissionPreview(propertyId);

  const sponsor = genealogyQuery.data?.sponsor ?? null;

  const referrerOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    if (sponsor) {
      opts.push({ value: sponsor.id, label: `${sponsor.name} (Sponsor)` });
    }
    for (const referral of referralsQuery.data ?? []) {
      if (sponsor && referral.id === sponsor.id) continue;
      opts.push({ value: referral.id, label: referral.name });
    }
    return opts;
  }, [sponsor, referralsQuery.data]);
  const hasReferrerChoices = referrerOptions.length > 0;
  const selectedReferrerName =
    referrerOptions.find((option) => option.value === referrerId)?.label ?? null;

  // Auto-select sponsor when the member has one and the field is still pristine.
  useEffect(() => {
    if (hasAutoSelectedSponsor.current) return;
    if (referrerId !== '') return;
    if (!sponsor) return;
    if (genealogyQuery.isLoading) return;
    hasAutoSelectedSponsor.current = true;
    setReferrerId(sponsor.id);
  }, [sponsor, referrerId, genealogyQuery.isLoading]);

  const createCustomerMutation = useMutation({ mutationFn: createCustomer });
  const submitSaleMutation = useMutation({
    mutationFn: ({
      customerId: cid,
      propertyId: pid,
      referrerId: rid,
    }: {
      customerId: string;
      propertyId: string;
      referrerId?: string;
    }) => submitSale({ customerId: cid, propertyId: pid, referrerId: rid }, idempotencyKey),
    onSuccess: (sale) => {
      void queryClient.invalidateQueries({ queryKey: ['member', 'sales'] });
      void queryClient.invalidateQueries({ queryKey: ['member', 'customers'] });
      navigate(`/member/sales/${sale.id}`, { replace: true });
    },
  });

  const setField = (
    field: 'customerId' | 'propertyId' | 'newCustomer' | 'newPhone' | 'newEmail',
    value: string,
  ) => {
    if (field === 'customerId') {
      setCustomerId(value);
      if (value === '__new__') setAddingCustomer(true);
      else setAddingCustomer(false);
    } else if (field === 'propertyId') setPropertyId(value);
    else if (field === 'newCustomer')
      setNewCustomer((current) => ({ ...current, fullName: value }));
    else if (field === 'newPhone') setNewCustomer((current) => ({ ...current, phone: value }));
    else setNewCustomer((current) => ({ ...current, email: value }));
    setErrors((current) => {
      if (current[field] === undefined) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    setServerError(undefined);
  };

  const onReferrerChange = (value: string) => {
    hasAutoSelectedSponsor.current = true;
    setReferrerId(value);
    setErrors((current) => {
      const next = { ...current };
      delete next.referrerId;
      return next;
    });
    setServerError(undefined);
  };

  const onCategoryChange = (value: string) => {
    setCategoryId(value);
    setPropertyId((current) => {
      if (!current) return current;
      const stillValid = properties.some(
        (property) => property.id === current && property.categoryId === value,
      );
      return stillValid ? current : '';
    });
    setErrors((current) => {
      const next = { ...current };
      delete next.categoryId;
      delete next.propertyId;
      return next;
    });
    setServerError(undefined);
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    let resolvedCustomerId = customerId;
    if (addingCustomer) {
      if (!newCustomer.fullName.trim())
        nextErrors.newCustomer = 'Enter the customer\u2019s full name.';
      if (!newCustomer.phone.trim())
        nextErrors.newPhone = 'Enter the customer\u2019s phone number.';
      else if (!PHONE_RE.test(newCustomer.phone.trim()))
        nextErrors.newPhone = 'Enter a valid phone number.';
      if (
        newCustomer.email.trim() &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newCustomer.email.trim())
      ) {
        nextErrors.newEmail = 'Enter a valid email address.';
      }
    } else if (!customerId) {
      nextErrors.customerId = 'Select a customer or add a new one.';
    }
    if (!categoryId) nextErrors.categoryId = 'Select a property category first.';
    if (!propertyId) nextErrors.propertyId = 'Select a property from the catalog.';
    setErrors(nextErrors);
    if (nextErrors.customerId) document.getElementById('sale-customerId')?.focus();
    else if (nextErrors.categoryId) document.getElementById('sale-categoryId')?.focus();
    else if (nextErrors.propertyId) document.getElementById('sale-propertyId')?.focus();
    if (Object.keys(nextErrors).length > 0) return;

    setServerError(undefined);
    try {
      if (addingCustomer) {
        const created = await createCustomerMutation.mutateAsync({
          fullName: newCustomer.fullName.trim(),
          phone: newCustomer.phone.trim(),
          email: newCustomer.email.trim() || undefined,
        });
        resolvedCustomerId = created.id;
      }
      await submitSaleMutation.mutateAsync({
        customerId: resolvedCustomerId,
        propertyId,
        referrerId: referrerId || undefined,
      });
    } catch (error) {
      setServerError(
        apiErrorMessage(error, 'We could not submit the sale. Please try again shortly.'),
      );
    }
  };

  if (customersQuery.isLoading) {
    return (
      <section>
        <PageHeader title="Submit a sale" />
        <div className={styles.loading} role="status">
          <Skeleton />
          <Skeleton />
          <Skeleton />
        </div>
      </section>
    );
  }

  if (customersQuery.isError) {
    return (
      <section>
        <PageHeader title="Submit a sale" />
        <ErrorState error={customersQuery.error} title="Could not load your customers" />
      </section>
    );
  }

  const customerOptions = (customersQuery.data ?? []).map((customer) => ({
    value: customer.id,
    label: `${customer.fullName} · ${customer.phone}`,
  }));

  const propertyOptions = visibleProperties.map((property) => ({
    value: property.id,
    label: `${property.name} - ${formatMoney(property.price!)}`,
  }));

  const submitting = submitSaleMutation.isPending || createCustomerMutation.isPending;

  return (
    <section>
      <PageHeader
        title="Submit a sale"
        description="Record a qualifying sale with a customer and a catalog property."
      />

      {serverError ? (
        <Alert variant="danger" title="We could not submit the sale">
          {serverError}
        </Alert>
      ) : null}

      <form className={styles.form} noValidate onSubmit={onSubmit}>
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Customer</legend>
          <SelectField
            id="sale-customerId"
            name="customerId"
            label="Customer"
            value={customerId}
            onChange={(value) => setField('customerId', value)}
            options={[...customerOptions, { value: '__new__', label: 'Add a new customer\u2026' }]}
            error={errors.customerId}
            hint="The customer is the buyer of the property."
          />
          {addingCustomer ? (
            <div className={styles.gridTwo}>
              <TextField
                id="sale-newCustomer"
                name="newCustomer"
                label="Customer full name"
                value={newCustomer.fullName}
                onChange={(value) => setField('newCustomer', value)}
                error={errors.newCustomer}
                autoComplete="name"
              />
              <TextField
                id="sale-newPhone"
                name="newPhone"
                type="tel"
                label="Customer phone"
                value={newCustomer.phone}
                onChange={(value) => setField('newPhone', value)}
                error={errors.newPhone}
                autoComplete="tel"
                inputMode="tel"
              />
              <TextField
                id="sale-newEmail"
                name="newEmail"
                type="email"
                label="Customer email"
                optional
                value={newCustomer.email}
                onChange={(value) => setField('newEmail', value)}
                error={errors.newEmail}
                autoComplete="email"
                inputMode="email"
              />
            </div>
          ) : null}
        </fieldset>

        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Property</legend>
          <SelectField
            id="sale-categoryId"
            name="categoryId"
            label="Category"
            value={categoryId}
            onChange={onCategoryChange}
            options={categoryOptions}
            error={errors.categoryId}
            hint="Choose a category to see the properties available in it."
          />
          <SelectField
            id="sale-propertyId"
            name="propertyId"
            label="Property Listings"
            value={propertyId}
            onChange={(value) => setField('propertyId', value)}
            options={propertyOptions}
            error={errors.propertyId}
            hint={
              categoryId
                ? 'Only properties in the selected category are listed.'
                : 'Select a category above to list its properties.'
            }
            disabled={!categoryId}
          />
          {selectedProperty ? (
            <div
              className={styles.snapshotPreview}
              role="status"
              aria-live="polite"
              aria-label="Sale value and commission preview"
            >
              Sale value:{' '}
              <span className={styles.snapshotValue}>{formatMoney(selectedProperty.price!)}</span>{' '}
              (locked at submission)
              {previewQuery.data ? (
                <>
                  <br />
                  <span className={styles.snapshotValue}>
                    {formatMoney(
                      multiplyMoney(selectedProperty.price!, previewQuery.data.directRate),
                    )}
                  </span>{' '}
                  your commission ({percentLabel(previewQuery.data.directRate)})
                  <br />
                  <span className={styles.snapshotValue}>
                    {formatMoney(
                      multiplyMoney(selectedProperty.price!, previewQuery.data.referralRate),
                    )}
                  </span>{' '}
                  {selectedReferrerName
                    ? `${selectedReferrerName.split(' (')[0]}’s commission`
                    : 'referral commission'}{' '}
                  ({percentLabel(previewQuery.data.referralRate)})
                </>
              ) : null}
            </div>
          ) : null}
        </fieldset>

        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Referral</legend>
          <SelectField
            id="sale-referrerId"
            name="referrerId"
            label="Referrer"
            optional
            value={referrerId}
            onChange={onReferrerChange}
            options={referrerOptions}
            error={errors.referrerId}
            hidePlaceholder
            disabled={!hasReferrerChoices}
            hint={
              !hasReferrerChoices
                ? 'You don’t have a sponsor or direct referrals yet, so no referral share applies to this sale.'
                : sponsor
                  ? 'Your sponsor is pre-selected. You can keep it or choose one of your direct referrals instead.'
                  : 'Choose the member who referred this customer from your direct referrals.'
            }
          />
          {referralsQuery.isError ? (
            <p className={styles.referrerHint} role="status">
              Could not load your direct referrals.
            </p>
          ) : null}
          {genealogyQuery.isError ? (
            <p className={styles.referrerHint} role="status">
              Could not load your sponsor.
            </p>
          ) : null}
        </fieldset>

        <div className={styles.actions}>
          <Button type="submit" loading={submitting} disabled={submitting}>
            Submit sale
          </Button>
          <p className={styles.note}>
            Your sale is recorded once. If your connection drops, you can safely submit
            again.
          </p>
        </div>
      </form>
    </section>
  );
}
