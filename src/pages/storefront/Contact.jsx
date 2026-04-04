import React from 'react';
import { useToast } from '../../context/ToastContext';

export default function Contact() {
  const { showToast } = useToast();

  return (
    <div>
      <section className="about-hero">
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div className="section-tag">Get In Touch</div>
          <h1 className="section-title">We'd Love to <span>Hear From You</span></h1>
        </div>
      </section>
      <section>
        <div className="container">
          <div className="contact-grid">
            <div className="contact-form-wrap">
              <h3 style={{ fontFamily: "'Mona Sans', 'Mona-Sans', 'Helvetica Neue', sans-serif", fontSize: '1.3rem', marginBottom: 22 }}>Send Us a Message</h3>
              <div className="form-group"><label>Full Name</label><input type="text" placeholder="Your name" /></div>
              <div className="form-group"><label>Phone Number</label><input type="tel" placeholder="+234 000 0000 000" /></div>
              <div className="form-group"><label>Email</label><input type="email" placeholder="your@email.com" /></div>
              <div className="form-group">
                <label>Subject</label>
                <select style={{ cursor: 'pointer', appearance: 'auto' }}>
                  <option>Order Inquiry</option>
                  <option>Delivery Issue</option>
                  <option>Feedback</option>
                  <option>Partnership</option>
                  <option>Other</option>
                </select>
              </div>
              <div className="form-group"><label>Message</label><textarea placeholder="Tell us how we can help…" /></div>
              <button className="btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => showToast('Message sent!', "We'll get back to you shortly 🔥", 'success')}>
                Send Message 📤
              </button>
            </div>
            <div className="contact-info-cards">
              <div className="info-card">
                <div className="info-icon">📍</div>
                <div>
                  <div className="info-title">Lagos Mainland</div>
                  <div className="info-text">13 McNeil Street, Yaba, Lagos<br />Pickup available during opening hours</div>
                </div>
              </div>
              <div className="info-card">
                <div className="info-icon">📍</div>
                <div>
                  <div className="info-title">Lagos Island</div>
                  <div className="info-text">5 Akin Adesola Street, Victoria Island<br />Pickup available during opening hours</div>
                </div>
              </div>
              <div className="info-card">
                <div className="info-icon">⏰</div>
                <div>
                  <div className="info-title">Opening Hours</div>
                  <div className="info-text">Mon – Sat: 8am – 6pm<br />Sunday: 10am – 4pm</div>
                </div>
              </div>
              <div className="info-card">
                <div className="info-icon">📸</div>
                <div>
                  <div className="info-title">Instagram</div>
                  <div className="info-text"><a href="https://www.instagram.com/smokeyhut_delight/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--red)', fontWeight: 700 }}>@smokeyhut_delight</a><br />57,000+ followers</div>
                </div>
              </div>
              <div className="info-card">
                <div className="info-icon">🚚</div>
                <div>
                  <div className="info-title">Delivery Info</div>
                  <div className="info-text">First dispatch: 10:30am daily<br />Delivery: 4–5 hours (location dependent)</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
