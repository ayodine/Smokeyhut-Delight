import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useSettings } from '../context/SettingsContext';
import { ShoppingCart, Menu, X, Store, ShoppingBag } from 'lucide-react';
import AccountMenu from './AccountMenu';

export default function Navbar({ onCartOpen }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [tickerVisible, setTickerVisible] = useState(true);
  const { itemCount } = useCart();
  const { settings } = useSettings();
  const location = useLocation();

  const links = [
    { to: '/', label: 'Home' },
    { to: '/shop', label: 'Shop' },
    { to: '/about', label: 'About' },
    { to: '/faq', label: 'FAQ' },
    { to: '/contact', label: 'Contact' },
    { to: '/store-rules', label: 'Store Rules' },
  ];

  const tickerItems = settings.tickerItems || [];

  return (
    <>
      <div className="nav-header">
        {tickerVisible && (
          <div className="ticker-banner">
            <div className="ticker-content">
              {[...tickerItems, ...tickerItems].map((item, i) => (
                <div key={i} className="ticker-item">{item}</div>
              ))}
            </div>
            <button className="ticker-close" onClick={() => setTickerVisible(false)} aria-label="Close banner">✕</button>
          </div>
        )}
        <nav className="main-nav" aria-label="Main navigation">
          <div className="nav-inner">
            <Link to="/" className="logo">
              <img src="/logo.svg" alt="Smokeyhut Logo" style={{ width: 34, height: 34, objectFit: 'contain' }} />
              Smokeyhut <span className="accent">Delight</span>
            </Link>
            <div className={`nav-links${mobileOpen ? ' mobile-open' : ''}`}>
              {links.map(l => (
                <Link
                  key={l.to}
                  to={l.to}
                  className={location.pathname === l.to ? 'active' : ''}
                  onClick={() => setMobileOpen(false)}
                >
                  {l.label}
                </Link>
              ))}
            </div>
            <div className="nav-right">
              <AccountMenu />
              <button className="cart-btn desktop-cart" onClick={onCartOpen} aria-label="Open cart">
                <ShoppingCart size={16} /> Cart <span className="cart-count">{itemCount}</span>
              </button>
              <button className="hamburger" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Menu">
                {mobileOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
            </div>
          </div>
        </nav>
      </div>

      {/* Spacer to offset fixed nav-header */}
      <div className="nav-header-spacer" style={{ height: tickerVisible ? 96 : 60 }} />

      {/* Mobile bottom nav bar */}
      <nav className="mobile-bottom-nav premium-bottom-nav" aria-label="Mobile navigation">
        <Link to="/" className="premium-nav-btn" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: location.pathname === '/' ? 'var(--red)' : 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 700, textDecoration: 'none' }}>
          <Store size={22} />
          Home
        </Link>
        <Link to="/shop" className="premium-nav-btn" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: location.pathname === '/shop' ? 'var(--red)' : 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 700, textDecoration: 'none' }}>
          <ShoppingBag size={22} />
          Shop
        </Link>
        <button
          className="premium-nav-btn"
          onClick={onCartOpen}
          style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: itemCount > 0 ? 'var(--red)' : 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 700, position: 'relative' }}
        >
          <span style={{ position: 'relative', display: 'inline-flex' }}>
            <ShoppingCart size={22} />
            {itemCount > 0 && (
              <span style={{ position: 'absolute', top: -6, right: -8, background: 'var(--red)', color: '#fff', borderRadius: '50%', width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', fontWeight: 900, lineHeight: 1 }}>
                {itemCount}
              </span>
            )}
          </span>
          Cart
        </button>
      </nav>

      {/* Spacer so content isn't hidden behind bottom nav on mobile */}
      <div className="mobile-bottom-spacer" />
    </>
  );
}
