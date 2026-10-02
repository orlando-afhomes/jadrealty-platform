import { Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
    vi.unstubAllGlobals();
  });

  /**
   * Layer the signed-upload flow over the mock API (same as ContentPage.spec):
   * sign returns a fresh public URL, the PUT succeeds.
   */
  function stubReplacementUpload(publicUrl: string) {
    const mockFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/cms/upload/sign')) {
        return Response.json({ signedUrl: 'https://cdn.test/replace-put', publicUrl });
      }
      if (url === 'https://cdn.test/replace-put') return new Response(null, { status: 200 });
      return (mockFetch as typeof fetch)(input, init);
    }) as typeof fetch;
  }

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

  it('styles detail action buttons with distinct colors', async () => {
    renderDetail('ctn-001');
    await screen.findByText('JA&D Membership Overview');

    expect(screen.getByText('Download').className).toMatch(/downloadButton/);
    expect(screen.getByText('Share on Messenger').className).toMatch(/shareMessenger/);
    expect(screen.getByText('Share on Viber').className).toMatch(/shareViber/);
    expect(screen.getByText('Copy Link').className).toMatch(/copyButton/);
  });

  it('shows a back affordance with an icon', async () => {
    renderDetail('ctn-001');
    await screen.findByText('JA&D Membership Overview');

    const back = screen.getByText('Back to marketing tools').closest('a');
    expect(back?.querySelector('svg')).not.toBeNull();
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

  it('shows a spinner on the delete confirm while deletion is in flight', async () => {
    let resolveDelete!: (value: Response) => void;
    const deleteGate = new Promise<Response>((resolve) => {
      resolveDelete = resolve;
    });
    const mockFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if ((init?.method ?? 'GET') === 'DELETE' && url.includes('/admin/content/')) {
        return deleteGate;
      }
      return (mockFetch as typeof fetch)(input, init);
    }) as typeof fetch;

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
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    // Confirm button swaps to its loading spinner and Cancel locks.
    expect(await within(dialog).findByText('Loading…')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();

    resolveDelete(Response.json({ id: 'ctn-001', deleted: true, fileRemoved: false }));
    expect(await screen.findByText('list-marker')).toBeInTheDocument();
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

  it('shows the current file as a name/type/size card with no preview or remove action', async () => {
    const user = userEvent.setup();
    renderDetail('ctn-001');
    await screen.findByText('JA&D Membership Overview');

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).queryByRole('img')).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Remove file' })).toBeNull();
    expect(within(dialog).queryByText(/marked for removal/)).toBeNull();
    const fileList = within(dialog).getByRole('list');
    // A data: URL carries no filename - the card falls back to the title.
    expect(within(fileList).getByText('JA&D Membership Overview')).toBeInTheDocument();
    expect(within(fileList).getByText('TXT')).toBeInTheDocument();
    expect(within(fileList).getByText('—')).toBeInTheDocument();
  });

  it('shows the reported size for a remote file', async () => {
    const mockFetch = globalThis.fetch;
    const photoUrl =
      'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800&h=450&fit=crop&auto=format';
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === photoUrl && (init?.method ?? 'GET') === 'HEAD') {
        return new Response(null, { status: 200, headers: { 'Content-Length': '12345' } });
      }
      return (mockFetch as typeof fetch)(input, init);
    }) as typeof fetch;

    const user = userEvent.setup();
    renderDetail('ctn-003');
    await screen.findByText('JA&D Project Showcase');

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog');
    const fileList = await within(dialog).findByRole('list');
    expect(within(fileList).getByText('photo-1522202176988-66273c2fd55f')).toBeInTheDocument();
    expect(within(fileList).getByText('Image')).toBeInTheDocument();
    expect(within(fileList).getByText('12.1 KB')).toBeInTheDocument();
  });

  it('stages a replacement file as a name/type/size card', async () => {
    const user = userEvent.setup();
    renderDetail('ctn-003');
    await screen.findByText('JA&D Project Showcase');

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog');

    const fileInput = within(dialog).getByLabelText('Replacement file') as HTMLInputElement;
    await user.upload(fileInput, new File(['new-bytes'], 'new-photo.jpg', { type: 'image/jpeg' }));

    const fileList = within(dialog).getByRole('list');
    expect(within(fileList).getByText('new-photo.jpg')).toBeInTheDocument();
    expect(within(fileList).getByText('JPG')).toBeInTheDocument();
    expect(within(fileList).getByText('9 B')).toBeInTheDocument();
    // No image preview anymore, and the current-file card is replaced.
    expect(within(dialog).queryByRole('img')).toBeNull();
    expect(within(fileList).queryByText('photo-1522202176988-66273c2fd55f')).toBeNull();
  });

  it('exposes a clickable upload dropzone in the edit dialog', async () => {
    // Regression: the file input uses the visually-hidden .fileInput style,
    // so it must sit inside a dropzone <label> to be clickable by mouse.
    const user = userEvent.setup();
    renderDetail('ctn-001');
    await screen.findByText('JA&D Membership Overview');

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog');
    expect(screen.getByText(/drag a replacement file here/)).toBeInTheDocument();
    const fileInput = within(dialog).getByLabelText('Replacement file');
    expect(fileInput.closest('label')).not.toBeNull();
  });

  it('replaces the file via upload then PATCH', async () => {
    stubReplacementUpload('https://cdn.test/replaced.pdf');
    const user = userEvent.setup();
    renderDetail('ctn-001');
    await screen.findByText('JA&D Membership Overview');

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog');
    const fileInput = within(dialog).getByLabelText('Replacement file') as HTMLInputElement;
    await user.upload(
      fileInput,
      new File(['replacement-bytes'], 'replacement.pdf', { type: 'application/pdf' }),
    );
    expect(await within(dialog).findByText(/replacement\.pdf/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Marketing tool updated')).toBeInTheDocument();
    expect(screen.getByText('Download')).toHaveAttribute('href', 'https://cdn.test/replaced.pdf');
  });
});
