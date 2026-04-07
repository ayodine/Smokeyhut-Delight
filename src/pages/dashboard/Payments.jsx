import React, { useState, useEffect } from 'react';
import { DollarSign, CreditCard, Landmark, Banknote, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useOutletContext } from 'react-router-dom';

const fmt = (n) => '₦' + n.toLocaleString();

export default function Payments() {
  const { selectedStore } = useOutletContext() || {};
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  const [filter, setFilter] = useState('all');
  const methods = ['all', 'paystack', 'bank_transfer', 'cash'];

  useEffect(() => {
    fetchData();
  }, [selectedStore]);

  const fetchData = async () => {
    setLoading(true);
    let query = supabase
      .from('orders')
      .select('id, customer_name, customer_email, total, payment_method, status, created_at, store_id')
      .not('payment_method', 'is', null)
      .order('created_at', { ascending: false });
    if (selectedStore && selectedStore !== 'all') {
      query = query.eq('store_id', selectedStore);
    }
    const { data } = await query;
    if (data) setPayments(data);
    setLoading(false);
  };

  const filtered = payments.filter(p => filter === 'all' || p.payment_method === filter);
  const totalRevenue = payments.filter(p => p.status === 'paid').reduce((s, p) => s + Number(p.total), 0);
  const byMethod = { paystack: 0, bank_transfer: 0, cash: 0 };
  payments.filter(p => p.status === 'paid').forEach(p => {
    byMethod[p.payment_method] = (byMethod[p.payment_method] || 0) + Number(p.total);
  });

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><Loader2 className="spin" size={32} color="var(--red)" /></div>;

  return (
    <div>
      <div className="dash-card-header" style={{ marginBottom: 20 }}>
        <div className="dash-card-title" style={{ fontFamily: "'Mona Sans', 'Mona-Sans', 'Helvetica Neue', sans-serif", fontSize: '1.4rem' }}>Payments & Transactions</div>
      </div>

      <div className="kpi-grid" style={{ marginBottom: 24 }}>
        <div className="kpi-card green">
          <div className="kpi-icon"><DollarSign size={24} /></div>
          <div className="kpi-value">{fmt(totalRevenue)}</div>
          <div className="kpi-label">Total Revenue</div>
        </div>
        <div className="kpi-card blue">
          <div className="kpi-icon"><CreditCard size={24} /></div>
          <div className="kpi-value">{fmt(byMethod.paystack)}</div>
          <div className="kpi-label">Via Paystack</div>
        </div>
        <div className="kpi-card yellow">
          <div className="kpi-icon"><Landmark size={24} /></div>
          <div className="kpi-value">{fmt(byMethod.bank_transfer)}</div>
          <div className="kpi-label">Bank Transfer</div>
        </div>
        <div className="kpi-card red">
          <div className="kpi-icon"><Banknote size={24} /></div>
          <div className="kpi-value">{fmt(byMethod.cash)}</div>
          <div className="kpi-label">Cash</div>
        </div>
      </div>

      <div className="dash-filters">
        {methods.map(m => (
          <button key={m} className={`dash-filter-btn${filter === m ? ' active' : ''}`} onClick={() => setFilter(m)}>
            {m === 'all' ? 'All' : m === 'bank_transfer' ? 'Bank Transfer' : m.charAt(0).toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>

      <div className="dash-card">
        <div style={{ overflowX: 'auto' }}>
          <table className="dash-table">
            <thead>
              <tr><th>Order ID</th><th>Customer</th><th>Email</th><th>Amount</th><th>Method</th><th>Status</th><th>Date</th></tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 700, color: 'var(--red)' }}>{p.id}</td>
                  <td style={{ fontWeight: 600 }}>{p.customer_name}</td>
                  <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{p.customer_email || '—'}</td>
                  <td style={{ fontWeight: 700 }}>{fmt(p.total)}</td>
                  <td style={{ fontSize: '0.82rem' }}>{(p.payment_method || '').replace('_', ' ')}</td>
                  <td><span className={`status-badge ${p.status}`}>{p.status}</span></td>
                  <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{new Date(p.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No payments found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
