import { useState } from 'react';
import { MapPin, Clock, Camera, Truck } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { useSEO } from '../../hooks/useSEO';

const CONTACT_EMAIL = 'Smokeyhut04@gmail.com';

export default function Contact() {
  useSEO({
    title: 'Contact Us – Smokeyhut Delight',
    description: "Get in touch with Smokeyhut Delight. Call, WhatsApp, or visit us at 13 McNeil Street, Yaba, Lagos. We're open Mon–Sat 8am–6pm.",
    path: '/contact',
  });

  const { showToast } = useToast();
  const [form, setForm] = useState({ name: '', phone: '', email: '', subject: 'Order Inquiry', message: '' });

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const handleSubmit = () => {
    if (!form.name.trim() || !form.message.trim()) {
      showToast('Required fields missing', 'Please enter your name and message', 'error');
      return;
    }

    const body = `Name: ${form.name}\nPhone: ${form.phone || 'N/A'}\nEmail: ${form.email || 'N/A'}\n\nMessage:\n${form.message}`;
    const mailto = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`[Smokeyhut] ${form.subject}`)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
    showToast('Message ready!', "Your email client will open to send the message.", 'success');
  };

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
              <div className="form-group"><label>Full Name *</label><input type="text" placeholder="Your name" value={form.name} onChange={set('name')} /></div>
              <div className="form-group"><label>Phone Number</label><input type="tel" placeholder="+234 000 0000 000" value={form.phone} onChange={set('phone')} /></div>
              <div className="form-group"><label>Email</label><input type="email" placeholder="your@email.com" value={form.email} onChange={set('email')} /></div>
              <div className="form-group">
                <label>Subject</label>
                <select value={form.subject} onChange={set('subject')} style={{ cursor: 'pointer', appearance: 'auto' }}>
                  <option>Order Inquiry</option>
                  <option>Delivery Issue</option>
                  <option>Feedback</option>
                  <option>Partnership</option>
                  <option>Other</option>
                </select>
              </div>
              <div className="form-group"><label>Message *</label><textarea placeholder="Tell us how we can help…" value={form.message} onChange={set('message')} /></div>
              <button className="btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={handleSubmit}>
                Send Message
              </button>
            </div>

            <div className="contact-info-cards">
              <div className="info-card">
                <div className="info-icon"><MapPin size={22} color="var(--red)" /></div>
                <div>
                  <div className="info-title">Lagos Mainland</div>
                  <div className="info-text">13 McNeil Street, Yaba, Lagos<br />Pickup available during opening hours</div>
                </div>
              </div>
              <div className="info-card">
                <div className="info-icon"><Clock size={22} color="var(--red)" /></div>
                <div>
                  <div className="info-title">Opening Hours</div>
                  <div className="info-text">Mon – Sat: 8am – 6pm<br />Sunday: 10am – 4pm</div>
                </div>
              </div>
              <div className="info-card">
                <div className="info-icon"><Camera size={22} color="var(--red)" /></div>
                <div>
                  <div className="info-title">Instagram</div>
                  <div className="info-text"><a href="https://www.instagram.com/smokeyhut_delight/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--red)', fontWeight: 700 }}>@smokeyhut_delight</a><br />57,000+ followers</div>
                </div>
              </div>
              <div className="info-card">
                <div className="info-icon"><Truck size={22} color="var(--red)" /></div>
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
