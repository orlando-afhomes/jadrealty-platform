import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MOCK_ADMIN } from '@jad/mock';

import { renderWithProviders } from '../../../test/utils';
import { SaleFormDialog } from './SaleFormDialog';

const { mockGetMembers, mockUseProperties, mockUseCategories, mockCreateMutate, mockUpdateMutate } =
  vi.hoisted(() => ({
    mockGetMembers: vi.fn(),
    mockUseProperties: vi.fn(),
    mockUseCategories: vi.fn(),
    mockCreateMutate: vi.fn(),
    mockUpdateMutate: vi.fn(),
  }));

vi.mock('../../members/repositories/memberRepository', () => ({
  getMembers: (...args: unknown[]) => mockGetMembers(...args),
}));

vi.mock('../../catalog/hooks/useProperties', () => ({
  useProperties: (...args: unknown[]) => mockUseProperties(...args),
}));

vi.mock('../../catalog/hooks/useCategories', () => ({
  useCategories: (...args: unknown[]) => mockUseCategories(...args),
}));

vi.mock('../hooks/useCreateSale', () => ({
  useCreateSale: () => ({ mutateAsync: mockCreateMutate, isPending: false }),
}));

vi.mock('../hooks/useUpdateSale', () => ({
  useUpdateSale: () => ({ mutateAsync: mockUpdateMutate, isPending: false }),
}));

const SELLER = {
  id: 'seller-uuid-1',
  firstName: 'Juan',
  lastName: 'Dela Cruz',
  sponsorId: null,
};

const REFERRER = {
  id: 'referrer-uuid-2',
  firstName: 'Maria',
  lastName: 'Santos',
  sponsorId: 'seller-uuid-1',
};

const CATEGORIES = [
  { slug: 'house-and-lot', title: 'House & Lot' },
  { slug: 'condo', title: 'Condo' },
];

const PROPERTIES = [
  {
    id: 'prop-house-1',
    name: '250 SQM Farm Lot',
    categoryId: 'house-and-lot',
    price: '1200000.00',
    status: 'ACTIVE',
  },
  {
    id: 'prop-condo-1',
    name: 'Celeste Condo Unit',
    categoryId: 'condo',
    price: '8600000.00',
    status: 'ACTIVE',
  },
];

function primeMocks() {
  mockGetMembers.mockResolvedValue([SELLER, REFERRER]);
  mockUseProperties.mockReturnValue({ data: PROPERTIES });
  mockUseCategories.mockReturnValue({ data: CATEGORIES });
  mockCreateMutate.mockResolvedValue({ id: 'sal-1' });
  mockUpdateMutate.mockResolvedValue({ id: 'sal-1' });
}

function renderCreate() {
  return renderWithProviders(<SaleFormDialog open onClose={() => {}} sale={null} />, {
    user: MOCK_ADMIN,
  });
}

async function pickCategory(user: ReturnType<typeof userEvent.setup>, title: string) {
  const category = screen.getByLabelText('Category');
  await user.selectOptions(category, screen.getByRole('option', { name: title }));
}

describe('SaleFormDialog field order', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    primeMocks();
  });

  it('renders Category, Property, Seller, Referrer, Customer Name, Mobile, Email in that order', async () => {
    renderCreate();
    await screen.findByLabelText('Category');
    // Dialog renders in a portal, so query the whole document, not the container.
    const labels = [...document.querySelectorAll('label')].map((l) =>
      (l.textContent ?? '').replace('*', '').trim(),
    );
    const wanted = [
      'Category',
      'Property',
      'Property Value',
      'Seller Name',
      'Referrer',
      'Customer Name',
      'Mobile Number',
      'Email',
    ];
    let cursor = -1;
    for (const name of wanted) {
      const idx = labels.findIndex((l, i) => i > cursor && l === name);
      expect(idx, `expected "${name}" after position ${cursor}`).toBeGreaterThan(cursor);
      cursor = idx;
    }
  });
});

describe('SaleFormDialog category gating', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    primeMocks();
  });

  it('disables the property select until a category is chosen', async () => {
    renderCreate();
    const property = (await screen.findByLabelText('Property')) as HTMLSelectElement;
    expect(property.disabled).toBe(true);
    expect(
      within(property).getByRole('option', { name: 'Select a category first…' }),
    ).toBeInTheDocument();
  });

  it('lists only properties of the chosen category', async () => {
    const user = userEvent.setup();
    renderCreate();
    await pickCategory(user, 'House & Lot');
    const property = screen.getByLabelText('Property') as HTMLSelectElement;
    expect(property.disabled).toBe(false);
    expect(within(property).getByRole('option', { name: /250 SQM Farm Lot/ })).toBeInTheDocument();
    expect(
      within(property).queryByRole('option', { name: /Celeste Condo/ }),
    ).not.toBeInTheDocument();
  });

  it('clears the property when the category changes away from it', async () => {
    const user = userEvent.setup();
    renderCreate();
    await pickCategory(user, 'House & Lot');
    const property = screen.getByLabelText('Property') as HTMLSelectElement;
    await user.selectOptions(property, 'prop-house-1');
    expect(property.value).toBe('prop-house-1');
    await pickCategory(user, 'Condo');
    expect(property.value).toBe('');
  });

  it('requires a category before submitting', async () => {
    const user = userEvent.setup();
    renderCreate();
    await user.click(await screen.findByRole('button', { name: 'Create sale' }));
    expect(await screen.findByText('Select a category')).toBeInTheDocument();
    expect(mockCreateMutate).not.toHaveBeenCalled();
  });
});

