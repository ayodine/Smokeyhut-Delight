import { useState, useEffect, useMemo, useRef } from 'react';
import OrderingGuidePopup from '../../components/OrderingGuidePopup';
import ProductCard from '../../components/ProductCard';
import { getProducts } from '../../lib/productsCache';
import { useCart } from '../../context/CartContext';
import { useToast } from '../../context/ToastContext';
import { useSettings } from '../../context/SettingsContext';
import { publicSupabase, customerSupabase } from '../../lib/supabase';
import { useCustomerAuth } from '../../context/CustomerAuthContext';
import { profileToPrefill } from '../../lib/customerProfile';
import { fetchDeliveryZones, matchDeliveryZone } from '../../lib/deliveryMatcher';
import { fetchDeliveryPromo, getPromoDeliveryFee } from '../../lib/deliveryPromo';
import {
  ShoppingCart, X, Truck, Store as StoreIcon, Loader2, MapPin,
  MessageCircle, Banknote, Plus, Minus, Trash2, Tag, Copy, CheckCircle,
  Utensils, PackageSearch, Send,
} from 'lucide-react';

const SUPABASE_URL        = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY   = import.meta.env.VITE_SUPABASE_ANON_KEY;
const WA_NUMBER           = '2348141748281';
const VAT                 = 200;
const fmt = (n) => '₦' + Number(n).toLocaleString();

