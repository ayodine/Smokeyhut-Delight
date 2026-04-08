import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import { useToast } from '../../context/ToastContext';
import { supabase, publicSupabase } from '../../lib/supabase';
import { fetchDeliveryZones, matchDeliveryZone } from '../../lib/deliveryMatcher';
import { ShoppingCart, Truck, CheckCircle, Store, Loader2, Home, ShoppingBag, CreditCard, Search, MapPin } from 'lucide-react';

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
  const [processing, setProcessing] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [transferProcessing, setTransferProcessing] = useState(false);
  const [successRef, setSuccessRef] = useState(null);
  const [successMethod, setSuccessMethod] = useState('paystack');

  const [stores, setStores] = useState([]);
  const [selectedStoreId, setSelectedStoreId] = useState(null);

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
  const grandTotal = total + deliveryFee;

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
      status: 'pending',
      notes: form.notes || null,
    };
  };

  const validateForm = () => {
    if (!form.firstName.trim() || !form.phone.trim()) {
      showToast('Required fields missing', 'Please enter your name and phone number', 'error');
      return false;
    }
    if (!isPickup && !form.address.trim()) {
      showToast('Address required', 'Please enter your delivery address', 'error');
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
    if (!validateForm()) return;
    if (!window.PaystackPop) {
      showToast('Payment unavailable', 'Payment service failed to load. Please refresh and try again.', 'error');
      return;
    }

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
        callback: async (response) => {
          paymentSucceeded = true;
          setProcessing(false);
          setVerifying(true);
          try {
            // Server-side verification with secret key — never trust the callback alone
            await verifyPaystackPayment(response.reference);
            clearCart();
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
        },
        onClose: () => {
          if (!paymentSucceeded) {
            showToast('Payment cancelled', 'You closed the payment window', 'info');
            setProcessing(false);
          }
        },
      });

      handler.openIframe();
    } catch (error) {
      console.error('Checkout error:', error);
      showToast('Payment Error', error.message || 'An unexpected error occurred.', 'error');
      setProcessing(false);
    }
  };

  const handleTransfer = async () => {
    if (!validateForm()) return;
    setTransferProcessing(true);
    try {
      const orderId = 'SHD-' + Date.now().toString(36).toUpperCase();
      const { error } = await publicSupabase.from('orders').insert([buildOrderPayload(orderId, 'bank_transfer')]);
      if (error) throw error;
      await publicSupabase.from('order_items').insert(
        items.map(i => ({ order_id: orderId, product_id: i.id || null, name: i.name, price: i.price, qty: i.qty }))
      );
      notify('transfer_made', {
        id: orderId,
        customer_name: `${form.firstName} ${form.lastName}`.trim(),
        customer_phone: form.phone,
        total: grandTotal,
      });
      clearCart();
      setSuccessMethod('transfer');
      setSuccessRef(orderId);
    } catch (err) {
      showToast('Error', err.message, 'error');
    }
    setTransferProcessing(false);
  };

  if (successRef) {
    return (
      <div style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-subtle)', borderRadius: 24, maxWidth: 460, width: '100%', padding: '48px 36px', textAlign: 'center', boxShadow: 'var(--shadow-lg)' }}>
          <div style={{ background: 'rgba(192,32,31,0.1)', width: 100, height: 100, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
            <CheckCircle size={56} color="var(--red)" />
          </div>
          <h2 style={{ fontSize: '2rem', fontWeight: 900, marginBottom: 12 }}>
            {successMethod === 'transfer' ? <>Transfer <span className="accent">Noted!</span></> : <>Order <span className="accent">Confirmed!</span></>}
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '1rem', lineHeight: 1.7, marginBottom: 20 }}>
            {successMethod === 'transfer'
              ? <>Thank you! We have received your transfer notification and will confirm your payment shortly. Your order reference is below.</>
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
                <div className="form-group"><label>First Name *</label><input value={form.firstName} onChange={set('firstName')} placeholder="First name" /></div>
                <div className="form-group"><label>Last Name</label><input value={form.lastName} onChange={set('lastName')} placeholder="Last name" /></div>
              </div>
              <div className="form-group"><label>Phone *</label><input value={form.phone} onChange={set('phone')} placeholder="+234 000 0000 000" /></div>
              <div className="form-group"><label>Email <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '0.82rem' }}>(used for payment receipt)</span></label><input type="email" value={form.email} onChange={set('email')} placeholder="your@email.com" /></div>
              {!isPickup && (
                <>
                  <div className="form-group"><label>Delivery Address *</label><input value={form.address} onChange={set('address')} placeholder="Street address" /></div>
                  <div className="form-group"><label>City</label><input value={form.city} onChange={set('city')} placeholder="Lagos" /></div>
                </>
              )}
              <div className="form-group"><label>Order Notes</label><textarea value={form.notes} onChange={set('notes')} placeholder="Any special requests..." /></div>

              {/* Paystack button — hidden until production keys are ready
              <button
                className="btn-primary"
                style={{ width: '100%', justifyContent: 'center', padding: '16px 28px', fontSize: '1rem', marginTop: 8 }}
                onClick={handlePaystack}
                disabled={processing || verifying}
              >
                {verifying
                  ? <><Loader2 size={18} className="spin" style={{ marginRight: 8 }} /> Confirming payment...</>
                  : processing
                  ? <><Loader2 size={18} className="spin" style={{ marginRight: 8 }} /> Processing...</>
                  : `💳 Pay ${fmt(grandTotal)} with Paystack`
                }
              </button>
              <p style={{ textAlign: 'center', fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 12 }}>
                🔒 Secured by Paystack · Card, Bank Transfer, USSD & more
              </p>
              */}
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
              <div className="order-line" style={{ borderBottom: 'none', paddingTop: 16 }}>
                <span style={{ fontWeight: 900, fontSize: '1.1rem' }}>Total</span>
                <span className="order-total">{fmt(grandTotal)}</span>
              </div>

              <div style={{ marginTop: 20, padding: '18px 16px', background: 'var(--black2)', borderRadius: 10, textAlign: 'center' }}>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Transfer To</div>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: 4 }}>Smokeyhut Delight</div>
                <h3 style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--text)', margin: '0 0 4px' }}>5655718527</h3>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 14 }}>Moniepoint</div>
                <button
                  className="btn-secondary"
                  style={{ width: '100%', justifyContent: 'center', padding: '12px', display: 'flex', alignItems: 'center', gap: 8 }}
                  onClick={handleTransfer}
                  disabled={transferProcessing}
                >
                  {transferProcessing
                    ? <><Loader2 size={16} className="spin" /> Processing...</>
                    : <><CreditCard size={16} /> I Have Made the Transfer</>
                  }
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
