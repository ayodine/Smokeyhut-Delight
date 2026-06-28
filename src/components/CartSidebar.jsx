import React from 'react';
import { useCart } from '../context/CartContext';
import { useNavigate } from 'react-router-dom';
import { ShoppingCart, Trash2 } from 'lucide-react';
import { anyItemPastCutoff } from '../lib/deliveryCutoff';

export default function CartSidebar({ isOpen, onClose }) {
  const { items, updateQty, removeItem, total, itemCount } = useCart();
  const navigate = useNavigate();

  const fmt = (n) => '₦' + n.toLocaleString();

  return (
    <>
      <div className={`cart-overlay${isOpen ? ' open' : ''}`} onClick={onClose} />
      <div className={`cart-sidebar${isOpen ? ' open' : ''}`}>
        <div className="cart-header">
          <h3>Your Cart ({itemCount})</h3>
          <button className="cart-close" onClick={onClose}>✕</button>
        </div>
        <div className="cart-items">
          {items.length === 0 ? (
            <div className="cart-empty">
              <span className="e-icon" style={{ display: 'block', marginBottom: 12 }}><ShoppingCart size={48} color="var(--text-muted)" /></span>
              <p>Your cart is empty</p>
              <p style={{ fontSize: '0.82rem', marginTop: 6 }}>Add some smoky goodness!</p>
            </div>
          ) : items.map(item => (
            <div key={item.id} className="cart-item">
              <div className="cart-item-emoji" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {item.image ? (
                  <img src={item.image} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', background: 'var(--black3)' }} />
                )}
              </div>
              <div className="cart-item-info">
                <div className="cart-item-name">{item.name}</div>
                <div className="cart-item-price">{fmt(item.price * item.qty)}</div>
                <div className="cart-qty">
                  <button className="qty-btn" onClick={() => updateQty(item.id, item.qty - 1)}>−</button>
                  <span className="qty-num">{item.qty}</span>
                  <button className="qty-btn" onClick={() => updateQty(item.id, item.qty + 1)} disabled={item.qty >= Number(item.stock)} style={item.qty >= Number(item.stock) ? { opacity: 0.3, cursor: 'not-allowed' } : undefined}>+</button>
                </div>
              </div>
              <button className="cart-remove" onClick={() => removeItem(item.id)}><Trash2 size={18} color="var(--text-muted)" /></button>
            </div>
          ))}
        </div>
        {items.length > 0 && (
          <div className="cart-footer">
            <div className="cart-subtotal">
              <span>Subtotal</span>
              <span>{fmt(total)}</span>
            </div>
            {anyItemPastCutoff(items) && (
              <div style={{ fontSize: '0.78rem', color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 10px', marginBottom: 8, fontWeight: 600 }}>
                ⏰ Some items have passed today's cutoff and will be delivered tomorrow.
              </div>
            )}
            <div className="cart-note">Delivery fee calculated at checkout. Order before 10am for same-day delivery.</div>
            <button className="checkout-btn" onClick={() => { onClose(); navigate('/cart'); }}>
              View Cart Details →
            </button>
          </div>
        )}
      </div>
    </>
  );
}
