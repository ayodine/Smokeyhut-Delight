import { useState, useEffect } from 'react';
import { NavLink, Outlet, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import {
  BarChart2, Package, Truck, CreditCard, Store, ShoppingBag, Users,
  Settings, LogOut, Globe, Menu, UserCog, MapPin, Tag,
  DollarSign, TrendingUp, Receipt, Archive, ChevronDown,
} from 'lucide-react';
import AdminChatBubble from '../../components/AdminChatBubble';
import CustomSelect from '../../components/CustomSelect';

const allNavItems = [
  { to: '/admin',           icon: BarChart2,   label: 'Overview',  end: true, roles: ['Admin', 'Manager', 'Staff'] },
  { to: '/admin/orders',    icon: Package,     label: 'Orders',               roles: ['Admin', 'Manager', 'Staff'] },
  { to: '/admin/shipping',  icon: Truck,       label: 'Shipping',             roles: ['Admin', 'Manager', 'Rider', 'Staff'] },
  { to: '/admin/payments',  icon: CreditCard,  label: 'Payments',             roles: ['Admin', 'Manager', 'Staff'] },
  { to: '/admin/stores',    icon: Store,       label: 'Stores',               roles: ['Admin', 'Manager', 'Staff'] },
  { to: '/admin/products',  icon: ShoppingBag, label: 'Products',             roles: ['Admin', 'Manager', 'Staff'] },
  { to: '/admin/customers', icon: Users,       label: 'Customers',            roles: ['Admin', 'Manager', 'Staff'] },
  { to: '/admin/stats',     icon: TrendingUp,  label: 'Stats',                roles: ['Admin', 'Manager', 'Staff'] },
  { to: '/admin/zones',     icon: MapPin,      label: 'Zones',                roles: ['Admin', 'Manager', 'Staff'] },
  { to: '/admin/coupons',   icon: Tag,         label: 'Coupons',              roles: ['Admin', 'Manager', 'Staff'] },
  {
    type: 'group', icon: DollarSign, label: 'Finance', roles: ['Admin', 'Manager', 'Staff'],
    children: [
      { to: '/admin/finance/sales',     icon: TrendingUp, label: 'Sales Report', roles: ['Admin', 'Manager', 'Staff'] },
      { to: '/admin/finance/expenses',  icon: Receipt,    label: 'Expenses',     roles: ['Admin', 'Manager', 'Staff'] },
      { to: '/admin/finance/inventory', icon: Archive,    label: 'Inventory',    roles: ['Admin', 'Manager', 'Staff'] },
    ],
  },
  { to: '/admin/staff',     icon: UserCog,     label: 'Staff',                roles: ['Admin'] },
  { to: '/admin/settings',  icon: Settings,    label: 'Settings',             roles: ['Admin', 'Manager', 'Staff'] },
];

function passesPermission(label, role, userPermissions) {
  if (role === 'Admin') return true;
  
  const perms = Array.isArray(userPermissions) ? userPermissions : [];
  
  // If the user has specific permissions assigned, STRICTLY enforce them regardless of role
  if (perms.length > 0) {
    return perms.some(p => p.startsWith(`${label}:`));
  }
  
  // If no permissions assigned, Staff gets nothing, but Managers/Riders get their default role access
  return role !== 'Staff';
}

export default function DashboardLayout() {
  const { signOut, user, userRole, userPermissions } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedStore, setSelectedStore] = useState('all');
  const [storeOptions, setStoreOptions] = useState([]);
  const [financeOpen, setFinanceOpen] = useState(location.pathname.startsWith('/admin/finance'));

  const role = userRole || 'Admin';

  const navItems = allNavItems.reduce((acc, item) => {
    if (!item.roles.includes(role)) return acc;
    if (item.type === 'group') {
      const children = item.children.filter(c =>
        c.roles.includes(role) && passesPermission(c.label, role, userPermissions)
      );
      if (children.length > 0) acc.push({ ...item, children });
    } else {
      if (passesPermission(item.label, role, userPermissions)) acc.push(item);
    }
    return acc;
  }, []);

  const allowed = navItems.flatMap(item =>
    item.type === 'group' ? item.children.map(c => c.to) : [item.to]
  );
  const isRouteAllowed = allowed.some(path =>
    path === '/admin' ? location.pathname === '/admin' : location.pathname.startsWith(path)
  );
  const firstNavItem = navItems[0];
  const firstAllowedPath = firstNavItem?.type === 'group' ? firstNavItem.children[0]?.to : firstNavItem?.to;

  useEffect(() => {
    const fetchStores = async () => {
      const { data } = await supabase.from('stores').select('id, name').order('id');
      if (data) setStoreOptions(data);
    };

    fetchStores();

    // Subscribe to changes on the stores table in real-time
    const channel = supabase
      .channel('public:stores')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stores' }, () => {
        fetchStores();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Keep finance sub-menu open when navigating within it
  useEffect(() => {
    if (location.pathname.startsWith('/admin/finance')) setFinanceOpen(true);
  }, [location.pathname]);

  useEffect(() => {
    if (!userRole || isRouteAllowed) return;
    navigate(firstAllowedPath || '/admin/shipping', { replace: true });
  }, [userRole, location.pathname, userPermissions]);

  const handleLogout = async () => {
    await signOut();
    navigate('/admin/login');
  };

  const roleLabel = { Admin: '🔑 Admin', Manager: '🧑‍💼 Manager', Rider: '🛵 Rider', Staff: '👤 Staff' }[role] || role;
  const isFinanceActive = location.pathname.startsWith('/admin/finance');

  return (
    <div className="dash-layout">
      <aside className={`dash-sidebar${sidebarOpen ? ' open' : ''}`}>
        <div className="dash-sidebar-logo" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="/logo.svg" alt="Smokeyhut Logo" style={{ width: 28, height: 28, objectFit: 'contain' }} />
          <span className="accent">Admin</span>
        </div>
        <nav className="dash-nav">
          {navItems.map(item => {
            if (item.type === 'group') {
              const Icon = item.icon;
              return (
                <div key={item.label}>
                  <button
                    className={`dash-nav-item dash-nav-group-btn${isFinanceActive ? ' active' : ''}`}
                    onClick={() => setFinanceOpen(v => !v)}
                  >
                    <Icon className="nav-icon" size={18} />
                    {item.label}
                    <ChevronDown
                      size={14}
                      style={{ marginLeft: 'auto', transform: financeOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
                    />
                  </button>
                  {financeOpen && (
                    <div className="dash-nav-sub">
                      {item.children.map(child => {
                        const CIcon = child.icon;
                        return (
                          <NavLink
                            key={child.to}
                            to={child.to}
                            className={({ isActive }) => `dash-nav-item dash-nav-sub-item${isActive ? ' active' : ''}`}
                            onClick={() => setSidebarOpen(false)}
                          >
                            <CIcon size={14} style={{ opacity: 0.7 }} />
                            {child.label}
                          </NavLink>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

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
              <div style={{ width: 180 }}>
                <CustomSelect
                  value={selectedStore}
                  onChange={e => setSelectedStore(e.target.value)}
                  options={[
                    { value: 'all', label: 'All Stores' },
                    ...storeOptions.map(s => ({ value: s.id, label: s.name }))
                  ]}
                />
              </div>
            )}
          </div>
        </header>
        <div className="dash-content">
          {isRouteAllowed
            ? <Outlet context={{ selectedStore }} />
            : (userRole && firstAllowedPath ? <Navigate to={firstAllowedPath} replace /> : null)
          }
        </div>
      </main>
      <AdminChatBubble />
    </div>
  );
}
