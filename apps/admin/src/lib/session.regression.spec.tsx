import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SupabaseSessionProvider, useSession } from './session';
import { normalizeRole } from '@jad/contracts';

const mockGetSession = vi.fn();
const mockOnAuthStateChange = vi.fn();
const mockSignOut = vi.fn();
const mockMembersSingle = vi.fn();
const mockMemberRolesEq = vi.fn();
const mockRolesIn = vi.fn();
const mockRolesEq = vi.fn();

vi.mock('./supabase', async () => {
  const actual = await vi.importActual<typeof import('./supabase')>('./supabase');
  return {
    ...actual,
    isSupabaseConfigured: () => true,
    getSupabaseClient: () => ({
      auth: { getSession: mockGetSession, onAuthStateChange: mockOnAuthStateChange, signOut: mockSignOut },
      from: (table: string) => {
        if (table === 'members')
          return { select: () => ({ eq: () => ({ single: mockMembersSingle }) }) };
        if (table === 'member_roles') return { select: () => ({ eq: mockMemberRolesEq, in: mockRolesIn }) };
        if (table === 'roles') return { select: () => ({ eq: mockRolesEq, in: mockRolesIn }) };
        return { select: () => ({ eq: () => Promise.resolve({ data: null, error: null }), in: () => Promise.resolve({ data: null, error: null }) }) };
      },
    }),
  };
});

function Probe() {
  const { status, role, roleId, user } = useSession();
  return (
    <div>
      <div data-testid="status">{status}</div>
      <div data-testid="role">{role ?? 'null'}</div>
      <div data-testid="roleId">{roleId ?? 'null'}</div>
      <div data-testid="user">{user?.id ?? 'none'}</div>
    </div>
  );
}

