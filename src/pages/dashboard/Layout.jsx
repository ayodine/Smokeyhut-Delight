import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { BarChart2, Package, Truck, CreditCard, Store, ShoppingBag, Users, Settings, LogOut, Globe, Flame, Menu, UserCog } from 'lucide-react';

const navItems = [
  { to: '/admin', icon: BarChart2, label: 'Overview', end: true },
  { to: '/admin/orders', icon: Package, label: 'Orders' },
  { to: '/admin/shipping', icon: Truck, label: 'Shipping' },
  { to: '/admin/payments', icon: CreditCard, label: 'Payments' },
  { to: '/admin/stores', icon: Store, label: 'Stores' },
  { to: '/admin/products', icon: ShoppingBag, label: 'Products' },
  { to: '/admin/customers', icon: Users, label: 'Customers' },
  { to: '/admin/staff', icon: UserCog, label: 'Staff' },
  { to: '/admin/settings', icon: Settings, label: 'Settings' },
];

export default function DashboardLayout() {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedStore, setSelectedStore] = useState('all');

  const handleLogout = async () => {
    await signOut();
    navigate('/admin/login');
  };

  return (
    <div className="dash-layout">
      <aside className={`dash-sidebar${sidebarOpen ? ' open' : ''}`}>
        <div className="dash-sidebar-logo" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="/logo.svg" alt="Smokeyhut Logo" style={{ width: 28, height: 28, objectFit: 'contain' }} />
          Smokeyhut <span className="accent">Admin</span>
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
          <div style={{ marginBottom: 8, color: 'rgba(255,255,255,0.5)', fontSize: '0.78rem' }}>
            {user?.email || 'admin@smokeyhut.com'}
          </div>
          <button onClick={handleLogout} className="dash-nav-item" style={{ color: 'rgba(255,255,255,0.6)', padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12 }}>
            <LogOut size={18} className="nav-icon" /> Sign Out
          </button>
          <NavLink to="/" className="dash-nav-item" style={{ color: 'rgba(255,255,255,0.6)', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <Globe size={18} className="nav-icon" /> View Store
          </NavLink>
        </div>
      </aside>

      <main className="dash-main">
        <header className="dash-topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{ display: 'none', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-main)' }} className="dash-menu-toggle">
               <Menu size={24} />
            </button>
            <div className="dash-topbar-title">Dashboard</div>
          </div>
          <div className="dash-topbar-right">
            <select className="dash-store-select" value={selectedStore} onChange={e => setSelectedStore(e.target.value)}>
              <option value="all">All Stores</option>
              <option value="1">Lagos Mainland</option>
              <option value="2">Lagos Island</option>
            </select>
          </div>
        </header>
        <div className="dash-content">
          <Outlet context={{ selectedStore }} />
        </div>
      </main>
    </div>
  );
}
