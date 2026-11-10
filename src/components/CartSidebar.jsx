import React, { useState, useEffect, useMemo } from 'react';
import { useCart } from '../context/CartContext';
import { useNavigate } from 'react-router-dom';
import { ShoppingCart, Trash2, Clock, Gift, AlertTriangle, Calendar, Truck } from 'lucide-react';
import { anyItemPastCutoff } from '../lib/deliveryCutoff';
import { verifyCartItemsAvailability } from '../lib/productAvailability';
import { evaluateCartPreorders, formatReleaseDate } from '../lib/preorderUtils';
import { evaluateDispatchCapacitySurcharge } from '../lib/dispatchPricing';
import PromoProgressBanner from './PromoProgressBanner';

export default function CartSidebar({ isOpen, onClose }) {
  const { items, updateQty, removeItem, total, itemCount, promoRewardItem, syncCartWithDbProducts } = useCart();
  const navigate = useNavigate();

  const [unavailableItems, setUnavailableItems] = useState([]);

  useEffect(() => {
    let cancelled = false;
    if (!isOpen || !items || items.length === 0) {
      setUnavailableItems([]);
      return;
    }
    verifyCartItemsAvailability(items).then(res => {
      if (!cancelled) {
        setUnavailableItems(res.unavailableItems || []);
        if (res.dbProductsMap) syncCartWithDbProducts(res.dbProductsMap);
      }
    });
    return () => { cancelled = true; };
  }, [isOpen, items, syncCartWithDbProducts]);

  const cartPreorders = useMemo(() => evaluateCartPreorders(items), [items]);
  const dispatchSurcharge = useMemo(() => evaluateDispatchCapacitySurcharge(items, 0, 'delivery'), [items]);

  const fmt = (n) => '₦' + Number(n).toLocaleString();

  return (
    <>
      <div className={`cart-overlay${isOpen ? ' open' : ''}`} onClick={onClose} />
      <div className={`cart-sidebar${isOpen ? ' open' : ''}`}>
        <div className="cart-header">
          <h3>Your Cart ({itemCount})</h3>
          <button className="cart-close" onClick={onClose}>✕</button>
        </div>
        {items.length > 0 && (
          <div style={{ padding: '0 16px 12px' }}>
            <PromoProgressBanner variant="compact" />
          </div>
        )}
        {unavailableItems.length > 0 && (
          <div style={{ margin: '0 16px 12px', padding: '10px 12px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.78rem', color: '#b91c1c', fontWeight: 600 }}>
            <AlertTriangle size={15} color="#b91c1c" style={{ flexShrink: 0 }} />
            <span>Some items are out of stock / unavailable.</span>
          </div>
        )}
        <div className="cart-items">

          {items.length === 0 ? (
            <div className="cart-empty">
              <span className="e-icon" style={{ display: 'block', marginBottom: 12 }}><ShoppingCart size={48} color="var(--text-muted)" /></span>
              <p>Your cart is empty</p>
              <p style={{ fontSize: '0.82rem', marginTop: 6 }}>Add some smoky goodness!</p>
            </div>
          ) : (
            <>
              {items.map(item => {
                const isUnavailable = unavailableItems.some(u => String(u.id) === String(item.id));
                return (
                  <div key={item.id} className="cart-item" style={isUnavailable ? { background: '#fff5f5' } : {}}>
                    <div className="cart-item-emoji" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                      {item.image ? (
                        <img src={item.image} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ width: '100%', height: '100%', background: 'var(--black3)' }} />
                      )}
                    </div>
                    <div className="cart-item-info">
                      <div className="cart-item-name" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span>{item.parent_name || item.name}</span>
                        {item.variant_label && (
                          <span style={{ fontSize: '0.66rem', fontWeight: 800, background: 'rgba(192,32,31,0.1)', color: '#c0201f', border: '1px solid rgba(192,32,31,0.2)', padding: '1px 6px', borderRadius: 6 }}>
                            {item.variant_label}
                          </span>
                        )}
                        {Boolean(item.preorder_enabled || item.is_preorder) && (
                          <span style={{ fontSize: '0.62rem', fontWeight: 800, background: '#b45309', color: '#fff', padding: '1px 5px', borderRadius: 4, textTransform: 'uppercase' }}>
                            Pre-Order
                          </span>
                        )}
                      </div>
                      {Boolean(item.preorder_enabled || item.is_preorder) && item.preorder_release_date && (
                        <div style={{ fontSize: '0.7rem', color: '#b45309', fontWeight: 600, marginTop: 2 }}>
                          Available from {formatReleaseDate(item.preorder_release_date)}
                        </div>
                      )}
                      {isUnavailable ? (
                        <span style={{ display: 'inline-block', fontSize: '0.68rem', fontWeight: 800, color: '#b91c1c', background: '#fee2e2', padding: '1px 5px', borderRadius: 4, marginTop: 2 }}>
                          Out of stock / Hidden
                        </span>
                      ) : (
                        <div className="cart-item-price">{fmt(item.price * item.qty)}</div>
                      )}
                      <div className="cart-qty">
                        <button className="qty-btn" onClick={() => updateQty(item.id, item.qty - 1)}>−</button>
                        <span className="qty-num">{item.qty}</span>
                        <button className="qty-btn" onClick={() => updateQty(item.id, item.qty + 1)}>+</button>
                      </div>
                    </div>
                    <button className="cart-remove" onClick={() => removeItem(item.id)}><Trash2 size={18} color="var(--text-muted)" /></button>
                  </div>
                );
              })}

              {promoRewardItem && (
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
                <span>Promo Gift Applied</span>
                <span>FREE (₦0)</span>
              </div>
            )}
            {cartPreorders.hasPreorder && (
              <div style={{ fontSize: '0.76rem', color: '#78350f', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 10px', marginBottom: 8, fontWeight: 600, display: 'flex', alignItems: 'flex-start', gap: 6, lineHeight: 1.4 }}>
                <Calendar size={14} color="#b45309" style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <div><strong>Pre-Order Release:</strong> {cartPreorders.formattedLatestReleaseDate || cartPreorders.latestReleaseDate}</div>
                  {cartPreorders.isMixedCart && (
                    <div style={{ fontSize: '0.72rem', color: '#92400e', marginTop: 2 }}>
                      Mixed cart: all items in this order will be fulfilled together on or after the pre-order release date.
                    </div>
                  )}
                </div>
              </div>
            )}
            {dispatchSurcharge.triggered && (
              <div style={{ fontSize: '0.76rem', color: '#991b1b', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '8px 10px', marginBottom: 8, fontWeight: 600, display: 'flex', alignItems: 'flex-start', gap: 6, lineHeight: 1.4 }}>
                <Truck size={14} color="#b91c1c" style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <strong>Dedicated Dispatch ({dispatchSurcharge.appliedMultiplier}× Delivery Fee):</strong>{' '}
                  {dispatchSurcharge.customerMessage}
                </div>
              </div>
            )}
            {!cartPreorders.hasPreorder && anyItemPastCutoff(items) && (
              <div style={{ fontSize: '0.78rem', color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 10px', marginBottom: 8, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Clock size={14} color="#92400e" style={{ flexShrink: 0 }} /> Some items have passed today's cutoff and will be delivered tomorrow.
              </div>
            )}
            <div className="cart-note">Delivery fee calculated at checkout. Order before 10am for same-day delivery.</div>
            <button className="checkout-btn" onClick={() => { onClose(); navigate('/cart'); }}>
              {unavailableItems.length > 0 ? 'View Cart & Remove Unavailable Items →' : 'View Cart Details →'}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
