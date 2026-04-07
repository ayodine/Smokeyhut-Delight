import { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { BarChart2, Package, Truck, CreditCard, Store, ShoppingBag, Users, Settings, LogOut, Globe, Menu, UserCog, MapPin } from 'lucide-react';

const allNavItems = [
  { to: '/admin',          icon: BarChart2,  label: 'Overview',  end: true,  roles: ['Admin', 'Manager'] },
  { to: '/admin/orders',   icon: Package,    label: 'Orders',    roles: ['Admin', 'Manager'] },
  { to: '/admin/shipping', icon: Truck,      label: 'Shipping',  roles: ['Admin', 'Manager', 'Rider'] },
  { to: '/admin/payments', icon: CreditCard, label: 'Payments',  roles: ['Admin', 'Manager'] },
  { to: '/admin/stores',   icon: Store,      label: 'Stores',    roles: ['Admin', 'Manager'] },
  { to: '/admin/products', icon: ShoppingBag,label: 'Products',  roles: ['Admin', 'Manager'] },
  { to: '/admin/customers',icon: Users,      label: 'Customers', roles: ['Admin', 'Manager'] },
  { to: '/admin/zones',    icon: MapPin,     label: 'Zones',     roles: ['Admin', 'Manager'] },
  { to: '/admin/staff',    icon: UserCog,    label: 'Staff',     roles: ['Admin'] },
  { to: '/admin/settings', icon: Settings,   label: 'Settings',  roles: ['Admin', 'Manager'] },
];

export default function DashboardLayout() {
  const { signOut, user, userRole } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedStore, setSelectedStore] = useState('all');
  const [storeOptions, setStoreOptions] = useState([]);

  const role = userRole || 'Admin';
  const navItems = allNavItems.filter(item => item.roles.includes(role));

  useEffect(() => {
    supabase.from('stores').select('id, name').order('id').then(({ data }) => {
      if (data) setStoreOptions(data);
    });
  }, []);

  // Redirect to first allowed page if current path is not permitted
  useEffect(() => {
    if (!userRole) return;
    const allowed = navItems.map(item => item.to);
    const isAllowed = allowed.some(path =>
      path === '/admin' ? location.pathname === '/admin' : location.pathname.startsWith(path)
    );
    if (!isAllowed) {
      navigate(navItems[0]?.to || '/admin/shipping', { replace: true });
    }
  }, [userRole, location.pathname]);

  const handleLogout = async () => {
    await signOut();
    navigate('/admin/login');
  };

  const roleLabel = { Admin: '🔑 Admin', Manager: '🧑‍💼 Manager', Rider: '🛵 Rider' }[role] || role;

  return (
    <div className="dash-layout">
      <aside className={`dash-sidebar${sidebarOpen ? ' open' : ''}`}>
        <div className="dash-sidebar-logo" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="/logo.svg" alt="Smokeyhut Logo" style={{ width: 28, height: 28, objectFit: 'contain' }} />
          <span className="accent">Admin</span>
        </div>
        <nav className="dash-nav">
          {navItems.map(item => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `dash-nav-item${isActive ? ' active' : ''}`}
                onClick={() => setSidebarOpen(false)}
              >
                <Icon className="nav-icon" size={18} />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
        <div className="dash-sidebar-footer">
          <div style={{ marginBottom: 4, color: 'rgba(255,255,255,0.5)', fontSize: '0.78rem' }}>
            {user?.email || 'admin@smokeyhut.com'}
          </div>
          <div style={{ marginBottom: 8, fontSize: '0.72rem', color: 'rgba(255,255,255,0.35)' }}>
            {roleLabel}
          </div>
          <button onClick={handleLogout} className="dash-nav-item" style={{ color: 'rgba(255,255,255,0.6)', padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12 }}>
            <LogOut size={18} className="nav-icon" /> Sign Out
          </button>
          <NavLink to="/" className="dash-nav-item" style={{ color: 'rgba(255,255,255,0.6)', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <Globe size={18} className="nav-icon" /> View Store
          </NavLink>
        </div>
      </aside>

      {sidebarOpen && <div className="dash-sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

      <main className="dash-main">
        <header className="dash-topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="dash-menu-toggle">
              <Menu size={24} />
            </button>
            <div className="dash-topbar-title">Dashboard</div>
          </div>
          <div className="dash-topbar-right">
            {role !== 'Rider' && (
              <select className="dash-store-select" value={selectedStore} onChange={e => setSelectedStore(e.target.value)}>
                <option value="all">All Stores</option>
                {storeOptions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
          </div>
        </header>
        <div className="dash-content">
          <Outlet context={{ selectedStore }} />
        </div>
      </main>
    </div>
  );
}
