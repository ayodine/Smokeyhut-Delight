import React from 'react';
import { X, Clock, Truck, ShieldCheck, PhoneCall, AlertTriangle, CheckCircle2 } from 'lucide-react';

export default function CheckoutDisclaimerModal({ isOpen, onAgree, onClose }) {
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose || onAgree}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(5px)',
          zIndex: 99999,
          animation: 'fadeIn 0.2s ease-out',
        }}
      />

      {/* Modal Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="disclaimer-modal-title"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '92%',
          maxWidth: 480,
          maxHeight: '90vh',
          overflowY: 'auto',
          background: '#fff',
          borderRadius: 22,
          padding: '28px 22px 24px',
          boxShadow: '0 25px 65px rgba(0,0,0,0.3)',
          zIndex: 100000,
          fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
          color: '#111',
          animation: 'slideUp 0.25s ease-out',
        }}
      >
        {/* Close icon button */}
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              position: 'absolute',
              top: 18,
              right: 18,
              background: '#f5f5f7',
              border: 'none',
              borderRadius: '50%',
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#666',
              transition: 'background 0.15s',
            }}
          >
            <X size={18} />
          </button>
        )}

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              background: '#fef2f2',
              border: '1.5px solid #fecaca',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 12px',
            }}
          >
            <AlertTriangle size={26} color="#c0201f" />
          </div>
          <span
            style={{
              fontSize: '0.72rem',
              fontWeight: 800,
              color: '#c0201f',
              textTransform: 'uppercase',
              letterSpacing: '0.07em',
              display: 'block',
              marginBottom: 4,
            }}
          >
            Important Ordering Notice
          </span>
          <h2
            id="disclaimer-modal-title"
            style={{
              margin: 0,
              fontSize: '1.35rem',
              fontWeight: 900,
              color: '#111',
              letterSpacing: '-0.01em',
            }}
          >
            Before You Place Your Order
          </h2>
          <p style={{ margin: '6px 0 0', fontSize: '0.84rem', color: '#6b7280', lineHeight: 1.45 }}>
            Please review our delivery guidelines and store policies:
          </p>
        </div>

        {/* Policy list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 22 }}>
          {/* Policy 1 */}
          <div
            style={{
              display: 'flex',
              gap: 12,
              alignItems: 'flex-start',
              padding: '12px 14px',
              borderRadius: 12,
              background: '#f9fafb',
              border: '1px solid #f3f4f6',
            }}
          >
            <Clock size={18} color="#c0201f" style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontWeight: 800, fontSize: '0.85rem', color: '#111', marginBottom: 2 }}>
                Delivery Schedule & Timing
              </div>
              <div style={{ fontSize: '0.79rem', color: '#4b5563', lineHeight: 1.45 }}>
                Orders are processed Mon–Sat 8am–6pm (Sun 10am–5pm). Same-day batch dispatch begins from 11:00am and takes 3–4 hours depending on your area.
              </div>
            </div>
          </div>

          {/* Policy 2 */}
          <div
            style={{
              display: 'flex',
              gap: 12,
              alignItems: 'flex-start',
              padding: '12px 14px',
              borderRadius: 12,
              background: '#f9fafb',
              border: '1px solid #f3f4f6',
            }}
          >
            <PhoneCall size={18} color="#c0201f" style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontWeight: 800, fontSize: '0.85rem', color: '#111', marginBottom: 2 }}>
                Active Phone & 10-Minute Waiting Policy
              </div>
              <div style={{ fontSize: '0.79rem', color: '#4b5563', lineHeight: 1.45 }}>
                Our dispatch rider will wait a maximum of 10 minutes at your location. Please ensure your contact phone number is reachable.
              </div>
            </div>
          </div>

          {/* Policy 3 */}
          <div
            style={{
              display: 'flex',
              gap: 12,
              alignItems: 'flex-start',
              padding: '12px 14px',
              borderRadius: 12,
              background: '#f9fafb',
              border: '1px solid #f3f4f6',
            }}
          >
            <Truck size={18} color="#c0201f" style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontWeight: 800, fontSize: '0.85rem', color: '#111', marginBottom: 2 }}>
                Accurate Address & No Customisation
              </div>
              <div style={{ fontSize: '0.79rem', color: '#4b5563', lineHeight: 1.45 }}>
                Kindly verify your delivery address. To maintain our signature firewood taste and speed, all items are freshly prepared to standard recipes.
              </div>
            </div>
          </div>

          {/* Policy 4 */}
          <div
            style={{
              display: 'flex',
              gap: 12,
              alignItems: 'flex-start',
              padding: '12px 14px',
              borderRadius: 12,
              background: '#f9fafb',
              border: '1px solid #f3f4f6',
            }}
          >
            <ShieldCheck size={18} color="#c0201f" style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontWeight: 800, fontSize: '0.85rem', color: '#111', marginBottom: 2 }}>
                Check Package Immediately
              </div>
              <div style={{ fontSize: '0.79rem', color: '#4b5563', lineHeight: 1.45 }}>
                Please inspect your order upon delivery. Any feedback or complaints must be shared within 4 hours of receipt.
              </div>
            </div>
          </div>
        </div>

        {/* Confirm Button */}
        <button
          type="button"
          onClick={onAgree}
          style={{
            width: '100%',
            padding: '16px',
            borderRadius: 14,
            background: '#c0201f',
            color: '#fff',
            border: 'none',
            fontWeight: 900,
            fontSize: '1rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            boxShadow: '0 6px 18px rgba(192,32,31,0.3)',
            transition: 'background 0.15s, transform 0.1s',
            letterSpacing: '-0.01em',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#a81817'; }}
          onMouseLeave={e => { e.currentTarget.style.background = '#c0201f'; }}
        >
          <CheckCircle2 size={20} /> I Understand
        </button>
      </div>
    </>
  );
}
