import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import ProductCard from '../../components/ProductCard';
import PromoProgressBanner from '../../components/PromoProgressBanner';
import OrderingGuidePopup from '../../components/OrderingGuidePopup';
import { Clock, Flame, ShoppingCart, Leaf, Truck, Award, Store, Camera } from 'lucide-react';
import { getProducts } from '../../lib/productsCache';
import { useSEO } from '../../hooks/useSEO';

function Countdown() {
  const [time, setTime] = useState({ h: '00', m: '00', s: '00' });
  const [isOpen, setIsOpen] = useState(false);
  const [isSunday, setIsSunday] = useState(false);

  useEffect(() => {
    const tick = () => {
      const lagosNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Lagos' }));
      const nowMins = lagosNow.getHours() * 60 + lagosNow.getMinutes();
      const sunday = lagosNow.getDay() === 0;
      const openHour = sunday ? 10 : 8;
      const closeHour = sunday ? 17 : 18;
      const open = nowMins >= openHour * 60 && nowMins < closeHour * 60;
      setIsOpen(open);
      setIsSunday(sunday);

      const target = new Date(lagosNow);
      if (open) {
        target.setHours(closeHour, 0, 0, 0);
      } else {
        if (nowMins >= closeHour * 60) target.setDate(target.getDate() + 1);
        target.setHours(openHour, 0, 0, 0);
      }

      const diff = Math.max(0, target - lagosNow);
      const h = String(Math.floor(diff / 3600000)).padStart(2, '0');
      const m = String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0');
      const s = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0');
      setTime({ h, m, s });
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="store-status-bar">
      <div className="store-status-inner">

        {/* LEFT — open/closed pill + countdown */}
        <div className="status-left">
          <div className="status-header">
            <span className={`live-dot ${isOpen ? 'dot-open' : 'dot-closed'}`} />
            <span className="status-badge-text">
              {isOpen ? "We're Smoking Right Now" : 'Store Closed — Opens Tomorrow'}
            </span>
          </div>

          <p className="status-timer-label">
            {isOpen ? 'Order before we close for same-day delivery:' : 'Ordering opens in:'}
          </p>

          <div className="countdown-digits">
            <div className="digit-box">
              <span className="digit-num">{time.h}</span>
              <span className="digit-label">HOURS</span>
            </div>
            <span className="digit-sep">:</span>
            <div className="digit-box">
              <span className="digit-num">{time.m}</span>
              <span className="digit-label">MINS</span>
            </div>
            <span className="digit-sep">:</span>
            <div className="digit-box">
              <span className="digit-num">{time.s}</span>
              <span className="digit-label">SECS</span>
            </div>
          </div>

          <p className="status-delivery-note">
            {isOpen
              ? <><Truck size={13} style={{ display:'inline', marginRight:5, verticalAlign:'middle' }} />Same-day delivery across Lagos. Order now!</>
              : <><Truck size={13} style={{ display:'inline', marginRight:5, verticalAlign:'middle' }} />{isSunday ? 'Ordering opens at 10:00 am on Sundays' : 'Ordering opens daily at 11:00 am'}</>
            }
          </p>
        </div>

        {/* RIGHT — hours card */}
        <div className="status-right">
          <div className="hours-card">
            <div className="hours-card-title">
              <Clock size={13} style={{ marginRight: 6, opacity: 0.6, verticalAlign: 'middle' }} />
              Opening Hours
            </div>
            <div className="hours-row">
              <span className="hours-day">Mon – Sat</span>
              <span className="hours-time">8:00 am – 6:00 pm</span>
            </div>
            <div className="hours-row">
              <span className="hours-day">Sunday</span>
              <span className="hours-time">10:00 am – 5:00 pm</span>
            </div>
            <div className="hours-divider" />
            <div className="hours-row hours-delivery">
              <span className="hours-day">
                <Truck size={12} style={{ marginRight: 5, verticalAlign: 'middle', opacity: 0.7 }} />
                Delivery time
              </span>
              <span className="hours-time">3 – 4 hrs</span>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}

const testimonials = [
  { text: '"I ordered the full spicy guineafowl for the first time last month and now it\'s a weekly thing. The smokiness is INSANE."', name: 'Adaeze O.', loc: 'Victoria Island', color: 'linear-gradient(135deg,#f97,#d44)', initial: 'A' },
  { text: '"The guineafowl rice combo changed my life. I brought it for a hangout and everyone was asking for the contact."', name: 'Babatunde K.', loc: 'Surulere', color: 'linear-gradient(135deg,#8cf,#47a)', initial: 'B' },
  { text: '"The palm wine here is so authentic and fresh. Paired with the smoky bird — it\'s a whole cultural experience."', name: 'Chioma N.', loc: 'Lekki', color: 'linear-gradient(135deg,#cf8,#484)', initial: 'C' },
  { text: '"Ordered the ₦22k combo for me and my partner. Two whole birds + drinks. That\'s real value!"', name: 'Damilola F.', loc: 'Yaba', color: 'linear-gradient(135deg,#fca,#d73)', initial: 'D' },
  { text: '"I drive all the way from Ikorodu for this guineafowl. Worth every minute of the drive."', name: 'Emmanuel A.', loc: 'Ikorodu', color: 'linear-gradient(135deg,#a8f,#64c)', initial: 'E' },
  { text: '"The delivery is always on time and hot. Professional operation, excellent food. 100% recommend."', name: 'Fatimah U.', loc: 'Ikeja', color: 'linear-gradient(135deg,#f8a,#c33)', initial: 'F' },
];

const features = [
  { icon: Flame, title: 'Real Firewood Grill', desc: 'Every Guineafowl is grilled over authentic firewood for that irresistible smoky flavour.' },
  { icon: Leaf, title: 'Freshly Made Daily', desc: "We grill fresh everyday — if it's on the menu, it's freshly grilled." },
  { icon: Truck, title: 'Same-Day Delivery', desc: 'Order before 10am and your food dispatches by 11:00am. Lagos-wide delivery.' },
  { icon: Flame, title: 'Perfectly Spiced', desc: 'Our signature spice blend has been perfected over years — bold, smoky, and addictively good.' },
  { icon: Award, title: 'Lagos #1 Guineafowl', desc: '57,000+ followers and thousands of satisfied customers can\'t be wrong.' },
  { icon: Store, title: 'Pickup Available', desc: 'Visit us at 13 McNeil street, Sabo Yaba, Lagos State.' },
];

export default function Home() {
  useSEO({
    title: 'Smokeyhut Delight – Best Firewood Grilled Guineafowl in Lagos',
    description: "Lagos's #1 firewood-grilled guineafowl. Order fresh, smoky guineafowl online for same-day delivery across Lagos. Open Mon–Sat 8am–6pm, Sun 10am–5pm.",
    path: '/',
  });

  const [bestsellers, setBestsellers] = useState([]);

  useEffect(() => {
    getProducts().then(({ products }) => setBestsellers(products.slice(0, 6)));
  }, []);

  return (
    <div>
      <OrderingGuidePopup />
      {/* HERO */}
      <section className="hero">
        <div className="hero-bg" />
        <div className="hero-content">
          <div>
            <div className="hero-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Flame size={14} /> #1 Firewood Grill in Lagos</div>
            <h1>Lagos's <em>Finest</em><br />Firewood-Grilled<br />Guineafowl</h1>
            <p className="hero-desc">Smokeyhut Delight serves the most authentic, smoky, perfectly spiced Guineafowl in Lagos — grilled fresh daily over open firewood.</p>
            <div className="hero-btns">
              <Link to="/shop" className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><ShoppingCart size={18} /> Order Now</Link>
              <Link to="/about" className="btn-secondary">Our Story →</Link>
            </div>
            <div className="hero-stats">
              <div><div className="stat-num">57K+</div><div className="stat-label">Happy Customers</div></div>
              <div><div className="stat-num">5★</div><div className="stat-label">Avg Rating</div></div>
              <div><div className="stat-num">6+</div><div className="stat-label">Years of Smoke</div></div>
            </div>
          </div>
          <div className="hero-visual" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <img src="https://itpnfalqjjicesqcjzix.supabase.co/storage/v1/object/public/product-images/HERO.png" alt="Smokeyhut Firewood Grilled Guineafowl" className="hero-image-large" />
          </div>
        </div>
      </section>

      <Countdown />

      {/* BESTSELLERS */}
      <section className="products-section">
        <div className="container">
          <div className="section-header">
            <div className="section-tag">Best Sellers</div>
            <h2 className="section-title">Order <span>Your Favourites</span></h2>
            <p className="section-sub">Our most-loved dishes, grilled fresh and ready for you today.</p>
          </div>

          {/* Promo Progress Banner */}
          <div style={{ maxWidth: 680, margin: '0 auto 32px' }}>
            <PromoProgressBanner variant="full" />
          </div>

          <div className="premium-grid">
            {bestsellers.map(p => (
              <ProductCard key={p.id} product={{...p, desc: p.short_desc, category_id: p.category_id, category: p.category_id}} variant="shopify" />
            ))}
            {bestsellers.length === 0 && <div style={{gridColumn:'1/-1', textAlign:'center', color:'var(--text-muted)'}}>Loading menu...</div>}
          </div>
          <div style={{ textAlign: 'center', margin: '36px auto' }}>
            <Link to="/shop" className="btn-primary">View Full Menu →</Link>
          </div>
        </div>
      </section>

      {/* WHY US */}
      <section>
        <div className="container">
          <div className="section-header">
            <div className="section-tag">Why Choose Us</div>
            <h2 className="section-title">The Smokeyhut <span>Difference</span></h2>
            <p className="section-sub">We don't do shortcuts. Fire, wood, and time.</p>
          </div>
          <div className="features-grid">
            {features.map((f, i) => {
              const Icon = f.icon;
              return (
                <div key={i} className="feature-card">
                  <div className="feature-icon"><Icon size={24} color="#c0201f" /></div>
                  <div className="feature-title">{f.title}</div>
                  <div className="feature-desc">{f.desc}</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* REVIEWS */}
      <section className="reviews-section">
        <div className="container">
          <div className="section-header">
            <div className="section-tag">Social Proof</div>
            <h2 className="section-title">What <span>Lagos Is Saying</span></h2>
            <p className="section-sub">Real reviews from our community across Lagos.</p>
          </div>
          <div className="reviews-grid">
            {testimonials.map((t, i) => (
              <div key={i} className="review-card">
                <div className="review-stars">★★★★★</div>
                <p className="review-text">{t.text}</p>
                <div className="review-author">
                  <div className="author-avatar" style={{ background: t.color }}>{t.initial}</div>
                  <div>
                    <div className="author-name">{t.name}</div>
                    <div className="author-loc">{t.loc}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* INSTAGRAM BANNER */}
      <section className="insta-banner">
        <div className="container" style={{ textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.08)', padding: '6px 16px', borderRadius: 20, marginBottom: 16 }}>
            <Camera size={16} color="#c0201f" />
            <span style={{ fontSize: '0.82rem', color: '#ccc', fontWeight: 600 }}>Join our 57K+ community</span>
          </div>
          <h2 style={{ fontSize: 'clamp(1.6rem, 4vw, 2.4rem)', fontWeight: 900, color: '#fff', marginBottom: 12 }}>Follow Us on Instagram</h2>
          <p style={{ color: '#aaa', fontSize: '1rem', maxWidth: 460, margin: '0 auto 24px', lineHeight: 1.6 }}>Daily behind-the-scenes, smoking videos, customer reactions & exclusive discount codes.</p>
          <a href="https://instagram.com/smokeyhut" target="_blank" rel="noopener noreferrer" className="btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            @smokeyhut on Instagram →
          </a>
        </div>
      </section>

      {/* CTA */}
      <section className="cta-section">
        <div className="container">
          <div className="cta-inner">
            <div className="cta-content">
              <h2>Craving That Smoky Flavour?</h2>
              <p>Order online now. Freshly grilled, packed with flavour, delivered hot to your door anywhere in Lagos.</p>
              <Link to="/shop" className="btn-primary">Order Online Today →</Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
