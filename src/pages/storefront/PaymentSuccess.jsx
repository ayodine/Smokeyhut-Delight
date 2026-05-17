import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import { useToast } from '../../context/ToastContext';
import { CheckCircle, XCircle, Loader2, Home, ShoppingBag } from 'lucide-react';
import { supabase } from '../../lib/supabase';

export default function PaymentSuccess() {
  const [searchParams] = useSearchParams();
  const reference = searchParams.get('reference');
  const [verifying, setVerifying] = useState(true);
  const [status, setStatus] = useState('verifying'); // 'verifying', 'success', 'error'
  const { clearCart } = useCart();
  const { showToast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (!reference) {
      setStatus('error');
      setVerifying(false);
      return;
    }

    const verifyPaymentFn = async () => {
      try {
        const { data, error: funcError } = await supabase.functions.invoke('verify-payment', {
          body: { reference }
        });

        if (!funcError && data?.success) {
          setStatus('success');
          clearCart();
          showToast('Payment Successful!', 'Your order has been confirmed.', 'success');
        } else {
          setStatus('error');
          showToast('Verification Failed', funcError?.message || data?.error || 'Payment could not be verified.', 'error');
        }
      } catch (error) {
        setStatus('error');
        showToast('Error', error.message || 'An error occurred during verification.', 'error');
      } finally {
        setVerifying(false);
      }
    };

    verifyPaymentFn();
  }, [reference, clearCart, showToast]);

  return (
    <div className="container" style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
      <div className="card" style={{ maxWidth: 500, width: '100%', textAlign: 'center', padding: '40px 30px', borderRadius: 24, background: 'var(--card-bg)', border: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-lg)' }}>
        
        {status === 'verifying' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
            <Loader2 size={64} className="spin" color="var(--red)" />
            <h2 style={{ fontSize: '2rem', fontWeight: 800 }}>Verifying <span>Payment</span></h2>
            <p style={{ color: 'var(--text-muted)' }}>Please wait while we confirm your order...</p>
          </div>
        )}

        {status === 'success' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
            <div style={{ background: 'rgba(192,32,31,0.1)', padding: 20, borderRadius: '50%' }}>
              <CheckCircle size={80} color="var(--red)" />
            </div>
            <h2 style={{ fontSize: '2.5rem', fontWeight: 900 }}>Order <span>Confirmed!</span></h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem', lineHeight: 1.6 }}>
              Thank you for choosing <strong>Smokeyhut Delight</strong>! Your payment was successful and your order is being processed.
            </p>
            <div style={{ width: '100%', padding: '16px', background: 'var(--black2)', borderRadius: 12, fontSize: '0.9rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Reference:</span> <code style={{ color: 'var(--text)', fontWeight: 700 }}>{reference}</code>
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
              <Link to="/" className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Home size={18} /> Back Home
              </Link>
              <Link to="/shop" className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ShoppingBag size={18} /> Order More
              </Link>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
            <div style={{ background: 'rgba(239,68,68,0.1)', padding: 20, borderRadius: '50%' }}>
              <XCircle size={80} color="#ef4444" />
            </div>
            <h2 style={{ fontSize: '2.2rem', fontWeight: 800 }}>Payment <span>Failed</span></h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>
              We couldn't verify your payment. If you think this is a mistake, please contact our support.
            </p>
            <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
              <Link to="/checkout" className="btn-primary">Try Again</Link>
              <Link to="/" className="btn-secondary">Go Home</Link>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
