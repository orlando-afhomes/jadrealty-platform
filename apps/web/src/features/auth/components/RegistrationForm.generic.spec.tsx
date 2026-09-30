import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router';

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
  countries: [
    { code: 'US', name: 'United States', dialCode: '1', phoneMin: 10, phoneMax: 10 },
    { code: 'PH', name: 'Philippines' },
  ],
};

function renderForm(extraRoutes: Record<string, unknown> = {}) {
  mockFetchRoutes({
    '/config/public': CONFIG_US,
    '/programs': {
      data: [{ id: 'prg-abroad', code: 'ABROAD', name: 'Abroad', description: 'OFW program.' }],
      meta: {},
    },
    '/programs/prg-abroad/qualification-questions': { data: [], meta: {} },
    ...extraRoutes,
  });
  return renderWithProviders(
    <Routes>
      <Route
        path="/register"
        element={<RegistrationForm submit={vi.fn(async () => {})} mode="create" />}
      />
    </Routes>,
    { route: '/register' },
  );
}

describe('RegistrationForm non-PH address', () => {
  it('renders region/city text fields instead of PH selectors', async () => {
    renderForm();
    expect(await screen.findByLabelText('Region / state')).toBeInTheDocument();
    expect(screen.getByLabelText('City')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Province' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Barangay' })).not.toBeInTheDocument();
  });

  it('requires region and city and advances once provided', async () => {
    const user = userEvent.setup();
    renderForm();
    const continueButton = await screen.findByRole('button', { name: 'Continue' });

    await user.type(screen.getByLabelText('First name'), 'John');
    await user.type(screen.getByLabelText('Last name'), 'Doe');
    await user.click(screen.getByLabelText(/I don't have a middle initial/));
    await user.type(screen.getByLabelText('Phone number'), '+14155552671');
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.change(screen.getByLabelText('Date of birth'), { target: { value: '1990-06-06' } });
    await user.selectOptions(screen.getByLabelText('Gender'), 'Male');
    await user.click(continueButton);

    expect(screen.getByText('Enter your region/state.')).toBeInTheDocument();
    expect(screen.getByText('Enter your city.')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Region / state'), 'California');
    await user.type(screen.getByLabelText('City'), 'Los Angeles');
    await user.click(continueButton);
    // Empty question list allows continuing (pre-existing behavior).
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Qualification' })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Referral code' })).toBeInTheDocument(),
    );
  });

  it('rejects a US phone number with the wrong digit count', async () => {
    const user = userEvent.setup();
    renderForm();
    await screen.findByRole('button', { name: 'Continue' });

    await user.type(screen.getByLabelText('Phone number'), '415555267');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText('Enter a valid phone number.')).toBeInTheDocument();
  });

  it('offers international suggestions that fill region and city', async () => {
    const user = userEvent.setup();
    renderForm({
      '/locations/suggest': {
        data: [
          {
            label: 'Los Angeles, California, United States',
            region: 'California',
            city: 'Los Angeles',
          },
        ],
        meta: {},
      },
    });
    const continueButton = await screen.findByRole('button', { name: 'Continue' });

    await user.type(screen.getByLabelText('First name'), 'John');
    await user.type(screen.getByLabelText('Last name'), 'Doe');
    await user.click(screen.getByLabelText(/I don't have a middle initial/));
    await user.type(screen.getByLabelText('Phone number'), '+14155552671');
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.change(screen.getByLabelText('Date of birth'), { target: { value: '1990-06-06' } });
    await user.selectOptions(screen.getByLabelText('Gender'), 'Male');
    await user.type(screen.getByLabelText('City'), 'Los');

    // Debounced provider suggestions render as choices; picking one fills
    // both text fields and dismisses the list.
    const option = await screen.findByRole('button', {
      name: 'Los Angeles, California, United States',
    });
    await user.click(option);
    expect(screen.getByLabelText('Region / state')).toHaveValue('California');
    expect(screen.getByLabelText('City')).toHaveValue('Los Angeles');
    expect(
      screen.queryByRole('button', { name: 'Los Angeles, California, United States' }),
    ).not.toBeInTheDocument();

    await user.click(continueButton);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Qualification' })).toBeInTheDocument(),
    );
  });

  it('keeps free text submittable when suggestions are unavailable', async () => {
    const user = userEvent.setup();
    renderForm({
      '/locations/suggest': {
        body: { error: { code: 'INTERNAL', message: 'boom' } },
        status: 500,
      },
    });
    const continueButton = await screen.findByRole('button', { name: 'Continue' });

    await user.type(screen.getByLabelText('First name'), 'John');
    await user.type(screen.getByLabelText('Last name'), 'Doe');
    await user.click(screen.getByLabelText(/I don't have a middle initial/));
    await user.type(screen.getByLabelText('Phone number'), '+14155552671');
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.change(screen.getByLabelText('Date of birth'), { target: { value: '1990-06-06' } });
    await user.selectOptions(screen.getByLabelText('Gender'), 'Male');
    await user.type(screen.getByLabelText('Region / state'), 'California');
    await user.type(screen.getByLabelText('City'), 'Los Angeles');
    await user.click(continueButton);
    // Provider outage degrades silently - the typed values still advance.
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Qualification' })).toBeInTheDocument(),
    );
  });
});
