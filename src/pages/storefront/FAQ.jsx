import React, { useState } from 'react';
import { faqs } from '../../data/mockData';

export default function FAQ() {
  const [openIdx, setOpenIdx] = useState(null);

  return (
    <div>
      <section className="about-hero">
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div className="section-tag">Help Centre</div>
          <h1 className="section-title">Frequently Asked <span>Questions</span></h1>
          <p style={{ color: 'var(--text-muted)', maxWidth: 480, margin: '12px auto', lineHeight: 1.7, fontSize: '0.97rem' }}>
            Everything you need to know about ordering from Smokeyhut Delight.
          </p>
        </div>
      </section>
      <section>
        <div className="container">
          <div className="faq-list">
            {faqs.map((faq, i) => (
              <div key={i} className={`faq-item${openIdx === i ? ' open' : ''}`}>
                <button className="faq-q" onClick={() => setOpenIdx(openIdx === i ? null : i)}>
                  {faq.q}
                  <span className="arrow">›</span>
                </button>
                <div className="faq-a">{faq.a}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
