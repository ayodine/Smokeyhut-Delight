import React from 'react';
import { useCart } from '../context/CartContext';
import { useNavigate } from 'react-router-dom';
import { ShoppingCart, Trash2, Clock, Gift, Truck } from 'lucide-react';
import { anyItemPastCutoff } from '../lib/deliveryCutoff';
import PromoProgressBanner from './PromoProgressBanner';

export default function CartSidebar({ isOpen, onClose }) {
  const { items, updateQty, removeItem, total, itemCount, promoRewardItem } = useCart();
  const navigate = useNavigate();

  const fmt = (n) => '₦' + Number(n).toLocaleString();

  return (
    <>
      <div className={`cart-overlay${isOpen ? ' open' : ''}`} onClick={onClose} />
      <div className={`cart-sidebar${isOpen ? ' open' : ''}`}>
        <div className="cart-header">
          <h3>Your Cart ({itemCount})</h3>
          <button className="cart-close" onClick={onClose}>✕</button>
        </div>
        <div className="cart-items">
          <PromoProgressBanner variant="compact" style={{ margin: '8px 12px 14px' }} />

          {items.length === 0 ? (
            <div className="cart-empty">
              <span className="e-icon" style={{ display: 'block', marginBottom: 12 }}><ShoppingCart size={48} color="var(--text-muted)" /></span>
              <p>Your cart is empty</p>
              <p style={{ fontSize: '0.82rem', marginTop: 6 }}>Add some smoky goodness!</p>
            </div>
          ) : (
            <>
              {items.map(item => (
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
                      <button className="qty-btn" onClick={() => updateQty(item.id, item.qty + 1)}>+</button>
                    </div>
                  </div>
                  <button className="cart-remove" onClick={() => removeItem(item.id)}><Trash2 size={18} color="var(--text-muted)" /></button>
                </div>
              ))}

              {promoRewardItem && (
                promoRewardItem.is_free_delivery ? (
                  <div className="cart-item" style={{ background: '#f0fdf4', borderRadius: 10, border: '1px dashed #22c55e', padding: '10px 12px', marginTop: 8 }}>
                    <div className="cart-item-emoji" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#16a34a', color: '#fff', borderRadius: 8, width: 44, height: 44, flexShrink: 0 }}>
                      <Truck size={22} />
                    </div>
                    <div className="cart-item-info" style={{ flex: 1 }}>
                      <div className="cart-item-name" style={{ color: '#15803d', fontWeight: 800, fontSize: '0.88rem' }}>Free Delivery</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        <span style={{ fontSize: '0.68rem', fontWeight: 900, background: '#16a34a', color: '#fff', padding: '1px 6px', borderRadius: 4 }}>FREE SHIPPING</span>
                        <span className="cart-item-price" style={{ color: '#15803d', fontWeight: 800 }}>₦0</span>
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#166534', marginTop: 2 }}>Applied automatically at checkout</div>
                    </div>
                  </div>
                ) : (
                  <div className="cart-item" style={{ background: 'rgba(34, 197, 94, 0.08)', borderRadius: 10, border: '1px dashed #22c55e', padding: '10px 12px', marginTop: 8 }}>
                    <div className="cart-item-emoji" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#16a34a', color: '#fff', borderRadius: 8, width: 44, height: 44, flexShrink: 0 }}>
                      <Gift size={22} />
                    </div>
                    <div className="cart-item-info" style={{ flex: 1 }}>
                      <div className="cart-item-name" style={{ color: '#15803d', fontWeight: 800, fontSize: '0.88rem' }}>{promoRewardItem.name}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        <span style={{ fontSize: '0.68rem', fontWeight: 900, background: '#16a34a', color: '#fff', padding: '1px 6px', borderRadius: 4 }}>FREE PROMO REWARD</span>
                        <span className="cart-item-price" style={{ color: '#15803d', fontWeight: 800 }}>₦0</span>
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#166534', marginTop: 2 }}>Qty: {promoRewardItem.qty}</div>
                    </div>
                  </div>
                )
              )}
            </>
          )}
        </div>
        {items.length > 0 && (
          <div className="cart-footer">
            <div className="cart-subtotal">
              <span>Subtotal</span>
              <span>{fmt(total)}</span>
            </div>
            {promoRewardItem && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: '#15803d', fontWeight: 700, margin: '4px 0 8px' }}>
                <span>{promoRewardItem.is_free_delivery ? '🚚 Free Delivery Promo' : 'Promo Gift Applied'}</span>
                <span>FREE (₦0)</span>
              </div>
            )}
            {anyItemPastCutoff(items) && (
              <div style={{ fontSize: '0.78rem', color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 10px', marginBottom: 8, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Clock size={14} color="#92400e" style={{ flexShrink: 0 }} /> Some items have passed today's cutoff and will be delivered tomorrow.
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
