import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router';

import { PolicyDetailPage } from './PolicyDetailPage';
import { mockFetchNetworkError, mockFetchRoutes, renderWithProviders } from '../../../test/utils';

const POLICIES = {
  data: [
    {
      id: 'pol-001',
      title: 'Terms and Conditions',
      type: 'terms',
      content: 'These are the terms and conditions.\nSecond paragraph, plain text.',
      documentUrl: 'https://cdn.test/terms.pdf',
      updatedAt: '2026-07-01T10:00:00.000Z',
    },
    {
      id: 'pol-003',
      title: 'Privacy Policy',
      type: 'privacy',
      content: 'This is the privacy policy.',
      updatedAt: '2026-07-15T10:00:00.000Z',
    },
  ],
  meta: {},
};

function renderAt(path: string) {
  return renderWithProviders(
    <Routes>
      <Route path="/policies/:policyId" element={<PolicyDetailPage />} />
    </Routes>,
    { route: path },
  );
}

describe('public PolicyDetailPage', () => {
  it('renders policy content as plain text with a PDF link', async () => {
    mockFetchRoutes({ '/policies': POLICIES });
    renderAt('/policies/pol-001');

    expect(
      await screen.findByRole('heading', { name: 'Terms and Conditions' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/These are the terms and conditions\.\s+Second paragraph, plain text\./),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View PDF' })).toHaveAttribute(
      'href',
      'https://cdn.test/terms.pdf',
    );
    expect(screen.getByRole('link', { name: 'All policies' })).toHaveAttribute('href', '/policies');
  });

  it('renders content without a PDF link when the policy has none', async () => {
    mockFetchRoutes({ '/policies': POLICIES });
    renderAt('/policies/pol-003');

    expect(await screen.findByRole('heading', { name: 'Privacy Policy' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'View PDF' })).not.toBeInTheDocument();
  });

  it('renders a not-found state for an unknown policy id', async () => {
    mockFetchRoutes({ '/policies': POLICIES });
    renderAt('/policies/pol-999');

    expect(await screen.findByRole('heading', { name: 'Policy not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'All policies' })).toHaveAttribute('href', '/policies');
  });

  it('falls back to static content when the API is unreachable (Q6)', async () => {
    mockFetchNetworkError();
    renderAt('/policies/pol-002');

    expect(await screen.findByRole('heading', { name: 'Program Guidelines' })).toBeInTheDocument();
    expect(screen.getByText(/qualifying sales and referrals/)).toBeInTheDocument();
  });
});
