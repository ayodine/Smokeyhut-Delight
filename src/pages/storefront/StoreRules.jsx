import React from 'react';
import { Clock, Package, ClipboardList, Truck, CheckCircle, Map } from 'lucide-react';

const regs = [
  { icon: Clock, title: 'Opening Hours', items: ['Monday – Saturday: 8:00am – 6:00pm', 'Sunday: 10:00am – 4:00pm', 'Orders after closing delivered next day'] },
  { icon: Package, title: 'Order Processing', items: ['First-batch orders until 10:00am', 'Dispatch begins from 10:30am', 'Delivery: 4–5 hours depending on location'] },
  { icon: ClipboardList, title: 'Before You Order', items: ['Provide accurate shipping details and active phone', 'Select: pickup or delivery', 'No extra order customization available', 'Extra packaging: ₦1,000 per pack'] },
  { icon: Truck, title: 'Delivery Policy', items: ['Rider waits maximum 10 minutes', 'Unreachable = rescheduled at full delivery cost', 'Ensure availability to receive your order'] },
  { icon: CheckCircle, title: 'After Delivery', items: ['Check package immediately upon delivery', 'Complaints after 4 hours not considered valid'] },
  { icon: Map, title: 'Extended Locations', items: ['Lasu, Ayobo, Alagbado, Akesan, Ojo, Akute, Ibeju-Lekki: up to 24 hrs', 'Same-day delivery communicated upon dispatch'] },
];

export default function StoreRules() {
  return (
    <div>
      <section className="about-hero">
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div className="section-tag">Store Policy</div>
          <h1 className="section-title">Store <span>Regulations</span></h1>
          <p style={{ color: 'var(--text-muted)', maxWidth: 500, margin: '12px auto', lineHeight: 1.7, fontSize: '0.97rem' }}>Please read these guidelines before placing your order.</p>
        </div>
      </section>
      <section>
        <div className="container">
          <div className="reg-grid">
            {regs.map((r, i) => {
              const Icon = r.icon;
              return (
                <div key={i} className="reg-card">
                  <div className="reg-icon"><Icon size={28} /></div>
                  <div className="reg-title">{r.title}</div>
                  <ul className="reg-list">{r.items.map((item, j) => <li key={j}>{item}</li>)}</ul>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
