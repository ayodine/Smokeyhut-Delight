import React from 'react';
import { useSEO } from '../../hooks/useSEO';

export default function Privacy() {
  useSEO({
    title: 'Privacy Policy',
    description: 'Read our privacy policy to understand how Smokeyhut Delight handles your personal data and order information.',
    path: '/privacy',
  });

  return (
    <div>
      <section className="about-hero">
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div className="section-tag">Legal</div>
          <h1 className="section-title">Privacy <span>Policy</span></h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginTop: 10 }}>Last updated: January 2025</p>
        </div>
      </section>
      <section><div className="container"><div className="policy-content">
        <h2>1. Information We Collect</h2>
        <p>When you place an order with Smokeyhut Delight, we collect your name, phone number, delivery address, and order details. This information is used solely to process and deliver your order.</p>
        <h2>2. How We Use Your Information</h2>
        <ul>
          <li>To process and fulfill your orders</li>
          <li>To contact you regarding delivery updates</li>
          <li>To resolve complaints or disputes</li>
          <li>To improve our service and customer experience</li>
        </ul>
        <h2>3. Information Sharing</h2>
        <p>We do not sell, trade, or share your personal data with third parties, except our delivery partners who require your address and phone number to complete your order.</p>
        <h2>4. Data Security</h2>
        <p>Your personal information is stored securely. We take reasonable steps to protect your data from unauthorized access.</p>
        <h2>5. Your Rights</h2>
        <p>You may request deletion of your personal data at any time by contacting us via our Instagram DM (<strong>@smokeyhut_delight</strong>) or through our contact form.</p>
        <h2>6. Contact</h2>
        <p>Questions about this policy? Reach us at <strong>@smokeyhut_delight</strong> on Instagram.</p>
      </div></div></section>
    </div>
  );
}
