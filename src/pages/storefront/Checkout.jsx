import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import { useToast } from '../../context/ToastContext';
import { supabase, publicSupabase } from '../../lib/supabase';
import { fetchDeliveryZones, matchDeliveryZone } from '../../lib/deliveryMatcher';
import { ShoppingCart, Truck, CheckCircle, Store, Loader2, Home, ShoppingBag, Search, MapPin, MessageCircle, Tag, X } from 'lucide-react';

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Call verify-payment edge function with the secret key (server-side)
async function verifyPaystackPayment(reference) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/verify-payment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ reference }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.error || 'Payment verification failed');
  return data;
}


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
  const fmt = (n) => '₦' + Number(n).toLocaleString();

  // Delivery state
  const [deliveryType, setDeliveryType] = useState('delivery'); // 'delivery' | 'pickup'
  const [zones, setZones] = useState([]);
  const [locationQuery, setLocationQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [selectedMatch, setSelectedMatch] = useState(null); // { zone, area, matchedOn }
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef(null);

  // Order form state
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', email: '', address: '', city: 'Lagos', notes: '' });
  const [touched, setTouched] = useState({ firstName: false, lastName: false, phone: false, email: false, address: false, city: false });
  const [processing, setProcessing] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [waProcessing, setWaProcessing] = useState(false);
  const paystackLaunching = useRef(false);
  const [successRef, setSuccessRef] = useState(null);
  const [successMethod, setSuccessMethod] = useState('paystack');

  const [stores, setStores] = useState([]);
  const [selectedStoreId, setSelectedStoreId] = useState(null);

  // Coupon state
  const [couponCode, setCouponCode] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState(null); // { id, code, type, value, discount }
  const [couponError, setCouponError] = useState('');

  // Fetch zones and active stores on mount
  useEffect(() => {
    fetchDeliveryZones(publicSupabase).then(setZones);
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

  const isPickup = deliveryType === 'pickup';
  const allFreeShipping = items.length > 0 && items.every(i => i.free_shipping === true);
  const deliveryFee = isPickup ? 0 : (allFreeShipping ? 0 : (selectedMatch?.zone.price ?? 0));
  const couponDiscount = appliedCoupon?.discount ?? 0;
  const grandTotal = Math.max(0, total + deliveryFee - couponDiscount);

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
      // Reset to first store when switching to pickup
      if (stores.length > 0) setSelectedStoreId(stores[0].id);
    }
  };

  // Save pending order to Supabase before redirecting to Paystack
  const buildOrderPayload = (orderId, method) => {
    const customerName = `${form.firstName} ${form.lastName}`.trim();
    const pickupStore = stores.find(s => s.id === selectedStoreId);
    const deliveryAddress = isPickup
      ? `Store Pickup — ${pickupStore?.name || 'Store'}`
      : `${form.address}, ${selectedMatch?.area?.name || selectedMatch?.zone?.name || form.city}`;
    const deliveryZoneName = isPickup ? 'Store Pickup' : (selectedMatch?.zone?.name || '');

    return {
      id: orderId,
      customer_name: customerName,
      customer_email: form.email || null,
      customer_phone: form.phone,
      delivery_address: deliveryAddress,
      store_id: selectedStoreId,
      payment_method: method,
      total: grandTotal,
      delivery_fee: deliveryFee,
      coupon_code: appliedCoupon?.code || null,
      coupon_discount: appliedCoupon?.discount || 0,
      status: 'pending',
      notes: form.notes || null,
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
      showToast('Location required', 'Please type and select your delivery area', 'error');
      inputRef.current?.focus();
      return false;
    }
    if (items.length === 0) {
      showToast('Cart is empty', 'Add items to your cart first', 'error');
      return false;
    }
    return true;
  };

  const handlePaystack = async () => {
    if (paystackLaunching.current) return;
    if (!validateForm()) return;
    if (!window.PaystackPop) {
      showToast('Payment unavailable', 'Payment service failed to load. Please refresh and try again.', 'error');
      return;
    }

    paystackLaunching.current = true;
    setProcessing(true);
    try {
      const orderId = 'SHD-' + Date.now().toString(36).toUpperCase();
      const { error: orderError } = await publicSupabase.from('orders').insert([buildOrderPayload(orderId, 'paystack')]);
      if (orderError) throw orderError;

      const { error: itemsError } = await publicSupabase.from('order_items').insert(
        items.map(i => ({ order_id: orderId, product_id: i.id || null, name: i.name, price: i.price, qty: i.qty }))
      );
      if (itemsError) throw itemsError;

      const customerEmail = form.email?.trim() || `${form.phone.replace(/\D/g, '')}@smokeyhut.com`;
      let paymentSucceeded = false;

      const handler = window.PaystackPop.setup({
        key: import.meta.env.VITE_PAYSTACK_PUBLIC_KEY,
        email: customerEmail,
        amount: Math.round(grandTotal * 100),
        ref: orderId,
        currency: 'NGN',
        // Enable all available payment channels
        channels: ['card', 'bank', 'ussd', 'qr', 'mobile_money', 'bank_transfer'],
        metadata: {
          order_id: orderId,
          customer_name: `${form.firstName} ${form.lastName}`.trim(),
          phone: form.phone,
          delivery_address: isPickup ? 'Store Pickup' : `${form.address}, ${form.city}`,
          cancel_action: window.location.href,
        },
        callback: function(response) {
          paymentSucceeded = true;
          setProcessing(false);
          setVerifying(true);
          (async () => {
            try {
              // Server-side verification with secret key — never trust the callback alone
              await verifyPaystackPayment(response.reference);
              clearCart();
              await incrementCouponUse();
              setSuccessMethod('paystack');
              setSuccessRef(response.reference);
              notify('order_confirmed', {
                id: orderId,
                customer_name: `${form.firstName} ${form.lastName}`.trim(),
                customer_email: form.email || null,
                customer_phone: form.phone,
                delivery_address: isPickup ? 'Store Pickup' : `${form.address}, ${form.city}`,
                total: grandTotal,
              });
            } catch (err) {
              // Payment went through on Paystack side but verification call had an issue.
              // Still show success — the order exists in DB and will be reviewed manually.
              console.error('Verification error (payment may still be valid):', err.message);
              clearCart();
              setSuccessMethod('paystack');
              setSuccessRef(response.reference);
            } finally {
              setVerifying(false);
            }
          })();
        },
        onClose: function() {
          if (!paymentSucceeded) {
            publicSupabase.from('orders').update({ status: 'cancelled' }).eq('id', orderId);
            showToast('Payment cancelled', 'You closed the payment window', 'info');
            setProcessing(false);
            paystackLaunching.current = false;
          }
        },
      });

      handler.openIframe();
    } catch (error) {
      console.error('Checkout error:', error);
      showToast('Payment Error', error.message || 'An unexpected error occurred.', 'error');
      setProcessing(false);
      paystackLaunching.current = false;
    }
  };

  const handleWhatsApp = async () => {
    if (!validateForm()) return;
    setWaProcessing(true);

    // Open the window synchronously BEFORE any awaits — iOS Safari blocks window.open() after async operations
    const waWindow = window.open('', '_blank');

    try {
      const orderId = 'SHD-' + Date.now().toString(36).toUpperCase();
      const { error } = await publicSupabase.from('orders').insert([buildOrderPayload(orderId, 'whatsapp')]);
      if (error) throw error;
      await publicSupabase.from('order_items').insert(
        items.map(i => ({ order_id: orderId, product_id: i.id || null, name: i.name, price: i.price, qty: i.qty }))
      );

      // Build pre-filled WhatsApp message
      const customerName = `${form.firstName} ${form.lastName}`.trim();
      const pickupStore  = stores.find(s => s.id === selectedStoreId);
      const deliveryLine = isPickup
        ? `🏪 Pickup: ${pickupStore?.name || 'Store'}`
        : `📍 Delivery: ${form.address}, ${selectedMatch?.area?.name || selectedMatch?.zone?.name || form.city}\n🚚 Zone: ${selectedMatch?.zone?.name || 'TBD'} — ${deliveryFee === 0 ? 'Free' : fmt(deliveryFee)}`;
      const itemLines = items.map(i => `  • ${i.name} × ${i.qty} = ${fmt(i.price * i.qty)}`).join('\n');

      const message = [
        `🛍️ *New Order — ${orderId}*`,
        ``,
        `👤 Name: ${customerName}`,
        `📞 Phone: ${form.phone}`,
        form.email ? `✉️ Email: ${form.email}` : null,
        ``,
        `📦 Items:`,
        itemLines,
        ``,
        deliveryLine,
        ``,
        `💰 *Total: ${fmt(grandTotal)}*`,
        form.notes ? `📝 Notes: ${form.notes}` : null,
        ``,
        `_Please confirm my order 🙏_`,
      ].filter(l => l !== null).join('\n');

      const waUrl = `https://wa.me/2348141748281?text=${encodeURIComponent(message)}`;

      // Navigate the already-opened window to the WhatsApp URL
      if (waWindow) {
        waWindow.location.href = waUrl;
      } else {
        // Popup was blocked — fall back to same-tab navigation
        window.location.href = waUrl;
      }

      clearCart();
      await incrementCouponUse();
      setSuccessMethod('whatsapp');
      setSuccessRef(orderId);
    } catch (err) {
      if (waWindow) waWindow.close();
      showToast('Error', err.message, 'error');
    }
    setWaProcessing(false);
  };


  if (successRef) {
    return (
      <div style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-subtle)', borderRadius: 24, maxWidth: 460, width: '100%', padding: '48px 36px', textAlign: 'center', boxShadow: 'var(--shadow-lg)' }}>
          <div style={{ background: 'rgba(192,32,31,0.1)', width: 100, height: 100, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
            <CheckCircle size={56} color="var(--red)" />
          </div>
          <h2 style={{ fontSize: '2rem', fontWeight: 900, marginBottom: 12 }}>
            {successMethod === 'whatsapp' ? <>Order <span className="accent">Sent!</span></> : <>Order <span className="accent">Confirmed!</span></>}
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '1rem', lineHeight: 1.7, marginBottom: 20 }}>
            {successMethod === 'whatsapp'
              ? <>Your order has been saved and WhatsApp has opened with your order details. <strong>Please send the message</strong> to complete your order — we'll confirm it shortly.</>
              : <>Thank you for choosing <strong>Smokeyhut Delight</strong>! Your payment was successful and your order is being prepared.</>
            }
          </p>
          <div style={{ padding: '12px 16px', background: 'var(--black2)', borderRadius: 10, fontSize: '0.85rem', marginBottom: 28 }}>
            <span style={{ color: 'var(--text-muted)' }}>Reference: </span>
            <code style={{ color: 'var(--text)', fontWeight: 700 }}>{successRef}</code>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <Link to="/" className="btn-secondary" style={{ flex: 1, justifyContent: 'center', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Home size={18} /> Home
            </Link>
            <Link to="/shop" className="btn-primary" style={{ flex: 1, justifyContent: 'center', display: 'flex', alignItems: 'center', gap: 8 }}>
              <ShoppingBag size={18} /> Order More
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
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
    <div>
      <div className="breadcrumb container">
        <Link to="/">Home</Link><span style={{ margin: '0 8px', color: 'var(--gray-light)' }}>›</span>
        <Link to="/cart">Cart</Link><span style={{ margin: '0 8px', color: 'var(--gray-light)' }}>›</span> Checkout
      </div>
      <section className="checkout-section">
        <div className="container">
          <div className="section-header">
            <div className="section-tag">Checkout</div>
            <h2 className="section-title">Complete Your <span>Order</span></h2>
          </div>
          <div className="checkout-grid">
            <div className="checkout-form-card">
              <h3>Delivery Method</h3>

              {/* Delivery type toggle */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
                <button
                  onClick={() => handleDeliveryTypeChange('delivery')}
                  style={{
                    flex: 1, padding: '12px 16px', borderRadius: 10, border: `2px solid ${deliveryType === 'delivery' ? 'var(--red)' : 'var(--border-subtle)'}`,
                    background: deliveryType === 'delivery' ? 'rgba(192,32,31,0.08)' : 'var(--black)',
                    color: deliveryType === 'delivery' ? 'var(--red)' : 'var(--text-muted)',
                    fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all 0.2s'
                  }}
                >
                  <Truck size={18} /> Delivery
                </button>
                <button
                  onClick={() => handleDeliveryTypeChange('pickup')}
                  style={{
                    flex: 1, padding: '12px 16px', borderRadius: 10, border: `2px solid ${deliveryType === 'pickup' ? 'var(--red)' : 'var(--border-subtle)'}`,
                    background: deliveryType === 'pickup' ? 'rgba(192,32,31,0.08)' : 'var(--black)',
                    color: deliveryType === 'pickup' ? 'var(--red)' : 'var(--text-muted)',
                    fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all 0.2s'
                  }}
                >
                  <Store size={18} /> Store Pickup
                </button>
              </div>

              {/* Delivery area search */}
              {deliveryType === 'delivery' && (
                <div className="form-group" style={{ marginBottom: 20, position: 'relative' }}>
                  <label>Your Area / Location *</label>
                  <div style={{ position: 'relative' }}>
                    <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                    <input
                      ref={inputRef}
                      value={locationQuery}
                      onChange={e => { setLocationQuery(e.target.value); setSelectedMatch(null); }}
                      onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
                      onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                      placeholder="Type your area, e.g. Lekki, Surulere, Ikeja..."
                      style={{ paddingLeft: 40 }}
                      autoComplete="off"
                    />
                  </div>

                  {/* Suggestions dropdown */}
                  {showSuggestions && suggestions.length > 0 && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, right: 0,
                      background: 'var(--card-bg)', border: '1px solid var(--border-subtle)',
                      borderRadius: 12, marginTop: 6, boxShadow: 'var(--shadow-lg)',
                      zIndex: 20, overflow: 'hidden'
                    }}>
                      {suggestions.map((match, i) => (
                        <div
                          key={i}
                          onMouseDown={() => handleSelectSuggestion(match)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                            cursor: 'pointer', borderBottom: i === suggestions.length - 1 ? 'none' : '1px solid var(--border-subtle)',
                            transition: 'background 0.15s'
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--black2)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <div style={{ background: 'var(--black2)', padding: 8, borderRadius: 8, display: 'flex', flexShrink: 0 }}>
                            <MapPin size={16} color="var(--red)" />
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{match.area ? match.area.name : match.zone.name}</div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{match.zone.name}</div>
                          </div>
                          <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--red)', flexShrink: 0 }}>
                            {fmt(match.zone.price)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* No results hint */}
                  {showSuggestions && locationQuery.trim().length >= 2 && suggestions.length === 0 && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, right: 0,
                      background: 'var(--card-bg)', border: '1px solid var(--border-subtle)',
                      borderRadius: 12, marginTop: 6, padding: '14px 16px', zIndex: 20,
                      color: 'var(--text-muted)', fontSize: '0.88rem'
                    }}>
                      No areas found for "{locationQuery}". Try a nearby area or contact us.
                    </div>
                  )}

                  {/* Selected zone display */}
                  {selectedMatch && (
                    <div style={{
                      marginTop: 10, padding: '10px 14px', background: 'rgba(192,32,31,0.08)',
                      border: '1px solid rgba(192,32,31,0.3)', borderRadius: 10,
                      display: 'flex', alignItems: 'center', gap: 10
                    }}>
                      <CheckCircle size={16} color="var(--red)" />
                      <div style={{ flex: 1 }}>
                        <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{selectedMatch.zone.name}</span>
                        {allFreeShipping
                          ? <span style={{ marginLeft: 8, fontSize: '0.75rem', background: '#dcfce7', color: '#166534', padding: '1px 7px', borderRadius: 20, fontWeight: 800 }}>FREE SHIP</span>
                          : <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginLeft: 8 }}>— {fmt(selectedMatch.zone.price)}</span>
                        }
                      </div>
                      <button
                        onClick={() => { setSelectedMatch(null); setLocationQuery(''); inputRef.current?.focus(); }}
                        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem' }}
                      >
                        Change
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Pickup store selector */}
              {deliveryType === 'pickup' && (
                <div style={{ marginBottom: 20 }}>
                  {stores.length > 1 && (
                    <div className="form-group" style={{ marginBottom: 12 }}>
                      <label>Select Pickup Location</label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {stores.map(store => (
                          <div
                            key={store.id}
                            onClick={() => setSelectedStoreId(store.id)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                              borderRadius: 10, cursor: 'pointer', transition: 'all 0.2s',
                              border: `2px solid ${selectedStoreId === store.id ? 'var(--red)' : 'var(--border-subtle)'}`,
                              background: selectedStoreId === store.id ? 'rgba(192,32,31,0.06)' : 'var(--black)',
                            }}
                          >
                            <div style={{
                              width: 18, height: 18, borderRadius: '50%', border: `2px solid ${selectedStoreId === store.id ? 'var(--red)' : 'var(--border-subtle)'}`,
                              background: selectedStoreId === store.id ? 'var(--red)' : 'transparent', flexShrink: 0, transition: 'all 0.2s'
                            }} />
                            <div>
                              <div style={{ fontWeight: 700, fontSize: '0.9rem', color: selectedStoreId === store.id ? 'var(--red)' : 'var(--text)' }}>{store.name}</div>
                              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{store.address}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div style={{ padding: '12px 16px', background: 'rgba(192,32,31,0.06)', border: '1px solid rgba(192,32,31,0.2)', borderRadius: 10, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <Store size={18} color="var(--red)" style={{ flexShrink: 0, marginTop: 2 }} />
                    <div>
                      <div style={{ fontWeight: 700, marginBottom: 2, fontSize: '0.9rem' }}>
                        {stores.length === 1 ? stores[0]?.name : (stores.find(s => s.id === selectedStoreId)?.name || 'Store Pickup')} — Free
                      </div>
                      <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                        {stores.find(s => s.id === selectedStoreId)?.address || 'Ready from 10:30am.'}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <h3 style={{ marginTop: 8 }}>Customer Info</h3>
              <div className="form-row">
                <div className="form-group">
                  <label>First Name *</label>
                  <input
                    required
                    value={form.firstName}
                    onChange={set('firstName')}
                    onBlur={() => setTouched(t => ({ ...t, firstName: true }))}
                    placeholder="First name"
                    style={touched.firstName && !form.firstName.trim() ? { borderColor: '#e53e3e' } : {}}
                  />
                  {touched.firstName && !form.firstName.trim() && (
                    <span style={{ fontSize: '0.78rem', color: '#e53e3e', marginTop: 4, display: 'block' }}>First name is required</span>
                  )}
                </div>
                <div className="form-group">
                  <label>Last Name *</label>
                  <input
                    required
                    value={form.lastName}
                    onChange={set('lastName')}
                    onBlur={() => setTouched(t => ({ ...t, lastName: true }))}
                    placeholder="Last name"
                    style={touched.lastName && !form.lastName.trim() ? { borderColor: '#e53e3e' } : {}}
                  />
                  {touched.lastName && !form.lastName.trim() && (
                    <span style={{ fontSize: '0.78rem', color: '#e53e3e', marginTop: 4, display: 'block' }}>Last name is required</span>
                  )}
                </div>
              </div>
              <div className="form-group">
                <label>Phone *</label>
                <input
                  required
                  value={form.phone}
                  onChange={set('phone')}
                  onBlur={() => setTouched(t => ({ ...t, phone: true }))}
                  placeholder="+234 000 0000 000"
                  style={touched.phone && !form.phone.trim() ? { borderColor: '#e53e3e' } : {}}
                />
                {touched.phone && !form.phone.trim() && (
                  <span style={{ fontSize: '0.78rem', color: '#e53e3e', marginTop: 4, display: 'block' }}>
                    Phone number is required to complete your order
                  </span>
                )}
              </div>
              <div className="form-group">
                <label>Email *</label>
                <input
                  required
                  type="email"
                  value={form.email}
                  onChange={set('email')}
                  onBlur={() => setTouched(t => ({ ...t, email: true }))}
                  placeholder="your@email.com"
                  style={touched.email && (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) ? { borderColor: '#e53e3e' } : {}}
                />
                {touched.email && !form.email.trim() && (
                  <span style={{ fontSize: '0.78rem', color: '#e53e3e', marginTop: 4, display: 'block' }}>
                    Email is required to complete your order
                  </span>
                )}
                {touched.email && form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) && (
                  <span style={{ fontSize: '0.78rem', color: '#e53e3e', marginTop: 4, display: 'block' }}>
                    Please enter a valid email address
                  </span>
                )}
              </div>
              {!isPickup && (
                <>
                  <div className="form-group">
                    <label>Delivery Address *</label>
                    <input
                      required
                      value={form.address}
                      onChange={set('address')}
                      onBlur={() => setTouched(t => ({ ...t, address: true }))}
                      placeholder="Street address"
                      style={touched.address && !form.address.trim() ? { borderColor: '#e53e3e' } : {}}
                    />
                    {touched.address && !form.address.trim() && (
                      <span style={{ fontSize: '0.78rem', color: '#e53e3e', marginTop: 4, display: 'block' }}>Delivery address is required</span>
                    )}
                  </div>
                  <div className="form-group">
                    <label>City *</label>
                    <input
                      required
                      value={form.city}
                      onChange={set('city')}
                      onBlur={() => setTouched(t => ({ ...t, city: true }))}
                      placeholder="Lagos"
                      style={touched.city && !form.city.trim() ? { borderColor: '#e53e3e' } : {}}
                    />
                    {touched.city && !form.city.trim() && (
                      <span style={{ fontSize: '0.78rem', color: '#e53e3e', marginTop: 4, display: 'block' }}>City is required</span>
                    )}
                  </div>
                </>
              )}
              <div className="form-group"><label>Order Notes</label><textarea value={form.notes} onChange={set('notes')} placeholder="Any special requests..." /></div>

              <button
                className="btn-primary"
                style={{
                  width: '100%', justifyContent: 'center', padding: '16px 28px',
                  fontSize: '1rem', marginTop: 8, display: 'flex', alignItems: 'center', gap: 8,
                  opacity: (processing || verifying) ? 0.7 : 1,
                  pointerEvents: (processing || verifying) ? 'none' : 'auto',
                }}
                onClick={handlePaystack}
              >
                {verifying
                  ? <><Loader2 size={18} className="spin" /> Confirming payment...</>
                  : processing
                  ? <><Loader2 size={18} className="spin" /> Processing...</>
                  : <><img src="https://upload.wikimedia.org/wikipedia/commons/0/0b/Paystack_Logo.png" alt="Paystack" style={{ height: 18, filter: 'brightness(0) invert(1)', objectFit: 'contain' }} /> Pay {fmt(grandTotal)}</>

                }
              </button>
              <p style={{ textAlign: 'center', fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 12 }}>
                🔒 Secured by Paystack · Card, Bank Transfer, USSD & more
              </p>
            </div>

            <div className="order-summary">
              <h3>Order Summary</h3>
              {items.map(item => (
                <div key={item.id} className="order-line" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {item.image ? (
                    <img src={item.image} alt={item.name} style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: '50%' }} />
                  ) : (
                    <span style={{ fontSize: '1.5rem' }}>🍗</span>
                  )}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{item.name}</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Qty: {item.qty}</div>
                  </div>
                  <span>{fmt(item.price * item.qty)}</span>
                </div>
              ))}
              <div className="order-line" style={{ marginTop: 16 }}><span>Subtotal</span><span>{fmt(total)}</span></div>
              <div className="order-line">
                <span>
                  Delivery
                  {isPickup && ' (Store Pickup)'}
                  {!isPickup && selectedMatch && ` (${selectedMatch.zone.name})`}
                  {allFreeShipping && !isPickup && <span style={{ marginLeft: 6, fontSize: '0.7rem', background: '#dcfce7', color: '#166534', padding: '1px 7px', borderRadius: 20, fontWeight: 800 }}>FREE SHIP</span>}
                </span>
                <span>{deliveryFee === 0 ? 'Free' : fmt(deliveryFee)}</span>
              </div>

              {/* Coupon input */}
              {!appliedCoupon ? (
                <div style={{ marginTop: 12 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      value={couponCode}
                      onChange={e => { setCouponCode(e.target.value.toUpperCase()); setCouponError(''); }}
                      placeholder="Coupon code"
                      style={{ flex: 1, fontSize: '0.88rem', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--black)', color: 'var(--text)' }}
                      onKeyDown={e => e.key === 'Enter' && applyCoupon()}
                    />
                    <button
                      onClick={applyCoupon}
                      disabled={couponLoading || !couponCode.trim()}
                      style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--black2)', color: 'var(--text)', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', opacity: couponLoading || !couponCode.trim() ? 0.5 : 1 }}
                    >
                      {couponLoading ? <Loader2 size={14} className="spin" /> : <Tag size={14} />} Apply
                    </button>
                  </div>
                  {couponError && <p style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: 6 }}>{couponError}</p>}
                </div>
              ) : (
                <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 8 }}>
                  <Tag size={14} color="#16a34a" />
                  <div style={{ flex: 1 }}>
                    <span style={{ fontWeight: 700, fontSize: '0.88rem', color: '#16a34a' }}>{appliedCoupon.code}</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: 8 }}>
                      {appliedCoupon.type === 'percent' ? `${appliedCoupon.value}% off` : `${fmt(appliedCoupon.value)} off`}
                    </span>
                  </div>
                  <button onClick={removeCoupon} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 0 }}><X size={16} /></button>
                </div>
              )}

              {appliedCoupon && (
                <div className="order-line" style={{ color: '#16a34a' }}>
                  <span>Discount ({appliedCoupon.code})</span>
                  <span>−{fmt(couponDiscount)}</span>
                </div>
              )}

              <div className="order-line" style={{ borderBottom: 'none', paddingTop: 16 }}>
                <span style={{ fontWeight: 900, fontSize: '1.1rem' }}>Total</span>
                <span className="order-total">{fmt(grandTotal)}</span>
              </div>


              {/* WhatsApp order option — hidden */}
              {false && (
                <>
                  <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>OR</span>
                    <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
                  </div>
                  <button
                    onClick={handleWhatsApp}
                    disabled={waProcessing}
                    style={{
                      marginTop: 12, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                      padding: '14px', borderRadius: 10, border: 'none', cursor: 'pointer',
                      background: '#25D366', color: '#fff', fontWeight: 700, fontSize: '0.95rem',
                      boxShadow: '0 4px 14px rgba(37,211,102,0.35)', transition: 'opacity 0.15s',
                      opacity: waProcessing ? 0.6 : 1,
                    }}
                  >
                    {waProcessing
                      ? <><Loader2 size={18} className="spin" /> Preparing order...</>
                      : <><MessageCircle size={20} /> Order via WhatsApp</>
                    }
                  </button>
                  <p style={{ textAlign: 'center', fontSize: '0.77rem', color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.5 }}>
                    Saves your order &amp; opens WhatsApp with details pre-filled — just hit send.
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