describe('Admin SupabaseSessionProvider – authoritative role (regression)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockOnAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
    mockMembersSingle.mockResolvedValue({ data: null });
    mockMemberRolesEq.mockResolvedValue({ data: [], error: null });
    mockRolesIn.mockResolvedValue({ data: [], error: null });
  });

  afterEach(() => vi.clearAllMocks());

  it('SUPER_ADMIN via DB → SUPER_ADMIN (admin access granted)', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'sup-001', email: 'superadmin@gmail.com', user_metadata: {} } } },
    });
    mockMembersSingle.mockResolvedValue({ data: { firstName: 'Saul', lastName: 'Super', isQualified: true, status: 'APPROVED_ACTIVE' } });
    mockMemberRolesEq.mockResolvedValue({ data: [{ roleId: 'r-super' }], error: null });
    mockRolesIn.mockResolvedValue({ data: [{ slug: 'super_admin' }], error: null });

    render(<SupabaseSessionProvider><Probe /></SupabaseSessionProvider>);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    expect(screen.getByTestId('role')).toHaveTextContent('admin');
  });

  it('MEMBER via DB → user (admin access denied, safe)', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'mem-001', email: 'juan@example.com', user_metadata: { role: 'super_admin' } } } },
    });
    mockMembersSingle.mockResolvedValue({ data: { firstName: 'Juan', lastName: 'Dela Cruz', isQualified: true, status: 'APPROVED_ACTIVE' } });
    mockMemberRolesEq.mockResolvedValue({ data: [{ roleId: 'r-basic' }], error: null });
    mockRolesIn.mockResolvedValue({ data: [{ slug: 'member_basic' }], error: null });

    render(<SupabaseSessionProvider><Probe /></SupabaseSessionProvider>);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    expect(screen.getByTestId('role')).toHaveTextContent('user'); // metadata ignored
  });

  it('Unknown role → user (no escalation)', async () => {
    expect(normalizeRole('nonsense')).toBe('user');
    expect(normalizeRole('ADMIN')).toBe('admin'); // only SUPER_ADMIN maps
  });

  it('Missing member_roles → user (no crash)', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'x-1', email: 'a@b.com', user_metadata: { full_name: 'Ghost' } } } } });
    mockMembersSingle.mockResolvedValue({ data: null });
    mockMemberRolesEq.mockResolvedValue({ data: [], error: null });

    render(<SupabaseSessionProvider><Probe /></SupabaseSessionProvider>);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    expect(screen.getByTestId('role')).toHaveTextContent('user');
  });

  it('Role lookup failure → user (no admin)', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'mem-002', email: 'maria@example.com', user_metadata: {} } } } });
    mockMembersSingle.mockResolvedValue({ data: { firstName: 'Maria', lastName: 'Santos', isQualified: true, status: 'APPROVED_ACTIVE' } });
    mockMemberRolesEq.mockRejectedValue(new Error('fail'));

    render(<SupabaseSessionProvider><Probe /></SupabaseSessionProvider>);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    expect(screen.getByTestId('role')).toHaveTextContent('user');
  });

  it('Expired session → unauthenticated', async () => {
    let cb: (e: string, s: unknown) => void = () => {};
    mockOnAuthStateChange.mockImplementation((c) => {
      cb = c as unknown as typeof cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'mem-001', email: 'a@b.com', user_metadata: {} } } } });
    mockMembersSingle.mockResolvedValue({ data: { firstName: 'Juan', lastName: 'Dela Cruz', isQualified: true, status: 'APPROVED_ACTIVE' } });
    mockMemberRolesEq.mockResolvedValue({ data: [], error: null });

    render(<SupabaseSessionProvider><Probe /></SupabaseSessionProvider>);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    cb('SIGNED_OUT', { user: null } as never);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'));
  });

  it('super_admin slug → roleId super_admin (delete-capable shell)', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'adm-1', email: 'admin@jad.local', user_metadata: {} } } },
    });
    mockMembersSingle.mockResolvedValue({ data: { firstName: 'Admin', lastName: 'User', isQualified: true, status: 'APPROVED_ACTIVE' } });
    mockMemberRolesEq.mockResolvedValue({ data: [{ roleId: 'r-super' }], error: null });
    mockRolesIn.mockResolvedValue({ data: [{ slug: 'super_admin' }], error: null });

    render(<SupabaseSessionProvider><Probe /></SupabaseSessionProvider>);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    expect(screen.getByTestId('role')).toHaveTextContent('admin');
    expect(screen.getByTestId('roleId')).toHaveTextContent('super_admin');
  });

  it('admin slug → roleId admin; stale super_admin row wins on ties', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'adm-1', email: 'admin@jad.local', user_metadata: {} } } },
    });
    mockMembersSingle.mockResolvedValue({ data: { firstName: 'Admin', lastName: 'User', isQualified: true, status: 'APPROVED_ACTIVE' } });
    mockMemberRolesEq.mockResolvedValue({ data: [{ roleId: 'r-admin' }, { roleId: 'r-super' }], error: null });
    mockRolesIn.mockResolvedValue({ data: [{ slug: 'admin' }, { slug: 'super_admin' }], error: null });

    render(<SupabaseSessionProvider><Probe /></SupabaseSessionProvider>);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    expect(screen.getByTestId('roleId')).toHaveTextContent('super_admin');
  });

  it('finance slug → roleId finance', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'fin-1', email: 'fina@jad.example', user_metadata: {} } } },
    });
    mockMembersSingle.mockResolvedValue({ data: { firstName: 'Fina', lastName: 'Finance', isQualified: true, status: 'APPROVED_ACTIVE' } });
    mockMemberRolesEq.mockResolvedValue({ data: [{ roleId: 'r-fin' }], error: null });
    mockRolesIn.mockResolvedValue({ data: [{ slug: 'finance' }], error: null });

    render(<SupabaseSessionProvider><Probe /></SupabaseSessionProvider>);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    expect(screen.getByTestId('roleId')).toHaveTextContent('finance');
  });

  it('member slug → null roleId (no staff access)', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'mem-001', email: 'juan@example.com', user_metadata: {} } } },
    });
    mockMembersSingle.mockResolvedValue({ data: { firstName: 'Juan', lastName: 'Dela Cruz', isQualified: true, status: 'APPROVED_ACTIVE' } });
    mockMemberRolesEq.mockResolvedValue({ data: [{ roleId: 'r-basic' }], error: null });
    mockRolesIn.mockResolvedValue({ data: [{ slug: 'member_basic' }], error: null });

    render(<SupabaseSessionProvider><Probe /></SupabaseSessionProvider>);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    expect(screen.getByTestId('role')).toHaveTextContent('user');
    expect(screen.getByTestId('roleId')).toHaveTextContent('null');
  });

  it('Reload restores SUPER_ADMIN', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'sup-001', email: 'superadmin@gmail.com', user_metadata: {} } } } });
    mockMembersSingle.mockResolvedValue({ data: { firstName: 'Saul', lastName: 'Super', isQualified: true, status: 'APPROVED_ACTIVE' } });
    mockMemberRolesEq.mockResolvedValue({ data: [{ roleId: 'r1' }], error: null });
    mockRolesIn.mockResolvedValue({ data: [{ slug: 'super_admin' }], error: null });

    render(<SupabaseSessionProvider><Probe /></SupabaseSessionProvider>);
    await waitFor(() => expect(screen.getByTestId('role')).toHaveTextContent('admin'));
  });
});
