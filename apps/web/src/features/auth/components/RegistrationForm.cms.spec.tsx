import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router';

import type { RegisterContent } from '@jad/contracts';

import { RegistrationForm } from './RegistrationForm';
import { mockFetchRoutes, renderWithProviders } from '../../../test/utils';

vi.mock('../hooks/useLocationVerification', () => {
  const stable = {
    status: 'success' as const,
    data: {
      verifiedCountryCode: 'US',
      programId: 'prg-abroad',
      method: 'IP' as const,
      blocked: false,
      requiresException: false,
      verificationId: '550e8400-e29b-41d4-a716-446655440002',
    },
    error: null,
    retry: vi.fn(),
  };
  return { useLocationVerification: () => stable };
});

const CONFIG_US = {
  minimumAge: 18,
  genders: ['Male', 'Female', 'Others'],
  countries: [{ code: 'US', name: 'United States', dialCode: '1', phoneMin: 10, phoneMax: 10 }],
};

const CMS_COPY: Pick<
  RegisterContent,
  'stepTitles' | 'fields' | 'qualification' | 'submitLabel' | 'loginPrompt'
> = {
  stepTitles: {
    programProfile: 'Edited Program Step',
    qualification: 'Qualification',
    referral: 'Referral code',
    governmentId: 'Government ID',
    account: 'Account',
  },
  fields: {
    programId: { label: 'Program' },
    firstName: { label: 'Given name' },
    middleInitial: { label: 'Middle initial' },
    lastName: { label: 'Last name' },
    nameSuffix: { label: 'Name suffix' },
    dateOfBirth: { label: 'Date of birth' },
    gender: { label: 'Gender' },
    countryCode: { label: 'Country' },
    address: { label: 'Address' },
    phone: { label: 'Phone number' },
    email: { label: 'Email address' },
    password: { label: 'Password' },
    confirmPassword: { label: 'Confirm password' },
    referralCode: { label: 'Sponsor / referral code' },
    idDocument: { label: 'Government ID copy' },
    consent: { label: 'Consent' },
  },
  qualification: { domestic: [], abroad: [] },
  submitLabel: 'Create My Account',
  loginPrompt: { text: 'Already have a JA&D account?', linkLabel: 'Sign in' },
};

function renderForm(copy: typeof CMS_COPY) {
  mockFetchRoutes({
    '/config/public': CONFIG_US,
    '/programs': {
      data: [{ id: 'prg-abroad', code: 'ABROAD', name: 'Abroad', description: 'OFW program.' }],
      meta: {},
    },
    '/programs/prg-abroad/qualification-questions': { data: [], meta: {} },
  });
  return renderWithProviders(
    <Routes>
      <Route
        path="/register"
        element={<RegistrationForm submit={vi.fn(async () => {})} mode="create" copy={copy} />}
      />
    </Routes>,
    { route: '/register' },
  );
}

describe('RegistrationForm CMS copy', () => {
  it('renders CMS field labels and step titles instead of hard-coded copy', async () => {
    renderForm(CMS_COPY);
    expect(await screen.findByLabelText('Given name')).toBeInTheDocument();
    expect(screen.getByText('Edited Program Step')).toBeInTheDocument();
    expect(screen.queryByLabelText('First name')).not.toBeInTheDocument();
  });

  it('falls back to built-in copy when no CMS copy is provided', async () => {
    mockFetchRoutes({
      '/config/public': CONFIG_US,
      '/programs': {
        data: [{ id: 'prg-abroad', code: 'ABROAD', name: 'Abroad', description: 'OFW program.' }],
        meta: {},
      },
      '/programs/prg-abroad/qualification-questions': { data: [], meta: {} },
    });
    renderWithProviders(
      <Routes>
        <Route
          path="/register"
          element={<RegistrationForm submit={vi.fn(async () => {})} mode="create" />}
        />
      </Routes>,
      { route: '/register' },
    );
    expect(await screen.findByLabelText('First name')).toBeInTheDocument();
  });
});
