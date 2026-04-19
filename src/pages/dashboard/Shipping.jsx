import { useState, useEffect } from 'react';
import { Package, Truck, CheckCircle, Loader2, MapPin, Banknote, X } from 'lucide-react';
import { SkelKpiGrid, SkelTable, SkelLine } from '../../components/Skeleton';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../context/ToastContext';
import { useOutletContext } from 'react-router-dom';

const fmt = (n) => '₦' + Number(n).toLocaleString();

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const STATUS_FLOW = {
  pending:    { next: 'processing', label: 'Start Processing', color: '#f59e0b' },
  processing: { next: 'shipped',    label: 'Mark Dispatched',  color: '#3b82f6' },
  shipped:    { next: 'delivered',  label: 'Mark Delivered',   color: '#22c55e' },
};

const EMPTY_KPIS = {
  pending: 0, processing: 0, shipped: 0, delivered: 0,
  total_fees: 0, delivered_count: 0, delivered_fees: 0,
};

export default function Shipping() {
  const { selectedStore } = useOutletContext() || {};
  const [orders, setOrders] = useState([]);
  const [kpis, setKpis] = useState(EMPTY_KPIS);
  const [chartData, setChartData] = useState([0, 0, 0, 0, 0, 0, 0]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(null);
  const [filter, setFilter] = useState('active');
  const [dateFilter, setDateFilter] = useState('');
  const { showToast } = useToast();

  const filters = [
    { key: 'active',     label: 'Active' },
    { key: 'pending',    label: 'Pending' },
    { key: 'processing', label: 'Processing' },
    { key: 'shipped',    label: 'Dispatched' },
    { key: 'delivered',  label: 'Delivered' },
  ];

  useEffect(() => { fetchData(); }, [selectedStore]);

  const fetchData = async () => {
    setLoading(true);
    const storeParam = selectedStore && selectedStore !== 'all' ? Number(selectedStore) : null;

    let tableQuery = supabase
      .from('orders')
      .select('id, customer_name, customer_phone, delivery_address, total, delivery_fee, status, created_at, notes')
      .not('status', 'in', '("cancelled")')
      .order('created_at', { ascending: false })
      .limit(300);
    if (selectedStore && selectedStore !== 'all') {
      tableQuery = tableQuery.eq('store_id', selectedStore);
    }

    // Fallback queries — minimal columns, no row limit, only fetched if RPC fails
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    weekStart.setHours(0, 0, 0, 0);

    let kpiFallbackQuery = supabase.from('orders').select('status, delivery_fee').not('status', 'in', '("cancelled")');
    if (selectedStore && selectedStore !== 'all') kpiFallbackQuery = kpiFallbackQuery.eq('store_id', selectedStore);

    let chartFallbackQuery = supabase.from('orders').select('status, delivery_fee, created_at').eq('status', 'delivered').gte('created_at', weekStart.toISOString());
    if (selectedStore && selectedStore !== 'all') chartFallbackQuery = chartFallbackQuery.eq('store_id', selectedStore);

    const [kpisRes, chartRes, ordersRes, kpiFallbackRes, chartFallbackRes] = await Promise.all([
      supabase.rpc('get_shipping_kpis', { p_store_id: storeParam }),
      supabase.rpc('get_weekly_delivery_chart', { p_store_id: storeParam }),
      tableQuery,
      kpiFallbackQuery,
      chartFallbackQuery,
    ]);

    setOrders(ordersRes.data || []);

    if (kpisRes.data) {
      setKpis(kpisRes.data);
    } else {
      const all = kpiFallbackRes.data || [];
      setKpis({
        pending:         all.filter(o => o.status === 'pending').length,
        processing:      all.filter(o => o.status === 'processing').length,
        shipped:         all.filter(o => o.status === 'shipped').length,
        delivered:       all.filter(o => o.status === 'delivered').length,
        total_fees:      all.reduce((s, o) => s + (Number(o.delivery_fee) || 0), 0),
        delivered_count: all.filter(o => o.status === 'delivered').length,
        delivered_fees:  all.filter(o => o.status === 'delivered').reduce((s, o) => s + (Number(o.delivery_fee) || 0), 0),
      });
    }

    if (chartRes.data) {
      setChartData(chartRes.data);
    } else {
      const crows = chartFallbackRes.data || [];
      const monday = weekStart;
      setChartData([0, 1, 2, 3, 4, 5, 6].map(i => {
        const dayStart = new Date(monday); dayStart.setDate(monday.getDate() + i);
        const dayEnd = new Date(dayStart); dayEnd.setHours(23, 59, 59, 999);
        return crows.filter(o => { const d = new Date(o.created_at); return d >= dayStart && d <= dayEnd; }).reduce((s, o) => s + (Number(o.delivery_fee) || 0), 0);
      }));
    }
    setLoading(false);
  };

  const handleStatusUpdate = async (order, nextStatus) => {
    setUpdating(order.id);

    // Decrement stock only when transitioning to 'shipped' for the first time
    if (nextStatus === 'shipped') {
      const { data: current } = await supabase.from('orders').select('status').eq('id', order.id).single();
      if (current?.status !== 'shipped') {
        const { data: orderItems } = await supabase.from('order_items').select('product_id, qty').eq('order_id', order.id);
        const validItems = (orderItems || []).filter(i => i.product_id);
        if (validItems.length > 0) {
          const productIds = [...new Set(validItems.map(i => String(i.product_id)))];
          const { data: productStock } = await supabase.from('products').select('id, stock').in('id', productIds);
          if (productStock?.length) {
            const stockMap = Object.fromEntries(productStock.map(p => [String(p.id), p.stock ?? 0]));
            const qtyMap = {};
            validItems.forEach(i => {
              qtyMap[String(i.product_id)] = (qtyMap[String(i.product_id)] || 0) + (i.qty || 0);
            });
            await Promise.all(
              Object.entries(qtyMap).map(([pid, qty]) =>
                supabase.from('products').update({ stock: Math.max(0, (stockMap[pid] ?? 0) - qty) }).eq('id', pid)
              )
            );
          }
        }
      }
    }

    const { error } = await supabase.from('orders').update({ status: nextStatus }).eq('id', order.id);
    if (error) {
      showToast('Update failed', error.message, 'error');
    } else {
      setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: nextStatus } : o));
      // Refresh server-side KPIs after status change
      const storeParam = selectedStore && selectedStore !== 'all' ? Number(selectedStore) : null;
      supabase.rpc('get_shipping_kpis', { p_store_id: storeParam }).then(({ data }) => {
        if (data) setKpis(data);
      });
      showToast('Status updated', `Order ${order.id} → ${nextStatus}`);
    }
    setUpdating(null);
  };

  const filtered = orders.filter(o => {
    const matchStatus = filter === 'active'
      ? ['pending', 'processing', 'shipped'].includes(o.status)
      : o.status === filter;
    const matchDate = !dateFilter || new Date(o.created_at).toLocaleDateString('en-CA') === dateFilter;
    return matchStatus && matchDate;
  });

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
          <div className="kpi-value">{kpis.pending}</div>
          <div className="kpi-label">Pending</div>
        </div>
        <div className="kpi-card blue">
          <div className="kpi-icon"><Package size={24} /></div>
          <div className="kpi-value">{kpis.processing}</div>
          <div className="kpi-label">Processing</div>
        </div>
        <div className="kpi-card red">
          <div className="kpi-icon"><Truck size={24} /></div>
          <div className="kpi-value">{kpis.shipped}</div>
          <div className="kpi-label">Dispatched</div>
        </div>
        <div className="kpi-card green">
          <div className="kpi-icon"><CheckCircle size={24} /></div>
          <div className="kpi-value">{kpis.delivered}</div>
          <div className="kpi-label">Delivered</div>
        </div>
        <div className="kpi-card" style={{ background: 'var(--card-bg)', border: '1px solid var(--border-subtle)' }}>
          <div className="kpi-icon"><Banknote size={24} /></div>
          <div className="kpi-value" style={{ fontSize: '1.2rem' }}>{fmt(kpis.total_fees)}</div>
          <div className="kpi-label">Total Delivery Fees</div>
        </div>
        <div className="kpi-card green">
          <div className="kpi-icon"><CheckCircle size={24} /></div>
          <div className="kpi-value">{kpis.delivered_count}</div>
          <div className="kpi-label">Successful Deliveries</div>
          <div style={{ fontSize: '0.82rem', fontWeight: 700, marginTop: 4, opacity: 0.85 }}>{fmt(kpis.delivered_fees)}</div>
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

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <div className="dash-filters" style={{ marginBottom: 0 }}>
          {filters.map(f => (
            <button key={f.key} className={`dash-filter-btn${filter === f.key ? ' active' : ''}`} onClick={() => setFilter(f.key)}>
              {f.label} {f.key !== 'active' && <span style={{ opacity: 0.6, marginLeft: 4 }}>({kpis[f.key] ?? ''})</span>}
            </button>
          ))}
        </div>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <input
            type="date"
            value={dateFilter}
            onChange={e => setDateFilter(e.target.value)}
            style={{
              padding: '9px 12px', borderRadius: 8, fontSize: '0.85rem',
              border: `1px solid ${dateFilter ? 'var(--red)' : 'var(--border-subtle)'}`,
              background: 'var(--white)', color: 'var(--text)',
              fontFamily: "'DM Sans',sans-serif", cursor: 'pointer', outline: 'none',
              paddingRight: dateFilter ? 32 : 12,
            }}
          />
          {dateFilter && (
            <button
              onClick={() => setDateFilter('')}
              style={{ position: 'absolute', right: 8, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: 0 }}
              title="Clear date"
            ><X size={14} /></button>
          )}
        </div>
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
                      <div style={{ fontWeight: 600 }}>{new Date(order.created_at).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: true })}</div>
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
