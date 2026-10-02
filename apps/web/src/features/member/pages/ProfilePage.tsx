import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router';

import type { UpdateProfileRequest } from '@jad/contracts';
import { formatMoney } from '@jad/shared';
import {
  ConfirmDialog,
  ErrorState,
  Icon,
  notifySuccess,
  PageHeader,
  QrCode,
  Skeleton,
  StatusChip,
} from '@jad/ui';

import { Button } from '../../../components/Button';
import { Alert } from '../../../components/Alert';
import { apiErrorMessage } from '../../../lib/api/errorMessage';
import { orphanMessageFor } from '../../../lib/api/orphan';
import { useDirectReferrals, useGenealogy, useMemberProfile, usePayoutAccounts, useVouchers } from '../hooks/useMember';
import { formatDate, MEMBER_STATUS_TONE, memberStatusLabel, payoutMethodLabel } from '../lib/presentation';
import { updateProfile } from '../services/member';
import { SelectField } from '../../auth/components/SelectField';
import { TextField } from '../../auth/components/TextField';
import styles from './ProfilePage.module.css';

/**
 * Member profile (SCR-MEM-002). Read-only view of `GET /members/:id` (own
 * profile only - object-level, NFR-AUTHZ-002) with an edit mode for mutable
 * fields (`PATCH /me`). Country is immutable (BR-REG-010) and rendered
 * read-only; the referral code is immutable (BR-REF-004) and not editable.
 *
 * Below the details, linked-account summaries (payout account, voucher QR,
 * network) give an at-a-glance overview with links to each full page. Each
 * block loads independently so one failing query never blanks the others.
 */
function PayoutAccountSummary() {
  const accountsQuery = usePayoutAccounts();
  // Full account number is visible by default; the toggle masks it.
  const [revealed, setRevealed] = useState(true);

  if (accountsQuery.isLoading) {
    return (
      <div className={styles.linkedBlock}>
        <h2 className={styles.linkedTitle}>Payout account</h2>
        <div role="status" aria-label="Loading payout account">
          <Skeleton />
        </div>
      </div>
    );
  }

  const accounts = accountsQuery.data ?? [];
  const featured =
    accounts.find((account) => account.isPrimary) ??
    accounts.find((account) => account.status === 'CONFIRMED') ??
    accounts[0];

  return (
    <div className={styles.linkedBlock}>
      <h2 className={styles.linkedTitle}>Payout account</h2>
      {accountsQuery.isError || !featured ? (
        <p className={styles.linkedText}>
          {accountsQuery.isError
            ? 'Could not load your payout accounts.'
            : 'No payout account yet.'}{' '}
          <Link className={styles.linkedLink} to="/member/payouts/new">
            Add a payout account
          </Link>
        </p>
      ) : (
        <>
          <p className={styles.linkedText}>
            {payoutMethodLabel(featured.method)} ·{' '}
            <span className={styles.accountNumber}>
              {revealed
                ? (featured.accountIdentifier ?? featured.accountIdentifierMasked)
                : featured.accountIdentifierMasked}
            </span>{' '}
            <button
              type="button"
              className={styles.eyeButton}
              aria-pressed={revealed}
              aria-label={revealed ? 'Hide account number' : 'Show account number'}
              title={revealed ? 'Hide account number' : 'Show account number'}
              onClick={() => setRevealed((current) => !current)}
            >
              <Icon name={revealed ? 'eye-off' : 'eye'} size={16} />
            </button>{' '}
            {featured.isPrimary ? <span className={styles.primaryBadge}>Primary</span> : null}
          </p>
          <Link className={styles.linkedLink} to="/member/payouts">
            Manage payout accounts
          </Link>
        </>
      )}
    </div>
  );
}

