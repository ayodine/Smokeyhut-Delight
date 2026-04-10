import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useSettings } from '../context/SettingsContext';
import { ShoppingCart, Home, Store, Menu, X, Info } from 'lucide-react';

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
      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        <Link to="/" className={`mobile-nav-item${location.pathname === '/' ? ' active' : ''}`}>
          <Home size={22} />
          <span>Home</span>
        </Link>
        <Link to="/shop" className={`mobile-nav-item${location.pathname === '/shop' ? ' active' : ''}`}>
          <Store size={22} />
          <span>Shop</span>
        </Link>
        <button className="mobile-nav-item mobile-nav-cart" onClick={onCartOpen} aria-label="Open cart">
          <span className="mobile-cart-icon-wrap">
            <ShoppingCart size={24} />
            {itemCount > 0 && <span className="mobile-cart-badge">{itemCount}</span>}
          </span>
          <span>Cart</span>
        </button>
        <Link to="/about" className={`mobile-nav-item${location.pathname === '/about' ? ' active' : ''}`}>
          <Info size={22} />
          <span>About</span>
        </Link>
        <button
          className={`mobile-nav-item${mobileOpen ? ' active' : ''}`}
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Menu"
        >
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          <span>Menu</span>
        </button>
      </nav>

      {/* Spacer so content isn't hidden behind bottom nav on mobile */}
      <div className="mobile-bottom-spacer" />
    </>
  );
}
