import { Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { MOCK_ADMIN } from '@jad/mock';

import { installMockApi, renderWithProviders } from '../../../test/utils';
import { MarketingToolDetailPage } from './MarketingToolDetailPage';

function renderDetail(id: string) {
  return renderWithProviders(
    <Routes>
      <Route path="/admin/marketing-tools/:id" element={<MarketingToolDetailPage />} />
    </Routes>,
    { user: MOCK_ADMIN, route: `/admin/marketing-tools/${id}` },
  );
}

describe('MarketingToolDetailPage', () => {
  let server: ReturnType<typeof installMockApi>;

  beforeEach(() => {
    server = installMockApi();
    server.install();
  });

  afterEach(() => {
    server.restore();
  });

  it('renders page header with back link', async () => {
    renderDetail('ctn-001');
    expect(await screen.findByText('Marketing Tool')).toBeInTheDocument();
    expect(screen.getByText('Back to marketing tools')).toBeInTheDocument();
  });

  it('renders item details for a document', async () => {
    renderDetail('ctn-001');
    expect(await screen.findByText('JA&D Membership Overview')).toBeInTheDocument();
    expect(screen.getByText('A one-page overview of the JA&D membership opportunity.')).toBeInTheDocument();
    expect(screen.getAllByText('Document').length).toBeGreaterThan(0);
  });

  it('shows download link when downloadUrl exists', async () => {
    renderDetail('ctn-001');
    await screen.findByText('JA&D Membership Overview');
    expect(screen.getByText('Download')).toBeInTheDocument();
  });

  it('shows share links when share object exists', async () => {
    renderDetail('ctn-001');
    await screen.findByText('JA&D Membership Overview');
    expect(screen.getByText('Share on Messenger')).toBeInTheDocument();
    expect(screen.getByText('Share on Viber')).toBeInTheDocument();
    expect(screen.getByText('Copy Link')).toBeInTheDocument();
  });

  it('renders not found state for unknown id', async () => {
    renderDetail('unknown');
    expect(await screen.findByText('Tool not found')).toBeInTheDocument();
  });
});