describe('SaleFormDialog seller labels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    primeMocks();
  });

  it('shows seller and referrer names without ids', async () => {
    const user = userEvent.setup();
    renderCreate();
    await screen.findByLabelText('Seller');
    const seller = screen.getByLabelText('Seller') as HTMLSelectElement;
    expect(within(seller).getByRole('option', { name: 'Juan Dela Cruz' })).toBeInTheDocument();
    expect(seller.textContent).not.toContain('seller-uuid-1');

    await user.selectOptions(seller, 'seller-uuid-1');
    const referrer = screen.getByLabelText('Referrer') as HTMLSelectElement;
    expect(within(referrer).getByRole('option', { name: 'Maria Santos' })).toBeInTheDocument();
    expect(referrer.textContent).not.toContain('referrer-uuid-2');
  });
});

describe('SaleFormDialog customer input shaping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    primeMocks();
  });

  it('title-cases the name and strips digits/symbols as typed', async () => {
    const user = userEvent.setup();
    renderCreate();
    const name = (await screen.findByLabelText('Customer name')) as HTMLInputElement;
    await user.type(name, 'juan123 de!la cruz');
    expect(name.value).toBe('Juan Dela Cruz');
  });

  it('drops letters from the mobile number as typed', async () => {
    const user = userEvent.setup();
    renderCreate();
    const phone = (await screen.findByLabelText('Customer mobile number')) as HTMLInputElement;
    await user.type(phone, '09abc17123def4567');
    expect(phone.value).toBe('09171234567');
  });

  it('lowercases the email as typed', async () => {
    const user = userEvent.setup();
    renderCreate();
    const email = (await screen.findByLabelText('Customer email')) as HTMLInputElement;
    await user.type(email, 'JOHN.DOE@EXAMPLE.COM');
    expect(email.value).toBe('john.doe@example.com');
  });

  it('submits a fully valid sale with the resolved category property', async () => {
    const user = userEvent.setup();
    renderCreate();
    await pickCategory(user, 'Condo');
    await user.selectOptions(screen.getByLabelText('Property'), 'prop-condo-1');
    await user.selectOptions(await screen.findByLabelText('Seller'), 'seller-uuid-1');
    await user.type(screen.getByLabelText('Customer name'), 'ramon reyes');
    await user.type(screen.getByLabelText('Customer mobile number'), '+639171234567');
    await user.type(screen.getByLabelText('Customer email'), 'RAMON.REYES@EXAMPLE.COM');
    await user.click(screen.getByRole('button', { name: 'Create sale' }));
    await waitFor(() => expect(mockCreateMutate).toHaveBeenCalledTimes(1));
    expect(mockCreateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        propertyId: 'prop-condo-1',
        propertyName: 'Celeste Condo Unit',
        customerName: 'Ramon Reyes',
        customerPhone: '+639171234567',
        customerEmail: 'ramon.reyes@example.com',
        sellerId: 'seller-uuid-1',
        sellerName: 'Juan Dela Cruz',
      }),
    );
  });
});

describe('SaleFormDialog edit mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    primeMocks();
  });

  it('backfills the category from the sale property', async () => {
    renderWithProviders(
      <SaleFormDialog
        open
        onClose={() => {}}
        sale={
          {
            id: 'sal-9',
            status: 'SUBMITTED',
            propertyId: 'prop-condo-1',
            propertyName: 'Celeste Condo Unit',
            propertyValue: '8600000.00',
            customerName: 'Ramon Reyes',
            sellerId: 'seller-uuid-1',
            sellerName: 'Juan Dela Cruz',
          } as never
        }
      />,
      { user: MOCK_ADMIN },
    );
    const category = (await screen.findByLabelText('Category')) as HTMLSelectElement;
    expect(category.value).toBe('condo');
    const property = screen.getByLabelText('Property') as HTMLSelectElement;
    expect(property.value).toBe('prop-condo-1');
  });

  it('backfills the category when the catalog arrives after the dialog opens', async () => {
    mockUseProperties.mockReturnValue({ data: undefined });
    const view = renderWithProviders(
      <SaleFormDialog
        open
        onClose={() => {}}
        sale={
          {
            id: 'sal-9',
            status: 'SUBMITTED',
            propertyId: 'prop-condo-1',
            propertyName: 'Celeste Condo Unit',
            propertyValue: '8600000.00',
            customerName: 'Ramon Reyes',
            sellerId: 'seller-uuid-1',
            sellerName: 'Juan Dela Cruz',
          } as never
        }
      />,
      { user: MOCK_ADMIN },
    );
    const firstCategory = (await view.findByLabelText('Category')) as HTMLSelectElement;
    expect(firstCategory.value).toBe('');
    mockUseProperties.mockReturnValue({ data: PROPERTIES });
    view.rerender(
      <SaleFormDialog
        open
        onClose={() => {}}
        sale={
          {
            id: 'sal-9',
            status: 'SUBMITTED',
            propertyId: 'prop-condo-1',
            propertyName: 'Celeste Condo Unit',
            propertyValue: '8600000.00',
            customerName: 'Ramon Reyes',
            sellerId: 'seller-uuid-1',
            sellerName: 'Juan Dela Cruz',
          } as never
        }
      />,
    );
    // Query fresh: rerender may replace the dialog subtree, so a previously
    // captured node can go stale while the live tree is correct.
    await waitFor(() => {
      const live = screen.getByLabelText('Category') as HTMLSelectElement;
      expect(live.value).toBe('condo');
    });
  });
});
