
import { useState, useEffect } from 'react';
import { NavLink, Outlet, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import {
  BarChart2, Package, Truck, CreditCard, Store, ShoppingBag, ShoppingCart, Users,
  Settings, LogOut, Globe, Menu, UserCog, MapPin, Tag,
  DollarSign, TrendingUp, Receipt, Archive, ChevronDown, Boxes,
  ChevronLeft, ChevronRight, Shield, Briefcase, Bike, User
} from 'lucide-react';
import AdminChatBubble from '../../components/AdminChatBubble';
import CustomSelect from '../../components/CustomSelect';

const ROLE_METADATA = {
  Admin: { icon: Shield, label: 'Admin' },
  Manager: { icon: Briefcase, label: 'Manager' },
  Rider: { icon: Bike, label: 'Rider' },
  Staff: { icon: User, label: 'Staff' }
};

const allNavItems = [
  // 1. Dashboard Overview
  { to: '/admin', icon: BarChart2, label: 'Overview', end: true, roles: ['Admin', 'Manager', 'Staff'] },

  // 2. Orders & Sales Group
  {
    type: 'group', icon: Package, label: 'Orders & Sales', roles: ['Admin', 'Manager', 'Rider', 'Staff'],
    children: [
      { to: '/admin/orders',          icon: Package,      label: 'Orders',          roles: ['Admin', 'Manager', 'Staff'] },
      { to: '/admin/abandoned-carts', icon: ShoppingCart, label: 'Abandoned Carts', roles: ['Admin', 'Manager', 'Staff'] },
      { to: '/admin/shipping',        icon: Truck,        label: 'Shipping',        roles: ['Admin', 'Manager', 'Rider', 'Staff'] },
      { to: '/admin/payments',        icon: CreditCard,   label: 'Payments',        roles: ['Admin', 'Manager', 'Staff'] },
    ],
  },

  // 3. Menu & Catalog Group
  {
    type: 'group', icon: ShoppingBag, label: 'Menu & Products', roles: ['Admin', 'Manager', 'Staff'],
    children: [
      { to: '/admin/products',        icon: ShoppingBag, label: 'Products',   roles: ['Admin', 'Manager', 'Staff'] },
      { to: '/admin/products-sold',   icon: Boxes,       label: 'Units Sold', roles: ['Admin', 'Manager', 'Staff'] },
      { to: '/admin/finance/inventory', icon: Archive,   label: 'Inventory',  roles: ['Admin', 'Manager', 'Staff'] },
    ],
  },

  // 4. Customers & Growth
  {
    type: 'group', icon: Users, label: 'Customers & Promos', roles: ['Admin', 'Manager', 'Staff'],
    children: [
      { to: '/admin/customers', icon: Users, label: 'Customers', roles: ['Admin', 'Manager', 'Staff'] },
      { to: '/admin/coupons',   icon: Tag,   label: 'Coupons',   roles: ['Admin', 'Manager', 'Staff'] },
    ],
  },

  // 5. Finance & Analytics
  {
    type: 'group', icon: DollarSign, label: 'Finance & Analytics', roles: ['Admin', 'Manager', 'Staff'],
    children: [
      { to: '/admin/stats',            icon: TrendingUp, label: 'Stats',        roles: ['Admin', 'Manager', 'Staff'] },
      { to: '/admin/finance/sales',    icon: TrendingUp, label: 'Sales Report', roles: ['Admin', 'Manager', 'Staff'] },
      { to: '/admin/finance/expenses', icon: Receipt,    label: 'Expenses',     roles: ['Admin', 'Manager', 'Staff'] },
    ],
  },

  // 6. Store Operations & Management
  {
    type: 'group', icon: Settings, label: 'Management', roles: ['Admin', 'Manager', 'Staff'],
    children: [
      { to: '/admin/stores',   icon: Store,    label: 'Stores',   roles: ['Admin', 'Manager', 'Staff'] },
      { to: '/admin/zones',    icon: MapPin,   label: 'Zones',    roles: ['Admin', 'Manager', 'Staff'] },
      { to: '/admin/staff',    icon: UserCog,  label: 'Staff',    roles: ['Admin'] },
      { to: '/admin/settings', icon: Settings, label: 'Settings', roles: ['Admin', 'Manager', 'Staff'] },
    ],
  },
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
  const { signOut, user, userRole, userPermissions, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem('dash_sidebar_collapsed') === 'true';
  });
  const [selectedStore, setSelectedStore] = useState('all');
  const [storeOptions, setStoreOptions] = useState([]);
  
  // Multi-group collapsible state
  const [openGroups, setOpenGroups] = useState(() => {
    const initial = {};
    allNavItems.forEach(item => {
      if (item.type === 'group') {
        const isActive = item.children?.some(c => location.pathname.startsWith(c.to));
        if (isActive) initial[item.label] = true;
      }
    });
    return initial;
  });

  const toggleGroup = (groupLabel) => {
    setOpenGroups(prev => ({
      ...prev,
      [groupLabel]: !prev[groupLabel]
    }));
  };

  useEffect(() => {
    localStorage.setItem('dash_sidebar_collapsed', sidebarCollapsed);
  }, [sidebarCollapsed]);

  // Keep group open when navigating within its child routes
  useEffect(() => {
    allNavItems.forEach(item => {
      if (item.type === 'group') {
        const isActive = item.children?.some(c =>
          c.to === '/admin' ? location.pathname === '/admin' : location.pathname.startsWith(c.to)
        );
        if (isActive) {
          setOpenGroups(prev => ({ ...prev, [item.label]: true }));
        }
      }
    });
  }, [location.pathname]);

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

  useEffect(() => {
    if (loading || !userRole || isRouteAllowed) return;
    navigate(firstAllowedPath || '/admin/shipping', { replace: true });
  }, [userRole, location.pathname, userPermissions, loading]);

  const handleLogout = async () => {
    await signOut();
    navigate('/admin/login');
  };

  const roleMeta = ROLE_METADATA[role] || { icon: User, label: role };
  const RoleIcon = roleMeta.icon;

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#1A1610' }}>
        <div style={{ textAlign: 'center' }}>
          <img
            src="/logo.svg"
            alt="Smokeyhut Delight"
            style={{ width: 80, height: 80, objectFit: 'contain', animation: 'pulse 1.5s ease-in-out infinite' }}
          />
          <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
        </div>
      </div>
    );
  }

  return (
    <div className="dash-layout">
      <aside className={`dash-sidebar${sidebarOpen ? ' open' : ''}${sidebarCollapsed ? ' collapsed' : ''}`}>
        <div className="dash-sidebar-logo" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden' }}>
            <img src="/logo.svg" alt="Smokeyhut Logo" style={{ width: 28, height: 28, objectFit: 'contain', flexShrink: 0 }} />
            <span className="accent logo-text" style={{ transition: 'opacity 0.2s, width 0.2s' }}>Admin</span>
          </div>
          <button 
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="sidebar-collapse-toggle"
            title={sidebarCollapsed ? "Expand Menu" : "Collapse Menu"}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'rgba(255,255,255,0.45)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 4,
              borderRadius: 6,
              transition: 'background 0.2s, color 0.2s',
            }}
            onMouseEnter={e => e.currentTarget.style.color = '#fff'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.45)'}
          >
            {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>
        <nav className="dash-nav">
          {navItems.map(item => {
            if (item.type === 'group') {
              const Icon = item.icon;
              const isGroupOpen = !!openGroups[item.label];
              const isGroupActive = item.children.some(child =>
                child.to === '/admin' ? location.pathname === '/admin' : location.pathname.startsWith(child.to)
              );

              return (
                <div key={item.label}>
                  <button
                    className={`dash-nav-item dash-nav-group-btn${isGroupActive ? ' active' : ''}`}
                    onClick={() => toggleGroup(item.label)}
                    title={sidebarCollapsed ? item.label : undefined}
                  >
                    <Icon className="nav-icon" size={18} />
                    <span className="nav-label">{item.label}</span>
                    <ChevronDown
                      size={14}
                      style={{ marginLeft: 'auto', transform: isGroupOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
                    />
                  </button>
                  {isGroupOpen && (
                    <div className="dash-nav-sub">
                      {item.children.map(child => {
                        const CIcon = child.icon;
                        return (
                          <NavLink
                            key={child.to}
                            to={child.to}
                            className={({ isActive }) => `dash-nav-item dash-nav-sub-item${isActive ? ' active' : ''}`}
                            onClick={() => setSidebarOpen(false)}
                            title={sidebarCollapsed ? child.label : undefined}
                          >
                            <CIcon size={14} style={{ opacity: 0.7 }} />
                            <span className="nav-label">{child.label}</span>
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
                title={sidebarCollapsed ? item.label : undefined}
              >
                <Icon className="nav-icon" size={18} />
                <span className="nav-label">{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
        <div className="dash-sidebar-footer">
          <div className="sidebar-footer-email" style={{ marginBottom: 4, color: 'rgba(255,255,255,0.5)', fontSize: '0.78rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user?.email || 'admin@smokeyhut.com'}
          </div>
          <div className="sidebar-footer-role" style={{ 
            marginBottom: 8, 
            fontSize: '0.72rem', 
            color: 'rgba(255,255,255,0.35)', 
            display: 'flex', 
            alignItems: 'center', 
            gap: 6,
            overflow: 'hidden', 
            textOverflow: 'ellipsis', 
            whiteSpace: 'nowrap' 
          }}>
            <RoleIcon size={12} style={{ opacity: 0.6 }} />
            <span>{roleMeta.label}</span>
          </div>
          <button onClick={handleLogout} className="dash-nav-item" title={sidebarCollapsed ? "Sign Out" : undefined} style={{ color: 'rgba(255,255,255,0.6)', padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12 }}>
            <LogOut size={18} className="nav-icon" />
            <span className="nav-label">Sign Out</span>
          </button>
          <NavLink to="/" className="dash-nav-item" title={sidebarCollapsed ? "View Store" : undefined} style={{ color: 'rgba(255,255,255,0.6)', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <Globe size={18} className="nav-icon" />
            <span className="nav-label">View Store</span>
          </NavLink>
        </div>
      </aside>

      {sidebarOpen && <div className="dash-sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

      <main className={`dash-main${sidebarCollapsed ? ' collapsed' : ''}`}>
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
