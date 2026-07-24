import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle, Loader2, Clock } from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { publicSupabase } from '../../lib/supabase';

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Landing page after Paystack's hosted payment page. READ-ONLY UX: the
// webhook is the source of payment truth — this page just polls until the
// order leaves pending_payment. One backup verify-payment call covers a slow
// webhook. It never claims failure: the webhook/sweeper may still land it.
const POLL_MS = 2000;
const FIRST_PHASE_MS = 30000;   // then fire the one-shot verify backup
const SECOND_PHASE_MS = 10000;  // keep polling a little after the backup

export default function PaymentSuccess() {
  const [params] = useSearchParams();
  const reference = params.get('reference') || params.get('trxref') || '';
  const { clearCart } = useCart();
  // Derive the no-reference state at init so the effect never setStates synchronously.
  const [state, setState] = useState(reference ? 'checking' : 'noref'); // 'checking' | 'paid' | 'processing' | 'noref'
  const [orderId, setOrderId] = useState(null);
  const clearedRef = useRef(false);

  useEffect(() => {
    if (!reference) return;
    let stopped = false;
    let verifyFired = false;
    const startedAt = Date.now();

    const confirmPaid = (id) => {
      if (stopped) return;
      setOrderId(id);
      setState('paid');
      if (!clearedRef.current) {
        clearedRef.current = true;
        clearCart();
        if (typeof window !== 'undefined' && window.fbq) {
          window.fbq('track', 'Purchase', { content_type: 'product', currency: 'NGN' });
        }
      }
    };

    const tick = async () => {
      if (stopped) return;
      const { data } = await publicSupabase.rpc('get_payment_status', { p_ref: reference });
      if (stopped) return;
      if (data?.paid) { confirmPaid(data.order_id); return; }
      const elapsed = Date.now() - startedAt;
      if (elapsed > FIRST_PHASE_MS && !verifyFired) {
        verifyFired = true;
        try {
          await fetch(`${SUPABASE_URL}/functions/v1/verify-payment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPABASE_ANON_KEY}`, apikey: SUPABASE_ANON_KEY },
            body: JSON.stringify({ reference }),
          });
        } catch { /* silent — polling continues */ }
      }
      if (elapsed > FIRST_PHASE_MS + SECOND_PHASE_MS) { setState('processing'); return; }
      setTimeout(tick, POLL_MS);
    };
    tick();
    return () => { stopped = true; };
  }, [reference]); // clearCart intentionally omitted — guarded by clearedRef

  const box = { minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 20 };

  if (state === 'noref') {
    return (
      <div style={box}><div>
        <h2 style={{ fontWeight: 900 }}>Missing payment reference</h2>
        <p style={{ color: '#888', margin: '10px 0 20px' }}>If you completed a payment, you'll receive a confirmation email shortly.</p>
        <Link to="/shop" className="btn-primary">Back to Menu</Link>
      </div></div>
    );
  }
  if (state === 'paid') {
    return (
      <div style={box}><div>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}><CheckCircle size={64} color="#16a34a" /></div>
        <h2 style={{ fontWeight: 900 }}>Payment confirmed! 🎉</h2>
        <p style={{ color: '#555', margin: '10px 0 4px' }}>Your order <strong style={{ color: '#c0201f' }}>{orderId}</strong> is being prepared.</p>
        <p style={{ color: '#888', fontSize: '0.85rem', marginBottom: 20 }}>A confirmation email is on its way. Pay the delivery fee to the rider in cash on arrival.</p>
        <Link to="/shop" className="btn-primary">Back to Menu</Link>
      </div></div>
    );
  }
  if (state === 'processing') {
    return (
      <div style={box}><div>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}><Clock size={64} color="#f59e0b" /></div>
        <h2 style={{ fontWeight: 900 }}>Payment is processing…</h2>
        <p style={{ color: '#555', margin: '10px 0 20px', maxWidth: 420 }}>
          We're confirming your payment with the bank. You'll get a confirmation email as soon as it lands —
          no need to pay again. Keep your payment reference: <strong>{reference}</strong>
        </p>
        <Link to="/shop" className="btn-primary">Back to Menu</Link>
      </div></div>
    );
  }
  return (
    <div style={box}><div>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}><Loader2 size={48} className="spin" color="#c0201f" /></div>
      <h2 style={{ fontWeight: 900 }}>Confirming your payment…</h2>
      <p style={{ color: '#888', marginTop: 8 }}>This usually takes a few seconds.</p>
    </div></div>
  );
}