function VoucherSummary() {
  const vouchersQuery = useVouchers();

  if (vouchersQuery.isLoading) {
    return (
      <div className={styles.linkedBlock}>
        <h2 className={styles.linkedTitle}>Voucher</h2>
        <div role="status" aria-label="Loading voucher">
          <Skeleton />
        </div>
      </div>
    );
  }

  const active = (vouchersQuery.data ?? []).find((voucher) => voucher.status === 'ACTIVE');

  return (
    <div className={styles.linkedBlock}>
      <h2 className={styles.linkedTitle}>Voucher</h2>
      {vouchersQuery.isError || !active ? (
        <p className={styles.linkedText}>
          {vouchersQuery.isError
            ? 'Could not load your vouchers.'
            : 'No active vouchers. Vouchers appear here after they are issued.'}{' '}
          <Link className={styles.linkedLink} to="/member/vouchers">
            View vouchers
          </Link>
        </p>
      ) : (
        <div className={styles.qrRow}>
          <QrCode value={active.code} size={96} alt={`QR code for voucher ${active.code}`} />
          <div>
            <p className={styles.linkedText}>
              <span className={styles.code}>{active.code}</span> ·{' '}
              {formatMoney(active.remainingValue)} left
            </p>
            <Link className={styles.linkedLink} to="/member/vouchers">
              View vouchers
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function NetworkSummary() {
  const genealogyQuery = useGenealogy();
  const referralsQuery = useDirectReferrals();

  if (genealogyQuery.isLoading || referralsQuery.isLoading) {
    return (
      <div className={styles.linkedBlock}>
        <h2 className={styles.linkedTitle}>Network</h2>
        <div role="status" aria-label="Loading network">
          <Skeleton />
        </div>
      </div>
    );
  }

  const sponsorName = genealogyQuery.data?.sponsor?.name;
  const directCount = (referralsQuery.data ?? []).length;

  return (
    <div className={styles.linkedBlock}>
      <h2 className={styles.linkedTitle}>Network</h2>
      {genealogyQuery.isError && referralsQuery.isError ? (
        <p className={styles.linkedText}>
          Could not load your network.{' '}
          <Link className={styles.linkedLink} to="/member/referrals/network">
            View network
          </Link>
        </p>
      ) : (
        <>
          <p className={styles.linkedText}>
            {sponsorName ? (
              <>
                Sponsored by <strong>{sponsorName}</strong> ·{' '}
              </>
            ) : (
              'No sponsor linked · '
            )}
            {directCount} direct referral{directCount === 1 ? '' : 's'}
          </p>
          <Link className={styles.linkedLink} to="/member/referrals/network">
            View network
          </Link>
        </>
      )}
    </div>
  );
}
export function ProfilePage() {
  const profileQuery = useMemberProfile();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<UpdateProfileRequest | undefined>(undefined);
  const [error, setError] = useState<string | undefined>();
  const [copied, setCopied] = useState(false);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);

  const initForm = () => {
    const p = profileQuery.data;
    if (!p) return;
    setForm({
      firstName: p.firstName,
      lastName: p.lastName,
      middleInitial: p.middleInitial,
      nameSuffix: p.nameSuffix,
      gender: p.gender,
      address: p.address,
      phone: p.phone,
    });
  };

  const profileMutation = useMutation({
    mutationFn: (input: UpdateProfileRequest) => updateProfile(input),
    onSuccess: () => {
      setEditing(false);
      setError(undefined);
      setForm(undefined);
      notifySuccess({ title: 'Profile updated' });
      void queryClient.invalidateQueries({ queryKey: ['member', 'profile'] });
      void queryClient.invalidateQueries({ queryKey: ['member', 'sales'] });
    },
    onError: (mutationError) => {
      setError(apiErrorMessage(mutationError, 'We could not save your profile. Please try again.'));
    },
  });

  const isDirty = (() => {
    if (!form || !profileQuery.data) return false;
    const p = profileQuery.data;
    return (
      form.firstName !== p.firstName ||
      form.lastName !== p.lastName ||
      (form.middleInitial ?? '') !== (p.middleInitial ?? '') ||
      (form.nameSuffix ?? '') !== (p.nameSuffix ?? '') ||
      form.gender !== p.gender ||
      (form.address ?? '') !== (p.address ?? '') ||
      form.phone !== p.phone
    );
  })();

  const handleCancel = () => {
    if (isDirty) {
      setConfirmDiscardOpen(true);
      return;
    }
    setEditing(false);
    setError(undefined);
    setForm(undefined);
  };

  const confirmDiscard = () => {
    setConfirmDiscardOpen(false);
    setEditing(false);
    setError(undefined);
    setForm(undefined);
  };

  if (profileQuery.isLoading) {
    return (
      <section>
        <PageHeader title="Profile" />

        <div className={styles.loading} role="status" aria-live="polite" aria-busy="true">
          <Skeleton />
          <Skeleton />
          <Skeleton />
        </div>
      </section>
    );
  }

  if (profileQuery.isError || !profileQuery.data) {
    return (
      <section>
        <PageHeader title="Profile" />

        <ErrorState
          error={profileQuery.error}
          title="Could not load your profile"
          message={orphanMessageFor(profileQuery.error)}
          onRetry={() => void profileQuery.refetch()}
        />
      </section>
    );
  }

  const profile = profileQuery.data;

  const setField = <K extends keyof UpdateProfileRequest>(
    field: K,
    value: UpdateProfileRequest[K],
  ) => {
    setForm((current) => ({ ...(current as UpdateProfileRequest), [field]: value }));
  };

  const onSave = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form) return;
    setError(undefined);
    profileMutation.mutate(form);
  };

  return (
    <section>
      <PageHeader
        title="Profile"
        description="Your member details."
        actions={
          !editing ? (
            <Button
              variant="secondary"
              onClick={() => {
                initForm();
                setEditing(true);
              }}
            >
              Edit
            </Button>
          ) : null
        }
      />

      {error ? (
        <Alert variant="danger" title="We could not save your profile">
          {error}
        </Alert>
      ) : null}

      <div className={styles.profileGrid}>
        <div>
          {editing && form ? (
          <div className={styles.editCard}>
          <form className={styles.form} noValidate onSubmit={onSave}>
            <div className={styles.gridTwo}>
              <TextField
                id="profile-firstName"
                name="firstName"
                label="First name"
                value={form.firstName}
                onChange={(value) => setField('firstName', value)}
                autoComplete="given-name"
                placeholder="Juan"
                maxLength={30}
              />
              <TextField
                id="profile-lastName"
                name="lastName"
                label="Last name"
                value={form.lastName}
                onChange={(value) => setField('lastName', value)}
                autoComplete="family-name"
                placeholder="Dela Cruz"
                maxLength={30}
              />
            </div>
            <div className={styles.gridThree}>
              <TextField
                id="profile-middleInitial"
                name="middleInitial"
                label="Middle initial"
                optional
                value={form.middleInitial ?? ''}
                onChange={(value) => setField('middleInitial', value.slice(0, 1))}
                autoComplete="off"
                placeholder="M"
                maxLength={1}
                hint="Single letter (A-Z)"
              />
              <TextField
                id="profile-nameSuffix"
                name="nameSuffix"
                label="Name suffix"
                optional
                value={form.nameSuffix ?? ''}
                onChange={(value) => setField('nameSuffix', value)}
                autoComplete="off"
                placeholder="Jr."
                maxLength={10}
              />
              <TextField
                id="profile-phone"
                name="phone"
                type="tel"
                label="Phone number"
                value={form.phone}
                onChange={(value) => setField('phone', value)}
                autoComplete="tel"
                inputMode="tel"
                placeholder="+63 917 555 0199"
                hint="+63 9xx • 11 digits"
              />
            </div>
            <SelectField
              id="profile-gender"
              name="gender"
              label="Gender"
              value={form.gender}
              onChange={(value) => setField('gender', value)}
              options={(profileQuery.data?.gender
                ? [profile.gender, 'Male', 'Female', 'LGBT']
                : ['Male', 'Female', 'LGBT']
              )
                .filter((gender, index, all) => all.indexOf(gender) === index)
                .map((gender) => ({ value: gender, label: gender }))}
            />
            <TextField
              id="profile-address"
              name="address"
              label="Address"
              optional
              value={form.address ?? ''}
              onChange={(value) => setField('address', value)}
              autoComplete="street-address"
              placeholder="123 Mabini St, Pasig City"
            />
            <div className={styles.formActions}>
              <Button
                type="submit"
                loading={profileMutation.isPending}
                disabled={profileMutation.isPending}
              >
                Save changes
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={handleCancel}
                disabled={profileMutation.isPending}
              >
                Cancel
              </Button>
            </div>
          </form>
        </div>
      ) : (
        <dl className={styles.details}>
          <div className={styles.item}>
            <dt>Name</dt>
            <dd>
              {profile.firstName} {profile.middleInitial ? `${profile.middleInitial}. ` : ''}
              {profile.lastName}
              {profile.nameSuffix ? `, ${profile.nameSuffix}` : ''}
            </dd>
          </div>
          <div className={styles.item}>
            <dt>Email</dt>
            <dd>{profile.email}</dd>
          </div>
          <div className={styles.item}>
            <dt>Phone</dt>
            <dd>{profile.phone}</dd>
          </div>
          <div className={styles.item}>
            <dt>Date of birth</dt>
            <dd>
              {formatDate(profile.dateOfBirth)} (age {profile.age})
            </dd>
          </div>
          <div className={styles.item}>
            <dt>Gender</dt>
            <dd>{profile.gender}</dd>
          </div>
          <div className={styles.item}>
            <dt>Country</dt>
            <dd>
              {profile.countryName} <span className={styles.immutable}>(immutable)</span>
            </dd>
          </div>
          {profile.address ? (
            <div className={styles.item}>
              <dt>Address</dt>
              <dd>{profile.address}</dd>
            </div>
          ) : null}
          <div className={styles.item}>
            <dt>Program</dt>
            <dd>
              {profile.program.name} ({profile.program.code})
            </dd>
          </div>
          <div className={styles.item}>
            <dt>Status</dt>
            <dd>
              <StatusChip
                label={memberStatusLabel(profile.status)}
                tone={MEMBER_STATUS_TONE[profile.status]}
              />
            </dd>
          </div>
          <div className={styles.item}>
            <dt>Referral code</dt>
            <dd className={styles.referralCell}>
              <span className={styles.code}>{profile.referralCode}</span>{' '}
              <span className={styles.immutable}>(immutable)</span>{' '}
              <button
                type="button"
                className={styles.copyButton}
                aria-live="polite"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(profile.referralCode);
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1600);
                  } catch {
                    setCopied(false);
                  }
                }}
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </dd>
          </div>
        </dl>
      )}
      </div>

      <div className={styles.linked}>
        <PayoutAccountSummary />
        <VoucherSummary />
        <NetworkSummary />
      </div>
      </div>

      <ConfirmDialog
        open={confirmDiscardOpen}
        onCancel={() => setConfirmDiscardOpen(false)}
        onConfirm={confirmDiscard}
        title="Discard changes?"
        message="You have unsaved changes. Discard them?"
        confirmLabel="Discard"
        cancelLabel="Keep editing"
      />
    </section>
  );
}
