import React, { useState, useEffect } from 'react';
import { X, Clock, Package, Edit3, Truck, CheckCircle, MapPin } from 'lucide-react';

export default function OrderingGuidePopup() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // Check if the user has already seen the popup this session
    const hasSeen = sessionStorage.getItem('smokeyhut_popup_seen');
    if (!hasSeen) {
      const timer = setTimeout(() => {
        setIsOpen(true);
      }, 1000); // 1-second delay
      return () => clearTimeout(timer);
    }
  }, []);

  const handleClose = () => {
    setIsOpen(false);
    sessionStorage.setItem('smokeyhut_popup_seen', 'true');
  };

  if (!isOpen) return null;

  return (
    <>
      <div 
        onClick={handleClose}
        style={{ 
          position: 'fixed', inset: 0, zIndex: 99999, 
          background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)' 
        }} 
      />
      <div 
        style={{
          position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          zIndex: 100000, background: 'var(--card-bg)', width: '92%', maxWidth: 540,
          maxHeight: '85vh', overflowY: 'auto', borderRadius: 20, padding: '32px 24px',
          boxShadow: '0 24px 60px rgba(0,0,0,0.4)', color: 'var(--text)',
          border: '1px solid var(--border-subtle)',
          fontFamily: "'DM Sans', sans-serif"
        }}
      >
        <button 
          onClick={handleClose} 
          style={{ 
            position: 'absolute', top: 20, right: 20, background: 'var(--black3)', 
            border: 'none', color: 'var(--text-muted)', width: 36, height: 36, 
            borderRadius: '50%', display: 'flex', alignItems: 'center', 
            justifyContent: 'center', cursor: 'pointer' 
          }}
        >
          <X size={20} />
        </button>
        
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <img src="/logo.svg" alt="Smokeyhut" style={{ width: 64, height: 64 }} />
        </div>
        
        <h2 style={{ textAlign: 'center', margin: '0 0 24px 0', fontSize: '1.6rem', fontFamily: "'Mona Sans', 'Mona-Sans', 'Helvetica Neue', sans-serif" }}>
          Smokeyhut Delight <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '1.05rem', marginTop: 4, fontWeight: 500 }}>Ordering Guide</span>
        </h2>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Section 1 */}
          <div style={{ background: 'var(--black2)', padding: '16px 20px', borderRadius: 12, borderLeft: '4px solid var(--red)' }}>
            <h4 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 12px 0', fontSize: '1.05rem' }}>
              <Clock size={18} color="var(--red)" /> Opening Hours
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 700, color: 'var(--text)' }}>Mon – Sat</span><span>8:00am – 6:00pm</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 700, color: 'var(--text)' }}>Sunday</span><span>10:00am – 4:00pm</span>
              </div>
            </div>
            <p style={{ marginTop: 12, fontSize: '0.82rem', color: 'var(--yellow)', fontWeight: 600 }}>Orders placed after closing will be delivered the next day.</p>
          </div>

          {/* Section 2 */}
          <div style={{ background: 'var(--black2)', padding: '16px 20px', borderRadius: 12, borderLeft: '4px solid var(--red)' }}>
            <h4 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 10px 0', fontSize: '1.05rem' }}>
              <Package size={18} color="var(--red)" /> Order Processing & Delivery
            </h4>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              <li>First batch orders are processed until 10:00am</li>
              <li>Dispatch begins from 10:30am</li>
              <li>Delivery time: 4–5 hours depending on your location</li>
            </ul>
          </div>

          {/* Section 3 */}
          <div style={{ background: 'var(--black2)', padding: '16px 20px', borderRadius: 12, borderLeft: '4px solid var(--red)' }}>
            <h4 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 10px 0', fontSize: '1.05rem' }}>
              <Edit3 size={18} color="var(--red)" /> Before You Order
            </h4>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              <li>Kindly provide accurate shipping details and an active phone number</li>
              <li>Carefully select your preferred order option (pickup or delivery)</li>
              <li>No extra order customization available</li>
              <li>Extra packaging attracts an additional ₦1,000 per pack</li>
            </ul>
          </div>

          {/* Section 4 */}
          <div style={{ background: 'var(--black2)', padding: '16px 20px', borderRadius: 12, borderLeft: '4px solid var(--red)' }}>
            <h4 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 10px 0', fontSize: '1.05rem' }}>
              <Truck size={18} color="var(--red)" /> Delivery Policy
            </h4>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              <li>Our rider will wait a maximum of 10 minutes at your location</li>
              <li>If unreachable, delivery will be rescheduled at full delivery cost</li>
              <li>Please ensure you're available to receive your order</li>
            </ul>
          </div>

          {/* Section 5 */}
          <div style={{ background: 'var(--black2)', padding: '16px 20px', borderRadius: 12, borderLeft: '4px solid var(--red)' }}>
            <h4 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 10px 0', fontSize: '1.05rem' }}>
              <CheckCircle size={18} color="var(--red)" /> After Delivery
            </h4>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              <li>Kindly check your package immediately upon delivery</li>
              <li>Complaints made after 4 hours will not be considered valid</li>
            </ul>
          </div>

          {/* Section 6 */}
          <div style={{ background: 'var(--black2)', padding: '16px 20px', borderRadius: 12, borderLeft: '4px solid var(--red)' }}>
            <h4 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 10px 0', fontSize: '1.05rem' }}>
              <MapPin size={18} color="var(--red)" /> Extended Locations
            </h4>
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Deliveries to Lasu, Ayobo, Alagbado, Akesan, Ojo, Akute, Alagbole, Ijegun, and Ibeju-Lekki may take up to 24 hours. Same-day delivery (if available) will be communicated upon dispatch.
            </p>
          </div>
        </div>

        <button 
          onClick={handleClose} 
          className="btn-primary"
          style={{ width: '100%', marginTop: 24, justifyContent: 'center', padding: '16px' }}
        >
          <img src="/logo.svg" alt="" style={{ width: 20, height: 20 }} /> I Understand — Let's Order!
        </button>
      </div>
    </>
  );
}
