import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import { useToast } from '../../context/ToastContext';
import { useSettings } from '../../context/SettingsContext';
import { publicSupabase } from '../../lib/supabase';
import { fetchDeliveryZones, matchDeliveryZone } from '../../lib/deliveryMatcher';
import { fetchDeliveryPromo, getPromoDeliveryFee } from '../../lib/deliveryPromo';
import { anyItemPastCutoff } from '../../lib/deliveryCutoff';
import { ShoppingCart, Truck, CheckCircle, Store, Loader2, Search, MapPin, Tag, X, Copy, Banknote, Send } from 'lucide-react';

const SUPABASE_URL        = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY   = import.meta.env.VITE_SUPABASE_ANON_KEY;
// Fire-and-forget — notifications are non-critical, never block the UI
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

export default function Checkout() {
  const { items, total, clearCart } = useCart();
  const { showToast } = useToast();
  const { settings } = useSettings();
  const fmt = (n) => '₦' + Number(n).toLocaleString();

  // Delivery state
  const [deliveryType, setDeliveryType] = useState('delivery'); // 'delivery' | 'pickup'
  const [zones, setZones] = useState([]);
  const [deliveryPromo, setDeliveryPromo] = useState(null);
  const [locationQuery, setLocationQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [selectedMatch, setSelectedMatch] = useState(null); // { zone, area, matchedOn }
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef(null);

  // Order form state
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', email: '', address: '', city: 'Lagos', notes: '' });
  const [touched, setTouched] = useState({ firstName: false, lastName: false, phone: false, email: false, address: false, city: false });
  const [processing, setProcessing] = useState(false);
  const [successData, setSuccessData] = useState(null);
  const [transferName, setTransferName]               = useState('');
  const [transferNameTouched, setTransferNameTouched] = useState(false);
  const [transferConfirmed, setTransferConfirmed]     = useState(false);
  // Live control is settings.paystack.enabled. The DEV-only escape hatch lets
  // you test the Paystack flow locally (localStorage.force_paystack='1') WITHOUT
  // enabling it on the live site. import.meta.env.DEV is false in prod builds,
  // so this whole branch compiles away — it can never affect production.
  const paystackEnabled = !!settings?.paystack?.enabled
    || (import.meta.env.DEV && typeof localStorage !== 'undefined' && localStorage.getItem('force_paystack') === '1');
  const [payMethod, setPayMethod] = useState('paystack'); // 'paystack' | 'transfer'
  const activeMethod = paystackEnabled ? payMethod : 'transfer';

  // Disclaimer state
  const [disclaimerAgreed, setDisclaimerAgreed] = useState(false);
  const [showDisclaimerModal, setShowDisclaimerModal] = useState(false);
  const [cutoffAck, setCutoffAck] = useState(false);
  const [showCutoffModal, setShowCutoffModal] = useState(false);

  const [stores, setStores] = useState([]);
  const [selectedStoreId, setSelectedStoreId] = useState(null);

  // Coupon state
  const [couponCode, setCouponCode] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState(null); // { id, code, type, value, discount }
  const [couponError, setCouponError] = useState('');

  useEffect(() => {
    if (deliveryType === 'delivery' && !disclaimerAgreed) {
      setShowDisclaimerModal(true);
    }
  }, [deliveryType, disclaimerAgreed]);

  // Re-require acknowledgment whenever the cart contents change.
  useEffect(() => { setCutoffAck(false); }, [items]);

  // Track InitiateCheckout on page mount
  useEffect(() => {
    if (typeof window !== 'undefined' && window.fbq) {
      window.fbq('track', 'InitiateCheckout', {
        content_type: 'product',
        num_items: items.reduce((acc, i) => acc + i.qty, 0),
        value: total,
        currency: 'NGN'
      });
    }
  }, []);

  // Fetch zones and active stores on mount
  useEffect(() => {
    fetchDeliveryZones(publicSupabase).then(setZones);
    fetchDeliveryPromo(publicSupabase).then(setDeliveryPromo);
    publicSupabase
      .from('stores')
      .select('id, name, address')
      .eq('is_active', true)
      .order('id')
      .then(({ data }) => {
        if (data && data.length > 0) {
          setStores(data);
          setSelectedStoreId(data[0].id); // default to first store
        }
      });
  }, []);

  // Update suggestions as user types
  useEffect(() => {
    if (locationQuery.trim().length >= 2) {
      setSuggestions(matchDeliveryZone(locationQuery, zones));
      setShowSuggestions(true);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }, [locationQuery, zones]);

  const VAT = 200;
  const isPickup = deliveryType === 'pickup';
  const allFreeShipping = items.length > 0 && items.every(i => i.free_shipping === true);
  const promoFee = !isPickup && selectedMatch
    ? getPromoDeliveryFee(deliveryPromo, items, selectedMatch.area?.name || '', selectedMatch.zone.price)
    : null;
  const promoApplied = promoFee !== null && !allFreeShipping;
  const deliveryFee = isPickup ? 0 : (allFreeShipping ? 0 : (promoApplied ? promoFee : (selectedMatch?.zone.price ?? 0)));
  const couponDiscount = appliedCoupon?.discount ?? 0;
  const grandTotal = Math.max(0, total + deliveryFee - couponDiscount) + VAT;
  const amountToPayNow = Math.max(0, total - couponDiscount) + VAT;

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
    const now = new Date();
    if (data.expires_at && new Date(data.expires_at) < now) { setCouponError('This coupon has expired'); return; }
    if (data.max_uses !== null && data.uses >= data.max_uses) { setCouponError('This coupon has reached its usage limit'); return; }
    if (data.min_order_amount && total < data.min_order_amount) {
      setCouponError(`Minimum order of ${fmt(data.min_order_amount)} required for this coupon`); return;
    }
    const discount = data.type === 'percent'
      ? Math.round((total + deliveryFee) * (data.value / 100))
      : data.value;
    setAppliedCoupon({ id: data.id, code: data.code, type: data.type, value: data.value, discount: Math.min(discount, total + deliveryFee) });
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
    setCouponCode('');
    setCouponError('');
  };

  const incrementCouponUse = async () => {
    if (!appliedCoupon?.id) return;
    await publicSupabase.rpc('increment_coupon_uses', { coupon_id: appliedCoupon.id });
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const handleSelectSuggestion = (match) => {
    setSelectedMatch(match);
    setLocationQuery(match.area ? match.area.name : match.zone.name);
    setShowSuggestions(false);
    inputRef.current?.blur();
  };

  const handleDeliveryTypeChange = (type) => {
    setDeliveryType(type);
    if (type === 'pickup') {
      setSelectedMatch(null);
      setLocationQuery('');
      if (stores.length > 0) setSelectedStoreId(stores[0].id);
    }
  };

  const buildOrderPayload = (method) => {
    const customerName = `${form.firstName} ${form.lastName}`.trim();
    const pickupStore = stores.find(s => s.id === selectedStoreId);
    const deliveryAddress = isPickup
      ? `Store Pickup — ${pickupStore?.name || 'Store'}`
      : `${form.address}, ${selectedMatch?.area?.name || selectedMatch?.zone?.name || form.city}`;
    const deliveryZoneName = isPickup ? 'Store Pickup' : (selectedMatch?.area?.name || selectedMatch?.zone?.name || '');

    return {
      customer_name: customerName,
      customer_email: form.email || null,
      customer_phone: form.phone,
      delivery_address: deliveryAddress,
      delivery_zone: deliveryZoneName || null,
      store_id: selectedStoreId,
      payment_method: method,
      total: amountToPayNow,
      delivery_fee: deliveryFee,
      coupon_code: appliedCoupon?.code || null,
      coupon_discount: appliedCoupon?.discount || 0,
      status: 'pending',
      notes: (promoApplied ? '[via Website] [Delivery Promo]' : '[via Website]') + (form.notes ? '\n' + form.notes : ''),
    };
  };

  const validateForm = () => {
    // Mark all fields touched so inline errors appear
    setTouched({ firstName: true, lastName: true, phone: true, email: true, address: true, city: true });
    if (!form.firstName.trim() || !form.lastName.trim() || !form.phone.trim() || !form.email.trim()) {
      showToast('Required fields missing', 'Please fill in all required fields', 'error');
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      showToast('Invalid email', 'Please enter a valid email address', 'error');
      return false;
    }
    if (!isPickup && (!form.address.trim() || !form.city.trim())) {
      showToast('Address required', 'Please enter your delivery address and city', 'error');
      return false;
    }
    if (!isPickup && !selectedMatch) {
      showToast('Location required', 'Please select your delivery area', 'error');
      inputRef.current?.focus();
      return false;
    }
    if (items.length === 0) {
      showToast('Cart is empty', 'Add items to your cart first', 'error');
      return false;
    }
    return true;
  };



  const checkStock = async (itemsSnapshot) => {
    const ids = itemsSnapshot.map(i => i.id).filter(Boolean);
    if (!ids.length) return null;
    const { data, error } = await publicSupabase
      .from('products')
      .select('id, name, stock')
      .in('id', ids);
    if (error || !data) return null; // fail open — don't block on a read error
    const stockMap = Object.fromEntries(data.map(p => [String(p.id), p]));
    return itemsSnapshot
      .filter(i => i.id && stockMap[String(i.id)] && stockMap[String(i.id)].stock < i.qty)
      .map(i => ({ ...i, available: stockMap[String(i.id)].stock }));
  };

  const handleBankTransfer = async (skipCutoffGate = false) => {
    if (skipCutoffGate !== true && anyItemPastCutoff(items) && !cutoffAck) {
      setShowCutoffModal(true);
      return;
    }
    if (!validateForm()) return;

    const itemsSnapshot = [...items];
    const amountSnapshot = amountToPayNow;
    setProcessing(true);

    const stockFailures = await checkStock(itemsSnapshot);
    if (stockFailures?.length) {
      const msg = stockFailures
        .map(i => i.available === 0 ? `${i.name} is out of stock` : `Only ${i.available} left of ${i.name}`)
        .join(' · ');
      showToast('Cannot place order', msg, 'error');
      setProcessing(false);
      return;
    }

    let orderId;
    try {
      const payload = buildOrderPayload('bank_transfer');
      payload.notes = payload.notes + `\nTransfer Name: ${transferName.trim()}`;
      const { data, error } = await publicSupabase.rpc('create_storefront_order', { p: payload });
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

    if (typeof window !== 'undefined' && window.fbq) {
      window.fbq('track', 'Purchase', {
        content_type: 'product',
        value: Number(amountSnapshot),
        currency: 'NGN',
        num_items: itemsSnapshot.reduce((acc, i) => acc + i.qty, 0)
      });
    }

    clearCart();
    await incrementCouponUse();
    setTransferName('');
    setTransferConfirmed(false);
    setTransferNameTouched(false);
    notify('order_confirmed', {
      id: orderId,
      customer_name: customerName,
      customer_email: form.email || null,
      customer_phone: form.phone,
      delivery_address: deliveryLine,
      total: amountSnapshot,
    });
    setSuccessData({ orderId, amount: amountSnapshot, itemCount: itemsSnapshot.reduce((acc, i) => acc + i.qty, 0), deliveryLine });
    setProcessing(false);
  };

  const handlePaystack = async (skipCutoffGate = false) => {
    if (skipCutoffGate !== true && anyItemPastCutoff(items) && !cutoffAck) {
      setShowCutoffModal(true);
      return;
    }
    if (!validateForm()) return;

    const itemsSnapshot = [...items];
    setProcessing(true);

    const stockFailures = await checkStock(itemsSnapshot);
    if (stockFailures?.length) {
      const msg = stockFailures
        .map(i => i.available === 0 ? `${i.name} is out of stock` : `Only ${i.available} left of ${i.name}`)
        .join(' · ');
      showToast('Cannot place order', msg, 'error');
      setProcessing(false);
      return;
    }

    try {
      // Hidden until paid: the webhook flips pending_payment -> pending.
      // No notify() and no clearCart() here — email fires on payment,
      // cart clears on the success page.
      const payload = buildOrderPayload('paystack');
      payload.status = 'pending_payment';
      const { data: orderId, error } = await publicSupabase.rpc('create_storefront_order', { p: payload });
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




  if (items.length === 0 && !successData) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
            <ShoppingCart size={64} color="var(--text-muted)" />
          </div>
          <h2 className="section-title">Cart is <span>Empty</span></h2>
          <Link to="/shop" className="btn-primary" style={{ marginTop: 16 }}>Browse Menu →</Link>
        </div>
      </div>
    );
  }

  return (
    <>
    <div style={{ background: '#f5f5f7', minHeight: '100vh' }}>

      {/* Breadcrumb */}
      <div style={{ padding: '14px 16px', background: '#fff', borderBottom: '1px solid #e5e5e5' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: '#888' }}>
          <Link to="/" style={{ color: '#888', textDecoration: 'none' }}>Home</Link>
          <span>›</span>
          <Link to="/cart" style={{ color: '#888', textDecoration: 'none' }}>Cart</Link>
          <span>›</span>
          <span style={{ color: '#111', fontWeight: 700 }}>Checkout</span>
        </div>
      </div>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: 'clamp(12px, 4vw, 24px) clamp(10px, 3vw, 14px) 60px' }}>

        {/* Header */}
        <h1 style={{ fontWeight: 900, fontSize: '1.4rem', color: '#111', marginBottom: 16 }}>Complete Your Order</h1>

        {/* Policy Banner */}
        <div style={{ marginBottom: 14, borderRadius: 14, overflow: 'hidden', border: '1.5px solid #fde68a', background: '#fffbeb' }}>
          <div style={{ padding: '12px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
              <span style={{ fontSize: '0.95rem' }}>📋</span>
              <span style={{ fontWeight: 800, fontSize: '0.82rem', color: '#92400e' }}>Please Note Our Policy</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {['Orders are processed Mon–Sat 8am–6pm, Sun 10am–5pm.', 'Kindly provide accurate details and an active phone number.', 'We do not currently offer order customisation.'].map((p, i) => (
                <li key={i} style={{ fontSize: '0.78rem', color: '#78350f', lineHeight: 1.5 }}>{p}</li>
              ))}
            </ul>
            <a href="https://smokeyhutdelight.com/store-rules" target="_blank" rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 10, fontSize: '0.76rem', fontWeight: 800, color: '#b45309', textDecoration: 'none', borderBottom: '1.5px solid #b45309', paddingBottom: 1 }}>
              Read more →
            </a>
          </div>
        </div>

        {/* Order Items */}
        <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: 14 }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 800, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.07em', color: '#888' }}>Order Summary</span>
            <span style={{ fontWeight: 800, fontSize: '0.78rem', color: '#c0201f' }}>{fmt(total)}</span>
          </div>
          {items.map((item, idx) => (
            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: idx < items.length - 1 ? '1px solid #f5f5f5' : 'none' }}>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <div style={{ width: 52, height: 52, borderRadius: 10, overflow: 'hidden', background: '#f5f5f7', border: '1px solid #e5e5e5' }}>
                  {item.image ? <img src={item.image} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem' }}>🍗</div>}
                </div>
                <span style={{ position: 'absolute', top: -6, right: -6, background: '#111', color: '#fff', borderRadius: '50%', width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', fontWeight: 900 }}>{item.qty}</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                <div style={{ fontSize: '0.78rem', color: '#888', marginTop: 2 }}>{fmt(item.price)} each</div>
              </div>
              <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#111', flexShrink: 0 }}>{fmt(item.price * item.qty)}</div>
            </div>
          ))}
        </div>

        {/* Delivery Section */}
        <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: 14 }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #f0f0f0' }}>
            <span style={{ fontWeight: 800, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.07em', color: '#888' }}>Delivery</span>
          </div>
          <div style={{ padding: '14px 16px' }}>
            {/* Toggle */}
            <div style={{ display: 'flex', background: '#f5f5f7', borderRadius: 12, padding: 4, marginBottom: 16, gap: 4 }}>
              {[['delivery', 'Delivery', Truck], ['pickup', 'Store Pickup', Store]].map(([val, label, Icon]) => (
                <button key={val} onClick={() => handleDeliveryTypeChange(val)}
                  style={{ flex: 1, padding: '9px 12px', borderRadius: 9, background: deliveryType === val ? '#fff' : 'transparent', border: 'none', boxShadow: deliveryType === val ? '0 1px 6px rgba(0,0,0,0.12)' : 'none', color: deliveryType === val ? '#111' : '#888', fontWeight: 700, fontSize: '0.83rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'all 0.18s' }}>
                  <Icon size={14} />{label}
                </button>
              ))}
            </div>

            {deliveryType === 'delivery' ? (
              <>
                <div style={{ position: 'relative', marginBottom: 10 }}>
                  <Search size={15} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: '#aaa', pointerEvents: 'none' }} />
                  <input ref={inputRef} value={locationQuery}
                    onChange={e => { setLocationQuery(e.target.value); setSelectedMatch(null); }}
                    onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                    placeholder="Type your area, e.g. Lekki, Ikeja..." autoComplete="off"
                    style={{ width: '100%', padding: '12px 14px 12px 38px', borderRadius: 10, border: `1.5px solid ${selectedMatch ? '#c0201f' : '#e5e5e5'}`, background: '#fafafa', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box', color: '#111' }} />
                  {showSuggestions && suggestions.length > 0 && (
                    <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: '#fff', border: '1px solid #e5e5e5', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.1)', zIndex: 100, maxHeight: 200, overflowY: 'auto' }}>
                      {suggestions.map((m, i) => (
                        <div key={i} onMouseDown={() => handleSelectSuggestion(m)}
                          style={{ padding: '11px 14px', cursor: 'pointer', fontSize: '0.85rem', borderBottom: '1px solid #f5f5f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div><div style={{ fontWeight: 700, color: '#111' }}>{m.area ? m.area.name : m.zone.name}</div><div style={{ fontSize: '0.75rem', color: '#888' }}>{m.zone.name}</div></div>
                          {(() => {
                            const pf = getPromoDeliveryFee(deliveryPromo, items, m.area?.name || '', m.zone.price);
                            if (pf === null || allFreeShipping) return <span style={{ color: '#c0201f', fontWeight: 800, fontSize: '0.82rem' }}>{fmt(m.zone.price)}</span>;
                            return (
                              <span style={{ fontWeight: 800, fontSize: '0.82rem' }}>
                                <s style={{ color: '#aaa', fontWeight: 600, marginRight: 6 }}>{fmt(m.zone.price)}</s>
                                <span style={{ color: '#16a34a' }}>{pf === 0 ? 'Free' : fmt(pf)}</span>
                              </span>
                            );
                          })()}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {selectedMatch && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ padding: '10px 14px', background: 'rgba(192,32,31,0.05)', border: '1.5px solid rgba(192,32,31,0.2)', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <CheckCircle size={15} color="#c0201f" />
                        <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#111' }}>{selectedMatch.area ? selectedMatch.area.name : selectedMatch.zone?.name}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {promoApplied && (
                          <>
                            <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#16a34a', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 6, padding: '2px 6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Promo</span>
                            <s style={{ color: '#aaa', fontWeight: 600, fontSize: '0.8rem' }}>{fmt(selectedMatch.zone.price)}</s>
                          </>
                        )}
                        <span style={{ fontWeight: 800, fontSize: '0.85rem', color: promoApplied ? '#16a34a' : '#c0201f' }}>{deliveryFee === 0 ? 'Free' : fmt(deliveryFee)}</span>
                        <button onClick={() => { setSelectedMatch(null); setLocationQuery(''); inputRef.current?.focus(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', fontSize: '0.78rem', fontWeight: 700 }}>Change</button>
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
                <input value={form.address} onChange={set('address')} onBlur={() => setTouched(t => ({ ...t, address: true }))} placeholder="Street address *"
                  style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: `1.5px solid ${touched.address && !form.address.trim() ? '#ef4444' : '#e5e5e5'}`, background: '#fafafa', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box', marginBottom: 10, color: '#111' }} />
                <input value={form.city} onChange={set('city')} onBlur={() => setTouched(t => ({ ...t, city: true }))} placeholder="City *"
                  style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: `1.5px solid ${touched.city && !form.city.trim() ? '#ef4444' : '#e5e5e5'}`, background: '#fafafa', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box', color: '#111' }} />
              </>
            ) : (
              stores.length > 0 && stores.map(s => (
                <button key={s.id} onClick={() => setSelectedStoreId(s.id)}
                  style={{ width: '100%', textAlign: 'left', padding: '14px 16px', borderRadius: 12, marginBottom: 10, border: `2px solid ${selectedStoreId === s.id ? '#c0201f' : '#e5e5e5'}`, background: selectedStoreId === s.id ? 'rgba(192,32,31,0.04)' : '#fafafa', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div><div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#111' }}>{s.name}</div><div style={{ fontSize: '0.78rem', color: '#888', marginTop: 3 }}>{s.address}</div></div>
                  {selectedStoreId === s.id && <CheckCircle size={18} color="#c0201f" />}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Contact Info */}
        <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: 14 }}>
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

        {/* Coupon */}
        <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: 14 }}>
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
                  <span style={{ fontSize: '0.82rem', color: '#555' }}>−{fmt(couponDiscount)}</span>
                </div>
                <button onClick={removeCoupon} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', display: 'flex', padding: 2 }}><X size={16} /></button>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input value={couponCode} onChange={e => { setCouponCode(e.target.value.toUpperCase()); setCouponError(''); }} onKeyDown={e => e.key === 'Enter' && applyCoupon()} placeholder="Discount code"
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


        {/* Price Summary */}
        <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: 14 }}>
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
              <span style={{ fontWeight: 900, fontSize: '1rem', color: '#c0201f' }}>{activeMethod === 'paystack' ? 'Pay now (card)' : 'Pay now (transfer)'}</span>
              <span style={{ fontWeight: 900, fontSize: '1.1rem', color: '#c0201f' }}>{fmt(amountToPayNow)}</span>
            </div>
          </div>
        </div>

        {/* Payment method selector (only when Paystack is enabled) */}
        {paystackEnabled && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
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

        {/* Bank Transfer Payment */}
        {activeMethod === 'transfer' && (
        <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: 14, border: '1.5px solid rgba(192,32,31,0.12)' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Banknote size={16} color="#c0201f" />
            <span style={{ fontWeight: 800, fontSize: '0.9rem', color: '#111' }}>Bank Transfer</span>
          </div>
          <div style={{ padding: '14px 16px' }}>
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
          const disabled = processing || (activeMethod === 'transfer' && (!transferConfirmed || !transferName.trim()));
          return (
        <button
          onClick={() => (activeMethod === 'paystack' ? handlePaystack() : handleBankTransfer())}
          disabled={disabled}
          style={{ width: '100%', padding: '16px', borderRadius: 14, background: disabled ? 'rgba(192,32,31,0.45)' : '#c0201f', color: '#fff', border: 'none', fontWeight: 900, fontSize: '1rem', cursor: disabled ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, letterSpacing: '-0.01em', transition: 'background 0.2s' }}>
          {processing ? <><Loader2 size={18} className="spin" /> Processing…</> : (
            activeMethod === 'paystack'
              ? <><Send size={18} /> Pay {fmt(amountToPayNow)} Securely →</>
              : <><Send size={18} /> Complete Order · Pay {fmt(amountToPayNow)}</>
          )}
        </button>
          );
        })()}

      </div>

      <DisclaimerModal isOpen={showDisclaimerModal} onAgree={() => { setDisclaimerAgreed(true); setShowDisclaimerModal(false); }} />
      <CutoffModal
        isOpen={showCutoffModal}
        isPickup={deliveryType === 'pickup'}
        onAgree={() => { setCutoffAck(true); setShowCutoffModal(false); (activeMethod === 'paystack' ? handlePaystack : handleBankTransfer)(true); }}
        onClose={() => setShowCutoffModal(false)}
      />
    </div>

      {/* Success overlay */}
      {successData && (
        <div className="cart-overlay open" onClick={() => setSuccessData(null)} />
      )}

      {/* Success drawer */}
      <div
        className={`dash-drawer checkout-drawer-premium ${successData ? 'open' : ''}`}
        style={{ width: '100%', maxWidth: 480, display: 'flex', flexDirection: 'column', boxShadow: successData ? '-12px 0 48px rgba(0,0,0,0.1)' : 'none' }}
      >
        <div className="dash-drawer-header" style={{ padding: '24px 28px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--white)' }}>
          <span style={{ fontWeight: 800, fontSize: '1.2rem', color: 'var(--text)' }}>Order</span>
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
                  Your order has been saved and will be processed shortly.
                </p>
              </div>

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

              <div style={{ padding: '16px', background: 'var(--white)', border: '1px solid var(--border-subtle)', borderRadius: 12, marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Items</span>
                  <span style={{ fontWeight: 600, color: 'var(--text)' }}>{successData.itemCount}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Delivery to</span>
                  <span style={{ fontWeight: 600, color: 'var(--text)', textAlign: 'right' }}>{successData.deliveryLine}</span>
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
            </>
          )}
        </div>

        <div className="dash-drawer-footer" style={{ padding: '0 28px 28px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button
            onClick={() => window.location.href = '/shop'}
            style={{ width: '100%', padding: '16px', borderRadius: 12, background: '#c0201f', color: '#fff', border: 'none', fontWeight: 800, fontSize: '1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            Done — Back to Shop
          </button>
        </div>
      </div>
    </>
  );
}

function DisclaimerModal({ isOpen, onAgree }) {
  if (!isOpen) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
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
          style={{ width: '100%', padding: 14, borderRadius: 12, background: '#c0201f', color: '#fff', border: 'none', fontWeight: 800, fontSize: '1rem', cursor: 'pointer' }}
        >
          I Agree
        </button>
      </div>
    </div>
  );
}

function CutoffModal({ isOpen, isPickup, onAgree, onClose }) {
  if (!isOpen) return null;
  const when = isPickup ? 'ready for pickup tomorrow' : 'delivered tomorrow';
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 20, padding: 24, maxWidth: 400, width: '100%', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#fffbeb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: '1.5rem' }}>⏰</span>
          </div>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#92400e' }}>{isPickup ? 'Next-Day Pickup Notice' : 'Next-Day Delivery Notice'}</h3>
        </div>
        <p style={{ fontSize: '0.9rem', color: '#555', lineHeight: 1.6, marginBottom: 24 }}>
          Your order includes an item that has passed today's order cutoff. It will be <strong>{when}</strong>, not today. Do you want to continue?
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 14, borderRadius: 12, background: '#f3f4f6', color: '#111', border: 'none', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer' }}>
            Go Back
          </button>
          <button onClick={onAgree} style={{ flex: 1, padding: 14, borderRadius: 12, background: '#c0201f', color: '#fff', border: 'none', fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer' }}>
            I Understand
          </button>
        </div>
      </div>
    </div>
  );
}
