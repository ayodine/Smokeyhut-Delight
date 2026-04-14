import React from 'react';
import { Link } from 'react-router-dom';
import { Flame, Leaf, Heart, Zap, MapPin } from 'lucide-react';
import { useSEO } from '../../hooks/useSEO';

export default function About() {
  useSEO({
    title: 'Our Story – Authentic Nigerian Grilled Food',
    description: "From a passion for authentic flavours to Lagos's most beloved guineafowl brand. Learn the story behind Smokeyhut Delight in Yaba, Lagos.",
    path: '/about',
  });
  const values = [
    { icon: Flame, title: 'Authenticity', desc: 'Real firewood. Real spices. Real Nigerian food culture. No compromises.' },
    { icon: Leaf, title: 'Freshness', desc: 'Every order is prepared fresh. We grill daily and never store overnight.' },
    { icon: Heart, title: 'Community', desc: "We're preserving a food heritage that Lagos can be proud of." },
    { icon: Zap, title: 'Reliability', desc: 'From opening hours to delivery windows, we keep our word. Every time.' },
  ];

  return (
    <div>
      <div className="about-hero">
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div className="section-tag">Our Story</div>
          <h1 className="section-title" style={{ margin: '12px auto', maxWidth: 600 }}>Good Food, <span>Good Mood</span> — Always</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '1rem', maxWidth: 500, margin: '0 auto', lineHeight: 1.7 }}>
            From a passion for authentic flavours to Lagos' most beloved guineafowl brand.
          </p>
        </div>
      </div>
      <section>
        <div className="container">
          <div className="about-grid">
            <div>
              <div className="section-tag">Who We Are</div>
              <h2 className="section-title">Lagos's <span>Firewood Grill</span> Kings</h2>
              <p style={{ color: 'var(--text-muted)', lineHeight: 1.8, marginBottom: 16, fontSize: '0.95rem' }}>
                Smokeyhut Delight was born from a simple belief: that the most powerful cooking tool is real fire, real smoke, and real patience. Our founder turned a deep love of traditional Nigerian food culture into the city's most talked-about guineafowl brand.
              </p>
              <p style={{ color: 'var(--text-muted)', lineHeight: 1.8, marginBottom: 16, fontSize: '0.95rem' }}>
                With locations across Lagos Mainland and Lagos Island, we serve freshly grilled guineafowl, guineafowl rice, palm wine, and zobo every day. Over 57,000 followers on Instagram and thousands of repeat customers are proof that authentic always wins.
              </p>
              <p style={{ color: 'var(--text-muted)', lineHeight: 1.8, fontSize: '0.95rem' }}>
                We don't freeze our birds. We don't use shortcuts. We wake up early, fire up the wood, and do this the right way — every single day.
              </p>
            </div>
            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-subtle)', borderRadius: 20, overflow: 'hidden', boxShadow: 'var(--shadow-md)' }}>
              <div style={{ height: 300, overflow: 'hidden' }}><img src="/shop_front.png" alt="Smokeyhut Delight shop front" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div>
              <div style={{ padding: '20px 24px' }}>
                <div style={{ fontWeight: 800, fontSize: '1rem' }}>Est. Lagos, Nigeria</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}><MapPin size={14} /> Lagos Mainland & Lagos Island</div>
              </div>
            </div>
          </div>

          <div className="section-header center">
            <div className="section-tag">Our Values</div>
            <h2 className="section-title">What We <span>Stand For</span></h2>
          </div>
          <div className="values-grid">
            {values.map((v, i) => {
              const Icon = v.icon;
              return (
                <div key={i} className="value-card">
                  <span className="value-icon"><Icon size={32} /></span>
                  <div className="value-title">{v.title}</div>
                  <div className="value-desc">{v.desc}</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
