import { useState, useEffect } from 'react';
import { Package, Truck, CheckCircle, Loader2, MapPin, Banknote } from 'lucide-react';
import DashCalendar from '../../components/DashCalendar';
import { SkelKpiGrid, SkelTable, SkelDashHeader, SkelFilterPills, SkelChart } from '../../components/Skeleton';
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

import { useAuth } from '../../context/AuthContext';

export default function Shipping() {
  const { userRole, userPermissions } = useAuth();
  const isAdmin = userRole === 'Admin';
  const canManage = isAdmin || userRole === 'Manager' || userRole === 'Rider' || (userPermissions || []).includes('Shipping:manage');
  const { selectedStore } = useOutletContext() || {};
  const [orders, setOrders] = useState([]);
  const [kpis, setKpis] = useState(EMPTY_KPIS);
  const [chartData, setChartData] = useState([0, 0, 0, 0, 0, 0, 0]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(null);
  const [filter, setFilter] = useState('active');
  const [dateFilter, setDateFilter] = useState({ start: null, end: null });
  const { showToast } = useToast();

  const filters = [
    { key: 'active',     label: 'Active' },
    { key: 'pending',    label: 'Pending' },
    { key: 'processing', label: 'Processing' },
    { key: 'shipped',    label: 'Dispatched' },
    { key: 'delivered',  label: 'Delivered' },
  ];

  useEffect(() => {
    // Only run if range selection is complete or cleared
    const isDateFilterIncomplete = dateFilter && dateFilter.start && !dateFilter.end;
    if (isDateFilterIncomplete) return;
    fetchData();
  }, [selectedStore, dateFilter]);

  const fetchData = async () => {
    setLoading(true);
    const storeParam = selectedStore && selectedStore !== 'all' ? Number(selectedStore) : null;

    let tableQuery = supabase
      .from('orders')
      .select('id, customer_name, customer_phone, delivery_address, total, delivery_fee, status, created_at, notes')
      .is('deleted_at', null)
      .not('status', 'in', '("cancelled")')
      .order('created_at', { ascending: false });

    if (dateFilter && dateFilter.start && dateFilter.end) {
      const start = new Date(`${dateFilter.start}T00:00:00`);
      const end = new Date(`${dateFilter.end}T23:59:59.999`);
      tableQuery = tableQuery.gte('created_at', start.toISOString()).lte('created_at', end.toISOString());
    } else {
      tableQuery = tableQuery.limit(300);
    }
    if (selectedStore && selectedStore !== 'all') {
      tableQuery = tableQuery.eq('store_id', selectedStore);
    }

    // Fallback queries — minimal columns, no row limit, only fetched if RPC fails
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    weekStart.setHours(0, 0, 0, 0);

    let kpiFallbackQuery = supabase.from('orders').select('status, delivery_fee').is('deleted_at', null).not('status', 'in', '("cancelled")');
    if (selectedStore && selectedStore !== 'all') kpiFallbackQuery = kpiFallbackQuery.eq('store_id', selectedStore);

    let chartFallbackQuery = supabase.from('orders').select('status, delivery_fee, created_at').is('deleted_at', null).eq('status', 'delivered').gte('created_at', weekStart.toISOString());
    if (selectedStore && selectedStore !== 'all') chartFallbackQuery = chartFallbackQuery.eq('store_id', selectedStore);

    const [kpisRes, chartRes, ordersRes, kpiFallbackRes, chartFallbackRes] = await Promise.all([
      supabase.rpc('get_shipping_kpis', { p_store_id: storeParam }),
      supabase.rpc('get_weekly_delivery_chart', { p_store_id: storeParam }),
      tableQuery,
      kpiFallbackQuery,
      chartFallbackQuery,
    ]);

    setOrders(ordersRes.data || []);

    if (dateFilter && dateFilter.start && dateFilter.end) {
      // When filtering by a specific date, calculate KPIs locally from the fetched orders
      // (because tableQuery has no row limit for specific dates, this is 100% accurate)
      const dateOrders = ordersRes.data || [];
      setKpis({
        pending:         dateOrders.filter(o => o.status === 'pending').length,
        processing:      dateOrders.filter(o => o.status === 'processing').length,
        shipped:         dateOrders.filter(o => o.status === 'shipped').length,
        delivered:       dateOrders.filter(o => o.status === 'delivered').length,
        total_fees:      dateOrders.reduce((s, o) => s + (Number(o.delivery_fee) || 0), 0),
        delivered_count: dateOrders.filter(o => o.status === 'delivered').length,
        delivered_fees:  dateOrders.filter(o => o.status === 'delivered').reduce((s, o) => s + (Number(o.delivery_fee) || 0), 0),
      });
    } else if (kpisRes.data) {
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

    const { error } = await supabase.from('orders').update({ status: nextStatus }).eq('id', order.id);
    if (error) {
      showToast('Update failed', error.message, 'error');
    } else {
      setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: nextStatus } : o));
      // Refresh server-side KPIs after status change (if not date-filtered)
      if (!dateFilter || (!dateFilter.start && !dateFilter.end)) {
        const storeParam = selectedStore && selectedStore !== 'all' ? Number(selectedStore) : null;
        supabase.rpc('get_shipping_kpis', { p_store_id: storeParam }).then(({ data }) => {
          if (data) setKpis(data);
        });
      } else {
        // If date-filtered, update KPI locally instantly
        setKpis(prev => {
          const wasStatus = order.status;
          return {
            ...prev,
            [wasStatus]: Math.max(0, prev[wasStatus] - 1),
            [nextStatus]: prev[nextStatus] + 1,
            delivered_count: nextStatus === 'delivered' ? prev.delivered_count + 1 : prev.delivered_count,
            delivered_fees: nextStatus === 'delivered' ? prev.delivered_fees + (Number(order.delivery_fee) || 0) : prev.delivered_fees,
          };
        });
      }
      showToast('Status updated', `Order ${order.id} → ${nextStatus}`);
    }
    setUpdating(null);
  };

  const filtered = orders.filter(o => {
    const matchStatus = filter === 'active'
      ? ['pending', 'processing', 'shipped'].includes(o.status)
      : o.status === filter;
    const orderDateStr = new Date(o.created_at).toLocaleDateString('en-CA');
    const matchDate = !dateFilter || !dateFilter.start || !dateFilter.end ||
      (orderDateStr >= dateFilter.start && orderDateStr <= dateFilter.end);
    return matchStatus && matchDate;
  });

  const maxChart = Math.max(...chartData, 1);

  if (loading) return (
    <div>
      <SkelDashHeader />
      <SkelKpiGrid count={6} />
      <SkelChart height={160} />
      <SkelFilterPills count={5} />
      <SkelTable rows={6} cols={8} />
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
        <DashCalendar
          range={true}
          value={dateFilter}
          onChange={setDateFilter}
          placeholder="Pick a date range"
        />
        {dateFilter && (dateFilter.start || dateFilter.end) && (
          <button onClick={() => setDateFilter({ start: null, end: null })} style={{ background: 'none', border: 'none', fontSize: '0.8rem', color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 600 }}>
            Clear dates
          </button>
        )}
      </div>



      <div className="dash-card">
        <div style={{ overflowX: 'auto' }}>
          <table className="dash-table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Customer</th>
                <th><MapPin size={13} style={{ verticalAlign: 'text-bottom' }} /> Delivery Address</th>
                <th>Amount Paid</th>
                <th style={{ color: 'var(--red)', fontWeight: 800 }}>Collect (Delivery)</th>
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
                    <td style={{ fontWeight: 700 }}>
                      <div style={{ color: 'var(--green)' }}>Paid: {fmt(order.total)}</div>
                    </td>
                    <td style={{ fontWeight: 800, color: 'var(--red)', background: 'rgba(192,32,31,0.08)', borderRadius: 8 }}>
                      {order.delivery_fee ? fmt(order.delivery_fee) : '—'}
                    </td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      <div>{new Date(order.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                      <div style={{ fontWeight: 600 }}>{new Date(order.created_at).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: true })}</div>
                    </td>
                    <td><span className={`status-badge ${order.status}`}>{order.status}</span></td>
                    <td>
                      {next ? (
                        canManage ? (
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
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>—</span>
                        )
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
