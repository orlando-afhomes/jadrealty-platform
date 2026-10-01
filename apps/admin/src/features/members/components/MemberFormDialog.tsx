import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, FormEvent, ReactNode } from 'react';

import { Button, Dialog, Select } from '@jad/ui';
import type { AdminMember } from '@jad/contracts';
import {
  capitalizePersonName,
  cutoffDateForMinAge,
  MAX_NAME_LENGTH,
  MAX_STREET_LENGTH,
  sanitizeMiddleInitial,
  sanitizePersonName,
  splitStoredPhone,
} from '@jad/contracts';

import { createMember } from '../repositories/memberRepository';
import { updateMember } from '../repositories/memberRepository';
import { useQueryClient } from '@tanstack/react-query';
import styles from './MemberFormDialog.module.css';
import {
  MEMBER_NAME_SUFFIXES,
  normalizeMemberForm,
  validateMemberForm,
  type MemberFormValues,
} from '../memberForm';
import {
  useMemberFormBarangays,
  useMemberFormCities,
  useMemberFormConfig,
  useMemberFormProvinces,
} from '../hooks/useMemberFormReference';
import { MemberLocationSelect } from './MemberLocationSelect';
import { MemberPhoneField } from './MemberPhoneField';

interface MemberFormDialogProps {
  open: boolean;
  onClose: () => void;
  member?: AdminMember | null;
}

const MAX_EMAIL_LENGTH = 254;
const MAX_PASSWORD_LENGTH = 72;

/** Static country fallback when public config is unreachable (names only). */
const FALLBACK_COUNTRIES = [
  { code: 'PH', name: 'Philippines' },
  { code: 'US', name: 'United States' },
  { code: 'JP', name: 'Japan' },
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'ES', name: 'Spain' },
  { code: 'SG', name: 'Singapore' },
];

const EMPTY_FORM: MemberFormValues = {
  firstName: '',
  middleInitial: '',
  noMiddleInitial: false,
  lastName: '',
  nameSuffix: '',
  email: '',
  temporaryPassword: '',
  phoneDial: '',
  phoneNational: '',
  dateOfBirth: '1992-01-01',
  gender: '',
  customGender: '',
  countryCode: 'PH',
  street: '',
  provinceCode: '',
  cityCode: '',
  barangayCode: '',
  region: '',
  city: '',
  programCode: 'ABROAD',
  referralCode: '',
};

const inputStyle = (invalid: boolean): CSSProperties => ({
  minHeight: 44,
  padding: '10px 12px',
  border: `1px solid ${invalid ? 'var(--color-danger)' : 'var(--color-border-default)'}`,
  borderRadius: 'var(--radius-md)',
  fontSize: 'var(--text-body-s)',
});

