import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MOCK_ADMIN } from '@jad/mock';

import { installMockApi, renderWithProviders } from '../../../test/utils';
import { ContentPage } from './ContentPage';

describe('ContentPage', () => {
  let server: ReturnType<typeof installMockApi>;

  beforeEach(() => {
    server = installMockApi();
    server.install();
  });

  afterEach(() => {
    server.restore();
  });

  it('renders page header', async () => {
    renderWithProviders(<ContentPage />, { user: MOCK_ADMIN });
    expect(await screen.findByText('Marketing Tools')).toBeInTheDocument();
    expect(screen.getByText(/Ready-to-share/)).toBeInTheDocument();
  });

  it('renders content table with data', async () => {
    renderWithProviders(<ContentPage />, { user: MOCK_ADMIN });
    expect(await screen.findByText('JA&D Membership Overview')).toBeInTheDocument();
    expect(screen.getByText('JA&D Project Showcase')).toBeInTheDocument();
    expect(screen.getByText('JA&D Opportunity Video')).toBeInTheDocument();
  });

  it('shows content kind chips with file-type icons', async () => {
    renderWithProviders(<ContentPage />, { user: MOCK_ADMIN });
    await screen.findByText('JA&D Membership Overview');
    expect(screen.getAllByText('Document').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Image').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Video').length).toBeGreaterThanOrEqual(1);
  });

  it('shows filter pills and always-visible pagination footer', async () => {
    renderWithProviders(<ContentPage />, { user: MOCK_ADMIN });
    await screen.findByText('JA&D Membership Overview');
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/12 items page/)).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Pagination' })).toBeInTheDocument();
  });

  it('filters by kind', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ContentPage />, { user: MOCK_ADMIN });
    await screen.findByText('JA&D Membership Overview');

    await user.click(screen.getByRole('button', { name: 'Images' }));
    expect(screen.getByRole('button', { name: 'Images' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('JA&D Project Showcase')).toBeInTheDocument();
    expect(screen.queryByText('JA&D Opportunity Video')).not.toBeInTheDocument();
    expect(screen.getByText(/2 items page/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByText('JA&D Opportunity Video')).toBeInTheDocument();
  });

  it('opens New Content dialog with required file field and multi-select', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ContentPage />, { user: MOCK_ADMIN });
    await screen.findByText('JA&D Membership Overview');

    await user.click(screen.getByText('New Content'));

    expect(await screen.findByText('New Marketing Tool')).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toBeInTheDocument();
    expect(screen.getByLabelText('Description')).toBeInTheDocument();
    expect(screen.getByLabelText('Type')).toBeInTheDocument();
    expect(screen.getByText('Files (required)')).toBeInTheDocument();

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeInTheDocument();
    expect(fileInput.multiple).toBe(true);
  });

  it('file input has correct accept attribute per type', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ContentPage />, { user: MOCK_ADMIN });
    await screen.findByText('JA&D Membership Overview');

    await user.click(screen.getByText('New Content'));
    await screen.findByText('New Marketing Tool');

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput.accept).toBe('.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx');

    await user.selectOptions(screen.getByLabelText('Type'), 'IMAGE');
    expect(fileInput.accept).toBe('image/jpeg,image/png,image/webp');

    await user.selectOptions(screen.getByLabelText('Type'), 'VIDEO');
    expect(fileInput.accept).toBe('video/mp4,video/webm,video/quicktime');
  });

  it('Publish button disabled when no files selected', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ContentPage />, { user: MOCK_ADMIN });
    await screen.findByText('JA&D Membership Overview');

    await user.click(screen.getByText('New Content'));
    await screen.findByText('New Marketing Tool');

    const publishBtn = screen.getByRole('button', { name: 'Publish' });
    expect(publishBtn).toBeDisabled();
  });
});
