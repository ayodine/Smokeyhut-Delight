import React from 'react';
import { Link } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import { useToast } from '../../context/ToastContext';
import { getProducts } from '../../lib/productsCache';
import ProductCard from '../../components/ProductCard';
import PromoProgressBanner from '../../components/PromoProgressBanner';
import { verifyCartItemsAvailability } from '../../lib/productAvailability';
import { evaluateCartPreorders, formatReleaseDate } from '../../lib/preorderUtils';
import { evaluateDispatchCapacitySurcharge } from '../../lib/dispatchPricing';
import { ShoppingCart, Trash2, Plus, Minus, ArrowRight, Utensils, Clock, Gift, AlertTriangle, Calendar, Truck } from 'lucide-react';
import { anyItemPastCutoff } from '../../lib/deliveryCutoff';

const fmt = (n) => '₦' + Number(n).toLocaleString();

export default function Cart() {
  const { items, updateQty, removeItem, total, itemCount, promoRewardItem, syncCartWithDbProducts } = useCart();
  const { showToast } = useToast();

  const [products, setProducts] = React.useState([]);
  const [unavailableItems, setUnavailableItems] = React.useState([]);

  React.useEffect(() => {
    getProducts().then(({ products: p }) => setProducts(p));
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    if (!items || items.length === 0) {
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
  }, [items, syncCartWithDbProducts]);

  const cartPreorders = React.useMemo(() => evaluateCartPreorders(items), [items]);
  const dispatchSurcharge = React.useMemo(() => evaluateDispatchCapacitySurcharge(items, 0, 'delivery'), [items]);

  const handleRemoveUnavailableItems = () => {
    const idsToRemove = new Set(unavailableItems.map(u => String(u.id)));
    items.forEach(i => {
      if (idsToRemove.has(String(i.id))) {
        removeItem(i.id);
      }
    });
    setUnavailableItems([]);
    showToast('Bag updated', 'Unavailable items have been removed.', 'success');
  };

  const cartIds = items.map(i => i.id);
  const upsell = products
    .filter(p => !cartIds.includes(p.id) && !(Array.isArray(p.variants) && p.variants.some(v => cartIds.includes(v.id))))
    .slice(0, 4);
  const VAT = 200;

  /* ── Empty state ── */
  if (items.length === 0) {
    return (
      <div style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f7' }}>
        <div style={{ textAlign: 'center', padding: '0 24px' }}>
          <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
            <ShoppingCart size={36} color="#ccc" />
          </div>
          <h2 style={{ fontWeight: 900, fontSize: '1.4rem', color: '#111', marginBottom: 8 }}>Your bag is empty</h2>
          <p style={{ color: '#888', fontSize: '0.9rem', marginBottom: 28 }}>Add some smoky goodness to get started!</p>
          <Link to="/menu" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#111', color: '#fff', padding: '14px 28px', borderRadius: 12, fontWeight: 800, textDecoration: 'none', fontSize: '0.95rem' }}>
            Browse Menu <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: '#f5f5f7', minHeight: '100vh' }}>

      {/* Breadcrumb */}
      <div style={{ padding: '14px 16px', background: '#fff', borderBottom: '1px solid #e5e5e5' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: '#888' }}>
          <Link to="/" style={{ color: '#888', textDecoration: 'none' }}>Home</Link>
          <span>›</span>
          <Link to="/shop" style={{ color: '#888', textDecoration: 'none' }}>Shop</Link>
          <span>›</span>
          <span style={{ color: '#111', fontWeight: 700 }}>Cart</span>
        </div>
      </div>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '16px 14px 60px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h1 style={{ fontWeight: 900, fontSize: '1.3rem', color: '#111', margin: 0 }}>
            My Bag <span style={{ fontWeight: 500, fontSize: '0.9rem', color: '#888' }}>({itemCount} item{itemCount !== 1 ? 's' : ''})</span>
          </h1>
          <Link to="/menu" style={{ fontSize: '0.8rem', fontWeight: 700, color: '#c0201f', textDecoration: 'none' }}>+ Add more</Link>
        </div>

        {/* Promo Progress / Reward Banner */}
        <div style={{ marginBottom: 14 }}>
          <PromoProgressBanner variant="full" />
        </div>

        {/* Unavailable items alert banner */}
        {unavailableItems.length > 0 && (
          <div style={{
            marginBottom: 16,
            borderRadius: 14,
            border: '1.5px solid #f87171',
            background: '#fef2f2',
            padding: '14px 16px',
            boxShadow: '0 2px 8px rgba(239, 68, 68, 0.08)'
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 10, flex: 1, minWidth: 240 }}>
                <AlertTriangle size={20} color="#b91c1c" style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#991b1b', marginBottom: 4 }}>
                    Some items in your bag are no longer available
                  </div>
                  <div style={{ fontSize: '0.82rem', color: '#b91c1c', lineHeight: 1.4 }}>
                    {unavailableItems.map(u => u.message).join(' · ')}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={handleRemoveUnavailableItems}
                style={{
                  background: '#b91c1c',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  padding: '8px 14px',
                  fontSize: '0.8rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  flexShrink: 0
                }}
              >
                Remove unavailable items
              </button>
            </div>
          </div>
        )}

        {/* Pre-order & Dispatch-Capacity Notices */}
        {cartPreorders.hasPreorder && (
          <div style={{
            marginBottom: 14,
            borderRadius: 14,
            border: '1.5px solid #fde68a',
            background: '#fffbeb',
            padding: '14px 16px',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <Calendar size={19} color="#b45309" style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ fontSize: '0.84rem', color: '#78350f', lineHeight: 1.45 }}>
                <div style={{ fontWeight: 800, marginBottom: 3 }}>
                  Pre-Order Release Date: {cartPreorders.formattedLatestReleaseDate || cartPreorders.latestReleaseDate}
                </div>
                <div>
                  {cartPreorders.effectiveSchedulingMode === 'schedule_at_checkout'
                    ? `Choose your delivery date at checkout (from ${cartPreorders.formattedLatestReleaseDate || cartPreorders.latestReleaseDate} onwards).`
                    : `Pre-order now to reserve your pack. You can pick a delivery date at checkout or confirm it once released.`}
                </div>
                {cartPreorders.isMixedCart && (
                  <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px dashed #fcd34d', fontWeight: 700, color: '#92400e' }}>
                    Mixed Cart Notice: Regular menu items in this bag will be fulfilled together with your pre-ordered item(s) on or after {cartPreorders.formattedLatestReleaseDate || cartPreorders.latestReleaseDate}.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {dispatchSurcharge.triggered && (
          <div style={{
            marginBottom: 14,
            borderRadius: 14,
            border: '1.5px solid #fca5a5',
            background: '#fef2f2',
            padding: '14px 16px',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <Truck size={19} color="#b91c1c" style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ fontSize: '0.84rem', color: '#991b1b', lineHeight: 1.45 }}>
                <div style={{ fontWeight: 800, marginBottom: 3 }}>
                  Dedicated Dispatch Required ({dispatchSurcharge.appliedMultiplier}× Delivery Fee)
                </div>
                <div>{dispatchSurcharge.customerMessage}</div>
              </div>
            </div>
          </div>
        )}

        {/* Cart Items Card */}
        <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: 14 }}>
          {!cartPreorders.hasPreorder && anyItemPastCutoff(items) && (
            <div style={{ fontSize: '0.82rem', color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 14px', margin: '0 16px 12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Clock size={15} color="#92400e" style={{ flexShrink: 0 }} /> Some items have passed today's cutoff and will be delivered tomorrow.
            </div>
          )}
          {items.map((item, idx) => {
            const hasImage = item.image && item.image.startsWith('http');
            const isUnavailable = unavailableItems.some(u => String(u.id) === String(item.id));
            return (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px', borderBottom: (idx < items.length - 1 || promoRewardItem) ? '1px solid #f5f5f5' : 'none', background: isUnavailable ? '#fff5f5' : 'transparent' }}>
                {/* Thumbnail + qty badge */}
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <div style={{ width: 64, height: 64, borderRadius: 12, overflow: 'hidden', background: '#f5f5f7', border: isUnavailable ? '1px solid #fca5a5' : '1px solid #e5e5e5' }}>
                    {hasImage
                      ? <img src={item.image} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Utensils size={20} color="#ccc" /></div>
                    }
                  </div>
                  <span style={{ position: 'absolute', top: -6, right: -6, background: '#c0201f', color: '#fff', borderRadius: '50%', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 900 }}>
                    {item.qty}
                  </span>
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: isUnavailable ? '#991b1b' : '#111', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.parent_name || item.name}
                    </div>
                    {item.variant_label && (
                      <span style={{ background: 'rgba(192,32,31,0.08)', color: '#c0201f', border: '1px solid rgba(192,32,31,0.2)', fontSize: '0.68rem', fontWeight: 800, padding: '2px 7px', borderRadius: 6 }}>
                        {item.variant_label}
                      </span>
                    )}
                    {Boolean(item.preorder_enabled || item.is_preorder) && (
                      <span style={{ background: '#b45309', color: '#fff', fontSize: '0.64rem', fontWeight: 800, padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase' }}>
                        Pre-Order
                      </span>
                    )}
                  </div>
                  {Boolean(item.preorder_enabled || item.is_preorder) && item.preorder_release_date && (
                    <div style={{ fontSize: '0.74rem', color: '#b45309', fontWeight: 700, marginTop: 2 }}>
                      Available from {formatReleaseDate(item.preorder_release_date)}
                    </div>
                  )}
                  {isUnavailable ? (
                    <div style={{ display: 'inline-block', background: '#fee2e2', color: '#b91c1c', fontSize: '0.72rem', fontWeight: 800, padding: '2px 6px', borderRadius: 4, marginTop: 2 }}>
                      No longer available (Out of stock)
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.78rem', color: '#888', marginTop: 2 }}>{fmt(item.price)} each</div>
                  )}
                </div>

                {/* Right side: total + stepper */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#111' }}>{fmt(item.price * item.qty)}</div>
                  <div style={{ display: 'flex', alignItems: 'center', background: '#f5f5f7', borderRadius: 8, border: '1px solid #e5e5e5', overflow: 'hidden' }}>
                    <button
                      onClick={() => {
                        if (item.qty === 1) { removeItem(item.id); showToast('Removed', `${item.name} removed`, 'info'); }
                        else updateQty(item.id, item.qty - 1);
                      }}
                      style={{ width: 30, height: 30, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: item.qty === 1 ? '#ef4444' : '#555' }}
                    >
                      {item.qty === 1 ? <Trash2 size={13} /> : <Minus size={13} />}
                    </button>
                    <span style={{ fontWeight: 800, fontSize: '0.82rem', minWidth: 22, textAlign: 'center', color: '#111' }}>{item.qty}</span>
                    <button onClick={() => updateQty(item.id, item.qty + 1)} style={{ width: 30, height: 30, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555' }}>
                      <Plus size={13} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Render Unlocked Free Promo Reward Item */}
          {promoRewardItem && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px', background: 'rgba(34, 197, 94, 0.05)', borderTop: '1px dashed rgba(34, 197, 94, 0.3)' }}>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <div style={{ width: 64, height: 64, borderRadius: 12, overflow: 'hidden', background: '#dcfce7', border: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Gift size={28} color="#16a34a" />
                </div>
                <span style={{ position: 'absolute', top: -6, right: -6, background: '#16a34a', color: '#fff', borderRadius: '50%', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 900 }}>
                  {promoRewardItem.qty}
                </span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 800, fontSize: '0.9rem', color: '#15803d' }}>{promoRewardItem.name}</span>
                  <span style={{ background: '#16a34a', color: '#fff', fontSize: '0.65rem', fontWeight: 900, padding: '2px 6px', borderRadius: 4 }}>FREE PROMO GIFT</span>
                </div>
                <div style={{ fontSize: '0.78rem', color: '#166534', marginTop: 2 }}>Daily promotion reward (₦0)</div>
              </div>
              <div style={{ fontWeight: 900, fontSize: '0.95rem', color: '#16a34a', flexShrink: 0 }}>
                ₦0
              </div>
            </div>
          )}
        </div>

        {/* Order Summary Card */}
        <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: 14 }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #f0f0f0' }}>
            <span style={{ fontWeight: 800, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.07em', color: '#888' }}>Order Summary</span>
          </div>
          <div style={{ padding: '14px 16px' }}>
            {items.map(item => (
              <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: '0.85rem' }}>
                <span style={{ color: '#555' }}>{item.name} × {item.qty}</span>
                <span style={{ fontWeight: 600, color: '#111' }}>{fmt(item.price * item.qty)}</span>
              </div>
            ))}
            {promoRewardItem && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: '0.85rem', color: '#16a34a', fontWeight: 700 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Gift size={13} color="#16a34a" /> {promoRewardItem.name} × {promoRewardItem.qty}
                </span>
                <span>FREE (₦0)</span>
              </div>
            )}
            <div style={{ height: 1, background: '#f0f0f0', margin: '12px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: '0.85rem' }}>
              <span style={{ color: '#888' }}>Subtotal</span>
              <span style={{ fontWeight: 700, color: '#111' }}>{fmt(total)}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: '0.85rem' }}>
              <span style={{ color: '#888' }}>VAT</span>
              <span style={{ fontWeight: 700, color: '#111' }}>{fmt(VAT)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: '0.82rem' }}>
              <span style={{ color: '#888' }}>Delivery fee</span>
              <span style={{ color: dispatchSurcharge.triggered ? '#b91c1c' : '#888', fontWeight: dispatchSurcharge.triggered ? 700 : 400 }}>
                {dispatchSurcharge.triggered
                  ? `${dispatchSurcharge.appliedMultiplier}× Zone Fee at checkout (Dedicated Dispatch)`
                  : 'Calculated at checkout'}
              </span>
            </div>
            <div style={{ height: 1, background: '#f0f0f0', margin: '12px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 900, fontSize: '1rem', color: '#111' }}>Estimated total</span>
              <span style={{ fontWeight: 900, fontSize: '1.1rem', color: '#111' }}>{fmt(total + VAT)}</span>
            </div>
          </div>
          <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {unavailableItems.length > 0 ? (
              <button
                disabled
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  background: 'rgba(192,32,31,0.45)', color: '#fff', padding: '16px', borderRadius: 12,
                  fontWeight: 900, border: 'none', fontSize: '0.95rem', cursor: 'not-allowed'
                }}
              >
                Remove unavailable items to checkout
              </button>
            ) : (
              <Link to="/checkout" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#c0201f', color: '#fff', padding: '16px', borderRadius: 12, fontWeight: 900, textDecoration: 'none', fontSize: '1rem', letterSpacing: '-0.01em' }}>
                Proceed to Checkout <ArrowRight size={18} />
              </Link>
            )}
            <Link to="/menu" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', color: '#c0201f', fontWeight: 700, textDecoration: 'none', padding: '10px' }}>
              ← Continue Shopping
            </Link>
          </div>
        </div>

        {/* Upsell */}
        {upsell.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <div style={{ fontWeight: 800, fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#888', marginBottom: 12 }}>You May Also Like</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
              {upsell.map(p => <ProductCard key={p.parent_id || p.id} product={{ ...p, desc: p.short_desc, category: p.category_id }} variant="shopify" />)}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
