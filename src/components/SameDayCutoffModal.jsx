import React from 'react';
import { X, Clock, AlertCircle, CheckCircle2 } from 'lucide-react';
import { getCutoffState } from '../lib/deliveryCutoff';

export default function SameDayCutoffModal({ isOpen, product, onConfirm, onClose }) {
  if (!isOpen || !product) return null;

  const cutoff = getCutoffState(product);
  const isPast = cutoff.isPastCutoff;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(4px)',
          zIndex: 99999,
          animation: 'fadeIn 0.2s ease-out',
        }}
      />

      {/* Modal Card */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cutoff-modal-title"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '92%',
          maxWidth: 440,
          background: '#fff',
          borderRadius: 20,
          padding: '28px 24px',
          boxShadow: '0 24px 60px rgba(0,0,0,0.25)',
          zIndex: 100000,
          fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
          animation: 'slideUp 0.25s ease-out',
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
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

        {/* Icon & Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              background: isPast ? '#fef2f2' : '#fffbeb',
              border: `1.5px solid ${isPast ? '#fecaca' : '#fde68a'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Clock size={24} color={isPast ? '#dc2626' : '#d97706'} />
          </div>
          <div>
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: 800,
                color: isPast ? '#dc2626' : '#d97706',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                display: 'block',
              }}
            >
              Same-Day Delivery Notice
            </span>
            <h3
              id="cutoff-modal-title"
              style={{
                margin: 0,
                fontSize: '1.15rem',
                fontWeight: 900,
                color: '#111',
                lineHeight: 1.3,
              }}
            >
              {product.name}
            </h3>
          </div>
        </div>

        {/* Cutoff timing details */}
        <div
          style={{
            background: isPast ? '#fff5f5' : '#fafafb',
            border: `1.5px solid ${isPast ? '#fed7d7' : '#e5e7eb'}`,
            borderRadius: 14,
            padding: '14px 16px',
            marginBottom: 20,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            {isPast ? (
              <AlertCircle size={18} color="#dc2626" style={{ flexShrink: 0, marginTop: 2 }} />
            ) : (
              <CheckCircle2 size={18} color="#166534" style={{ flexShrink: 0, marginTop: 2 }} />
            )}
            <div style={{ fontSize: '0.88rem', lineHeight: 1.5, color: '#374151' }}>
              {isPast ? (
                <>
                  Orders for this product stop by <strong>{cutoff.cutoffLabel}</strong> for same-day delivery.
                  Because it is past {cutoff.cutoffLabel}, this item will be scheduled for{' '}
                  <strong style={{ color: '#dc2626' }}>tomorrow's delivery</strong>.
                </>
              ) : (
                <>
                  Orders for this product must be placed before <strong>{cutoff.cutoffLabel}</strong> for same-day dispatch.
                  Orders placed after {cutoff.cutoffLabel} will be delivered the next day.
                </>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 1,
              padding: '13px 16px',
              borderRadius: 12,
              background: '#f3f4f6',
              color: '#4b5563',
              border: 'none',
              fontWeight: 700,
              fontSize: '0.9rem',
              cursor: 'pointer',
              transition: 'background 0.15s',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              flex: '1.4',
              padding: '13px 16px',
              borderRadius: 12,
              background: '#c0201f',
              color: '#fff',
              border: 'none',
              fontWeight: 800,
              fontSize: '0.92rem',
              cursor: 'pointer',
              transition: 'background 0.15s',
              boxShadow: '0 4px 14px rgba(192,32,31,0.3)',
            }}
          >
            I Understand
          </button>
        </div>
      </div>
    </>
  );
}
