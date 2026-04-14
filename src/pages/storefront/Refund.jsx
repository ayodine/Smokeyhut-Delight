import React from 'react';
import { useSEO } from '../../hooks/useSEO';

export default function Refund() {
  useSEO({
    title: 'Refund & Cancellation Policy',
    description: 'Understand the refund and cancellation policy at Smokeyhut Delight. Learn what happens if you need to cancel or request a refund.',
    path: '/refund',
  });

  return (
    <div>
      <section className="about-hero">
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div className="section-tag">Legal</div>
          <h1 className="section-title">Refund <span>Policy</span></h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginTop: 10 }}>Last updated: January 2025</p>
        </div>
      </section>
      <section><div className="container"><div className="policy-content">
        <h2>Our Commitment</h2>
        <p>At Smokeyhut Delight, we take great pride in the quality of our food and service. We want every customer to be completely satisfied.</p>
        <h2>Eligibility for Complaints</h2>
        <ul>
          <li>Complaints must be made within <strong>4 hours</strong> of delivery</li>
          <li>Photo or video evidence may be required</li>
          <li>The delivery rider and dispatch team will verify the claim</li>
        </ul>
        <h2>What We Cover</h2>
        <ul>
          <li>Wrong order delivered</li>
          <li>Missing items from your order</li>
          <li>Quality issues (undercooked, spoiled, etc.)</li>
        </ul>
        <h2>What We Don't Cover</h2>
        <ul>
          <li>Change of mind after delivery</li>
          <li>Complaints made after 4 hours</li>
          <li>Incorrect address provided by customer</li>
        </ul>
        <h2>Resolution</h2>
        <p>Valid complaints will be resolved with a replacement order or store credit. Cash refunds are not available. Contact us via Instagram DM or our contact form.</p>
      </div></div></section>
    </div>
  );
}
