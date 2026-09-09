import { Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MOCK_ADMIN } from '@jad/mock';

import { installMockApi, renderWithProviders } from '../../../test/utils';
import { resetContentStore } from '../../../mock/contentMockStore';
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
    resetContentStore();
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
    expect(
      screen.getByText('A one-page overview of the JA&D membership opportunity.'),
    ).toBeInTheDocument();
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

  it('deletes the tool after confirmation and returns to the list', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route path="/admin/marketing-tools/:id" element={<MarketingToolDetailPage />} />
        <Route path="/admin/marketing-tools" element={<div>list-marker</div>} />
      </Routes>,
      { user: MOCK_ADMIN, route: '/admin/marketing-tools/ctn-001' },
    );
    await screen.findByText('JA&D Membership Overview');

    await user.click(screen.getByRole('button', { name: 'Delete JA&D Membership Overview' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/permanently remove/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(await screen.findByText('list-marker')).toBeInTheDocument();
    expect(await screen.findByText('Marketing tool deleted')).toBeInTheDocument();
  });

  it('edits the tool title from the detail page', async () => {
    const user = userEvent.setup();
    renderDetail('ctn-001');
    await screen.findByText('JA&D Membership Overview');

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog');
    const titleInput = within(dialog).getByLabelText('Title');
    await user.clear(titleInput);
    await user.type(titleInput, 'Detail Edited Title');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Detail Edited Title')).toBeInTheDocument();
    expect(await screen.findByText('Marketing tool updated')).toBeInTheDocument();
  });
});
