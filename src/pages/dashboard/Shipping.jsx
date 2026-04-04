import React, { useState, useEffect } from 'react';
import { Package, Truck, CheckCircle, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

export default function Shipping() {
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [filter, setFilter] = useState('all');
  const statuses = ['all', 'in_transit', 'delivered'];

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const { data } = await supabase.from('shipments').select('*').order('created_at', { ascending: false });
    if (data) setShipments(data);
    setLoading(false);
  };

  const handleDelivered = async (id) => {
    if(window.confirm('Mark this package as delivered?')) {
      const delivered_at = new Date().toISOString();
      await supabase.from('shipments').update({ status: 'delivered', delivered_at }).eq('id', id);
      setShipments(prev => prev.map(s => s.id === id ? { ...s, status: 'delivered', delivered_at } : s));
    }
  };

  const filtered = shipments.filter(s => filter === 'all' || s.status === filter);

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><Loader2 className="spin" size={32} color="var(--red)" /></div>;

  return (
    <div>
      <div className="dash-card-header" style={{ marginBottom: 20 }}>
        <div className="dash-card-title" style={{ fontFamily: "'Mona Sans', 'Mona-Sans', 'Helvetica Neue', sans-serif", fontSize: '1.4rem' }}>Shipping & Dispatch</div>
      </div>

      <div className="kpi-grid" style={{ marginBottom: 24 }}>
        <div className="kpi-card blue">
          <div className="kpi-icon"><Package size={24} /></div>
          <div className="kpi-value">{shipments.length}</div>
          <div className="kpi-label">Total Shipments</div>
        </div>
        <div className="kpi-card yellow">
          <div className="kpi-icon"><Truck size={24} /></div>
          <div className="kpi-value">{shipments.filter(s => s.status === 'in_transit').length}</div>
          <div className="kpi-label">In Transit</div>
        </div>
        <div className="kpi-card green">
          <div className="kpi-icon"><CheckCircle size={24} /></div>
          <div className="kpi-value">{shipments.filter(s => s.status === 'delivered').length}</div>
          <div className="kpi-label">Delivered</div>
        </div>
      </div>

      <div className="dash-filters">
        {statuses.map(s => (
          <button key={s} className={`dash-filter-btn${filter === s ? ' active' : ''}`} onClick={() => setFilter(s)}>
            {s === 'all' ? 'All' : s.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
          </button>
        ))}
      </div>

      <div className="dash-card">
        <div style={{ overflowX: 'auto' }}>
          <table className="dash-table">
            <thead><tr><th>Waybill ID</th><th>Order ID</th><th>Customer</th><th>Destination</th><th>Dispatch Time</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 700, color: 'var(--red)' }}>{s.id}</td>
                  <td>{s.order_id}</td>
                  <td><div style={{ fontWeight: 700 }}>{s.customer_name}</div></td>
                  <td style={{ fontSize: '0.88rem' }}>{s.delivery_address}</td>
                  <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    <div>Dispatched: {s.dispatch_at ? new Date(s.dispatch_at).toLocaleTimeString() : 'N/A'}</div>
                    {s.status === 'delivered' && <div>Delivered: {s.delivered_at ? new Date(s.delivered_at).toLocaleTimeString() : 'N/A'}</div>}
                  </td>
                  <td><span className={`status-badge ${s.status}`}>{s.status.replace('_', ' ')}</span></td>
                  <td>
                    {s.status === 'in_transit' && (
                      <button onClick={() => handleDelivered(s.id)} style={{ background: '#dcfce7', color: '#166534', border: 'none', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontSize: '0.78rem' }}>Mark Delivered</button>
                    )}
                    {s.status === 'delivered' && (
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Completed</span>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No shipments found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
