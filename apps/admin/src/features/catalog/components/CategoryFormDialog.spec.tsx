import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithProviders } from '../../../test/utils';
import { CategoryFormDialog } from './CategoryFormDialog';

const created: unknown[] = [];
const updated: unknown[] = [];

vi.mock('../hooks/useCreateCategory', () => ({
  useCreateCategory: () => ({
    isPending: false,
    mutateAsync: async (input: unknown) => {
      created.push(input);
    },
  }),
}));

vi.mock('../hooks/useUpdateCategory', () => ({
  useUpdateCategory: () => ({
    isPending: false,
    mutateAsync: async (input: unknown) => {
      updated.push(input);
    },
  }),
}));

const CATEGORY = {
  slug: 'cat-one',
  title: 'Cat One',
  shortDescription: 'Short',
  description: 'Long',
  image: { id: 'photo-1', alt: 'Cat One' },
  isFeatured: false,
  listingCount: 2,
  directRate: '0.1000',
  referralRate: '0.0500',
};

describe('CategoryFormDialog commission rates', () => {
  beforeEach(() => {
    created.length = 0;
    updated.length = 0;
  });

  it('prefills the category rates in percent and saves them back as decimals', async () => {
    const user = userEvent.setup();
    let closed = false;
    renderWithProviders(
      <CategoryFormDialog open onClose={() => (closed = true)} category={CATEGORY} />,
    );

    expect(screen.getByLabelText('Direct commission (%)')).toHaveValue('10');
    expect(screen.getByLabelText('Direct referral (%)')).toHaveValue('5');

    await user.clear(screen.getByLabelText('Direct commission (%)'));
    await user.type(screen.getByLabelText('Direct commission (%)'), '12.5');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(updated).toEqual([
      { slug: 'cat-one', input: expect.objectContaining({ directRate: '0.1250' }) },
    ]);
    expect(closed).toBe(true);
  });

  it('rejects percentages outside 0-100 without saving', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <CategoryFormDialog open onClose={() => {}} category={CATEGORY} />,
    );

    await user.clear(screen.getByLabelText('Direct referral (%)'));
    await user.type(screen.getByLabelText('Direct referral (%)'), '150');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(await screen.findByText('Enter a percentage between 0 and 100.')).toBeInTheDocument();
    expect(updated).toHaveLength(0);
  });
});