function Field({
  label,
  required,
  error,
  hint,
  children,
  htmlFor,
  errorId,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: ReactNode;
  htmlFor: string;
  errorId: string;
}) {
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <label htmlFor={htmlFor} style={{ fontSize: 'var(--text-body-s)', fontWeight: 600 }}>
        {label}{' '}
        {required ? (
          <span aria-hidden="true" style={{ color: 'var(--color-danger)' }}>
            *
          </span>
        ) : null}
      </label>
      {children}
      {error ? (
        <span
          id={errorId}
          style={{ color: 'var(--color-danger)', fontSize: 'var(--text-caption)' }}
          role="alert"
        >
          {error}
        </span>
      ) : hint ? (
        <span style={{ fontSize: 'var(--text-caption)', color: 'var(--color-text-muted)' }}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

export function MemberFormDialog({ open, onClose, member }: MemberFormDialogProps) {
  const isEdit = Boolean(member);
  const qc = useQueryClient();
  const [form, setForm] = useState<MemberFormValues>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | undefined>();
  const [isPending, setIsPending] = useState(false);
  const fieldsRef = useRef<HTMLDivElement>(null);
  const phoneSplitDone = useRef(false);
  // Fresh idempotency key per open: retries of the same open replay instead
  // of minting a second member; a reopened dialog mints a new member.
  const idempotencyKey = useRef('');
  const newIdempotencyKey = () => {
    try {
      const uuid = globalThis.crypto?.randomUUID?.();
      if (typeof uuid === 'string' && uuid) return uuid;
    } catch {
      // Fall through to the Math.random fallback below.
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  };

  const configQuery = useMemberFormConfig(open);
  const countries = configQuery.data?.countries;
  const minAge = configQuery.data?.minimumAge ?? 18;
  const countryList = useMemo(
    () => (countries && countries.length > 0 ? countries : FALLBACK_COUNTRIES),
    [countries],
  );
  const countryName =
    countryList.find((c) => c.code === form.countryCode)?.name ?? form.countryCode;

  const provincesQuery = useMemberFormProvinces(form.countryCode, open);
  const citiesQuery = useMemberFormCities(form.provinceCode, open);
  const barangaysQuery = useMemberFormBarangays(form.cityCode, open);
  const provinces = provincesQuery.data ?? [];
  const cities = citiesQuery.data ?? [];
  const barangays = barangaysQuery.data ?? [];

  // Independent city picked at the top level parents itself (register parity).
  const topIsCity = useMemo(
    () => provinces.find((p) => p.code === form.provinceCode)?.kind === 'city',
    [provinces, form.provinceCode],
  );
  const effectiveCityCode = topIsCity ? form.provinceCode : form.cityCode;

  const ctx = useMemo(
    () => ({
      minAge,
      countries,
      provinceCodes: provincesQuery.data ? provincesQuery.data.map((p) => p.code) : undefined,
      cityCodes: citiesQuery.data ? citiesQuery.data.map((c) => c.code) : undefined,
      barangayCodes: barangaysQuery.data ? barangaysQuery.data.map((b) => b.code) : undefined,
    }),
    [minAge, countries, provincesQuery.data, citiesQuery.data, barangaysQuery.data],
  );

  // Prefill on open / member change.
  useEffect(() => {
    phoneSplitDone.current = false;
    idempotencyKey.current = newIdempotencyKey();
    if (member) {
      const isOther = !['Male', 'Female'].includes(member.gender);
      setForm({
        firstName: member.firstName,
        middleInitial: member.middleInitial ?? '',
        noMiddleInitial: !member.middleInitial,
        lastName: member.lastName,
        nameSuffix: member.nameSuffix ?? '',
        email: member.email,
        temporaryPassword: '',
        phoneDial: '',
        phoneNational: member.phone,
        dateOfBirth: member.dateOfBirth,
        gender: isOther ? 'Others' : member.gender,
        customGender: isOther ? member.gender : '',
        countryCode: member.countryCode,
        street: member.address ?? '',
        provinceCode: member.provinceCode ?? '',
        cityCode: member.cityCode ?? '',
        barangayCode: member.barangayCode ?? '',
        region: member.regionName ?? '',
        city: member.cityName ?? '',
        programCode: member.program.code,
        referralCode: '',
      });
    } else {
      setForm(EMPTY_FORM);
    }
    setErrors({});
    setSubmitError(undefined);
  }, [member, open]);

  // Split the stored E.164 phone into dial + national once reference data
  // loads (edit mode). User edits afterwards are never clobbered.
  useEffect(() => {
    if (!member || !countries || phoneSplitDone.current) return;
    phoneSplitDone.current = true;
    const split = splitStoredPhone(member.phone, countries, member.countryCode);
    setForm((s) => ({ ...s, phoneDial: split.dial, phoneNational: split.national }));
  }, [member, countries]);

  const set = <K extends keyof MemberFormValues>(key: K, value: MemberFormValues[K]) => {
    setForm((s) => ({ ...s, [key]: value }));
  };

  const verifiedDial = useMemo(() => {
    const row = countries?.find((c) => c.code === form.countryCode);
    return row?.dialCode && /^[0-9]{1,4}$/.test(row.dialCode) ? row.dialCode : '';
  }, [countries, form.countryCode]);
  const effectiveDial = form.phoneDial || verifiedDial;

  const blurValidate = (key: string) => {
    const all = validateMemberForm({ ...form, phoneDial: effectiveDial }, ctx, { isEdit });
    if (!all[key]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    } else {
      setErrors((prev) => ({ ...prev, [key]: all[key] as string }));
    }
  };

  const focusFirstError = () => {
    const invalid = fieldsRef.current?.querySelector('[aria-invalid="true"]') as HTMLElement | null;
    invalid?.focus();
  };

  const handleCountryChange = (code: string) => {
    setForm((s) => ({
      ...s,
      countryCode: code,
      // Dependent address + phone rule reset (register parity).
      provinceCode: '',
      cityCode: '',
      barangayCode: '',
      region: '',
      city: '',
      phoneDial: '',
    }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next.provinceCode;
      delete next.cityCode;
      delete next.barangayCode;
      delete next.region;
      delete next.city;
      delete next.phone;
      return next;
    });
  };

  const handleProvinceChange = (code: string) => {
    setForm((s) => ({ ...s, provinceCode: code, cityCode: '', barangayCode: '' }));
  };

  const handleCityChange = (code: string) => {
    setForm((s) => ({ ...s, cityCode: code, barangayCode: '' }));
  };

  const handleSubmit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (isPending) return;
    const values: MemberFormValues = {
      ...form,
      phoneDial: form.phoneDial || verifiedDial,
      cityCode: effectiveCityCode,
    };
    const v = validateMemberForm(values, ctx, { isEdit });
    setErrors(v);
    if (Object.keys(v).length > 0) {
      focusFirstError();
      return;
    }
    setSubmitError(undefined);
    setIsPending(true);
    try {
      const normalized = normalizeMemberForm(values);
      if (isEdit && member) {
        await updateMember(member.id, {
          firstName: normalized.firstName,
          lastName: normalized.lastName,
          middleInitial: normalized.middleInitial,
          nameSuffix: normalized.nameSuffix,
          phone: normalized.phone,
          gender: normalized.gender,
          address: normalized.street || undefined,
        } as never);
        await qc.invalidateQueries({ queryKey: ['admin', 'member', member.id] });
        await qc.invalidateQueries({ queryKey: ['admin', 'members'] });
      } else {
        await createMember(
          {
            firstName: normalized.firstName,
            ...(normalized.middleInitial ? { middleInitial: normalized.middleInitial } : {}),
            lastName: normalized.lastName,
            ...(normalized.nameSuffix ? { nameSuffix: normalized.nameSuffix } : {}),
            email: normalized.email,
            phone: normalized.phone,
            gender: normalized.gender,
            address: normalized.street || undefined,
            countryCode: normalized.countryCode,
            countryName,
            ...(normalized.provinceCode ? { provinceCode: normalized.provinceCode } : {}),
            ...(normalized.cityCode ? { cityCode: normalized.cityCode } : {}),
            ...(normalized.barangayCode ? { barangayCode: normalized.barangayCode } : {}),
            ...(normalized.region ? { region: normalized.region } : {}),
            ...(normalized.city ? { city: normalized.city } : {}),
            programCode: normalized.programCode,
            dateOfBirth: normalized.dateOfBirth,
            temporaryPassword: normalized.temporaryPassword,
            ...(normalized.referralCode ? { referralCode: normalized.referralCode } : {}),
          },
          { idempotencyKey: idempotencyKey.current },
        );
        await qc.invalidateQueries({ queryKey: ['admin', 'members'] });
      }
      onClose();
    } catch (e) {
      setSubmitError((e as Error).message);
    } finally {
      setIsPending(false);
    }
  };

  const dobMax = cutoffDateForMinAge(minAge);
  const refFailed = configQuery.isError || provincesQuery.isError;
  const isPh = form.countryCode === 'PH';

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit Member' : 'Create Member'}
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            form="member-form"
            onClick={handleSubmit}
            loading={isPending}
          >
            {isEdit ? 'Save changes' : 'Create member'}
          </Button>
        </>
      }
    >
      <form
        id="member-form"
        noValidate
        onSubmit={(e) => {
          void handleSubmit(e);
        }}
        onKeyDown={(e) => {
          // Deterministic Enter-to-submit (jsdom and some browsers skip
          // implicit submission for form-associated buttons outside the
          // form element). The location combobox stops propagation when it
          // consumes Enter for option-pick, so this never double-fires.
          if (e.key !== 'Enter' || e.defaultPrevented) return;
          const target = e.target as HTMLElement | null;
          if (!target || target.tagName !== 'INPUT') return;
          if ((target as HTMLInputElement).type === 'checkbox') return;
          if (target.getAttribute('role') === 'combobox') return;
          e.preventDefault();
          void handleSubmit();
        }}
      >
        <div
          ref={fieldsRef}
          data-testid="member-form-fields"
          style={{
            display: 'grid',
            gap: 'var(--space-3)',
            minWidth: 'min(320px, 100%)',
            maxWidth: '100%',
          }}
        >
          {submitError ? (
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
              {submitError}
            </p>
          ) : null}
          {refFailed ? (
            <p
              role="status"
              style={{
                margin: 0,
                padding: '10px 12px',
                border: '1px solid var(--color-warning, #b7791f)',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--text-body-s)',
              }}
            >
              Reference data (countries/locations) could not be loaded - validation falls back to
              generic rules and the server re-checks everything.{' '}
              <button
                type="button"
                onClick={() => {
                  configQuery.refetch();
                  provincesQuery.refetch();
                }}
                style={{ textDecoration: 'underline', cursor: 'pointer' }}
              >
                Retry
              </button>
            </p>
          ) : null}

          <Field
            label="First Name"
            required
            htmlFor="member-firstName"
            errorId="member-firstName-error"
            error={errors.firstName}
          >
            <input
              id="member-firstName"
              value={form.firstName}
              onChange={(e) =>
                set('firstName', capitalizePersonName(sanitizePersonName(e.target.value)))
              }
              onBlur={(e) => {
                set('firstName', capitalizePersonName(e.target.value).trim() || e.target.value);
                blurValidate('firstName');
              }}
              placeholder="Juan"
              aria-label="First Name"
              aria-required="true"
              aria-invalid={Boolean(errors.firstName)}
              aria-describedby={errors.firstName ? 'member-firstName-error' : undefined}
              autoComplete="given-name"
              autoCapitalize="words"
              autoCorrect="off"
              spellCheck={false}
              maxLength={MAX_NAME_LENGTH}
              style={inputStyle(Boolean(errors.firstName))}
            />
          </Field>

          <Field
            label="Middle Initial"
            htmlFor="member-middleInitial"
            errorId="member-middleInitial-error"
            error={errors.middleInitial}
            hint="One letter (A–Z), or tick N/A when the member has none."
          >
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                id="member-middleInitial"
                value={form.middleInitial}
                onChange={(e) => set('middleInitial', sanitizeMiddleInitial(e.target.value))}
                onBlur={() => blurValidate('middleInitial')}
                placeholder="D"
                aria-label="Middle Initial"
                aria-required={!form.noMiddleInitial}
                aria-invalid={Boolean(errors.middleInitial)}
                aria-describedby={errors.middleInitial ? 'member-middleInitial-error' : undefined}
                autoComplete="off"
                maxLength={1}
                disabled={form.noMiddleInitial}
                style={{ ...inputStyle(Boolean(errors.middleInitial)), maxWidth: 88 }}
              />
              <label
                htmlFor="member-noMiddleInitial"
                style={{ fontSize: 'var(--text-body-s)', display: 'inline-flex', gap: 6 }}
              >
                <input
                  id="member-noMiddleInitial"
                  type="checkbox"
                  checked={form.noMiddleInitial}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setForm((s) => ({
                      ...s,
                      noMiddleInitial: checked,
                      middleInitial: checked ? '' : s.middleInitial,
                    }));
                  }}
                />
                N/A
              </label>
            </div>
          </Field>

          <Field
            label="Last Name"
            required
            htmlFor="member-lastName"
            errorId="member-lastName-error"
            error={errors.lastName}
          >
            <input
              id="member-lastName"
              value={form.lastName}
              onChange={(e) =>
                set('lastName', capitalizePersonName(sanitizePersonName(e.target.value)))
              }
              onBlur={(e) => {
                set('lastName', capitalizePersonName(e.target.value).trim() || e.target.value);
                blurValidate('lastName');
              }}
              placeholder="Dela Cruz"
              aria-label="Last Name"
              aria-required="true"
              aria-invalid={Boolean(errors.lastName)}
              aria-describedby={errors.lastName ? 'member-lastName-error' : undefined}
              autoComplete="family-name"
              autoCapitalize="words"
              autoCorrect="off"
              spellCheck={false}
              maxLength={MAX_NAME_LENGTH}
              style={inputStyle(Boolean(errors.lastName))}
            />
          </Field>

          <Field
            label="Name Suffix"
            htmlFor="member-nameSuffix"
            errorId="member-nameSuffix-error"
            error={errors.nameSuffix}
            hint="Optional - fixed choices only."
          >
            <Select
              aria-label="Name Suffix"
              aria-invalid={Boolean(errors.nameSuffix)}
              aria-describedby={errors.nameSuffix ? 'member-nameSuffix-error' : undefined}
              value={form.nameSuffix}
              onChange={(e) => set('nameSuffix', e.target.value)}
              options={[
                { value: '', label: 'None' },
                ...MEMBER_NAME_SUFFIXES.map((suffix) => ({ value: suffix, label: suffix })),
              ]}
            />
          </Field>

          <Field
            label="Email"
            required
            htmlFor="member-email"
            errorId="member-email-error"
            error={errors.email}
            hint={isEdit ? 'Email cannot be changed' : undefined}
          >
            <input
              id="member-email"
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value.toLowerCase())}
              onBlur={() => {
                set('email', form.email.trim().toLowerCase() || form.email);
                if (!isEdit) blurValidate('email');
              }}
              placeholder="juan.delacruz@example.com"
              aria-label="Email"
              aria-required="true"
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? 'member-email-error' : undefined}
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              maxLength={MAX_EMAIL_LENGTH}
              disabled={isEdit}
              style={{
                ...inputStyle(Boolean(errors.email)),
                background: isEdit ? 'var(--color-bg-surface)' : 'var(--color-bg-surface-raised)',
              }}
            />
          </Field>

          {!isEdit ? (
            <Field
              label="Temporary Password"
              required
              htmlFor="member-temporaryPassword"
              errorId="member-temporaryPassword-error"
              error={errors.temporaryPassword}
              hint="8–72 characters. The member can change this after first login."
            >
              <input
                id="member-temporaryPassword"
                type="password"
                value={form.temporaryPassword}
                onChange={(e) => set('temporaryPassword', e.target.value)}
                onBlur={() => blurValidate('temporaryPassword')}
                placeholder="Min. 8 characters"
                aria-label="Temporary Password"
                aria-required="true"
                aria-invalid={Boolean(errors.temporaryPassword)}
                aria-describedby={
                  errors.temporaryPassword ? 'member-temporaryPassword-error' : undefined
                }
                autoComplete="new-password"
                maxLength={MAX_PASSWORD_LENGTH}
                style={inputStyle(Boolean(errors.temporaryPassword))}
              />
            </Field>
          ) : null}

          <MemberPhoneField
            dial={effectiveDial}
            national={form.phoneNational}
            countries={countries}
            error={errors.phone}
            disabled={isPending}
            onDialChange={(dial) => set('phoneDial', dial)}
            onNationalChange={(national) => set('phoneNational', national)}
          />

          <Field
            label="Date of Birth"
            required
            htmlFor="member-dateOfBirth"
            errorId="member-dateOfBirth-error"
            error={errors.dateOfBirth}
          >
            <input
              id="member-dateOfBirth"
              type="date"
              value={form.dateOfBirth}
              onChange={(e) => set('dateOfBirth', e.target.value)}
              onBlur={() => blurValidate('dateOfBirth')}
              aria-label="Date of Birth"
              aria-required="true"
              aria-invalid={Boolean(errors.dateOfBirth)}
              aria-describedby={errors.dateOfBirth ? 'member-dateOfBirth-error' : undefined}
              autoComplete="bday"
              max={dobMax}
              className={`${styles.control} ${styles.date} ${errors.dateOfBirth ? styles.controlError : ''}`}
            />
          </Field>

          <Field
            label="Gender"
            required
            htmlFor="member-gender"
            errorId="member-gender-error"
            error={errors.gender}
          >
            <select
              id="member-gender"
              value={form.gender}
              onChange={(e) => setForm((s) => ({ ...s, gender: e.target.value, customGender: '' }))}
              onBlur={() => blurValidate('gender')}
              aria-label="Gender"
              aria-required="true"
              aria-invalid={Boolean(errors.gender)}
              aria-describedby={errors.gender ? 'member-gender-error' : undefined}
              className={`${styles.control} ${styles.select} ${errors.gender ? styles.controlError : ''}`}
            >
              <option value="">Select gender</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Others">Others</option>
            </select>
          </Field>

          {form.gender === 'Others' ? (
            <Field
              label="Specify Gender"
              required
              htmlFor="member-customGender"
              errorId="member-customGender-error"
              error={errors.customGender}
            >
              <input
                id="member-customGender"
                value={form.customGender}
                onChange={(e) => set('customGender', e.target.value)}
                onBlur={() => blurValidate('customGender')}
                placeholder="Enter gender"
                aria-label="Specify Gender"
                aria-required="true"
                aria-invalid={Boolean(errors.customGender)}
                aria-describedby={errors.customGender ? 'member-customGender-error' : undefined}
                autoComplete="off"
                maxLength={MAX_NAME_LENGTH}
                style={inputStyle(Boolean(errors.customGender))}
              />
            </Field>
          ) : null}

          <Field
            label="Country"
            required
            htmlFor="member-country"
            errorId="member-country-error"
            error={errors.country}
            hint={isEdit ? 'Country is immutable per BR-REG-010' : undefined}
          >
            <Select
              aria-label="Country"
              aria-required="true"
              aria-invalid={Boolean(errors.country)}
              aria-describedby={errors.country ? 'member-country-error' : undefined}
              value={form.countryCode}
              onChange={(e) => handleCountryChange(e.target.value)}
              options={countryList.map((c) => ({ value: c.code, label: `${c.name} (${c.code})` }))}
              disabled={isEdit || isPending}
            />
          </Field>

          {!isEdit ? (
            <Field
              label="Program"
              htmlFor="member-program"
              errorId="member-program-error"
              error={errors.programCode}
            >
              <Select
                aria-label="Program"
                aria-invalid={Boolean(errors.programCode)}
                aria-describedby={errors.programCode ? 'member-program-error' : undefined}
                value={form.programCode}
                disabled={isPending}
                onChange={(e) => set('programCode', e.target.value)}
                options={[
                  { value: 'ABROAD', label: 'Abroad' },
                  { value: 'DOMESTIC', label: 'Domestic' },
                ]}
              />
            </Field>
          ) : null}

          <Field
            label="Street Address"
            required
            htmlFor="member-street"
            errorId="member-street-error"
            error={errors.street}
          >
            <input
              id="member-street"
              value={form.street}
              onChange={(e) => set('street', e.target.value)}
              onBlur={() => {
                set('street', form.street.trim());
                blurValidate('street');
              }}
              placeholder="123 Mabini St, Quezon City"
              aria-label="Street Address"
              aria-required="true"
              aria-invalid={Boolean(errors.street)}
              aria-describedby={errors.street ? 'member-street-error' : undefined}
              autoComplete="street-address"
              maxLength={MAX_STREET_LENGTH}
              style={inputStyle(Boolean(errors.street))}
            />
          </Field>

          {!isEdit && isPh ? (
            <>
              <MemberLocationSelect
                required
                id="member-provinceCode"
                label="Province"
                value={form.provinceCode}
                options={provinces.map((p) => ({ value: p.code, label: p.name }))}
                onChange={handleProvinceChange}
                error={errors.provinceCode}
                disabled={provincesQuery.isPending}
                loading={provincesQuery.isPending}
              />
              {form.provinceCode ? (
                topIsCity ? (
                  <p style={{ margin: 0, fontSize: 'var(--text-body-s)' }}>
                    City/municipality: <strong>{form.provinceCode}</strong> (independent city
                    selects itself)
                  </p>
                ) : (
                  <MemberLocationSelect
                    required
                    id="member-cityCode"
                    label="City / Municipality"
                    value={form.cityCode}
                    options={cities.map((c) => ({ value: c.code, label: c.name }))}
                    onChange={handleCityChange}
                    error={errors.cityCode}
                    disabled={citiesQuery.isPending}
                    loading={citiesQuery.isPending}
                  />
                )
              ) : null}
              {effectiveCityCode ? (
                <MemberLocationSelect
                  required
                  id="member-barangayCode"
                  label="Barangay"
                  value={form.barangayCode}
                  options={barangays.map((b) => ({ value: b.code, label: b.name }))}
                  onChange={(code) => set('barangayCode', code)}
                  error={errors.barangayCode}
                  disabled={barangaysQuery.isPending}
                  loading={barangaysQuery.isPending}
                />
              ) : null}
            </>
          ) : null}

          {!isEdit && !isPh ? (
            <>
              <Field
                label="Region / State"
                required
                htmlFor="member-region"
                errorId="member-region-error"
                error={errors.region}
              >
                <input
                  id="member-region"
                  value={form.region}
                  onChange={(e) => set('region', e.target.value)}
                  onBlur={() => {
                    set('region', form.region.trim());
                    blurValidate('region');
                  }}
                  placeholder="California"
                  aria-label="Region or State"
                  aria-required="true"
                  aria-invalid={Boolean(errors.region)}
                  aria-describedby={errors.region ? 'member-region-error' : undefined}
                  autoComplete="address-level1"
                  maxLength={MAX_NAME_LENGTH}
                  style={inputStyle(Boolean(errors.region))}
                />
              </Field>
              <Field
                label="City"
                required
                htmlFor="member-city"
                errorId="member-city-error"
                error={errors.city}
              >
                <input
                  id="member-city"
                  value={form.city}
                  onChange={(e) => set('city', e.target.value)}
                  onBlur={() => {
                    set('city', form.city.trim());
                    blurValidate('city');
                  }}
                  placeholder="Los Angeles"
                  aria-label="City"
                  aria-required="true"
                  aria-invalid={Boolean(errors.city)}
                  aria-describedby={errors.city ? 'member-city-error' : undefined}
                  autoComplete="address-level2"
                  maxLength={MAX_NAME_LENGTH}
                  style={inputStyle(Boolean(errors.city))}
                />
              </Field>
            </>
          ) : null}

          {isEdit ? (
            <p
              style={{
                margin: 0,
                fontSize: 'var(--text-body-s)',
                color: 'var(--color-text-muted)',
              }}
            >
              Location: {member?.provinceName ?? ''} {member?.cityName ?? ''}{' '}
              {member?.barangayName ?? ''} {member?.regionName ?? ''} (managed via registration
              data)
            </p>
          ) : null}

          {!isEdit ? (
            <Field
              label="Sponsor referral code (optional)"
              htmlFor="member-referralCode"
              errorId="member-referralCode-error"
              error={errors.referralCode}
              hint="Links this member under an active, qualified sponsor for genealogy and referral commissions."
            >
              <input
                id="member-referralCode"
                type="text"
                value={form.referralCode}
                onChange={(e) => set('referralCode', e.target.value)}
                onBlur={() => {
                  set('referralCode', form.referralCode.trim());
                  blurValidate('referralCode');
                }}
                aria-label="Sponsor referral code"
                aria-required="true"
                aria-invalid={Boolean(errors.referralCode)}
                aria-describedby={errors.referralCode ? 'member-referralCode-error' : undefined}
                placeholder="e.g. JAD-DOE12"
                autoComplete="off"
                maxLength={40}
                style={inputStyle(Boolean(errors.referralCode))}
              />
            </Field>
          ) : null}
        </div>
      </form>
    </Dialog>
  );
}
