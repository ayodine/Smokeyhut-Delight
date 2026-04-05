import React, { useState, useEffect } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

const fmt = (n) => '₦' + n.toLocaleString();
const statuses = ['all', 'pending', 'processing', 'shipped', 'delivered', 'cancelled'];

export default function Orders() {
  const { userRole } = useAuth();
  const isAdmin = userRole === 'Admin';
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    // Supabase relation: orders -> order_items
    const { data } = await supabase.from('orders')
      .select('*, order_items(*)')
      .order('created_at', { ascending: false });
    
    if (data) setOrders(data);
    setLoading(false);
  };

  const updateStatus = async (id, newStatus) => {
    await supabase.from('orders').update({ status: newStatus }).eq('id', id);
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status: newStatus } : o));
  };

  const deleteOrder = async (id) => {
    if (window.confirm('Delete this order?')) {
      // Delete order_items first to satisfy FK constraint
      await supabase.from('order_items').delete().eq('order_id', id);
      const { error } = await supabase.from('orders').delete().eq('id', id);
      if (!error) setOrders(prev => prev.filter(o => o.id !== id));
    }
  };

  const filtered = orders.filter(o => {
    const matchStatus = filter === 'all' || o.status === filter;
    const matchSearch = String(o.customer_name || '').toLowerCase().includes(search.toLowerCase()) || 
                        String(o.id).toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><Loader2 className="spin" size={32} color="var(--red)" /></div>;

  return (
    <div>
      <div className="dash-card-header" style={{ marginBottom: 20 }}>
        <div className="dash-card-title" style={{ fontFamily: "'Mona Sans', 'Mona-Sans', 'Helvetica Neue', sans-serif", fontSize: '1.4rem' }}>Orders Management</div>
        <div style={{ position: 'relative' }}>
          <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: 12, top: 12 }} />
          <input className="dash-search" placeholder="Search orders..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 40 }} />
        </div>
      </div>
      
      <div className="dash-filters">
        {statuses.map(s => (
          <button key={s} className={`dash-filter-btn${filter === s ? ' active' : ''}`} onClick={() => setFilter(s)}>
            {s === 'all' ? `All (${orders.length})` : `${s.charAt(0).toUpperCase() + s.slice(1)} (${orders.filter(o => o.status === s).length})`}
          </button>
        ))}
      </div>
      
      <div className="dash-card">
        <div style={{ overflowX: 'auto' }}>
          <table className="dash-table">
            <thead><tr><th>ID</th><th>Customer</th><th>Items</th><th>Total</th><th>Payment</th><th>Status</th><th>Date</th></tr></thead>
            <tbody>
              {filtered.map(order => {
                const itemsCount = order.order_items?.length || 0;
                
                return (
                  <React.Fragment key={order.id}>
                    <tr style={{ cursor: 'pointer' }} onClick={() => setExpandedId(expandedId === order.id ? null : order.id)}>
                      <td style={{ fontWeight: 700, color: 'var(--red)' }}>{order.id}</td>
                      <td><div style={{ fontWeight: 700 }}>{order.customer_name}</div><div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{order.customer_phone}</div></td>
                      <td>{itemsCount} item{itemsCount !== 1 ? 's' : ''}</td>
                      <td style={{ fontWeight: 700 }}>{fmt(order.total || 0)}</td>
                      <td style={{ fontSize: '0.82rem' }}>{(order.payment_method || '').replace('_', ' ')}</td>
                      <td><span className={`status-badge ${order.status}`}>{order.status}</span></td>
                      <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{new Date(order.created_at).toLocaleDateString()}</td>
                    </tr>
                    {expandedId === order.id && (
                      <tr><td colSpan="7" style={{ background: 'var(--black2)', padding: '16px 20px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, fontSize: '0.88rem' }}>
                          <div><strong>Address:</strong> {order.delivery_address}</div>
                          <div><strong>Email:</strong> {order.customer_email || 'N/A'}</div>
                          <div><strong>Store ID:</strong> {order.store_id || 'Unassigned'}</div>
                          <div style={{ gridColumn: '1 / -1' }}>
                            <strong>Items:</strong>
                            <ul style={{ marginTop: 6, paddingLeft: 18 }}>
                              {(order.order_items || []).map((item, i) => (
                                <li key={i}>{item.name} × {item.qty} — {fmt(item.price * item.qty)}</li>
                              ))}
                              {!order.order_items?.length && <li style={{ color: 'var(--text-muted)' }}>No items found.</li>}
                            </ul>
                            
                            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(0,0,0,0.05)', display: 'flex', gap: 12, alignItems: 'center' }}>
                              <strong style={{ fontSize: '0.8rem' }}>Actions:</strong>
                              <select value={order.status} onChange={e => updateStatus(order.id, e.target.value)} style={{ padding: '6px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                                {statuses.filter(s => s !== 'all').map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                              {isAdmin && (
                                <button onClick={() => deleteOrder(order.id)} style={{ background: '#fee2e2', color: '#991b1b', border: 'none', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem' }}>
                                  Delete Order
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </td></tr>
                    )}
                  </React.Fragment>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                   <td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No orders found matching your filter.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
