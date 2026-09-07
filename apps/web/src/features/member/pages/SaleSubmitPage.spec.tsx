import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { MOCK_MEMBER } from '@jad/mock';

import { SaleSubmitPage } from './SaleSubmitPage';
import { renderMember } from '../test/utils';
import { mockFetchNetworkError, mockFetchRoutes } from '../../../test/utils';

const CUSTOMERS = {
  data: [{ id: 'cus-001', fullName: 'Ramon Reyes', phone: '+63 917 555 0111' }],
  meta: {},
};

const SALE_RESPONSE = {
  id: 'sal-011',
  status: 'SUBMITTED',
  propertyId: 'igp-250-sqm-farm-lot',
  propertyName: '250 SQM Farm Lot with Hotspring',
  propertyValue: '1200000.00',
  customerId: 'cus-001',
  customerName: 'Ramon Reyes',
  sellerId: 'mem-001',
  sellerName: 'Juan Dela Cruz',
  resubmissionCount: 0,
  submittedAt: '2026-08-20T10:00:00.000Z',
};

function SaleDetailProbe() {
  return <div>sale detail page</div>;
}

function renderSubmit() {
  return renderMember(
    <Routes>
      <Route path="/member/sales/new" element={<SaleSubmitPage />} />
      <Route path="/member/sales/:saleId" element={<SaleDetailProbe />} />
    </Routes>,
    { route: '/member/sales/new', user: MOCK_MEMBER },
  );
}

describe('member SaleSubmitPage (SCR-MEM-006, FR-SAL-002)', () => {
  it('renders the customer and catalog property pickers', async () => {
    mockFetchRoutes({ '/customers': CUSTOMERS });
    renderSubmit();

    await screen.findByLabelText('Customer');
    expect(screen.getByLabelText('Catalog property')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit sale' })).toBeInTheDocument();
    expect(
      screen.getByLabelText('Customer').querySelector('option[value="cus-001"]'),
    ).not.toBeNull();
  });

  it('validates required selections before submitting', async () => {
    mockFetchRoutes({ '/customers': CUSTOMERS });
    const user = userEvent.setup();
    renderSubmit();

    await screen.findByLabelText('Customer');
    await user.click(screen.getByRole('button', { name: 'Submit sale' }));

    expect(screen.getByText('Select a customer or add a new one.')).toBeInTheDocument();
    expect(screen.getByText('Select a property from the catalog.')).toBeInTheDocument();
  });

  it('submits a sale with an existing customer and navigates to the new sale', async () => {
    mockFetchRoutes({ '/customers': CUSTOMERS, '/sales': SALE_RESPONSE });
    const user = userEvent.setup();
    renderSubmit();

    await screen.findByLabelText('Customer');
    await user.selectOptions(screen.getByLabelText('Customer'), 'cus-001');
    await user.selectOptions(screen.getByLabelText('Catalog property'), 'igp-250-sqm-farm-lot');
    await user.click(screen.getByRole('button', { name: 'Submit sale' }));

    expect(await screen.findByText('sale detail page')).toBeInTheDocument();
  });

  it('surfaces the API envelope error when the submission is rejected', async () => {
    mockFetchRoutes({
      '/customers': CUSTOMERS,
      '/sales': {
        body: {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Select a customer and a property from the catalog.',
            timestamp: '2026-08-20T10:00:00Z',
          },
        },
        status: 400,
      },
    });
    const user = userEvent.setup();
    renderSubmit();

    await screen.findByLabelText('Customer');
    await user.selectOptions(screen.getByLabelText('Customer'), 'cus-001');
    await user.selectOptions(screen.getByLabelText('Catalog property'), 'igp-250-sqm-farm-lot');
    await user.click(screen.getByRole('button', { name: 'Submit sale' }));

    expect(
      await screen.findByText('Select a customer and a property from the catalog.'),
    ).toBeInTheDocument();
  });

  it('shows a network error state when customers cannot load', async () => {
    mockFetchNetworkError();
    renderSubmit();

    expect(await screen.findByText('Could not load your customers')).toBeInTheDocument();
  });
});
