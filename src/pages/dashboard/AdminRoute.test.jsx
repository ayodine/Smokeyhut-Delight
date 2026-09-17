import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProtectedRoute from '../../components/ProtectedRoute';
import DashboardLayout from './Layout';
import Login from './Login';
import Overview from './Overview';
import Coupons from './Coupons';
import PromoOffers from './PromoOffers';

let mockUser = null;
let mockRole = null;
let mockLoading = false;

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    userRole: mockRole,
    userPermissions: [],
    loading: mockLoading,
    signIn: vi.fn(),
    signOut: vi.fn(),
    error: null,
  }),
}));

vi.mock('../../context/ToastContext', () => ({
  useToast: () => ({
    showToast: vi.fn(),
  }),
}));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      update: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnValue({}),
    })),
    removeChannel: vi.fn(),
    auth: {
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
      resetPasswordForEmail: vi.fn(),
      signOut: vi.fn(),
    },
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
  },
  publicSupabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    })),
  },
}));

describe('Admin components rendering', () => {
  it('renders Login page cleanly', () => {
    const html = renderToString(
      <MemoryRouter initialEntries={['/admin/login']}>
        <Login />
      </MemoryRouter>
    );
    expect(html).toBeDefined();
    expect(html).toContain('Smokeyhut');
    expect(html).toContain('Admin');
    expect(html).toContain('Sign In');
  });

  it('renders ProtectedRoute in loading state', () => {
    mockLoading = true;
    mockUser = null;
    mockRole = null;
    const html = renderToString(
      <MemoryRouter initialEntries={['/admin']}>
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      </MemoryRouter>
    );
    expect(html).toContain('Smokeyhut Delight');
  });

  it('redirects to /admin/login when not logged in', () => {
    mockLoading = false;
    mockUser = null;
    mockRole = null;
    const html = renderToString(
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route path="/admin" element={
            <ProtectedRoute>
              <div>Protected Content</div>
            </ProtectedRoute>
          } />
          <Route path="/admin/login" element={<Login />} />
        </Routes>
      </MemoryRouter>
    );
    expect(html).not.toContain('Protected Content');
  });

  it('renders DashboardLayout when authenticated as Admin', () => {
    mockLoading = false;
    mockUser = { id: 'admin-1', email: 'admin@smokeyhut.com' };
    mockRole = 'Admin';
    const html = renderToString(
      <MemoryRouter initialEntries={['/admin']}>
        <DashboardLayout />
      </MemoryRouter>
    );
    expect(html).toBeDefined();
    expect(html).toContain('Overview');
    expect(html).toContain('Orders &amp; Sales');
  });

  it('renders Overview page cleanly', () => {
    const html = renderToString(
      <MemoryRouter initialEntries={['/admin']}>
        <Overview />
      </MemoryRouter>
    );
    expect(html).toBeDefined();
  });

  it('renders Coupons dashboard page cleanly', () => {
    const html = renderToString(
      <MemoryRouter initialEntries={['/admin/coupons']}>
        <Coupons />
      </MemoryRouter>
    );
    expect(html).toBeDefined();
  });

  it('renders PromoOffers dashboard page cleanly', () => {
    const html = renderToString(
      <MemoryRouter initialEntries={['/admin/promos']}>
        <PromoOffers />
      </MemoryRouter>
    );
    expect(html).toBeDefined();
  });
});
