import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { ShoppingCart } from 'lucide-react';

export default function Navbar({ onCartOpen }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [tickerVisible, setTickerVisible] = useState(true);
  const { itemCount } = useCart();
  const location = useLocation();

  const links = [
    { to: '/', label: 'Home' },
    { to: '/shop', label: 'Shop' },
    { to: '/about', label: 'About' },
    { to: '/faq', label: 'FAQ' },
    { to: '/contact', label: 'Contact' },
    { to: '/store-rules', label: 'Store Rules' },
  ];

  const tickerItems = [
    '🔥 <span>BEST GUINEAFOWL IN LAGOS</span> | Firewood-grilled daily — Order now!',
    '📍 <span>13 McNeil St, Yaba, Lagos</span> | Open Mon–Sat 8am–6pm',
    '🍗 <span>Combo Deal:</span> 2 Guineafowls + 2 Drinks = ₦22,000',
    '🚚 <span>SAME-DAY DELIVERY</span> | Order before 10am for first-batch dispatch!',
    '🌿 <span>FRESH DAILY:</span> Guineafowl • Rice • Palm Wine • Zobo',
  ];

  return (
    <>
      {tickerVisible && (
        <div className="ticker-banner">
          <div className="ticker-content">
            {[...tickerItems, ...tickerItems].map((item, i) => (
              <div key={i} className="ticker-item" dangerouslySetInnerHTML={{ __html: item }} />
            ))}
          </div>
          <button className="ticker-close" onClick={() => setTickerVisible(false)} aria-label="Close banner">✕</button>
        </div>
      )}
      <nav className="main-nav" aria-label="Main navigation">
        <div className="nav-inner">
          <Link to="/" className="logo">
            <img src="/logo.svg" alt="Smokeyhut Logo" style={{ width: 42, height: 42, objectFit: 'contain' }} />
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
            <button className="cart-btn" onClick={onCartOpen} aria-label="Open cart" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <ShoppingCart size={18} /> Cart <span className="cart-count">{itemCount}</span>
            </button>
            <button className="hamburger" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Menu">☰</button>
          </div>
        </div>
      </nav>
    </>
  );
}
