import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import { useToast } from '../../context/ToastContext';
import { useSettings } from '../../context/SettingsContext';
import { supabase } from '../../lib/supabase';
import { ShoppingCart, Truck, CheckCircle, ChevronRight, Store, Loader2 } from 'lucide-react';

export default function Checkout() {
  const { items, total, clearCart } = useCart();
  const { showToast } = useToast();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const fmt = (n) => '₦' + Number(n).toLocaleString();

  const initialDeliveryId = settings.deliveryOptions?.[0]?.id || '';
  const [deliveryId, setDeliveryId] = useState(initialDeliveryId);
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', email: '', address: '', city: 'Lagos', notes: '' });
  const [processing, setProcessing] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [sdkReady, setSdkReady] = useState(false);

  // Check if Paystack v2 SDK loaded
  useEffect(() => {
    const check = () => {
      if (window.PaystackPop) {
        setSdkReady(true);
      } else {
        setTimeout(check, 300);
      }
    };
    check();
  }, []);

  const selectedOption = settings.deliveryOptions?.find(o => o.id === deliveryId) || { name: 'Delivery', fee: 0 };
  const deliveryFee = selectedOption.fee;
  const isPickup = selectedOption.name.toLowerCase().includes('pickup');
  const grandTotal = total + deliveryFee;

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  // Save completed order to Supabase
  const saveOrder = async (paystackRef) => {
    try {
      const orderId = 'SHD-' + Date.now().toString(36).toUpperCase();
      const customerName = `${form.firstName} ${form.lastName}`.trim();
      const deliveryAddress = isPickup ? 'Store Pickup' : `${form.address}, ${form.city}`;

      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .insert([{
          id: orderId,
          customer_name: customerName,
          customer_email: form.email || null,
          customer_phone: form.phone,
          delivery_address: deliveryAddress,
          payment_method: 'paystack',
          total: grandTotal,
          status: 'processing',
          notes: form.notes || null,
        }])
        .select()
        .single();

      if (!orderError && orderData) {
        await supabase.from('order_items').insert(
          items.map(i => ({ order_id: orderId, product_id: i.id || null, name: i.name, price: i.price, qty: i.qty }))
        );
      }

      await supabase.from('payments').insert([{
        order_id: orderId,
        customer_name: `${form.firstName} ${form.lastName}`.trim(),
        amount: grandTotal,
        method: 'paystack',
        paystack_ref: paystackRef,
        status: 'success',
      }]);

      return orderId;
    } catch (err) {
      console.warn('Could not save order to DB:', err.message);
      return null;
    }
  };

  const handlePaystack = () => {
    if (!form.firstName.trim() || !form.phone.trim()) {
      showToast('Required fields missing', 'Please enter your name and phone number', 'error');
      return;
    }
    if (!isPickup && !form.address.trim()) {
      showToast('Address required', 'Please enter your delivery address', 'error');
      return;
    }
    if (items.length === 0) {
      showToast('Cart is empty', 'Add items to your cart first', 'error');
      return;
    }

    const key = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY;
    if (!key) {
      showToast('Payment unavailable', 'Paystack key not configured', 'error');
      return;
    }

    if (!window.PaystackPop) {
      showToast('Payment SDK loading…', 'Please try again in a moment', 'error');
      return;
    }

    setProcessing(true);

    const customerEmail = form.email?.trim() || `${form.phone.replace(/\D/g, '')}@smokeyhut.com`;
    const ref = 'SHD-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6).toUpperCase();

    // Paystack v2 API — opens as a popup (not iframe, avoids COEP blocking)
    window.PaystackPop.newTransaction({
      key,
      email: customerEmail,
      amount: grandTotal * 100, // kobo
      currency: 'NGN',
      ref,
      label: `${form.firstName} ${form.lastName}`.trim() || form.phone,
      metadata: {
        custom_fields: [
          { display_name: 'Customer Name', variable_name: 'customer_name', value: `${form.firstName} ${form.lastName}`.trim() },
          { display_name: 'Phone', variable_name: 'phone', value: form.phone },
          { display_name: 'Delivery Method', variable_name: 'delivery_method', value: selectedOption.name },
          { display_name: 'Address', variable_name: 'address', value: isPickup ? 'Store Pickup' : `${form.address}, ${form.city}` },
        ],
      },
      onSuccess: async (transaction) => {
        const orderId = await saveOrder(transaction.reference);
        clearCart();
        setProcessing(false);
        showToast(
          '🎉 Order placed!',
          orderId ? `Order ${orderId} confirmed. Ref: ${transaction.reference}` : `Payment confirmed. Ref: ${transaction.reference}`,
          'success'
        );
        navigate('/');
      },
      onCancel: () => {
        setProcessing(false);
        showToast('Payment cancelled', 'Your cart is saved. Try again when ready.', 'info');
      },
    });
  };


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
              <div className="form-group" style={{ marginBottom: 24, position: 'relative' }}>
                <label>Select preferred location/method</label>
                <div
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    width: '100%', background: 'var(--black)', border: `1px solid ${dropdownOpen ? 'var(--red)' : 'var(--border-subtle)'}`,
                    borderRadius: 8, padding: '14px 16px', color: 'var(--text)',
                    fontSize: '0.95rem', cursor: 'pointer', transition: 'all 0.2s',
                    boxShadow: dropdownOpen ? '0 0 0 3px rgba(192,32,31,0.1)' : 'none'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {isPickup ? <Store size={18} color="var(--red)" /> : <Truck size={18} color="var(--red)" />}
                    <span style={{ fontWeight: 700 }}>{selectedOption.name}</span>
                    <span style={{ color: 'var(--text-muted)' }}>— {selectedOption.fee === 0 ? 'Free' : fmt(selectedOption.fee)}</span>
                  </div>
                  <ChevronRight size={18} color="var(--text-muted)" style={{ transform: dropdownOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
                </div>

                {dropdownOpen && (
                  <>
                    <div onClick={() => setDropdownOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 10 }} />
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, right: 0,
                      background: 'var(--card-bg)', border: '1px solid var(--border-subtle)',
                      borderRadius: 12, marginTop: 8, boxShadow: 'var(--shadow-lg)',
                      zIndex: 20, overflow: 'hidden'
                    }}>
                      {settings.deliveryOptions?.map((opt, index) => {
                        const isOptPickup = opt.name.toLowerCase().includes('pickup');
                        const isSelected = deliveryId === opt.id;
                        return (
                          <div
                            key={opt.id}
                            onClick={() => { setDeliveryId(opt.id); setDropdownOpen(false); }}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px',
                              cursor: 'pointer', borderBottom: index === settings.deliveryOptions.length - 1 ? 'none' : '1px solid var(--border-subtle)',
                              background: isSelected ? 'rgba(192,32,31,0.04)' : 'transparent',
                              transition: 'background 0.2s'
                            }}
                            onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'var(--black2)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = isSelected ? 'rgba(192,32,31,0.04)' : 'transparent'; }}
                          >
                            <div style={{ background: isSelected ? 'var(--red)' : 'var(--black2)', padding: 10, borderRadius: 8, display: 'flex', transition: 'background 0.2s' }}>
                              {isOptPickup ? <Store size={18} color={isSelected ? '#fff' : "var(--text-muted)"} /> : <Truck size={18} color={isSelected ? '#fff' : "var(--text-muted)"} />}
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: isSelected ? 800 : 600, color: isSelected ? 'var(--red)' : 'var(--text)', marginBottom: 2 }}>{opt.name}</div>
                              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{opt.fee === 0 ? 'Free pickup directly at the store' : `Delivery fare: ${fmt(opt.fee)}`}</div>
                            </div>
                            {isSelected && <CheckCircle size={20} color="var(--red)" />}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              <h3 style={{ marginTop: 32 }}>Customer Info</h3>
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

              <button
                className="btn-primary"
                style={{ width: '100%', justifyContent: 'center', padding: '16px 28px', fontSize: '1rem', marginTop: 8 }}
                onClick={handlePaystack}
                disabled={processing}
              >
                {processing
                  ? <><Loader2 size={18} className="spin" style={{ marginRight: 8 }} /> Processing...</>
                  : `💳 Pay ${fmt(grandTotal)} with Paystack`
                }
              </button>

              {!sdkReady && (
                <p style={{ textAlign: 'center', fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 8 }}>
                  Loading payment gateway…
                </p>
              )}

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
              <div className="order-line"><span>Delivery ({selectedOption.name})</span><span>{selectedOption.fee === 0 ? 'Free' : fmt(selectedOption.fee)}</span></div>
              <div className="order-line" style={{ borderBottom: 'none', paddingTop: 16 }}>
                <span style={{ fontWeight: 900, fontSize: '1.1rem' }}>Total</span>
                <span className="order-total">{fmt(grandTotal)}</span>
              </div>

              <div style={{ marginTop: 20, padding: '14px 16px', background: 'var(--black2)', borderRadius: 10, fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.7 }}>
                <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>Accepted Payments</div>
                <div>💳 Debit / Credit Cards</div>
                <div>🏦 Bank Transfer</div>
                <div>📱 USSD (*737#, *901# etc)</div>
                <div>📲 Mobile Money</div>
                <div>💰 QR Code Pay</div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
