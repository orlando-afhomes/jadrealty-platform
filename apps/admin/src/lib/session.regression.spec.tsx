import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SupabaseSessionProvider, useSession } from './session';
import { normalizeRole } from '@jad/contracts';

const mockGetSession = vi.fn();
const mockOnAuthStateChange = vi.fn();
const mockSignOut = vi.fn();
const mockMembersSingle = vi.fn();

vi.mock('./supabase', async () => {
  const actual = await vi.importActual<typeof import('./supabase')>('./supabase');
  return {
    ...actual,
    isSupabaseConfigured: () => true,
    getSupabaseClient: () => ({
      auth: { getSession: mockGetSession, onAuthStateChange: mockOnAuthStateChange, signOut: mockSignOut },
      from: (table: string) => {
        if (table === 'Member' || table === 'members')
          return { select: () => ({ eq: () => ({ single: mockMembersSingle }) }) };
        return { select: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }) };
      },
    }),
  };
});

/**
 * Layer the staff-session endpoint over real fetch: role slugs resolve
 * server-side (Phase 6 — the client never reads Role tables). Always wraps
 * the original fetch so stubs never chain across tests.
 */
const originalFetch = globalThis.fetch;
function stubStaffSession(
  impl: () => Response = () =>
    Response.json({
      id: 'sup-001',
      email: 'superadmin@gmail.com',
      name: 'Saul Super',
      status: 'ACTIVE',
      slugs: ['super_admin'],
    }),
) {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes('/admin/session')) return impl();
    return (originalFetch as typeof fetch)(input, init);
  }) as typeof fetch;
}

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

function sessionWithUser(id: string, email: string, accessToken = 'tok') {
  return { user: { id, email, user_metadata: {} }, access_token: accessToken };
}

describe('Admin SupabaseSessionProvider – server-side staff session (regression)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockOnAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
    mockMembersSingle.mockResolvedValue({ data: null });
    stubStaffSession();
  });

  afterEach(() => vi.clearAllMocks());

  it('SUPER_ADMIN via endpoint → admin role, super_admin shell', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: sessionWithUser('sup-001', 'superadmin@gmail.com') },
    });
    mockMembersSingle.mockResolvedValue({ data: { firstName: 'Saul', lastName: 'Super', isQualified: true, status: 'APPROVED_ACTIVE' } });

    render(<SupabaseSessionProvider><Probe /></SupabaseSessionProvider>);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    expect(screen.getByTestId('role')).toHaveTextContent('admin');
    expect(screen.getByTestId('roleId')).toHaveTextContent('super_admin');
  });

  it('endpoint 404 (no staff identity) → user role, null shell', async () => {
    stubStaffSession(() => new Response(JSON.stringify({ error: { code: 'NOT_FOUND' } }), { status: 404 }));
    mockGetSession.mockResolvedValue({
      data: { session: sessionWithUser('mem-001', 'juan@example.com', 'tok-x') },
    });
    mockMembersSingle.mockResolvedValue({ data: { firstName: 'Juan', lastName: 'Dela Cruz', isQualified: true, status: 'APPROVED_ACTIVE' } });

    render(<SupabaseSessionProvider><Probe /></SupabaseSessionProvider>);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    expect(screen.getByTestId('role')).toHaveTextContent('user');
    expect(screen.getByTestId('roleId')).toHaveTextContent('null');
  });

  it('endpoint failure → user (no admin)', async () => {
    stubStaffSession(() => {
      throw new Error('network failure');
    });
    mockGetSession.mockResolvedValue({
      data: { session: sessionWithUser('mem-002', 'maria@example.com', 'tok-y') },
    });
    mockMembersSingle.mockResolvedValue({ data: { firstName: 'Maria', lastName: 'Santos', isQualified: true, status: 'APPROVED_ACTIVE' } });

    render(<SupabaseSessionProvider><Probe /></SupabaseSessionProvider>);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    expect(screen.getByTestId('role')).toHaveTextContent('user');
  });

  it('unknown role slug normalizes safely (no escalation)', async () => {
    expect(normalizeRole('nonsense')).toBe('user');
    expect(normalizeRole('ADMIN')).toBe('admin'); // only SUPER_ADMIN maps
  });

  it('Expired session → unauthenticated', async () => {
    let cb: (e: string, s: unknown) => void = () => {};
    mockOnAuthStateChange.mockImplementation((c) => {
      cb = c as unknown as typeof cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    mockGetSession.mockResolvedValue({ data: { session: sessionWithUser('mem-001', 'a@b.com') } });
    mockMembersSingle.mockResolvedValue({ data: { firstName: 'Juan', lastName: 'Dela Cruz', isQualified: true, status: 'APPROVED_ACTIVE' } });

    render(<SupabaseSessionProvider><Probe /></SupabaseSessionProvider>);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    cb('SIGNED_OUT', { user: null } as never);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'));
  });

  it('admin slug → roleId admin; stale super_admin row wins on ties', async () => {
    stubStaffSession(() =>
      Response.json({
        id: 'adm-1',
        email: 'admin@jad.local',
        name: 'Admin User',
        status: 'ACTIVE',
        slugs: ['admin', 'super_admin'],
      }),
    );
    mockGetSession.mockResolvedValue({
      data: { session: sessionWithUser('adm-1', 'admin@jad.local') },
    });
    mockMembersSingle.mockResolvedValue({ data: { firstName: 'Admin', lastName: 'User', isQualified: true, status: 'APPROVED_ACTIVE' } });

    render(<SupabaseSessionProvider><Probe /></SupabaseSessionProvider>);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    expect(screen.getByTestId('roleId')).toHaveTextContent('super_admin');
  });

  it('finance slug → roleId finance', async () => {
    stubStaffSession(() =>
      Response.json({
        id: 'fin-1',
        email: 'fina@jad.example',
        name: 'Fina Finance',
        status: 'ACTIVE',
        slugs: ['finance'],
      }),
    );
    mockGetSession.mockResolvedValue({
      data: { session: sessionWithUser('fin-1', 'fina@jad.example') },
    });
    mockMembersSingle.mockResolvedValue({ data: { firstName: 'Fina', lastName: 'Finance', isQualified: true, status: 'APPROVED_ACTIVE' } });

    render(<SupabaseSessionProvider><Probe /></SupabaseSessionProvider>);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    expect(screen.getByTestId('roleId')).toHaveTextContent('finance');
  });
});
