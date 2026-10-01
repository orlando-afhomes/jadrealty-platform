import {
  buildPhoneRuleForDial,
  dialCodeOptions,
  maxNationalLength,
  sanitizeNationalInput,
} from '@jad/contracts';
import type { CountryPhoneMeta } from '@jad/contracts';

import styles from './MemberFormDialog.module.css';

interface MemberPhoneFieldProps {
  /** Dial digits without '+', e.g. '63'. Never mutates the residence country. */
  dial: string;
  /** National significant number, digits only. */
  national: string;
  countries: CountryPhoneMeta[] | undefined;
  error?: string;
  disabled?: boolean;
  onDialChange: (dial: string) => void;
  onNationalChange: (national: string) => void;
  idPrefix?: string;
}

/**
 * Phone input with country-code dropdown - the same behavior as
 * `/register`'s `PhoneField`: the dropdown never changes the residence
 * country, input is digits-only and capped at the dial rule's max length
 * (typing and pasting can never exceed it), and `+<dial> - N digits` hints
 * the expected shape. Length/format enforcement stays in
 * `validatePhoneNumber` at submit.
 */
export function MemberPhoneField({
  dial,
  national,
  countries,
  error,
  disabled,
  onDialChange,
  onNationalChange,
  idPrefix = 'member',
}: MemberPhoneFieldProps) {
  const options = dialCodeOptions(countries);
  const rule = buildPhoneRuleForDial(countries, dial);
  const maxLen = maxNationalLength(rule);
  const dialId = `${idPrefix}-phoneDial`;
  const nationalId = `${idPrefix}-phone`;
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <label htmlFor={nationalId} style={{ fontSize: 'var(--text-body-s)', fontWeight: 600 }}>
        Phone <span style={{ color: 'var(--color-danger)' }}>*</span>
      </label>
      <div style={{ display: 'flex', gap: 8 }}>
        <select
          id={dialId}
          aria-label="Country code"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${nationalId}-error` : `${nationalId}-hint`}
          value={dial}
          onChange={(e) => onDialChange(e.target.value)}
          disabled={disabled}
          className={`${styles.control} ${styles.select} ${error ? styles.controlError : ''}`}
          style={{ maxWidth: 168 }}
        >
          {options.length === 0 ? <option value="">+</option> : null}
          {options.map((option) => (
            <option key={`${option.dial}-${option.countryCode}`} value={option.dial}>
              {option.label}
            </option>
          ))}
        </select>
        <input
          id={nationalId}
          value={national}
          onChange={(e) => onNationalChange(sanitizeNationalInput(e.target.value, dial, maxLen))}
          placeholder={dial === '63' ? '917 123 4567' : 'Phone number'}
          aria-label="Phone number"
          aria-required="true"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${nationalId}-error` : `${nationalId}-hint`}
          inputMode="numeric"
          autoComplete="tel-national"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={maxLen}
          disabled={disabled}
          className={`${styles.control} ${error ? styles.controlError : ''}`}
          style={{ flex: 1, minWidth: 0 }}
        />
      </div>
      {error ? (
        <span
          id={`${nationalId}-error`}
          style={{ color: 'var(--color-danger)', fontSize: 'var(--text-caption)' }}
          role="alert"
        >
          {error}
        </span>
      ) : (
        <span
          id={`${nationalId}-hint`}
          style={{ fontSize: 'var(--text-caption)', color: 'var(--color-text-muted)' }}
        >
          {dial ? `+${dial} - ${maxLen} digits` : 'Select a country code first'}
        </span>
      )}
    </div>
  );
}
