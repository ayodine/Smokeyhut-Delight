import React from 'react';
import { Link } from 'react-router-dom';
import { Camera, MessageCircle, Globe, Flame } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-grid">
        <div>
          <Link to="/" className="footer-logo" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            <img src="/logo.svg" alt="Smokeyhut Logo" style={{ width: 36, height: 36, objectFit: 'contain' }} />
            Smokeyhut <span>Delight</span>
          </Link>
          <p className="footer-desc">
            Lagos's favourite firewood-grilled guineafowl. Fresh daily, delivered hot. Est. Yaba, Lagos.
          </p>
          <div className="footer-social">
            <a href="https://www.instagram.com/smokeyhut_delight/" target="_blank" rel="noopener noreferrer" className="social-btn"><Camera size={20} /></a>
            <a href="#" className="social-btn"><MessageCircle size={20} /></a>
            <a href="#" className="social-btn"><Globe size={20} /></a>
          </div>
        </div>
        <div className="footer-col">
          <h4>Menu</h4>
          <Link to="/shop">Shop All</Link>
          <Link to="/shop">Guineafowl</Link>
          <Link to="/shop">Combos</Link>
          <Link to="/shop">Drinks</Link>
        </div>
        <div className="footer-col">
          <h4>Company</h4>
          <Link to="/about">About Us</Link>
          <Link to="/contact">Contact</Link>
          <Link to="/faq">FAQ</Link>
          <Link to="/store-rules">Store Rules</Link>
        </div>
        <div className="footer-col">
          <h4>Legal</h4>
          <Link to="/privacy">Privacy Policy</Link>
          <Link to="/refund">Refund Policy</Link>
          <Link to="/store-rules">Terms of Service</Link>
        </div>
      </div>
      <div className="footer-bottom">
        <p>© {new Date().getFullYear()} Smokeyhut Delight. All rights reserved.</p>
        <p style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>Made with <Flame size={16} color="var(--red)" /> in Lagos, Nigeria</p>
      </div>
    </footer>
  );
}
