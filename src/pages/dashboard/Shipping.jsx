import { useState, useEffect } from 'react';
import { Package, Truck, CheckCircle, Loader2, MapPin, Banknote } from 'lucide-react';
import { SkelKpiGrid, SkelTable, SkelLine } from '../../components/Skeleton';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../context/ToastContext';
import { useOutletContext } from 'react-router-dom';

const fmt = (n) => '₦' + Number(n).toLocaleString();

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function weeklyDeliveryChart(orders) {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);

  return DAYS.map((_, i) => {
    const dayStart = new Date(monday);
    dayStart.setDate(monday.getDate() + i);
    const dayEnd = new Date(dayStart);
    dayEnd.setHours(23, 59, 59, 999);
    return orders
      .filter(o => o.status === 'delivered')
      .filter(o => { const d = new Date(o.created_at); return d >= dayStart && d <= dayEnd; })
      .reduce((s, o) => s + (Number(o.delivery_fee) || 0), 0);
  });
}

const STATUS_FLOW = {
  pending:    { next: 'processing', label: 'Start Processing', color: '#f59e0b' },
  processing: { next: 'shipped',    label: 'Mark Dispatched',  color: '#3b82f6' },
  shipped:    { next: 'delivered',  label: 'Mark Delivered',   color: '#22c55e' },
};

