import React, { useState, useEffect } from 'react';
import { DollarSign, CreditCard, Landmark, Banknote, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const fmt = (n) => '₦' + n.toLocaleString();

export default function Payments() {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [filter, setFilter] = useState('all');
  const methods = ['all', 'paystack', 'bank_transfer', 'cash'];

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const { data } = await supabase.from('payments').select('*').order('created_at', { ascending: false });
    if (data) setPayments(data);
    setLoading(false);
  };

  const handleRefund = async (id) => {
    if(window.confirm('Refund this payment?')) {
      await supabase.from('payments').update({ status: 'refunded' }).eq('id', id);
      setPayments(prev => prev.map(x => x.id === id ? { ...x, status: 'refunded' } : x));
    }
  };

  const filtered = payments.filter(p => filter === 'all' || p.method === filter);
  const totalRevenue = payments.filter(p => p.status === 'success').reduce((s, p) => s + Number(p.amount), 0);
  const byMethod = { paystack: 0, bank_transfer: 0, cash: 0 };
  payments.filter(p => p.status === 'success').forEach(p => { 
    byMethod[p.method] = (byMethod[p.method] || 0) + Number(p.amount); 
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
            <thead><tr><th>ID</th><th>Order</th><th>Customer</th><th>Amount</th><th>Method</th><th>Reference</th><th>Status</th><th>Date</th><th style={{ textAlign: 'right' }}>Action</th></tr></thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 700, color: 'var(--red)' }}>{p.id}</td>
                  <td>{p.order_id}</td>
                  <td style={{ fontWeight: 600 }}>{p.customer_name}</td>
                  <td style={{ fontWeight: 700 }}>{fmt(p.amount)}</td>
                  <td style={{ fontSize: '0.82rem' }}>{(p.method || '').replace('_', ' ')}</td>
                  <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{p.paystack_ref || '—'}</td>
                  <td><span className={`status-badge ${p.status}`}>{p.status}</span></td>
                  <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{new Date(p.created_at).toLocaleDateString()}</td>
                  <td style={{ textAlign: 'right' }}>
                    {p.status === 'success' && (
                      <button onClick={() => handleRefund(p.id)} style={{ background: 'none', border: 'none', color: '#991b1b', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>Refund</button>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan="9" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No payments found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
