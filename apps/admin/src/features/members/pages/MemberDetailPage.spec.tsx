import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '../../../test/utils';
import { MemberDetailPage } from './MemberDetailPage';

const { mockUseMember, mockUseMemberRegistration, mockGetGovernmentIdUrl } = vi.hoisted(() => ({
  mockUseMember: vi.fn(),
  mockUseMemberRegistration: vi.fn(),
  mockGetGovernmentIdUrl: vi.fn(),
}));

vi.mock('../hooks/useMember', () => ({
  useMember: (...args: unknown[]) => mockUseMember(...args),
}));

vi.mock('../hooks/useMemberRegistration', () => ({
  useMemberRegistration: (...args: unknown[]) => mockUseMemberRegistration(...args),
}));

vi.mock('../../registrations/repositories/registrationRepository', () => ({
  getGovernmentIdUrl: (...args: unknown[]) => mockGetGovernmentIdUrl(...args),
}));

const MEMBER = {
  id: 'mem-uuid-1',
  firstName: 'Juan',
  lastName: 'Dela Cruz',
  email: 'juan@example.com',
  phone: '+639171234567',
  gender: 'Male',
  address: 'Manila',
  countryCode: 'PH',
  countryName: 'Philippines',
  program: { id: 'prg-domestic', code: 'DOMESTIC', name: 'Domestic Program' },
  referralCode: 'JD-2026-001',
  status: 'APPROVED_ACTIVE',
  isQualified: true,
  accountStatus: 'ACTIVE',
  registeredAt: '2026-08-01T00:00:00.000Z',
  registrationId: 'reg-001',
};

const APPLICATION = {
  id: 'reg-001',
  status: 'APPROVED_ACTIVE',
  programId: 'prg-domestic',
  programCode: 'DOMESTIC',
  referralCode: 'JD-2026-001',
  submittedAt: '2026-08-01T00:00:00.000Z',
  reviewedAt: '2026-08-02T00:00:00.000Z',
  reviewedBy: 'staff-uuid-1',
  qualificationAnswers: [{ questionId: 'q-001', answer: 'Yes' }],
  governmentId: {
    fileName: 'id.png',
    mimeType: 'image/png',
    sizeBytes: 70,
    storagePath: 'reg-001/id.png',
  },
};

function renderDetail() {
  return renderWithProviders(
    <Routes>
      <Route path="/admin/members/:id" element={<MemberDetailPage />} />
    </Routes>,
    { route: '/admin/members/mem-uuid-1' },
  );
}

describe('MemberDetailPage application card', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseMember.mockReturnValue({ data: MEMBER, isPending: false, isError: false, error: null });
    mockUseMemberRegistration.mockReturnValue({ data: APPLICATION, isPending: false });
    mockGetGovernmentIdUrl.mockResolvedValue('https://signed.test/id.png');
  });

  it('renders the linked application details including government ID', async () => {
    renderDetail();
    expect(await screen.findByText('Application Details')).toBeInTheDocument();
    expect(screen.getByText('DOMESTIC (prg-domestic)')).toBeInTheDocument();
    expect(screen.getByText('id.png')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Preview' })).toBeInTheDocument();
    expect(mockUseMemberRegistration).toHaveBeenCalledWith('reg-001');
  });

  it('shows a note for direct-created members without an application', async () => {
    mockUseMember.mockReturnValue({
      data: { ...MEMBER, registrationId: undefined },
      isPending: false,
      isError: false,
      error: null,
    });
    renderDetail();
    expect(await screen.findByText(/Direct-created member/)).toBeInTheDocument();
    expect(mockUseMemberRegistration).toHaveBeenCalledWith(undefined);
  });
});
