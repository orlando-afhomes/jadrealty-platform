import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router';

import { CMS_REGISTER_SEED } from '@jad/contracts';

import { RegisterPage } from './RegisterPage';
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

describe('RegisterPage CMS wiring', () => {
  it('renders admin-edited field labels from /cms/register', async () => {
    mockFetchRoutes({
      '/cms/register': {
        ...CMS_REGISTER_SEED,
        fields: {
          ...CMS_REGISTER_SEED.fields,
          firstName: { label: 'Given name' },
        },
      },
      '/config/public': CONFIG_US,
      '/programs': {
        data: [{ id: 'prg-abroad', code: 'ABROAD', name: 'Abroad', description: 'OFW program.' }],
        meta: {},
      },
      '/programs/prg-abroad/qualification-questions': { data: [], meta: {} },
    });
    renderWithProviders(
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
      </Routes>,
      { route: '/register' },
    );

    expect(await screen.findByLabelText('Given name')).toBeInTheDocument();
    expect(screen.queryByLabelText('First name')).not.toBeInTheDocument();
  });
});
