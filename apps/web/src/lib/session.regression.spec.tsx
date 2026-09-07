import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SupabaseSessionProvider, useSession } from './session';
import { normalizeRole } from '@jad/contracts';

// Mock supabase
const mockGetSession = vi.fn();
const mockOnAuthStateChange = vi.fn();
const mockSignOut = vi.fn();
const mockMembersSingle = vi.fn();
const mockMemberRolesEq = vi.fn();
const mockRolesIn = vi.fn();

// For per-id fallback
const mockRolesEq = vi.fn();

vi.mock('./supabase', async () => {
  const actual = await vi.importActual<typeof import('./supabase')>('./supabase');
  return {
    ...actual,
    isSupabaseConfigured: () => true,
    getSupabaseClient: () => ({
      auth: {
        getSession: mockGetSession,
        onAuthStateChange: mockOnAuthStateChange,
        signOut: mockSignOut,
      },
      from: (table: string) => {
        const lower = table.toLowerCase();
        if (lower === 'members' || table === 'members') {
          return { select: () => ({ eq: () => ({ single: mockMembersSingle }) }) };
        }
        if (lower === 'member_roles' || lower === 'memberrole') {
          return { select: () => ({ eq: mockMemberRolesEq, in: mockRolesIn }) };
        }
        if (lower === 'roles' || lower === 'role') {
          return { select: () => ({ eq: mockRolesEq, in: mockRolesIn }) };
        }
        return { select: () => ({ eq: vi.fn(), in: vi.fn() }) };
      },
    }),
  };
});

function Probe() {
  const { status, role, user } = useSession();
  return (
    <div>
      <div data-testid="status">{status}</div>
      <div data-testid="role">{role ?? 'null'}</div>
      <div data-testid="user">{user?.id ?? 'none'}</div>
      <div data-testid="name">{user?.name ?? 'none'}</div>
    </div>
  );
}

describe('SupabaseSessionProvider – authoritative role via member_roles (regression)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockOnAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
    mockSignOut.mockResolvedValue(undefined);
    mockMembersSingle.mockResolvedValue({ data: null });
    mockMemberRolesEq.mockResolvedValue({ data: [], error: null });
    mockRolesIn.mockResolvedValue({ data: [], error: null });
    mockRolesEq.mockResolvedValue({ data: [], error: null });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('Admin via DB roles → admin', async () => {
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          user: { id: 'adm-001', email: 'admin@jad.local', user_metadata: { full_name: 'Admin', role: 'admin' } },
        },
      },
    });
    mockMembersSingle.mockResolvedValue({
      data: { firstName: 'Admin', lastName: 'User', isQualified: true, status: 'APPROVED_ACTIVE' },
    });
    mockMemberRolesEq.mockResolvedValue({ data: [{ roleId: 'role-admin' }], error: null });
    mockRolesIn.mockResolvedValue({ data: [{ slug: 'admin', name: 'Admin' }], error: null });

    render(
      <SupabaseSessionProvider>
        <Probe />
      </SupabaseSessionProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    expect(screen.getByTestId('role')).toHaveTextContent('admin');
    expect(screen.getByTestId('user')).toHaveTextContent('adm-001');
    // ensure role came from DB, not metadata: even if metadata says admin, DB is source — here DB has it
  });

  it('User via DB → user (no privilege escalation)', async () => {
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          user: { id: 'mem-001', email: 'juan@example.com', user_metadata: { full_name: 'Juan', role: 'admin' } },
        },
      },
    });
    mockMembersSingle.mockResolvedValue({
      data: { firstName: 'Juan', lastName: 'Dela Cruz', isQualified: true, status: 'APPROVED_ACTIVE' },
    });
    // DB says user only, even though metadata says admin
    mockMemberRolesEq.mockResolvedValue({ data: [{ roleId: 'role-user' }], error: null });
    mockRolesIn.mockResolvedValue({ data: [{ slug: 'user', name: 'User' }], error: null });

    render(
      <SupabaseSessionProvider>
        <Probe />
      </SupabaseSessionProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    // Must be user, not admin, proving DB is authoritative and metadata not used for privilege
    expect(screen.getByTestId('role')).toHaveTextContent('user');
  });

  it('Unknown role slug → safe user normalization (no escalation)', async () => {
    expect(normalizeRole('unknown_role')).toBe('user');
    expect(normalizeRole('admin')).toBe('admin');
    expect(normalizeRole('finance')).toBe('user');
    expect(normalizeRole('super_admin')).toBe('admin');
    expect(normalizeRole('SUPER-ADMIN')).toBe('admin');
    expect(normalizeRole('member')).toBe('user');
    expect(normalizeRole('MEMBER')).toBe('user');
    expect(normalizeRole('')).toBe('user');
    expect(normalizeRole(null)).toBe('user');
  });

  it('Missing profile (members null) → safe user, no crash', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'unknown-1', email: 'a@b.com', user_metadata: { full_name: 'Ghost' } } } },
    });
    mockMembersSingle.mockResolvedValue({ data: null, error: { message: 'not found' } });
    mockMemberRolesEq.mockResolvedValue({ data: [], error: null });

    render(
      <SupabaseSessionProvider>
        <Probe />
      </SupabaseSessionProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    expect(screen.getByTestId('role')).toHaveTextContent('user');
    expect(screen.getByTestId('name')).toHaveTextContent('Ghost');
  });

  it('Role lookup failure → safe user, no accidental admin', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'mem-002', email: 'maria@example.com', user_metadata: {} } } },
    });
    mockMembersSingle.mockResolvedValue({
      data: { firstName: 'Maria', lastName: 'Santos', isQualified: true, status: 'APPROVED_ACTIVE' },
    });
    mockMemberRolesEq.mockRejectedValue(new Error('network failure'));
    // mockRolesIn not called

    render(
      <SupabaseSessionProvider>
        <Probe />
      </SupabaseSessionProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    expect(screen.getByTestId('role')).toHaveTextContent('user');
  });

  it('Expired / signed-out session → unauthenticated', async () => {
    let authCb: (e: string, s: unknown) => void = () => {};
    mockOnAuthStateChange.mockImplementation((cb) => {
      authCb = cb as unknown as typeof authCb;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'mem-001', email: 'a@b.com', user_metadata: { full_name: 'Juan' } } } },
    });
    mockMembersSingle.mockResolvedValue({ data: { firstName: 'Juan', lastName: 'Dela Cruz', isQualified: true, status: 'APPROVED_ACTIVE' } });
    mockMemberRolesEq.mockResolvedValue({ data: [], error: null });

    render(
      <SupabaseSessionProvider>
        <Probe />
      </SupabaseSessionProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    authCb('SIGNED_OUT', { user: null } as unknown as never);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'));
    expect(screen.getByTestId('role')).toHaveTextContent('null');
  });

  it('Reload (getSession) restores admin via DB', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'adm-001', email: 'admin@jad.local', user_metadata: {} } } },
    });
    mockMembersSingle.mockResolvedValue({ data: { firstName: 'Admin', lastName: 'User', isQualified: true, status: 'APPROVED_ACTIVE' } });
    mockMemberRolesEq.mockResolvedValue({ data: [{ roleId: 'r1' }], error: null });
    mockRolesIn.mockResolvedValue({ data: [{ slug: 'admin' }], error: null });

    render(
      <SupabaseSessionProvider>
        <Probe />
      </SupabaseSessionProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    expect(screen.getByTestId('role')).toHaveTextContent('admin');
  });
});
