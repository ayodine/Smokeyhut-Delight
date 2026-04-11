import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import ProductCard from '../../components/ProductCard';
import OrderingGuidePopup from '../../components/OrderingGuidePopup';
import { Clock, Flame, ShoppingCart, Leaf, Truck, Award, Store, Camera } from 'lucide-react';
import { getProducts } from '../../lib/productsCache';

const BATCHES = [
  { num: 1, start: [10, 30], end: [12, 30] },
  { num: 2, start: [12, 30], end: [14, 30] },
  { num: 3, start: [14, 30], end: [16, 30] },
  { num: 4, start: [16, 30], end: [18, 30] },
];

function toMins([h, m]) { return h * 60 + m; }
function fmtTime([h, m]) { const ampm = h < 12 ? 'am' : 'pm'; const h12 = h % 12 || 12; return `${h12}:${String(m).padStart(2, '0')}${ampm}`; }

function Countdown() {
  const [time, setTime] = useState({ h: '00', m: '00', s: '00' });
  const [label, setLabel] = useState('');
  const [subLabel, setSubLabel] = useState('');

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      // Always use Lagos time (Africa/Lagos = UTC+1, no DST) regardless of viewer's timezone
      const lagosNow = new Date(now.toLocaleString('en-US', { timeZone: 'Africa/Lagos' }));
      const nowMins = lagosNow.getHours() * 60 + lagosNow.getMinutes();

      let activeBatch = null;
      let nextBatch = null;

      for (const batch of BATCHES) {
        const s = toMins(batch.start);
        const e = toMins(batch.end);
        if (nowMins >= s && nowMins < e) { activeBatch = batch; break; }
        if (nowMins < s && !nextBatch) { nextBatch = batch; }
      }

      // Build target using lagosNow as base so diff is always in correct ms
      const target = new Date(lagosNow);
      let lbl, sub;

      if (activeBatch) {
        target.setHours(activeBatch.end[0], activeBatch.end[1], 0, 0);
        lbl = `Batch ${activeBatch.num} closes in:`;
        sub = `Order now — dispatches in this batch window`;
      } else if (nextBatch) {
        target.setHours(nextBatch.start[0], nextBatch.start[1], 0, 0);
        lbl = `Batch ${nextBatch.num} opens in:`;
        sub = `Next dispatch window at ${fmtTime(nextBatch.start)}`;
      } else {
        target.setDate(target.getDate() + 1);
        target.setHours(BATCHES[0].start[0], BATCHES[0].start[1], 0, 0);
        lbl = 'Next batch opens in:';
        sub = `Ordering closed for today. First batch tomorrow at ${fmtTime(BATCHES[0].start)}`;
      }

      const diff = Math.max(0, target - lagosNow);
      setTime({
        h: String(Math.floor(diff / 3600000)).padStart(2, '0'),
        m: String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0'),
        s: String(Math.floor((diff % 60000) / 1000)).padStart(2, '0'),
      });
      setLabel(lbl);
      setSubLabel(sub);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="countdown-bar">
      <div className="countdown-inner">
        <div className="countdown-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Clock size={16} /> {label}
        </div>
        <div className="countdown-digits">
          <div className="cd-block"><div className="cd-num">{time.h}</div><div className="cd-unit">hrs</div></div>
          <div className="cd-colon">:</div>
          <div className="cd-block"><div className="cd-num">{time.m}</div><div className="cd-unit">min</div></div>
          <div className="cd-colon">:</div>
          <div className="cd-block"><div className="cd-num">{time.s}</div><div className="cd-unit">sec</div></div>
        </div>
        <div className="countdown-offer" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Flame size={14} /> {subLabel}
        </div>
      </div>
      <div className="countdown-info">
        <div className="countdown-info-item"><Clock size={12} /> Batch 1: <strong>10:30am – 12:30pm</strong></div>
        <div className="countdown-info-item"><Clock size={12} /> Batch 2: <strong>12:30pm – 2:30pm</strong></div>
        <div className="countdown-info-item"><Clock size={12} /> Batch 3: <strong>2:30pm – 4:30pm</strong></div>
        <div className="countdown-info-item"><Clock size={12} /> Batch 4: <strong>4:30pm – 6:30pm</strong></div>
        <div className="countdown-info-item">⏱ Delivery: <strong>3–4 hrs</strong> depending on location</div>
      </div>
    </div>
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
  { icon: Leaf, title: 'Freshly Made Daily', desc: 'We grill fresh every single day. No frozen birds — if it\'s on the menu, it was grilled today.' },
  { icon: Truck, title: 'Same-Day Delivery', desc: 'Order before 10am and your food dispatches by 10:30am. Lagos-wide delivery.' },
  { icon: Flame, title: 'Perfectly Spiced', desc: 'Our signature spice blend has been perfected over years — bold, smoky, and addictively good.' },
  { icon: Award, title: 'Lagos #1 Guineafowl', desc: '57,000+ followers and thousands of satisfied customers can\'t be wrong.' },
  { icon: Store, title: 'Pickup Available', desc: 'Visit us at Yaba or Victoria Island. Walk in, pick up hot, enjoy the Smokeyhut experience.' },
];

export default function Home() {
  const [bestsellers, setBestsellers] = useState([]);

  useEffect(() => {
    getProducts().then(({ products }) => setBestsellers(products.slice(0, 4)));
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
            <img src="/HERO.png" alt="Smokeyhut Firewood Grilled Guineafowl" className="hero-image-large" />
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
          <div className="products-grid">
            {bestsellers.map(p => (
              <ProductCard key={p.id} product={{...p, desc: p.short_desc, category: p.category_id}} />
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
            <h2 className="section-title">Good Food, <span>Good Mood</span></h2>
            <p className="section-sub">Every bird is hand selected, seasoned with secret spices, and grilled over real firewood.</p>
          </div>
          <div className="features-grid">
            {features.map((f, i) => {
              const Icon = f.icon;
              return (
                <div key={i} className="feature-card">
                  <span className="feature-icon"><Icon size={32} /></span>
                  <div className="feature-title">{f.title}</div>
                  <div className="feature-desc">{f.desc}</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>


      {/* TESTIMONIALS */}
      <section>
        <div className="container">
          <div className="section-header center">
            <div className="section-tag">Reviews</div>
            <h2 className="section-title">What Our <span>Customers Say</span></h2>
            <p className="section-sub">Real reviews from people who love what we do.</p>
          </div>
          <div className="testimonials-grid">
            {testimonials.map((t, i) => (
              <div key={i} className="testimonial-card">
                <div className="testimonial-stars">★★★★★</div>
                <p className="testimonial-text">{t.text}</p>
                <div className="testimonial-author">
                  <div className="t-avatar" style={{ background: t.color }}>{t.initial}</div>
                  <div><div className="t-name">{t.name}</div><div className="t-sub">{t.loc}, Lagos</div></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <div className="cta-band">
        <div className="container">
          <h2>Ready to Taste the <span style={{ color: '#F5C518' }}>Best Guineafowl</span> in Lagos?</h2>
          <p>Order now for same-day delivery. Freshly grilled, firewood-smoked, delivered hot.</p>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/shop" className="btn-primary" style={{ background: '#fff', color: '#C0201F', display: 'flex', alignItems: 'center', gap: 6 }}><ShoppingCart size={18} /> Order Now</Link>
            <a href="https://www.instagram.com/smokeyhut_delight/" target="_blank" rel="noopener noreferrer" className="btn-secondary" style={{ borderColor: 'rgba(255,255,255,0.4)', color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}><Camera size={18} /> Follow Us</a>
          </div>
        </div>
      </div>
    </div>
  );
}