export default function Shipping() {
  const { selectedStore } = useOutletContext() || {};
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(null);
  const [filter, setFilter] = useState('active');
  const { showToast } = useToast();

  const filters = [
    { key: 'active',    label: 'Active' },
    { key: 'pending',   label: 'Pending' },
    { key: 'processing',label: 'Processing' },
    { key: 'shipped',   label: 'Dispatched' },
    { key: 'delivered', label: 'Delivered' },
  ];

  useEffect(() => { fetchData(); }, [selectedStore]);

  const fetchData = async () => {
    setLoading(true);
    let query = supabase
      .from('orders')
      .select('id, customer_name, customer_phone, delivery_address, total, delivery_fee, status, created_at, notes')
      .not('status', 'in', '("cancelled")')
      .order('created_at', { ascending: false });
    if (selectedStore && selectedStore !== 'all') {
      query = query.eq('store_id', selectedStore);
    }
    const { data } = await query;
    if (data) setOrders(data);
    setLoading(false);
  };

  const handleStatusUpdate = async (order, nextStatus) => {
    setUpdating(order.id);
    const { error } = await supabase.from('orders').update({ status: nextStatus }).eq('id', order.id);
    if (error) {
      showToast('Update failed', error.message, 'error');
    } else {
      setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: nextStatus } : o));
      showToast('Status updated', `Order ${order.id} → ${nextStatus}`);
    }
    setUpdating(null);
  };

  const filtered = orders.filter(o => {
    if (filter === 'active') return ['pending', 'processing', 'shipped'].includes(o.status);
    return o.status === filter;
  });

  const counts = {
    pending:    orders.filter(o => o.status === 'pending').length,
    processing: orders.filter(o => o.status === 'processing').length,
    shipped:    orders.filter(o => o.status === 'shipped').length,
    delivered:  orders.filter(o => o.status === 'delivered').length,
  };

  const totalDeliveryFees = orders
    .filter(o => o.status !== 'cancelled')
    .reduce((sum, o) => sum + (Number(o.delivery_fee) || 0), 0);

  const successfulDeliveries = orders.filter(o => o.status === 'delivered');
  const successfulDeliveryFees = successfulDeliveries.reduce((sum, o) => sum + (Number(o.delivery_fee) || 0), 0);

  const chartData = weeklyDeliveryChart(orders);
  const maxChart = Math.max(...chartData, 1);

  if (loading) return (
    <div>
      <SkelKpiGrid count={3} />
      <div style={{ marginBottom: 24 }}>
        <SkelLine lg style={{ width: 200, marginBottom: 16 }} />
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-subtle)', borderRadius: 16, padding: 24, display: 'flex', alignItems: 'flex-end', gap: 8, height: 160 }}>
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="skel" style={{ flex: 1, height: `${20 + Math.random() * 70}%`, borderRadius: 6 }} />
          ))}
        </div>
      </div>
      <SkelTable rows={6} cols={5} />
    </div>
  );

  return (
    <div>
      <div className="dash-card-header" style={{ marginBottom: 20 }}>
        <div className="dash-card-title" style={{ fontFamily: "'Mona Sans', 'Mona-Sans', 'Helvetica Neue', sans-serif", fontSize: '1.4rem' }}>Shipping & Dispatch</div>
      </div>

      <div className="kpi-grid" style={{ marginBottom: 24 }}>
        <div className="kpi-card yellow">
          <div className="kpi-icon"><Package size={24} /></div>
          <div className="kpi-value">{counts.pending}</div>
          <div className="kpi-label">Pending</div>
        </div>
        <div className="kpi-card blue">
          <div className="kpi-icon"><Package size={24} /></div>
          <div className="kpi-value">{counts.processing}</div>
          <div className="kpi-label">Processing</div>
        </div>
        <div className="kpi-card red">
          <div className="kpi-icon"><Truck size={24} /></div>
          <div className="kpi-value">{counts.shipped}</div>
          <div className="kpi-label">Dispatched</div>
        </div>
        <div className="kpi-card green">
          <div className="kpi-icon"><CheckCircle size={24} /></div>
          <div className="kpi-value">{counts.delivered}</div>
          <div className="kpi-label">Delivered</div>
        </div>
        <div className="kpi-card" style={{ background: 'var(--card-bg)', border: '1px solid var(--border-subtle)' }}>
          <div className="kpi-icon"><Banknote size={24} /></div>
          <div className="kpi-value" style={{ fontSize: '1.2rem' }}>{fmt(totalDeliveryFees)}</div>
          <div className="kpi-label">Total Delivery Fees</div>
        </div>
        <div className="kpi-card green">
          <div className="kpi-icon"><CheckCircle size={24} /></div>
          <div className="kpi-value">{successfulDeliveries.length}</div>
          <div className="kpi-label">Successful Deliveries</div>
          <div style={{ fontSize: '0.82rem', fontWeight: 700, marginTop: 4, opacity: 0.85 }}>{fmt(successfulDeliveryFees)}</div>
        </div>
      </div>

      {/* Weekly Delivery Revenue Chart */}
      <div className="dash-card" style={{ marginBottom: 24 }}>
        <div className="dash-card-header">
          <div className="dash-card-title">Weekly Delivery Revenue</div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Delivery fees from completed orders this week</div>
        </div>
        <div className="chart-container">
          {chartData.map((val, i) => (
            <div key={i} className="chart-bar" style={{ height: `${(val / maxChart) * 100}%` }}>
              <div className="chart-bar-value">{val > 0 ? fmt(val) : ''}</div>
              <div className="chart-bar-label">{DAYS[i]}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="dash-filters" style={{ marginBottom: 16 }}>
        {filters.map(f => (
          <button key={f.key} className={`dash-filter-btn${filter === f.key ? ' active' : ''}`} onClick={() => setFilter(f.key)}>
            {f.label} {f.key !== 'active' && <span style={{ opacity: 0.6, marginLeft: 4 }}>({counts[f.key] ?? ''})</span>}
          </button>
        ))}
      </div>

      <div className="dash-card">
        <div style={{ overflowX: 'auto' }}>
          <table className="dash-table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Customer</th>
                <th><MapPin size={13} style={{ verticalAlign: 'text-bottom' }} /> Delivery Address</th>
                <th>Amount</th>
                <th>Delivery Fee</th>
                <th>Time</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(order => {
                const next = STATUS_FLOW[order.status];
                return (
                  <tr key={order.id}>
                    <td style={{ fontWeight: 700, color: 'var(--red)', whiteSpace: 'nowrap' }}>{order.id}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{order.customer_name}</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{order.customer_phone}</div>
                    </td>
                    <td style={{ fontSize: '0.85rem', maxWidth: 200 }}>
                      <div>{order.delivery_address}</div>
                      {order.notes && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>Note: {order.notes}</div>}
                    </td>
                    <td style={{ fontWeight: 700 }}>{fmt(order.total)}</td>
                    <td style={{ fontWeight: 700, color: 'var(--green)' }}>{order.delivery_fee ? fmt(order.delivery_fee) : '—'}</td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      <div>{new Date(order.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                      <div style={{ fontWeight: 600 }}>{new Date(order.created_at).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}</div>
                    </td>
                    <td><span className={`status-badge ${order.status}`}>{order.status}</span></td>
                    <td>
                      {next ? (
                        <button
                          onClick={() => handleStatusUpdate(order, next.next)}
                          disabled={updating === order.id}
                          style={{
                            background: next.color, color: '#fff', border: 'none',
                            padding: '6px 12px', borderRadius: 6, cursor: 'pointer',
                            fontWeight: 700, fontSize: '0.78rem', whiteSpace: 'nowrap',
                            opacity: updating === order.id ? 0.6 : 1
                          }}
                        >
                          {updating === order.id ? <Loader2 size={14} className="spin" /> : next.label}
                        </button>
                      ) : (
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>✓ Done</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    No orders in this category.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
