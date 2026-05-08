import { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import ProductCard from '../../components/ProductCard';
import { getProducts } from '../../lib/productsCache';
import { useCart } from '../../context/CartContext';
import { useToast } from '../../context/ToastContext';
import { useSettings } from '../../context/SettingsContext';
import { publicSupabase } from '../../lib/supabase';
import { fetchDeliveryZones, matchDeliveryZone } from '../../lib/deliveryMatcher';
import {
  ShoppingCart, X, Truck, Store as StoreIcon, Loader2, MapPin,
  MessageCircle, Banknote, Plus, Minus, Trash2, Tag, Copy, CheckCircle,
} from 'lucide-react';

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const WA_NUMBER         = '2348141748281';
const VAT               = 100;
const fmt = (n) => '₦' + Number(n).toLocaleString();

async function notify(type, order) {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/notify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ type, order }),
    });
  } catch { /* silent */ }
}

export default function MenuPage() {
  const { items, addItem, removeItem, updateQty, clearCart, total, itemCount } = useCart();
  const { showToast } = useToast();
  const { settings } = useSettings();

  // Product grid state
  const [products, setProducts]     = useState([]);
  const [categories, setCategories] = useState([{ id: 'all', label: 'All Items' }]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [activeFilter, setActiveFilter] = useState('all');
  const [search, setSearch]         = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Drawer state
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [successData, setSuccessData]   = useState(null); // { orderId, method }

  // Delivery
  const [deliveryType, setDeliveryType] = useState('delivery');
  const [zones, setZones]               = useState([]);
  const [locationQuery, setLocationQuery] = useState('');
  const [suggestions, setSuggestions]   = useState([]);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [stores, setStores]             = useState([]);
  const [selectedStoreId, setSelectedStoreId] = useState(null);
  const locationInputRef                = useRef(null);

  // Customer form
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', email: '', address: '', city: 'Lagos', notes: '' });
  const [touched, setTouched] = useState({ firstName: false, lastName: false, phone: false, email: false, address: false, city: false });
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  // Coupon
  const [couponCode, setCouponCode]       = useState('');
  const [couponLoading, setCouponLoading] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponError, setCouponError]     = useState('');

  // Submission
  const [processing, setProcessing]       = useState(false);
  const [waProcessing, setWaProcessing]   = useState(false);

  const applyCoupon = async () => {
    const code = couponCode.trim().toUpperCase();
    if (!code) return;
    setCouponError('');
    setCouponLoading(true);
    const { data, error } = await publicSupabase
      .from('coupons')
      .select('id,code,type,value,expires_at,max_uses,uses,min_order_amount')
      .eq('code', code)
      .eq('is_active', true)
      .maybeSingle();
    setCouponLoading(false);
    if (error || !data) { setCouponError('Invalid or expired coupon code'); return; }
    if (data.expires_at && new Date(data.expires_at) < new Date()) { setCouponError('This coupon has expired'); return; }
    if (data.max_uses !== null && data.uses >= data.max_uses) { setCouponError('This coupon has reached its usage limit'); return; }
    if (data.min_order_amount && total < data.min_order_amount) {
      setCouponError(`Minimum order of ${fmt(data.min_order_amount)} required`); return;
    }
    const isPickup = deliveryType === 'pickup';
    const deliveryFeeAtApply = isPickup ? 0 : (selectedMatch?.zone?.price ?? 0);
    const discount = data.type === 'percent'
      ? Math.round((total + deliveryFeeAtApply) * (data.value / 100))
      : data.value;
    setAppliedCoupon({ id: data.id, code: data.code, type: data.type, value: data.value, discount: Math.min(discount, total + deliveryFeeAtApply) });
  };

  const removeCoupon = () => { setAppliedCoupon(null); setCouponCode(''); setCouponError(''); };

  const incrementCouponUse = async () => {
    if (!appliedCoupon?.id) return;
    await publicSupabase.rpc('increment_coupon_uses', { coupon_id: appliedCoupon.id });
  };

  useEffect(() => {
    getProducts().then(({ products: p, categories: c }) => {
      setProducts(p);
      setCategories([{ id: 'all', label: 'All Items' }, ...c]);
      setLoadingProducts(false);
    });
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    fetchDeliveryZones(publicSupabase).then(setZones);
    publicSupabase
      .from('stores')
      .select('id, name, address')
      .eq('is_active', true)
      .order('id')
      .then(({ data }) => {
        if (data?.length) { setStores(data); setSelectedStoreId(data[0].id); }
      });
  }, []);

  useEffect(() => {
    if (locationQuery.trim().length >= 2) {
      setSuggestions(matchDeliveryZone(locationQuery, zones));
      setShowSuggestions(true);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }, [locationQuery, zones]);

  const filtered = useMemo(() => {
    const q = debouncedSearch.toLowerCase();
    return products.filter(p => {
      const matchCat    = activeFilter === 'all' || p.category_id === activeFilter;
      const matchSearch = !q || p.name?.toLowerCase().includes(q) || p.short_desc?.toLowerCase().includes(q);
      return matchCat && matchSearch;
    });
  }, [products, debouncedSearch, activeFilter]);

  return (
    <>
      <Navbar onCartOpen={() => setCheckoutOpen(true)} />

      {/* Breadcrumb */}
      <div className="breadcrumb container">
        <a href="/">Home</a>
        <span style={{ margin: '0 8px', color: 'var(--gray-light)' }}>›</span>
        Menu
      </div>

      {/* Product grid */}
      <section className="products-section" style={{ paddingTop: 30 }}>
        <div className="container">
          <div className="section-header">
            <div className="section-tag">Full Menu</div>
            <h2 className="section-title">The Smokeyhut <span>Menu</span></h2>
            <p className="section-sub">Every item freshly prepared. Order before 10am for same-day delivery.</p>
          </div>

          <div style={{ marginBottom: 30 }}>
            <input
              type="text"
              className="product-search"
              placeholder="Search menu..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%', maxWidth: 400, display: 'block', marginBottom: 16,
                background: 'var(--card-bg)', border: '1px solid var(--border-subtle)',
                borderRadius: 8, padding: '12px 18px', fontSize: '0.9rem', outline: 'none',
                fontFamily: "'Nunito', sans-serif", boxShadow: 'var(--shadow)', color: 'var(--text)',
              }}
            />
            <div className="product-filters">
              {categories.map(c => (
                <button
                  key={c.id}
                  className={`filter-btn${activeFilter === c.id ? ' active' : ''}`}
                  onClick={() => setActiveFilter(c.id)}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div className="products-grid">
            {loadingProducts
              ? Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} style={{ background: 'var(--card-bg)', borderRadius: 16, height: 320, animation: 'pulse 1.5s ease-in-out infinite', opacity: 0.6 }} />
                ))
              : filtered.map(p => <ProductCard key={p.id} product={p} />)
            }
            {!loadingProducts && filtered.length === 0 && (
              <p style={{ color: 'var(--text-muted)', gridColumn: '1/-1' }}>No items found.</p>
            )}
          </div>
        </div>
      </section>

      {/* WhatsApp bubble */}
      <a href={`https://wa.me/${WA_NUMBER}`} target="_blank" rel="noopener noreferrer" className="wa-bubble" aria-label="Chat with us on WhatsApp">
        <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28" aria-hidden="true">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
          <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.117 1.523 5.847L.057 23.617a.5.5 0 0 0 .612.612l5.808-1.456A11.945 11.945 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.9 0-3.68-.498-5.22-1.37l-.374-.214-3.878.972.99-3.808-.234-.388A9.956 9.956 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
        </svg>
      </a>

      <Footer />

      {/* Checkout drawer overlay */}
      {checkoutOpen && (
        <div className="cart-overlay open" onClick={() => setCheckoutOpen(false)} />
      )}

      {/* Checkout drawer panel */}
      <div
        className="dash-drawer"
        style={{
          transform: checkoutOpen ? 'translateX(0)' : 'translateX(100%)',
          width: 'min(480px, 100vw)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div className="dash-drawer-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ShoppingCart size={18} color="var(--red)" />
            <span style={{ fontWeight: 800, fontSize: '1rem' }}>Your Order ({itemCount})</span>
          </div>
          <button className="dash-drawer-close" onClick={() => setCheckoutOpen(false)}><X size={16} /></button>
        </div>

        {/* Scrollable content */}
        <div className="dash-drawer-content" style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>

          {/* ── Cart items ── */}
          {items.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
              <ShoppingCart size={48} style={{ marginBottom: 12, opacity: 0.4 }} />
              <p style={{ fontWeight: 600 }}>Your cart is empty</p>
              <p style={{ fontSize: '0.82rem', marginTop: 4 }}>Add items from the menu above</p>
            </div>
          ) : (
            <div style={{ marginBottom: 20 }}>
              {items.map(item => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                  {/* Thumbnail */}
                  <div style={{ width: 52, height: 52, borderRadius: 10, overflow: 'hidden', flexShrink: 0, background: 'var(--black2)' }}>
                    {item.image
                      ? <img src={item.image} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <div style={{ width: '100%', height: '100%' }} />
                    }
                  </div>
                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.88rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
                    <div style={{ color: 'var(--red)', fontWeight: 700, fontSize: '0.85rem', marginTop: 2 }}>{fmt(item.price * item.qty)}</div>
                    {/* Qty controls */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                      <button onClick={() => updateQty(item.id, item.qty - 1)} style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--black2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Minus size={12} /></button>
                      <span style={{ fontWeight: 700, fontSize: '0.88rem', minWidth: 18, textAlign: 'center' }}>{item.qty}</span>
                      <button onClick={() => updateQty(item.id, item.qty + 1)} style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--black2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plus size={12} /></button>
                    </div>
                  </div>
                  <button onClick={() => removeItem(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, flexShrink: 0 }}><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
          )}

          {items.length > 0 && (
            <>
              {/* ── Delivery method ── */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontWeight: 800, fontSize: '0.82rem', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Delivery Method</div>
                <div style={{ display: 'flex', gap: 10 }}>
                  {[['delivery', 'Delivery', Truck], ['pickup', 'Store Pickup', StoreIcon]].map(([val, label, Icon]) => (
                    <button
                      key={val}
                      onClick={() => {
                        setDeliveryType(val);
                        if (val === 'pickup') { setSelectedMatch(null); setLocationQuery(''); }
                      }}
                      style={{
                        flex: 1, padding: '10px 12px', borderRadius: 10,
                        border: `2px solid ${deliveryType === val ? 'var(--red)' : 'var(--border-subtle)'}`,
                        background: deliveryType === val ? 'rgba(192,32,31,0.08)' : 'var(--black2)',
                        color: deliveryType === val ? 'var(--red)' : 'var(--text-muted)',
                        fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      }}
                    >
                      <Icon size={15} /> {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Location / store selector ── */}
              {deliveryType === 'delivery' ? (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontWeight: 800, fontSize: '0.82rem', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Delivery Location</div>
                  <div style={{ position: 'relative' }}>
                    <MapPin size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                    <input
                      ref={locationInputRef}
                      value={locationQuery}
                      onChange={e => { setLocationQuery(e.target.value); setSelectedMatch(null); }}
                      onFocus={() => locationQuery.trim().length >= 2 && setShowSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                      placeholder="Type your area (e.g. Ikeja)"
                      style={{ width: '100%', padding: '10px 12px 10px 34px', borderRadius: 8, border: `1px solid ${selectedMatch ? 'var(--red)' : 'var(--border-subtle)'}`, background: 'var(--black2)', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }}
                    />
                    {showSuggestions && suggestions.length > 0 && (
                      <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: 'var(--white)', border: '1px solid var(--border-subtle)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.1)', zIndex: 100, maxHeight: 220, overflowY: 'auto' }}>
                        {suggestions.map((m, i) => (
                          <div
                            key={i}
                            onMouseDown={() => { setSelectedMatch(m); setLocationQuery(m.area ? m.area.name : m.zone.name); setShowSuggestions(false); }}
                            style={{ padding: '10px 14px', cursor: 'pointer', fontSize: '0.85rem', borderBottom: '1px solid var(--border-subtle)' }}
                          >
                            <span style={{ fontWeight: 700 }}>{m.area ? m.area.name : m.zone.name}</span>
                            {m.zone && <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>— {fmt(m.zone.price)}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="form-group" style={{ marginTop: 10 }}>
                    <input value={form.address} onChange={set('address')} placeholder="Street address" style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--black2)', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <div className="form-group" style={{ marginTop: 8 }}>
                    <input value={form.city} onChange={set('city')} placeholder="City" style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--black2)', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                </div>
              ) : (
                stores.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontWeight: 800, fontSize: '0.82rem', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Pickup Store</div>
                    {stores.map(s => (
                      <button
                        key={s.id}
                        onClick={() => setSelectedStoreId(s.id)}
                        style={{
                          width: '100%', textAlign: 'left', padding: '12px 14px', borderRadius: 10, marginBottom: 8,
                          border: `2px solid ${selectedStoreId === s.id ? 'var(--red)' : 'var(--border-subtle)'}`,
                          background: selectedStoreId === s.id ? 'rgba(192,32,31,0.06)' : 'var(--black2)',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>{s.name}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>{s.address}</div>
                      </button>
                    ))}
                  </div>
                )
              )}

              {/* ── Customer details ── */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontWeight: 800, fontSize: '0.82rem', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Your Details</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                  <input value={form.firstName} onChange={set('firstName')} onBlur={() => setTouched(t => ({ ...t, firstName: true }))} placeholder="First name *" style={{ padding: '10px 12px', borderRadius: 8, border: `1px solid ${touched.firstName && !form.firstName.trim() ? '#ef4444' : 'var(--border-subtle)'}`, background: 'var(--black2)', fontSize: '0.85rem', outline: 'none' }} />
                  <input value={form.lastName} onChange={set('lastName')} onBlur={() => setTouched(t => ({ ...t, lastName: true }))} placeholder="Last name *" style={{ padding: '10px 12px', borderRadius: 8, border: `1px solid ${touched.lastName && !form.lastName.trim() ? '#ef4444' : 'var(--border-subtle)'}`, background: 'var(--black2)', fontSize: '0.85rem', outline: 'none' }} />
                </div>
                <input value={form.phone} onChange={set('phone')} onBlur={() => setTouched(t => ({ ...t, phone: true }))} placeholder="Phone number *" style={{ width: '100%', padding: '10px 12px', marginBottom: 8, borderRadius: 8, border: `1px solid ${touched.phone && !form.phone.trim() ? '#ef4444' : 'var(--border-subtle)'}`, background: 'var(--black2)', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }} />
                <input type="email" value={form.email} onChange={set('email')} onBlur={() => setTouched(t => ({ ...t, email: true }))} placeholder="Email address *" style={{ width: '100%', padding: '10px 12px', marginBottom: 8, borderRadius: 8, border: `1px solid ${touched.email && !form.email.trim() ? '#ef4444' : 'var(--border-subtle)'}`, background: 'var(--black2)', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }} />
                <textarea value={form.notes} onChange={set('notes')} placeholder="Notes (optional)" rows={2} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--black2)', fontSize: '0.85rem', outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }} />
              </div>

              {/* ── Coupon code ── */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontWeight: 800, fontSize: '0.82rem', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Coupon Code</div>
                {appliedCoupon ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Tag size={14} color="#22c55e" />
                      <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#22c55e' }}>{appliedCoupon.code}</span>
                      <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>−{fmt(appliedCoupon.discount)}</span>
                    </div>
                    <button onClick={removeCoupon} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, display: 'flex' }}><X size={14} /></button>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        value={couponCode}
                        onChange={e => { setCouponCode(e.target.value.toUpperCase()); setCouponError(''); }}
                        onKeyDown={e => e.key === 'Enter' && applyCoupon()}
                        placeholder="Enter coupon code"
                        style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: `1px solid ${couponError ? '#ef4444' : 'var(--border-subtle)'}`, background: 'var(--black2)', fontSize: '0.85rem', outline: 'none' }}
                      />
                      <button onClick={applyCoupon} disabled={couponLoading || !couponCode.trim()} style={{ padding: '10px 16px', borderRadius: 8, background: 'var(--red)', color: '#fff', border: 'none', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', flexShrink: 0, opacity: couponLoading || !couponCode.trim() ? 0.6 : 1 }}>
                        {couponLoading ? <Loader2 size={14} className="spin" /> : 'Apply'}
                      </button>
                    </div>
                    {couponError && <div style={{ color: '#ef4444', fontSize: '0.78rem', marginTop: 4 }}>{couponError}</div>}
                  </>
                )}
              </div>
            </>
          )}

        </div>
      </div>
    </>
  );
}
