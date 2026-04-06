import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import { useToast } from '../../context/ToastContext';
import { useSettings } from '../../context/SettingsContext';
import { supabase } from '../../lib/supabase';
import { ShoppingCart, Truck, CheckCircle, ChevronRight, Store, Loader2, Home, ShoppingBag } from 'lucide-react';

export default function Checkout() {
  const { items, total, clearCart } = useCart();
  const { showToast } = useToast();
  const { settings } = useSettings();
  const fmt = (n) => '₦' + Number(n).toLocaleString();

  const initialDeliveryId = settings.deliveryOptions?.[0]?.id || '';
  const [deliveryId, setDeliveryId] = useState(initialDeliveryId);
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', email: '', address: '', city: 'Lagos', notes: '' });
  const [processing, setProcessing] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [successRef, setSuccessRef] = useState(null);

  const selectedOption = settings.deliveryOptions?.find(o => o.id === deliveryId) || { name: 'Delivery', fee: 0 };
  const deliveryFee = selectedOption.fee;
  const isPickup = selectedOption.name.toLowerCase().includes('pickup');
  const grandTotal = total + deliveryFee;

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  // Save pending order to Supabase before redirecting to Paystack
  const saveOrder = async () => {
    try {
      const orderId = 'SHD-' + Date.now().toString(36).toUpperCase();
      const customerName = `${form.firstName} ${form.lastName}`.trim();
      const deliveryAddress = isPickup ? 'Store Pickup' : `${form.address}, ${form.city}`;

      // 1. Create Order
      const { error: orderError } = await supabase
        .from('orders')
        .insert([{
          id: orderId,
          customer_name: customerName,
          customer_email: form.email || null,
          customer_phone: form.phone,
          delivery_address: deliveryAddress,
          payment_method: 'paystack',
          total: grandTotal,
          delivery_fee: deliveryFee,
          status: 'pending',
          notes: form.notes || null,
        }]);

      if (orderError) throw orderError;

      // 2. Create Order Items
      const { error: itemsError } = await supabase.from('order_items').insert(
        items.map(i => ({ order_id: orderId, product_id: i.id || null, name: i.name, price: i.price, qty: i.qty }))
      );

      if (itemsError) throw itemsError;

      return orderId;
    } catch (err) {
      console.error('Error saving pending order:', err);
      showToast('Order creation failed', err.message, 'error');
      return null;
    }
  };

  const handlePaystack = async () => {
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
    if (!window.PaystackPop) {
      showToast('Payment unavailable', 'Payment service failed to load. Please refresh and try again.', 'error');
      return;
    }

    setProcessing(true);

    try {
      // 1. Create pending order in Supabase
      const orderId = await saveOrder();
      if (!orderId) {
        setProcessing(false);
        return;
      }

      // 2. Open Paystack popup modal directly with public key
      const customerEmail = form.email?.trim() || `${form.phone.replace(/\D/g, '')}@smokeyhut.com`;

      // Guard to prevent onClose toast firing after a successful payment
      let paymentSucceeded = false;

      const handler = window.PaystackPop.setup({
        key: import.meta.env.VITE_PAYSTACK_PUBLIC_KEY,
        email: customerEmail,
        amount: Math.round(grandTotal * 100), // kobo
        ref: orderId,
        metadata: {
          order_id: orderId,
          customer_name: `${form.firstName} ${form.lastName}`.trim(),
          phone: form.phone,
        },
        // Paystack v1 inline uses "callback", NOT "onSuccess"
        callback: async (response) => {
          paymentSucceeded = true;
          await supabase.from('orders').update({ status: 'processing' }).eq('id', orderId);
          clearCart();
          setProcessing(false);
          setSuccessRef(response.reference);
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


  // Show success modal regardless of cart state (clearCart empties items)
  if (successRef) {
    return (
      <div style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-subtle)', borderRadius: 24, maxWidth: 460, width: '100%', padding: '48px 36px', textAlign: 'center', boxShadow: 'var(--shadow-lg)' }}>
          <div style={{ background: 'rgba(192,32,31,0.1)', width: 100, height: 100, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
            <CheckCircle size={56} color="var(--red)" />
          </div>
          <h2 style={{ fontSize: '2rem', fontWeight: 900, marginBottom: 12 }}>Order <span className="accent">Confirmed!</span></h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '1rem', lineHeight: 1.7, marginBottom: 20 }}>
            Thank you for choosing <strong>Smokeyhut Delight</strong>! Your payment was successful and your order is being prepared.
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