// Kill-switch for manual bank transfer. Set to true to re-enable if Paystack is down.
const MANUAL_TRANSFER_ENABLED = false;

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
  const { items, removeItem, updateQty, clearCart, total, itemCount } = useCart();
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
  const [checkoutOpen, setCheckoutOpen]   = useState(false);
  const [successData, setSuccessData]     = useState(null); // { orderId, method }
  const [trackingOpen, setTrackingOpen]   = useState(false);

  // Delivery
  const [deliveryType, setDeliveryType] = useState('delivery');
  const [zones, setZones]               = useState([]);
  const [deliveryPromo, setDeliveryPromo] = useState(null);
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

  // Signed-in customers write orders through the auth client (JWT reaches the
  // RPC → user_id stamped); guests keep the anon client. Prefill from Google.
  const { user } = useCustomerAuth();
  const orderClient = user ? customerSupabase : publicSupabase;
  useEffect(() => {
    if (!user) return;
    const pre = profileToPrefill(user);
    setForm(f => ({
      ...f,
      firstName: f.firstName || pre.firstName,
      lastName: f.lastName || pre.lastName,
      email: f.email || pre.email,
    }));
  }, [user]);

  // Coupon
  const [couponCode, setCouponCode]       = useState('');
  const [couponLoading, setCouponLoading] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponError, setCouponError]     = useState('');

  // Submission
  const [processing, setProcessing]         = useState(false);
  const [transferName, setTransferName]     = useState('');
  const [transferNameTouched, setTransferNameTouched] = useState(false);
  const [transferConfirmed, setTransferConfirmed]     = useState(false);
  // Paystack is always the active payment method while MANUAL_TRANSFER_ENABLED is false.
  // The DEV-only escape hatch lets you test locally without enabling on live site.
  const paystackEnabled = !!settings?.paystack?.enabled
    || (import.meta.env.DEV && typeof localStorage !== 'undefined' && localStorage.getItem('force_paystack') === '1');
  // When manual transfer is disabled, always use paystack regardless of UI state.
  const [payMethod, setPayMethod] = useState('paystack'); // 'paystack' | 'transfer'
  const activeMethod = (MANUAL_TRANSFER_ENABLED && paystackEnabled) ? payMethod : 'paystack';

  // Disclaimer state
  const [disclaimerAgreed, setDisclaimerAgreed] = useState(false);
  const [showDisclaimerModal, setShowDisclaimerModal] = useState(false);

  useEffect(() => {
    if (checkoutOpen && deliveryType === 'delivery' && !disclaimerAgreed) {
      setShowDisclaimerModal(true);
    }
  }, [checkoutOpen, deliveryType, disclaimerAgreed]);

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
    const promoFeeAtApply = !isPickup && selectedMatch
      ? getPromoDeliveryFee(deliveryPromo, items, selectedMatch.area?.name || '', selectedMatch.zone?.price)
      : null;
    const deliveryFeeAtApply = isPickup ? 0 : (promoFeeAtApply ?? selectedMatch?.zone?.price ?? 0);
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
      if (typeof window !== 'undefined' && window.fbq) {
        window.fbq('track', 'ViewContent', {
          content_type: 'product_group',
          content_name: 'Menu Catalog'
        });
      }
    });
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    fetchDeliveryZones(publicSupabase).then(setZones);
    fetchDeliveryPromo(publicSupabase).then(setDeliveryPromo);
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

  const isPickup        = deliveryType === 'pickup';
  const allFreeShipping = items.length > 0 && items.every(i => i.free_shipping === true);
  const promoFee        = !isPickup && selectedMatch
    ? getPromoDeliveryFee(deliveryPromo, items, selectedMatch.area?.name || '', selectedMatch.zone?.price)
    : null;
  const promoApplied    = promoFee !== null && !allFreeShipping;
  const deliveryFee     = isPickup ? 0 : (allFreeShipping ? 0 : (promoApplied ? promoFee : (selectedMatch?.zone?.price ?? 0)));
  const couponDiscount  = appliedCoupon?.discount ?? 0;
  const amountToPayNow  = Math.max(0, total - couponDiscount) + VAT;
  const grandTotal      = Math.max(0, total + deliveryFee - couponDiscount) + VAT;

  const buildOrderPayload = (method) => {
    const customerName  = `${form.firstName} ${form.lastName}`.trim();
    const pickupStore   = stores.find(s => s.id === selectedStoreId);
    const deliveryAddress = isPickup
      ? `Store Pickup — ${pickupStore?.name || 'Store'}`
      : `${form.address}, ${selectedMatch?.area?.name || selectedMatch?.zone?.name || form.city}`;
    const deliveryZoneName = isPickup ? 'Store Pickup' : (selectedMatch?.area?.name || selectedMatch?.zone?.name || '');
    return {
      customer_name:    customerName,
      customer_email:   form.email || null,
      customer_phone:   form.phone,
      delivery_address: deliveryAddress,
      delivery_zone:    deliveryZoneName || null,
      store_id:         selectedStoreId,
      payment_method:   method,
      total:            amountToPayNow,
      delivery_fee:     deliveryFee,
      coupon_code:      appliedCoupon?.code || null,
      coupon_discount:  couponDiscount,
      status:           'pending',
      notes:            (promoApplied ? '[via WhatsApp Menu] [Delivery Promo]' : '[via WhatsApp Menu]') + (form.notes ? '\n' + form.notes : ''),
    };
  };

  const validateForm = () => {
    setTouched({ firstName: true, lastName: true, phone: true, email: true, address: true, city: true });
    if (!form.firstName.trim() || !form.lastName.trim() || !form.phone.trim() || !form.email.trim()) {
      showToast('Required fields missing', 'Please fill in all required fields', 'error'); return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      showToast('Invalid email', 'Please enter a valid email address', 'error'); return false;
    }
    if (!isPickup && (!form.address.trim() || !form.city.trim())) {
      showToast('Address required', 'Please enter your delivery address and city', 'error'); return false;
    }
    if (!isPickup && !selectedMatch) {
      showToast('Location required', 'Please select your delivery area from the suggestions', 'error');
      locationInputRef.current?.focus(); return false;
    }
    if (items.length === 0) {
      showToast('Cart is empty', 'Add items to your cart first', 'error'); return false;
    }
    return true;
  };



  const handleBankTransfer = async () => {
    if (!validateForm()) return;

    const itemsSnapshot = items.map(i => ({ ...i }));
    const amountSnapshot = amountToPayNow;
    setProcessing(true);
    let orderId;
    try {
      const payload = buildOrderPayload('bank_transfer');
      payload.notes = payload.notes + `\nTransfer Name: ${transferName.trim()}`;
      const { data, error } = await orderClient.rpc('create_storefront_order', { p: payload });
      if (error) throw error;
      orderId = data;
      await publicSupabase.from('order_items').insert(
        itemsSnapshot.map(i => ({ order_id: orderId, product_id: i.id || null, name: i.name, price: i.price, qty: i.qty }))
      );
    } catch (err) {
      showToast('Failed to place order', err.message, 'error');
      setProcessing(false);
      return;
    }

    const customerName = `${form.firstName} ${form.lastName}`.trim();
    const deliveryLine = isPickup
      ? `Store Pickup — ${stores.find(s => s.id === selectedStoreId)?.name || 'Store'}`
      : `${form.address}, ${selectedMatch?.area?.name || selectedMatch?.zone?.name || form.city}`;
    const itemLines = itemsSnapshot.map(i => `• ${i.name} ×${i.qty} — ${fmt(i.price * i.qty)}`).join('\n');
    const waLines = [
      `🧾 *New Order — ${orderId}*`,
      ``,
      `*Customer:* ${customerName}`,
      `*Phone:* ${form.phone}`,
      form.email ? `*Email:* ${form.email}` : null,
      ``,
      `*Items:*`,
      itemLines,
      ``,
      `*Delivery:* ${deliveryLine}`,
      couponDiscount > 0 ? `*Coupon:* ${appliedCoupon?.code} (−${fmt(couponDiscount)})` : null,
      `*Amount paid:* ${fmt(amountSnapshot)}`,
      `*Transfer Name:* ${transferName.trim()}`,
      `*Payment:* Bank Transfer 🏦`,
      form.notes ? `\n*Notes:* ${form.notes}` : null,
    ].filter(Boolean).join('\n');
    const waUrl = `https://api.whatsapp.com/send?phone=${WA_NUMBER}&text=${encodeURIComponent(waLines)}`;

    clearCart();
    await incrementCouponUse();
    setTransferName('');
    setTransferConfirmed(false);
    setTransferNameTouched(false);
    notify('order_confirmed', {
      id: orderId, customer_name: customerName,
      customer_email: form.email || null, customer_phone: form.phone,
      delivery_address: deliveryLine,
      total: amountSnapshot,
    });
    if (typeof window !== 'undefined' && window.fbq) {
      window.fbq('track', 'Purchase', {
        content_type: 'product',
        value: Number(amountSnapshot),
        currency: 'NGN',
        num_items: itemsSnapshot.reduce((acc, i) => acc + i.qty, 0)
      });
    }
    setCheckoutOpen(false);
    setSuccessData({ 
      orderId, 
      method: 'bank_transfer', 
      waUrl, 
      amount: amountSnapshot,
      itemCount: itemsSnapshot.reduce((acc, i) => acc + i.qty, 0),
      deliveryLine
    });
    setProcessing(false);
  };

  const handlePaystack = async () => {
    if (!validateForm()) return;

    const itemsSnapshot = items.map(i => ({ ...i }));
    setProcessing(true);

    try {
      // Hidden until paid: the webhook flips pending_payment -> pending.
      // No notify() and no clearCart() here — email fires on payment,
      // cart clears on the success page.
      const payload = buildOrderPayload('paystack');
      payload.status = 'pending_payment';
      const { data: orderId, error } = await orderClient.rpc('create_storefront_order', { p: payload });
      if (error) throw error;
      await publicSupabase.from('order_items').insert(
        itemsSnapshot.map(i => ({ order_id: orderId, product_id: i.id || null, name: i.name, price: i.price, qty: i.qty }))
      );

      const res = await fetch(`${SUPABASE_URL}/functions/v1/initialize-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'apikey': SUPABASE_ANON_KEY },
        body: JSON.stringify({ order_id: orderId, origin: window.location.origin }),
      });
      const data = await res.json();
      if (!res.ok || !data.authorization_url) throw new Error(data.error || 'Could not start payment');

      await incrementCouponUse();
      window.location.assign(data.authorization_url);
    } catch (err) {
      showToast('Could not start card payment', `${err.message} — you can pay by bank transfer instead.`, 'error');
      setProcessing(false);
    }
  };

  const handleOpenCheckout = () => {
    setCheckoutOpen(true);
    if (typeof window !== 'undefined' && window.fbq) {
      window.fbq('track', 'InitiateCheckout', {
        content_type: 'product',
        num_items: itemCount,
        value: total,
        currency: 'NGN'
      });
    }
  };

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
      <OrderingGuidePopup />
      {/* Minimal sticky header — logo only */}
      <header className="premium-glass-header" style={{ padding: '0 20px', height: 64, display: 'flex', alignItems: 'center' }}>
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'var(--text)', fontWeight: 800, fontSize: '1.1rem' }}>
          <img src="/logo.svg" alt="Smokeyhut Logo" style={{ width: 28, height: 28, objectFit: 'contain' }} />
          <span>Smokeyhut <span style={{ color: 'var(--red)' }}>Delight</span></span>
        </a>
      </header>
      <div style={{ background: '#f5f5f7', minHeight: '100vh', color: '#111' }}>

      {/* Store info bar */}
      <div className="container premium-filters-scroll" style={{ padding: '24px 12px 12px', overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 'max-content', paddingBottom: 4 }}>
          {/* Open Now badge */}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 30, fontSize: '0.75rem', fontWeight: 800, background: 'rgba(34,197,94,0.08)', color: '#16a34a', border: '1px solid rgba(34,197,94,0.15)' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
            Open Now
          </span>
          {/* Pills */}
          {[
            { icon: <Truck size={14} />, label: 'Lagos Delivery' },
            { icon: <MapPin size={14} />, label: 'Sabo Yaba, Lagos' },
            { icon: <Banknote size={14} />, label: 'Payment Before Delivery' },
          ].map(({ icon, label }) => (
            <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 30, fontSize: '0.75rem', fontWeight: 700, background: '#fff', color: '#555', border: '1px solid #e5e5e5' }}>
              {icon}{label}
            </span>
          ))}
        </div>
      </div>

      <section style={{ padding: 'clamp(32px, 8vw, 60px) 0' }}>
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: 36 }}>
            <h1 style={{ fontWeight: 900, fontSize: 'clamp(1.8rem, 5vw, 2.8rem)', color: '#111', marginBottom: 12, letterSpacing: '-0.02em' }}>The Smokeyhut Menu</h1>
            <p style={{ color: '#666', fontSize: '0.95rem', maxWidth: 500, margin: '0 auto', lineHeight: 1.6 }}>Every item freshly prepared with premium ingredients. Order now.</p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 40, gap: 20 }}>
            {/* Search */}
            <div style={{ position: 'relative', width: '100%', maxWidth: 480 }}>
              <PackageSearch size={18} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: '#aaa' }} />
              <input
                type="text"
                placeholder="Search our delicious menu..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  width: '100%', padding: '14px 20px 14px 44px', borderRadius: 12,
                  border: '1px solid #e5e5e5', background: '#fff', fontSize: '0.95rem',
                  outline: 'none', color: '#111', boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
                  transition: 'all 0.2s'
                }}
                onFocus={e => { e.target.style.borderColor = '#c0201f'; e.target.style.boxShadow = '0 4px 12px rgba(192,32,31,0.08)'; }}
                onBlur={e => { e.target.style.borderColor = '#e5e5e5'; e.target.style.boxShadow = '0 2px 8px rgba(0,0,0,0.02)'; }}
              />
            </div>

            {/* Filters */}
            <div className="premium-filters-scroll" style={{ display: 'flex', overflowX: 'auto', gap: 8, padding: '4px 20px 24px', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none', width: '100%' }}>
              <style>{`.premium-filters-scroll::-webkit-scrollbar { display: none; }`}</style>
              {categories.map(c => (
                <button
                  key={c.id}
                  onClick={() => setActiveFilter(c.id)}
                  style={{
                    flexShrink: 0,
                    padding: '8px 16px', borderRadius: 30, fontSize: '0.82rem', fontWeight: 700,
                    cursor: 'pointer', transition: 'all 0.2s',
                    background: activeFilter === c.id ? 'var(--red)' : '#fff',
                    color: activeFilter === c.id ? '#fff' : '#555',
                    border: `1px solid ${activeFilter === c.id ? 'var(--red)' : '#e5e5e5'}`,
                  }}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div className="premium-grid">
            {loadingProducts
              ? Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} style={{ background: '#f5f5f7', borderRadius: 12, height: 320, animation: 'pulse 1.5s ease-in-out infinite', opacity: 0.6 }} />
                ))
              : filtered.map((p, i) => (
                  <div key={p.id} className="stagger-enter" style={{ animationDelay: `${i * 0.04}s` }}>
                    <ProductCard product={p} variant="shopify" />
                  </div>
                ))
            }
            {!loadingProducts && filtered.length === 0 && (
              <p style={{ color: '#888', gridColumn: '1/-1', textAlign: 'center', padding: '40px 0' }}>No items found.</p>
            )}
          </div>
        </div>
      </section>

      {/* Spacer so content isn't hidden behind bottom nav */}
      <div style={{ height: 72 }} />


      {/* Mobile bottom nav */}
      <nav className="premium-bottom-nav" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 300,
        display: 'flex', alignItems: 'stretch',
        height: 64,
      }}>
        {/* Menu */}
        <button
          className="premium-nav-btn"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 700 }}
        >
          <Utensils size={22} />
          Menu
        </button>

        {/* Cart */}
        <button
          className="premium-nav-btn"
          onClick={handleOpenCheckout}
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

        {/* Tracking */}
        <button
          className="premium-nav-btn"
          onClick={() => setTrackingOpen(true)}
          style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: successData ? '#16a34a' : 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 700 }}
        >
          <PackageSearch size={22} />
          Tracking
        </button>
      </nav>
    </div> {/* End of light background wrapper */}

      {/* Tracking sheet overlay */}
      {trackingOpen && (
        <div className="cart-overlay open" onClick={() => setTrackingOpen(false)} />
      )}

      {/* Tracking bottom sheet */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 500,
        background: 'var(--card-bg)', borderRadius: '20px 20px 0 0',
        boxShadow: '0 -4px 24px rgba(0,0,0,0.15)',
        padding: '24px 24px 40px',
        transform: trackingOpen ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 0.3s cubic-bezier(0.32,0.72,0,1)',
      }}>
        {/* Handle */}
        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border-subtle)', margin: '0 auto 20px' }} />
        <button onClick={() => setTrackingOpen(false)} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={18} /></button>

        {successData ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(34,197,94,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
              <CheckCircle size={26} color="#22c55e" />
            </div>
            <div style={{ fontWeight: 800, fontSize: '1.1rem', marginBottom: 6 }}>Order Placed Successfully</div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 20 }}>Your order reference number</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, background: 'var(--black2)', borderRadius: 10, padding: '14px 18px' }}>
              <code style={{ fontWeight: 900, fontSize: '1.05rem', color: 'var(--text)', letterSpacing: '0.04em' }}>{successData.orderId}</code>
              <button
                onClick={() => { navigator.clipboard.writeText(successData.orderId); showToast('Copied!', 'Order ID copied', 'success'); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 4 }}
              >
                <Copy size={15} />
              </button>
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '10px 0 6px' }}>
            <PackageSearch size={40} style={{ opacity: 0.3, marginBottom: 14 }} />
            <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 8 }}>No recent order</div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Place an order and your reference will appear here.</div>
          </div>
        )}
      </div>

      {/* Checkout drawer overlay */}
      {checkoutOpen && (
        <div className="cart-overlay open" onClick={() => setCheckoutOpen(false)} />
      )}

      {/* Checkout drawer panel — Shopify-style mobile UI */}
      <div
        className={`dash-drawer checkout-drawer-premium ${checkoutOpen ? 'open' : ''}`}
        style={{
          width: '100%',
          maxWidth: 480,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: checkoutOpen ? '-12px 0 48px rgba(0,0,0,0.18)' : 'none',
          background: '#f5f5f7',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '0 20px', height: 60,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: '#fff', borderBottom: '1px solid #e5e5e5', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src="/logo.svg" alt="logo" style={{ width: 24, height: 24 }} />
            <span style={{ fontWeight: 800, fontSize: '1rem', color: '#111' }}>Checkout</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {itemCount > 0 && (
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#888', background: '#f0f0f0', borderRadius: 20, padding: '3px 10px' }}>
                {itemCount} item{itemCount > 1 ? 's' : ''}
              </span>
            )}
            <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', display: 'flex', padding: 4 }} onClick={() => setCheckoutOpen(false)}>
              <X size={22} />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>

          {/* Policy Notice */}
          <div style={{ margin: '12px 14px 0', borderRadius: 14, overflow: 'hidden', border: '1.5px solid #fde68a', background: '#fffbeb' }}>
            <div style={{ padding: '12px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                <span style={{ fontSize: '0.95rem' }}>📋</span>
                <span style={{ fontWeight: 800, fontSize: '0.82rem', color: '#92400e' }}>Please Note Our Policy</span>
              </div>
              <div style={{ fontSize: '0.75rem', color: '#78350f', fontWeight: 600, marginBottom: 4 }}>Order & Delivery Guide</div>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#92400e', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>1. Before You Order</div>
              <ul style={{ margin: 0, paddingLeft: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {[
                  'Orders are processed Mon–Sat 8am–6pm, Sun 10am–5pm.',
                  'Kindly provide accurate details and an active phone number.',
                  'We do not currently offer order customisation.',
                ].map((point, i) => (
                  <li key={i} style={{ fontSize: '0.78rem', color: '#78350f', lineHeight: 1.5 }}>{point}</li>
                ))}
              </ul>
              <a
                href="https://smokeyhutdelight.com/store-rules"
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 10, fontSize: '0.76rem', fontWeight: 800, color: '#b45309', textDecoration: 'none', borderBottom: '1.5px solid #b45309', paddingBottom: 1 }}
              >
                Read more →
              </a>
            </div>
          </div>

          {/* Cart Items */}
          <div style={{ background: '#fff', margin: '12px 14px', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 800, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.07em', color: '#888' }}>Order Summary</span>
              <span style={{ fontWeight: 800, fontSize: '0.78rem', color: 'var(--red)' }}>{fmt(total)}</span>
            </div>
            {items.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '36px 20px', color: '#aaa' }}>
                <ShoppingCart size={36} style={{ marginBottom: 10, opacity: 0.3 }} />
                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#555', marginBottom: 4 }}>Your bag is empty</div>
                <div style={{ fontSize: '0.82rem' }}>Add items from the menu to get started</div>
              </div>
            ) : (
              <div>
                {items.map((item, idx) => (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: idx < items.length - 1 ? '1px solid #f5f5f5' : 'none' }}>
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <div style={{ width: 56, height: 56, borderRadius: 12, overflow: 'hidden', background: '#f5f5f7', border: '1px solid #e5e5e5' }}>
                        {item.image
                          ? <img src={item.image} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ccc' }}><Utensils size={20} /></div>
                        }
                      </div>
                      <span style={{ position: 'absolute', top: -6, right: -6, background: '#111', color: '#fff', borderRadius: '50%', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 900 }}>
                        {item.qty}
                      </span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#111', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
                      <div style={{ fontSize: '0.8rem', color: '#888', marginTop: 2 }}>{fmt(item.price)} each</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#111' }}>{fmt(item.price * item.qty)}</div>
                      <div style={{ display: 'flex', alignItems: 'center', background: '#f5f5f7', borderRadius: 8, border: '1px solid #e5e5e5', overflow: 'hidden' }}>
                        <button onClick={() => updateQty(item.id, item.qty - 1)} style={{ width: 28, height: 28, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555' }}>
                          {item.qty === 1 ? <Trash2 size={13} color="#ef4444" /> : <Minus size={13} />}
                        </button>
                        <span style={{ fontWeight: 800, fontSize: '0.82rem', minWidth: 20, textAlign: 'center', color: '#111' }}>{item.qty}</span>
                        <button onClick={() => updateQty(item.id, item.qty + 1)} style={{ width: 28, height: 28, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555' }}>
                          <Plus size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {items.length > 0 && (<>

            {/* Delivery */}
            <div style={{ background: '#fff', margin: '0 14px 12px', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
              <div style={{ padding: '14px 16px', borderBottom: '1px solid #f0f0f0' }}>
                <span style={{ fontWeight: 800, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.07em', color: '#888' }}>Delivery</span>
              </div>
              <div style={{ padding: '14px 16px' }}>
                <div style={{ display: 'flex', background: '#f5f5f7', borderRadius: 12, padding: 4, marginBottom: 16, gap: 4 }}>
                  {[['delivery', 'Delivery', Truck], ['pickup', 'Store Pickup', StoreIcon]].map(([val, label, Icon]) => (
                    <button key={val}
                      onClick={() => { setDeliveryType(val); if (val === 'pickup') { setSelectedMatch(null); setLocationQuery(''); } }}
                      style={{ flex: 1, padding: '9px 12px', borderRadius: 9, background: deliveryType === val ? '#fff' : 'transparent', border: 'none', boxShadow: deliveryType === val ? '0 1px 6px rgba(0,0,0,0.12)' : 'none', color: deliveryType === val ? '#111' : '#888', fontWeight: 700, fontSize: '0.83rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'all 0.18s' }}>
                      <Icon size={14} />{label}
                    </button>
                  ))}
                </div>
                {deliveryType === 'delivery' ? (
                  <>
                    <div style={{ position: 'relative', marginBottom: 10 }}>
                      <MapPin size={15} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: '#aaa', pointerEvents: 'none' }} />
                      <input ref={locationInputRef} value={locationQuery}
                        onChange={e => { setLocationQuery(e.target.value); setSelectedMatch(null); }}
                        onFocus={() => locationQuery.trim().length >= 2 && setShowSuggestions(true)}
                        onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                        placeholder="Type your area (e.g. Ikeja)"
                        style={{ width: '100%', padding: '12px 14px 12px 38px', borderRadius: 10, border: `1.5px solid ${selectedMatch ? 'var(--red)' : '#e5e5e5'}`, background: '#fafafa', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box', color: '#111' }} />
                      {showSuggestions && suggestions.length > 0 && (
                        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: '#fff', border: '1px solid #e5e5e5', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.1)', zIndex: 100, maxHeight: 200, overflowY: 'auto' }}>
                          {suggestions.map((m, i) => (
                            <div key={i} onMouseDown={() => { setSelectedMatch(m); setLocationQuery(m.area ? m.area.name : m.zone.name); setShowSuggestions(false); }}
                              style={{ padding: '11px 14px', cursor: 'pointer', fontSize: '0.85rem', borderBottom: '1px solid #f5f5f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontWeight: 700, color: '#111' }}>{m.area ? m.area.name : m.zone.name}</span>
                              {m.zone && (() => {
                                const pf = getPromoDeliveryFee(deliveryPromo, items, m.area?.name || '', m.zone.price);
                                if (pf === null || allFreeShipping) return <span style={{ color: '#888', fontSize: '0.8rem' }}>{fmt(m.zone.price)}</span>;
                                return (
                                  <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>
                                    <s style={{ color: '#aaa', fontWeight: 500, marginRight: 6 }}>{fmt(m.zone.price)}</s>
                                    <span style={{ color: '#16a34a' }}>{pf === 0 ? 'Free' : fmt(pf)}</span>
                                  </span>
                                );
                              })()}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <input value={form.address} onChange={set('address')} placeholder="Street address"
                      style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1.5px solid #e5e5e5', background: '#fafafa', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box', marginBottom: 10, color: '#111' }} />
                    <input value={form.city} onChange={set('city')} placeholder="City"
                      style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1.5px solid #e5e5e5', background: '#fafafa', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box', color: '#111' }} />
                    {selectedMatch && (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ padding: '10px 14px', background: 'rgba(192,32,31,0.05)', border: '1.5px solid rgba(192,32,31,0.2)', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <CheckCircle size={15} color="var(--red)" />
                            <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#111' }}>{selectedMatch.area ? selectedMatch.area.name : selectedMatch.zone?.name}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {promoApplied && (
                              <>
                                <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#16a34a', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 6, padding: '2px 6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Promo</span>
                                <s style={{ color: '#aaa', fontWeight: 600, fontSize: '0.8rem' }}>{fmt(selectedMatch.zone.price)}</s>
                              </>
                            )}
                            <span style={{ fontWeight: 800, fontSize: '0.85rem', color: promoApplied ? '#16a34a' : 'var(--red)' }}>{deliveryFee === 0 ? 'Free' : fmt(deliveryFee)}</span>
                            <button onClick={() => { setSelectedMatch(null); setLocationQuery(''); locationInputRef.current?.focus(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', fontSize: '0.78rem', fontWeight: 700 }}>Change</button>
                          </div>
                        </div>
                        {/* Zone note/alias banner — shown when admin has added notes to this area */}
                        {selectedMatch.area?.aliases?.length > 0 && (
                          <div style={{ marginTop: 8, padding: '10px 13px', background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 10, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                            <span style={{ fontSize: '1rem', flexShrink: 0, lineHeight: 1.2 }}>📍</span>
                            <div>
                              <div style={{ fontWeight: 800, fontSize: '0.72rem', color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Delivery Notice</div>
                              {selectedMatch.area.aliases.map((note, i) => (
                                <p key={i} style={{ fontSize: '0.8rem', color: '#78350f', lineHeight: 1.5, margin: 0, marginTop: i > 0 ? 4 : 0 }}>{note}</p>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  stores.length > 0 && stores.map(s => (
                    <button key={s.id} onClick={() => setSelectedStoreId(s.id)}
                      style={{ width: '100%', textAlign: 'left', padding: '14px 16px', borderRadius: 12, marginBottom: 10, border: `2px solid ${selectedStoreId === s.id ? 'var(--red)' : '#e5e5e5'}`, background: selectedStoreId === s.id ? 'rgba(192,32,31,0.04)' : '#fafafa', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#111' }}>{s.name}</div>
                        <div style={{ fontSize: '0.78rem', color: '#888', marginTop: 3 }}>{s.address}</div>
                      </div>
                      {selectedStoreId === s.id && <CheckCircle size={18} color="var(--red)" />}
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Contact Information */}
            <div style={{ background: '#fff', margin: '0 14px 12px', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
              <div style={{ padding: '14px 16px', borderBottom: '1px solid #f0f0f0' }}>
                <span style={{ fontWeight: 800, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.07em', color: '#888' }}>Contact Information</span>
              </div>
              <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <input value={form.firstName} onChange={set('firstName')} onBlur={() => setTouched(t => ({ ...t, firstName: true }))} placeholder="First name *"
                    style={{ flex: '1 1 140px', minWidth: 0, padding: '12px 14px', borderRadius: 10, border: `1.5px solid ${touched.firstName && !form.firstName.trim() ? '#ef4444' : '#e5e5e5'}`, background: '#fafafa', fontSize: '0.9rem', outline: 'none', color: '#111', boxSizing: 'border-box' }} />
                  <input value={form.lastName} onChange={set('lastName')} onBlur={() => setTouched(t => ({ ...t, lastName: true }))} placeholder="Last name *"
                    style={{ flex: '1 1 140px', minWidth: 0, padding: '12px 14px', borderRadius: 10, border: `1.5px solid ${touched.lastName && !form.lastName.trim() ? '#ef4444' : '#e5e5e5'}`, background: '#fafafa', fontSize: '0.9rem', outline: 'none', color: '#111', boxSizing: 'border-box' }} />
                </div>
                <input value={form.phone} onChange={set('phone')} onBlur={() => setTouched(t => ({ ...t, phone: true }))} placeholder="Phone number *" type="tel"
                  style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: `1.5px solid ${touched.phone && !form.phone.trim() ? '#ef4444' : '#e5e5e5'}`, background: '#fafafa', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box', color: '#111' }} />
                <input value={form.email} onChange={set('email')} onBlur={() => setTouched(t => ({ ...t, email: true }))} placeholder="Email address *" type="email"
                  style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: `1.5px solid ${touched.email && !form.email.trim() ? '#ef4444' : '#e5e5e5'}`, background: '#fafafa', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box', color: '#111' }} />
                <textarea value={form.notes} onChange={set('notes')} placeholder="Order notes (optional)" rows={2}
                  style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1.5px solid #e5e5e5', background: '#fafafa', fontSize: '0.9rem', outline: 'none', resize: 'none', boxSizing: 'border-box', fontFamily: 'inherit', color: '#111' }} />
              </div>
            </div>

            {/* Discount Code */}
            <div style={{ background: '#fff', margin: '0 14px 12px', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
              <div style={{ padding: '14px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Tag size={14} color="#888" />
                <span style={{ fontWeight: 800, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.07em', color: '#888' }}>Discount Code</span>
              </div>
              <div style={{ padding: '14px 16px' }}>
                {appliedCoupon ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Tag size={15} color="#16a34a" />
                      <span style={{ fontWeight: 800, fontSize: '0.9rem', color: '#16a34a' }}>{appliedCoupon.code}</span>
                      <span style={{ fontSize: '0.82rem', color: '#555' }}>−{fmt(appliedCoupon.discount)}</span>
                    </div>
                    <button onClick={removeCoupon} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', display: 'flex', padding: 2 }}><X size={16} /></button>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input value={couponCode} onChange={e => { setCouponCode(e.target.value.toUpperCase()); setCouponError(''); }}
                        onKeyDown={e => e.key === 'Enter' && applyCoupon()} placeholder="Discount code"
                        style={{ flex: 1, padding: '12px 14px', borderRadius: 10, border: `1.5px solid ${couponError ? '#ef4444' : '#e5e5e5'}`, background: '#fafafa', fontSize: '0.9rem', outline: 'none', color: '#111' }} />
                      <button onClick={applyCoupon} disabled={couponLoading || !couponCode.trim()}
                        style={{ padding: '12px 18px', borderRadius: 10, background: '#111', color: '#fff', border: 'none', fontWeight: 800, fontSize: '0.88rem', cursor: 'pointer', flexShrink: 0, opacity: couponLoading || !couponCode.trim() ? 0.4 : 1 }}>
                        {couponLoading ? <Loader2 size={16} className="spin" /> : 'Apply'}
                      </button>
                    </div>
                    {couponError && <div style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: 6 }}>{couponError}</div>}
                  </>
                )}
              </div>
            </div>



            <div style={{ height: 16 }} />

            {/* ── Price Summary ── */}
            <div style={{ background: '#fff', margin: '0 14px 12px', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
              <div style={{ padding: '14px 16px', borderBottom: '1px solid #f0f0f0' }}>
                <span style={{ fontWeight: 800, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.07em', color: '#888' }}>Price Summary</span>
              </div>
              <div style={{ padding: '14px 16px' }}>
                {[
                  ['Subtotal (food)', fmt(total)],
                  couponDiscount > 0 ? [`Discount (${appliedCoupon?.code})`, `−${fmt(couponDiscount)}`] : null,
                  !isPickup && promoApplied ? ['Delivery (pay rider) 🎉 Promo', deliveryFee === 0 ? 'Free' : fmt(deliveryFee)] : (!isPickup && deliveryFee > 0 ? ['Delivery (pay rider)', fmt(deliveryFee)] : null),
                  ['VAT', fmt(VAT)],
                ].filter(Boolean).map(([label, value]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: '0.85rem' }}>
                    <span style={{ color: '#888' }}>{label}</span>
                    <span style={{ fontWeight: 600, color: '#111' }}>{value}</span>
                  </div>
                ))}
                <div style={{ height: 1, background: '#f0f0f0', margin: '10px 0' }} />
                {!isPickup && deliveryFee > 0 && (
                  <div style={{ padding: '11px 13px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                      <span style={{ fontSize: '0.85rem' }}>💡</span>
                      <span style={{ fontWeight: 800, fontSize: '0.75rem', color: '#92400e' }}>How payment works</span>
                    </div>
                    <p style={{ fontSize: '0.76rem', color: '#78350f', lineHeight: 1.5, margin: 0 }}>
                      Pay <strong>{fmt(amountToPayNow)}</strong> for your food now. Pay the <strong>{fmt(deliveryFee)}</strong> delivery fee directly to the rider in cash on arrival.
                    </p>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 900, fontSize: '1rem', color: 'var(--red)' }}>Pay now</span>
                  <span style={{ fontWeight: 900, fontSize: '1.1rem', color: 'var(--red)' }}>{fmt(amountToPayNow)}</span>
                </div>
              </div>
            </div>

            {/* Payment method selector — only shown if manual transfer is re-enabled */}
            {MANUAL_TRANSFER_ENABLED && paystackEnabled && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, margin: '0 14px 12px' }}>
                {[
                  ['paystack', 'Pay with Card / USSD', 'Instant confirmation via Paystack'],
                  ['transfer', 'Manual Bank Transfer', 'Transfer to our Moniepoint account'],
                ].map(([key, title, sub]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPayMethod(key)}
                    style={{
                      textAlign: 'left', padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
                      border: `2px solid ${activeMethod === key ? '#c0201f' : '#e5e5e5'}`,
                      background: activeMethod === key ? '#fef2f2' : '#fff',
                    }}
                  >
                    <div style={{ fontWeight: 800, fontSize: '0.85rem', color: '#111' }}>{title}</div>
                    <div style={{ fontSize: '0.72rem', color: '#888', marginTop: 2 }}>{sub}</div>
                  </button>
                ))}
              </div>
            )}

            {/* Bank Transfer Payment — hidden while MANUAL_TRANSFER_ENABLED is false */}
            {MANUAL_TRANSFER_ENABLED && activeMethod === 'transfer' && (
            <div style={{ background: '#fff', margin: '0 14px 12px', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1.5px solid rgba(192,32,31,0.12)' }}>
              <div style={{ padding: '14px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Banknote size={16} color="var(--red)" />
                <span style={{ fontWeight: 800, fontSize: '0.9rem', color: '#111' }}>Bank Transfer</span>
              </div>
              <div style={{ padding: '14px 16px' }}>

                {/* Bank details */}
                  <div style={{ padding: '14px', background: '#f9f9f9', borderRadius: 12, marginBottom: 14, border: '1px solid #e5e5e5' }}>
                    <div style={{ fontSize: '0.85rem', marginBottom: 4 }}>
                      <span style={{ color: '#888' }}>Bank: </span><strong>Moniepoint</strong>
                    </div>
                    <div style={{ fontSize: '0.85rem', marginBottom: 10 }}>
                      <span style={{ color: '#888' }}>Account Name: </span><strong>Smokeyhut Delight</strong>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 900, fontSize: '1.4rem', letterSpacing: '0.04em', color: '#111' }}>5655718527</span>
                      <button
                        onClick={() => { navigator.clipboard.writeText('5655718527'); showToast('Copied!', 'Account number copied', 'success'); }}
                        style={{ background: '#efefef', border: 'none', cursor: 'pointer', color: '#555', padding: '6px 12px', borderRadius: 8, fontSize: '0.75rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}
                      ><Copy size={13} /> Copy</button>
                    </div>
                  </div>


                {/* Name on transfer receipt */}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontWeight: 700, fontSize: '0.82rem', color: '#111', marginBottom: 6 }}>
                    Name on Transfer Receipt <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    value={transferName}
                    onChange={e => setTransferName(e.target.value)}
                    onBlur={() => setTransferNameTouched(true)}
                    placeholder="Enter the exact name on your bank transfer"
                    style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: `1.5px solid ${transferNameTouched && !transferName.trim() ? '#ef4444' : '#e5e5e5'}`, background: '#fafafa', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box', color: '#111' }}
                  />
                  <div style={{ fontSize: '0.75rem', color: '#888', marginTop: 4 }}>This helps us match your payment to your order</div>
                </div>

                {/* Confirmation checkbox */}
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '12px 14px', background: transferConfirmed ? '#f0fdf4' : '#fafafa', border: `1.5px solid ${transferConfirmed ? '#86efac' : '#e5e5e5'}`, borderRadius: 10, transition: 'background 0.2s, border-color 0.2s' }}>
                  <input
                    type="checkbox"
                    checked={transferConfirmed}
                    onChange={e => setTransferConfirmed(e.target.checked)}
                    style={{ width: 18, height: 18, cursor: 'pointer', accentColor: '#c0201f', flexShrink: 0 }}
                  />
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#111' }}>
                    I confirm I have transferred {fmt(amountToPayNow)}
                  </span>
                </label>
              </div>
            </div>
            )}

            {/* Disclaimer removed from inline flow */}

            {/* Complete Order button */}
            {(() => {
              const disabled = processing;
              return (
            <div style={{ margin: '0 14px 12px' }}>
              <button
                onClick={() => handlePaystack()}
                disabled={disabled}
                style={{ width: '100%', padding: '16px', borderRadius: 14, background: disabled ? 'rgba(192,32,31,0.45)' : 'var(--red)', color: '#fff', border: 'none', fontWeight: 900, fontSize: '1rem', cursor: disabled ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, letterSpacing: '-0.01em', transition: 'background 0.2s' }}>
                {processing
                  ? <><Loader2 size={18} className="spin" /> Processing…</>
                  : <><Send size={18} /> Pay {fmt(amountToPayNow)} Securely →</>
                }
              </button>
            </div>
              );
            })()}

            <div style={{ height: 28 }} />
          </>)}
        </div>
      </div>

      {/* ── Success drawer ── */}
      {successData && (
        <div className="cart-overlay open" onClick={() => setSuccessData(null)} />
      )}
      <div
        className={`dash-drawer checkout-drawer-premium ${successData ? 'open' : ''}`}
        style={{
          width: '100%',
          maxWidth: 480,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: successData ? '-12px 0 48px rgba(0,0,0,0.1)' : 'none'
        }}
      >
        <div className="dash-drawer-header" style={{ padding: '24px 28px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--white)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontWeight: 800, fontSize: '1.2rem', color: 'var(--text)' }}>
              Order
            </span>
          </div>
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setSuccessData(null)}><X size={24} /></button>
        </div>

        <div className="dash-drawer-content" style={{ flex: 1, overflowY: 'auto', padding: '28px' }}>
          {successData && (
             <>
               <div style={{ textAlign: 'center', marginBottom: 28 }}>
                  <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(34,197,94,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                     <CheckCircle size={32} color="#22c55e" />
                  </div>
                  <h2 style={{ fontSize: '1.4rem', fontWeight: 900, marginBottom: 8, color: 'var(--text)' }}>Order received!</h2>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                     Your order has been saved. Send it to us on WhatsApp to confirm delivery.
                  </p>
               </div>

               {/* Card 1: Order Reference */}
               <div style={{ padding: '16px', background: 'var(--black2)', border: '1px solid var(--border-subtle)', borderRadius: 12, marginBottom: 16 }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: 8 }}>Your Order Reference</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                    <code style={{ color: 'var(--text)', fontWeight: 800, fontSize: '1.1rem', letterSpacing: '0.05em' }}>{successData.orderId}</code>
                    <button
                      onClick={() => { navigator.clipboard.writeText(successData.orderId); showToast('Copied!', 'Order reference copied', 'success'); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: '0.8rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}
                    ><Copy size={14} /> Copy</button>
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Save this reference. Quote it if you need to follow up.</div>
               </div>

               {/* Card 2: Summary */}
               <div style={{ padding: '16px', background: 'var(--white)', border: '1px solid var(--border-subtle)', borderRadius: 12, marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, fontSize: '0.85rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Items</span>
                    <span style={{ fontWeight: 600, color: 'var(--text)' }}>{successData.itemCount || 1}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, fontSize: '0.85rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Delivery to</span>
                    <span style={{ fontWeight: 600, color: 'var(--text)', textAlign: 'right' }}>{successData.deliveryLine || 'Store Pickup'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, fontSize: '0.85rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Payment</span>
                    <span style={{ fontWeight: 600, color: '#16a34a' }}>Confirmed by you</span>
                  </div>
                  <div style={{ height: 1, background: 'var(--border-subtle)', margin: '12px 0' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text)' }}>Total Paid</span>
                    <span style={{ fontWeight: 900, fontSize: '1.1rem', color: 'var(--text)' }}>{fmt(successData.amount)}</span>
                  </div>
               </div>

               {/* Card 3: Next Step */}
               <div style={{ padding: '16px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <span style={{ fontWeight: 800, fontSize: '0.85rem', color: '#92400e' }}>Next step</span>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: '#78350f', lineHeight: 1.5, margin: 0 }}>
                    Tap the button below to send your order details via WhatsApp. Once received, we’ll verify your payment and confirm your delivery schedule.
                  </p>
               </div>
             </>
          )}
        </div>
        
        <div className="dash-drawer-footer" style={{ padding: '0 28px 28px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {successData?.waUrl && (
            <button
              onClick={() => window.open(successData.waUrl, '_blank')}
              style={{ width: '100%', padding: '16px', borderRadius: 12, background: '#22c55e', color: '#fff', border: 'none', fontWeight: 800, fontSize: '1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}
            >
              <Send size={18} /> Send to WhatsApp
            </button>
          )}
          <button
            onClick={() => { setSuccessData(null); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: 600, padding: '8px', textAlign: 'center', width: '100%' }}
          >
            Done — close
          </button>
        </div>
      </div>

      <DisclaimerModal isOpen={showDisclaimerModal} onAgree={() => { setDisclaimerAgreed(true); setShowDisclaimerModal(false); }} />
    </>
  );
}

function DisclaimerModal({ isOpen, onAgree }) {
  if (!isOpen) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 20, padding: 24, maxWidth: 400, width: '100%', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#fffbeb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: '1.5rem' }}>⚠️</span>
          </div>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#92400e' }}>Delivery Fee Notice</h3>
        </div>
        <p style={{ fontSize: '0.9rem', color: '#555', lineHeight: 1.6, marginBottom: 24 }}>
          Pay the delivery fee directly to the rider. We no longer collect delivery payments on behalf of riders. If you mistakenly send the delivery fee to us, refunds will take 24–48 hours to process, and you will still be required to pay the rider directly upon delivery.
        </p>
        <button
          onClick={onAgree}
          style={{ width: '100%', padding: 14, borderRadius: 12, background: 'var(--red)', color: '#fff', border: 'none', fontWeight: 800, fontSize: '1rem', cursor: 'pointer' }}
        >
          I Agree
        </button>
      </div>
    </div>
  );
}
