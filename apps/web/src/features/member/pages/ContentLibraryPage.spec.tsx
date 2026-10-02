import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MOCK_MEMBER, setMockSessionUser } from '@jad/mock';
import { createMemberMockServer } from '../../../mock';

import { buildDownloadFileName, ContentLibraryPage } from './ContentLibraryPage';
import { renderMember } from '../test/utils';
import { mockFetchRoutes } from '../../../test/utils';

describe('member ContentLibraryPage', () => {
  let server: ReturnType<typeof createMemberMockServer>;

  beforeEach(() => {
    server = createMemberMockServer();
    server.install();
    setMockSessionUser(MOCK_MEMBER);
  });

  afterEach(() => {
    server.restore();
    setMockSessionUser(null);
  });

  it('renders the marketing tools gallery with covers, view, download and forward links (SCR-MEM-022)', async () => {
    renderMember(<ContentLibraryPage />, { user: MOCK_MEMBER });

    // Marketing Tools - 12 items (canonical seed from @jad/mock)
    expect(await screen.findByText('JA&D Membership Overview')).toBeInTheDocument();
    expect(screen.getByText('JA&D Project Showcase')).toBeInTheDocument();
    expect(screen.getByText('JA&D Opportunity Video')).toBeInTheDocument();
    expect(screen.getByText('JA&D Program Brochure')).toBeInTheDocument();
    expect(screen.getByText('JA&D Property Lineup')).toBeInTheDocument();
    expect(screen.getByText('Virtual Office Tour')).toBeInTheDocument();
    expect(screen.getByText('Buyer Guide Checklist')).toBeInTheDocument();
    expect(screen.getByText('Community Open House Flyer')).toBeInTheDocument();
    expect(screen.getByText('Unit Turnover Checklist')).toBeInTheDocument();
    expect(screen.getByText('JA&D Social Starter Kit')).toBeInTheDocument();
    expect(screen.getByText('Member Welcome Video')).toBeInTheDocument();
    expect(screen.getByText('How Qualifying Sales Work')).toBeInTheDocument();

    // Kind chips - icons + labels present (card)
    expect(screen.getAllByText('Document').length).toBeGreaterThanOrEqual(7);
    expect(screen.getAllByText('Image').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Video').length).toBeGreaterThanOrEqual(3);

    // Header + filters (breadcrumbs are owned by MemberLayout)
    expect(screen.getByRole('link', { name: 'View Vouchers' })).toHaveAttribute(
      'href',
      '/member/vouchers',
    );
    expect(screen.getAllByText('Marketing Tools').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('Featured · Download-ready')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/Showing 12 of 12 items/)).toBeInTheDocument();
    // Beautiful covers - image/video/pdf/doc covers visible before View
    expect(document.querySelector('[class*="coverWrap"]')).toBeInTheDocument();
    expect(document.querySelector('[class*="cover"]')).toBeInTheDocument();

    // View-only previews - no inline media before clicking View (dialog only)
    expect(screen.queryByLabelText('JA&D Opportunity Video')).not.toBeInTheDocument();

    // View is a button for every downloadable item (12 with downloadUrl)
    expect(screen.getAllByRole('button', { name: 'View' }).length).toBeGreaterThanOrEqual(12);
    // Download is a button that saves the file directly (no new tab - the
    // auto-download flow is covered by the dedicated tests below)
    const downloads = screen.getAllByRole('button', { name: 'Download' });
    expect(downloads.length).toBeGreaterThanOrEqual(12);
    for (const btn of downloads) {
      expect(btn.className).toMatch(/downloadButton/);
    }

    // Share lives behind a share-button dialog (Messenger + WhatsApp); the
    // copy action is an icon button per card (12 items now)
    expect(screen.queryByRole('link', { name: 'Share on Messenger' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Share on Viber' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Share / }).length).toBe(12);
    expect(screen.getAllByRole('button', { name: /Copy link/ }).length).toBe(12);
  });

  it('filters by marketing category with pills and resets', async () => {
    const user = userEvent.setup();
    renderMember(<ContentLibraryPage />, { user: MOCK_MEMBER });

    expect(await screen.findByText('JA&D Project Showcase')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Images' }));
    expect(screen.getByRole('button', { name: 'Images' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('JA&D Project Showcase')).toBeInTheDocument();
    expect(screen.queryByText('JA&D Opportunity Video')).not.toBeInTheDocument();
    expect(screen.getByText(/Showing 2 of 12 items · Images/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Videos' }));
    expect(screen.getByText('JA&D Opportunity Video')).toBeInTheDocument();
    expect(screen.queryByText('JA&D Project Showcase')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Brochures' }));
    expect(screen.getByText('JA&D Program Brochure')).toBeInTheDocument();
    expect(screen.queryByText('JA&D Project Showcase')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Flyers' }));
    expect(screen.getByText('JA&D Membership Overview')).toBeInTheDocument();
    expect(screen.queryByText('JA&D Opportunity Video')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByText('JA&D Project Showcase')).toBeInTheDocument();
    expect(screen.getByText('JA&D Opportunity Video')).toBeInTheDocument();
    expect(screen.getByText('JA&D Property Lineup')).toBeInTheDocument();
  });

  it('opens a lightbox dialog for image, video and pdf on View click only', async () => {
    const user = userEvent.setup();
    renderMember(<ContentLibraryPage />, { user: MOCK_MEMBER });

    expect(await screen.findByText('JA&D Project Showcase')).toBeInTheDocument();
    expect(screen.queryByLabelText('JA&D Opportunity Video')).not.toBeInTheDocument();
    expect(screen.queryByTitle('JA&D Program Brochure')).not.toBeInTheDocument();

    // Image - View button opens dialog with large preview (no inline before)
    const showcaseCard = screen.getByText('JA&D Project Showcase').closest('li')!;
    await user.click(within(showcaseCard).getByRole('button', { name: 'View' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByAltText('JA&D Project Showcase')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close dialog' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // Video - View button opens dialog with video player (only after click)
    const videoCard = screen.getByText('JA&D Opportunity Video').closest('li')!;
    await user.click(within(videoCard).getByRole('button', { name: 'View' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('JA&D Opportunity Video')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // PDF - View button opens dialog with iframe (only after click)
    const pdfCard = screen.getByText('JA&D Program Brochure').closest('li')!;
    await user.click(within(pdfCard).getByRole('button', { name: 'View' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByTitle('JA&D Program Brochure')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // Plain document (data:text/plain) - View shows scrollable text, only after click
    const docCard = screen.getByText('JA&D Membership Overview').closest('li')!;
    expect(within(docCard).getByRole('button', { name: 'View' })).toBeInTheDocument();
    await user.click(within(docCard).getByRole('button', { name: 'View' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/JA&D offers a membership opportunity/)).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows an empty state when no marketing tools are published', async () => {
    server.restore();
    mockFetchRoutes({ '/content/forwardable': { data: [], meta: {} } });
    renderMember(<ContentLibraryPage />, { user: MOCK_MEMBER });

    expect(await screen.findByText('No marketing tools yet')).toBeInTheDocument();
    expect(document.querySelector('[class*="iconWrap"]')).not.toBeNull();
  });

  it('shows an illustrated empty state with a working Clear filter button on no matches', async () => {
    server.restore();
    mockFetchRoutes({
      '/content/forwardable': {
        data: [
          {
            id: 'ctn-img-1',
            title: 'Solo Showcase',
            kind: 'IMAGE',
            downloadUrl: 'https://cdn.test/solo.jpg',
            createdAt: '2026-08-08T10:15:00.000Z',
          },
        ],
        meta: {},
      },
    });
    const user = userEvent.setup();
    renderMember(<ContentLibraryPage />, { user: MOCK_MEMBER });
    await screen.findByText('Solo Showcase');

    await user.click(screen.getByRole('button', { name: 'Videos' }));
    expect(await screen.findByText('No matches')).toBeInTheDocument();
    expect(screen.getByText('No videos match this filter.')).toBeInTheDocument();
    expect(document.querySelector('[class*="iconWrap"]')).not.toBeNull();

    const clearBtn = screen.getByRole('button', { name: 'Clear filter' });
    expect(clearBtn.className).toMatch(/clearButton/);
    await user.click(clearBtn);
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByText('Solo Showcase')).toBeInTheDocument();
  });

  it('shows View, Download, share and copy buttons on each card (no inline share links)', async () => {
    renderMember(<ContentLibraryPage />, { user: MOCK_MEMBER });
    await screen.findByText('JA&D Membership Overview');

    const card = screen.getByText('JA&D Project Showcase').closest('li')!;
    expect(within(card).getByRole('button', { name: 'View' })).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Download' })).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: /Share/ })).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: /Copy link/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Share on Messenger' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Share on Viber' })).not.toBeInTheDocument();
  });

  it('styles View and Download with distinct action colors', async () => {
    renderMember(<ContentLibraryPage />, { user: MOCK_MEMBER });
    await screen.findByText('JA&D Project Showcase');

    const card = screen.getByText('JA&D Project Showcase').closest('li')!;
    const viewBtn = within(card).getByRole('button', { name: 'View' });
    const downloadBtn = within(card).getByRole('button', { name: 'Download' });
    expect(viewBtn.className).toMatch(/viewButton/);
    expect(downloadBtn.className).toMatch(/downloadButton/);
    expect(viewBtn.className).not.toBe(downloadBtn.className);
  });

  it('opens a share dialog with Messenger and WhatsApp on share click', async () => {
    const user = userEvent.setup();
    renderMember(<ContentLibraryPage />, { user: MOCK_MEMBER });
    await screen.findByText('JA&D Project Showcase');

    const card = screen.getByText('JA&D Project Showcase').closest('li')!;
    await user.click(within(card).getByRole('button', { name: /Share/ }));

    const dialog = await screen.findByRole('dialog');
    const messenger = within(dialog).getByRole('link', { name: /Messenger/ });
    expect(messenger).toHaveAttribute('href', expect.stringContaining('facebook.com'));
    expect(messenger).toHaveAttribute('target', '_blank');
    expect(messenger).toHaveAttribute('rel', 'noopener noreferrer');
    expect(within(messenger).getByTestId('messenger-icon')).toBeInTheDocument();
    const whatsapp = within(dialog).getByRole('link', { name: /WhatsApp/ });
    expect(whatsapp.getAttribute('href')).toContain('wa.me');
    expect(whatsapp).toHaveAttribute('target', '_blank');
    expect(whatsapp).toHaveAttribute('rel', 'noopener noreferrer');
    expect(within(whatsapp).getByTestId('whatsapp-icon')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('copies the share link from the copy icon button', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    const descriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    try {
      renderMember(<ContentLibraryPage />, { user: MOCK_MEMBER });
      await screen.findByText('JA&D Project Showcase');

      const card = screen.getByText('JA&D Project Showcase').closest('li')!;
      await user.click(within(card).getByRole('button', { name: /Copy link/ }));

      expect(writeText).toHaveBeenCalledWith('https://jad.example/project-showcase');
      expect(await within(card).findByRole('button', { name: /Copied/ })).toBeInTheDocument();
    } finally {
      if (descriptor) Object.defineProperty(navigator, 'clipboard', descriptor);
      else delete (navigator as unknown as Record<string, unknown>).clipboard;
    }
  });

  it('downloads the file automatically without opening a new tab', async () => {
    const user = userEvent.setup();
    renderMember(<ContentLibraryPage />, { user: MOCK_MEMBER });
    await screen.findByText('JA&D Project Showcase');

    const fileUrl =
      'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800&h=450&fit=crop&auto=format';
    const apiFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === fileUrl) {
        return new Response('bytes', {
          status: 200,
          headers: { 'Content-Type': 'image/jpeg' },
        });
      }
      return (apiFetch as typeof fetch)(input, init);
    }) as typeof fetch;

    const createObjectURL = vi.fn(() => 'blob:mock-url');
    const revokeObjectURL = vi.fn();
    Object.defineProperties(URL, {
      createObjectURL: { value: createObjectURL, configurable: true },
      revokeObjectURL: { value: revokeObjectURL, configurable: true },
    });
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    try {
      const card = screen.getByText('JA&D Project Showcase').closest('li')!;
      await user.click(within(card).getByRole('button', { name: 'Download' }));

      await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));
      expect(openSpy).not.toHaveBeenCalled();
      expect(anchorClick).toHaveBeenCalledTimes(1);
      const [anchor] = anchorClick.mock.instances as HTMLAnchorElement[];
      expect(anchor?.download).toMatch(/Showcase.*\.jpg$/);
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    } finally {
      anchorClick.mockRestore();
      openSpy.mockRestore();
    }
  });

  it('falls back to a new tab when the automatic download fails', async () => {
    const user = userEvent.setup();
    renderMember(<ContentLibraryPage />, { user: MOCK_MEMBER });
    await screen.findByText('JA&D Project Showcase');

    const fileUrl =
      'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800&h=450&fit=crop&auto=format';
    const apiFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === fileUrl) throw new TypeError('Failed to fetch');
      return (apiFetch as typeof fetch)(input, init);
    }) as typeof fetch;
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    try {
      const card = screen.getByText('JA&D Project Showcase').closest('li')!;
      await user.click(within(card).getByRole('button', { name: 'Download' }));

      await waitFor(() =>
        expect(openSpy).toHaveBeenCalledWith(fileUrl, '_blank', expect.stringContaining('noopener')),
      );
    } finally {
      openSpy.mockRestore();
    }
  });
});

describe('buildDownloadFileName', () => {
  const photoUrl =
    'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800&h=450&fit=crop&auto=format';

  it('uses the URL extension when present', () => {
    expect(
      buildDownloadFileName(
        'JA&D Program Brochure',
        'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
        'application/pdf',
      ),
    ).toBe('JA&D Program Brochure.pdf');
  });

  it('falls back to the content-type extension', () => {
    expect(buildDownloadFileName('JA&D Project Showcase', photoUrl, 'image/jpeg')).toBe(
      'JA&D Project Showcase.jpg',
    );
  });

  it('sanitizes illegal filename characters and omits unknown extensions', () => {
    expect(buildDownloadFileName('A/B:C*D?E', 'https://cdn.test/f', null)).toBe('ABCDE');
  });
});
