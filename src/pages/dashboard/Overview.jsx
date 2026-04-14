import React, { useState, useEffect } from 'react';
import { DollarSign, Package, Truck, Store, Download, ChevronUp, ChevronDown } from 'lucide-react';
import * as XLSX from 'xlsx';
import { SkelKpiGrid, SkelTable, SkelLine } from '../../components/Skeleton';
import { supabase } from '../../lib/supabase';
import { useOutletContext } from 'react-router-dom';

const fmt = (n) => '₦' + n.toLocaleString();
const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const PERIODS = [
  { label: 'Today',      value: 'today' },
  { label: 'This Week',  value: 'week' },
  { label: 'This Month', value: 'month' },
  { label: 'This Year',  value: 'year' },
  { label: 'All Time',   value: 'all' },
];

function getStartDate(period) {
  const now = new Date();
  switch (period) {
    case 'today': { const d = new Date(now); d.setHours(0,0,0,0); return d; }
    case 'week':  { const d = new Date(now); d.setDate(now.getDate() - ((now.getDay() + 6) % 7)); d.setHours(0,0,0,0); return d; }
    case 'month': { return new Date(now.getFullYear(), now.getMonth(), 1); }
    case 'year':  { return new Date(now.getFullYear(), 0, 1); }
    default: return null;
  }
}

export default function Overview() {
  const { selectedStore } = useOutletContext() || {};
  const [orders, setOrders] = useState([]);
  const [stores, setStores] = useState(0);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('all');
  const [sortKey, setSortKey] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');

  useEffect(() => {
    fetchData();
  }, [selectedStore]);

  const fetchData = async () => {
    setLoading(true);
    let ordersQuery = supabase.from('orders').select('id,customer_name,total,status,created_at,store_id').order('created_at', { ascending: false });
    if (selectedStore && selectedStore !== 'all') {
      ordersQuery = ordersQuery.eq('store_id', selectedStore);
    }
    const [ordersRes, storesRes] = await Promise.all([
      ordersQuery,
      supabase.from('stores').select('id', { count: 'exact' })
    ]);

    if (ordersRes.data) setOrders(ordersRes.data);
    if (storesRes.data) setStores(storesRes.data.length);

    setLoading(false);
  };

  // Period filter
  const startDate = getStartDate(period);
  const periodOrders = startDate
    ? orders.filter(o => new Date(o.created_at) >= startDate)
    : orders;

  const totalRevenue = periodOrders.reduce((s, o) => s + (o.status !== 'cancelled' ? Number(o.total) : 0), 0);
  const orderCount = periodOrders.length;
  const pendingShipments = periodOrders.filter(o => ['pending', 'processing'].includes(o.status)).length;

  // Column sort for recent orders
  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const SortIcon = ({ col }) => {
    if (sortKey !== col) return <ChevronUp size={11} style={{ opacity: 0.25, verticalAlign: 'middle', marginLeft: 3 }} />;
    return sortDir === 'asc'
      ? <ChevronUp size={11} style={{ verticalAlign: 'middle', marginLeft: 3, color: 'var(--red)' }} />
      : <ChevronDown size={11} style={{ verticalAlign: 'middle', marginLeft: 3, color: 'var(--red)' }} />;
  };

  const thStyle = (col) => ({
    cursor: 'pointer', userSelect: 'none',
    background: sortKey === col ? 'var(--black2)' : undefined,
  });

  const sortedOrders = [...periodOrders].sort((a, b) => {
    let av = a[sortKey], bv = b[sortKey];
    if (sortKey === 'total') { av = Number(av || 0); bv = Number(bv || 0); }
    else if (sortKey === 'created_at') { av = new Date(av); bv = new Date(bv); }
    else { av = String(av || '').toLowerCase(); bv = String(bv || '').toLowerCase(); }
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const recentOrders = sortedOrders.slice(0, 10);

  const exportToExcel = () => {
    const wb = XLSX.utils.book_new();
    const periodLabel = PERIODS.find(p => p.value === period)?.label || period;

    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Period', periodLabel],
      [],
      ['Metric', 'Value'],
      ['Total Revenue (₦)', totalRevenue],
      ['Orders in Period', orderCount],
      ['Pending Shipments', pendingShipments],
      ['Active Stores', stores],
    ]), 'Summary');

    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Day', 'Revenue (₦)'],
      ...days.map((d, i) => [d, chartData[i]]),
    ]), 'Weekly Revenue');

    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Order ID', 'Customer', 'Total (₦)', 'Status', 'Date'],
      ...periodOrders.map(o => [
        o.id,
        o.customer_name,
        Number(o.total || 0),
        o.status,
        new Date(o.created_at).toLocaleDateString(),
      ]),
    ]), 'Orders');

    XLSX.writeFile(wb, `smokeyhut-overview-${period}-${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // Weekly revenue: Mon–Sun of the current week (always current week)
  const chartData = (() => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
    monday.setHours(0, 0, 0, 0);

    return days.map((_, i) => {
      const dayStart = new Date(monday);
      dayStart.setDate(monday.getDate() + i);
      const dayEnd = new Date(dayStart);
      dayEnd.setHours(23, 59, 59, 999);
      return orders
        .filter(o => o.status !== 'cancelled')
        .filter(o => { const d = new Date(o.created_at); return d >= dayStart && d <= dayEnd; })
        .reduce((s, o) => s + Number(o.total || 0), 0);
    });
  })();
  const maxChart = Math.max(...chartData, 1);

  if (loading) return (
    <div>
      <SkelKpiGrid count={4} />
      <div style={{ marginBottom: 24 }}>
        <SkelLine lg style={{ width: 160, marginBottom: 16 }} />
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-subtle)', borderRadius: 16, padding: 24, display: 'flex', alignItems: 'flex-end', gap: 8, height: 180 }}>
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="skel" style={{ flex: 1, height: `${30 + Math.random() * 60}%`, borderRadius: 6 }} />
          ))}
        </div>
      </div>
      <SkelLine lg style={{ width: 160, marginBottom: 16 }} />
      <SkelTable rows={5} cols={4} />
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontFamily: "'Mona Sans','Mona-Sans','Helvetica Neue',sans-serif", fontSize: '1.4rem', fontWeight: 900, marginBottom: 4 }}>Overview</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Store performance at a glance.</p>
        </div>
        <button
          onClick={exportToExcel}
          disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '9px 18px', borderRadius: 8, border: '1px solid var(--border-subtle)',
            background: '#16a34a', color: '#fff',
            fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer',
            fontFamily: "'DM Sans',sans-serif", opacity: loading ? 0.5 : 1,
          }}
        >
          <Download size={15} /> Export to Excel
        </button>
      </div>

      {/* Period filter */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 24, flexWrap: 'wrap' }}>
        {PERIODS.map(p => (
          <button
            key={p.value}
            onClick={() => setPeriod(p.value)}
            style={{
              padding: '7px 16px', borderRadius: 20,
              border: `1px solid ${period === p.value ? 'var(--red)' : 'var(--border-subtle)'}`,
              background: period === p.value ? 'var(--red)' : 'var(--white)',
              color: period === p.value ? '#fff' : 'var(--text)',
              fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer',
              fontFamily: "'DM Sans',sans-serif", transition: 'all 0.15s',
            }}
          >{p.label}</button>
        ))}
      </div>

      {/* KPIs */}
      <div className="kpi-grid">
        <div className="kpi-card red">
          <div className="kpi-icon"><DollarSign size={24} /></div>
          <div className="kpi-value">{fmt(totalRevenue)}</div>
          <div className="kpi-label">Total Revenue</div>
          <div className="kpi-change up">{PERIODS.find(p => p.value === period)?.label}</div>
        </div>
        <div className="kpi-card blue">
          <div className="kpi-icon"><Package size={24} /></div>
          <div className="kpi-value">{orderCount}</div>
          <div className="kpi-label">Orders</div>
          <div className="kpi-change up">{PERIODS.find(p => p.value === period)?.label}</div>
        </div>
        <div className="kpi-card yellow">
          <div className="kpi-icon"><Truck size={24} /></div>
          <div className="kpi-value">{pendingShipments}</div>
          <div className="kpi-label">Pending Shipments</div>
          <div className="kpi-change down">Needs attention</div>
        </div>
        <div className="kpi-card green">
          <div className="kpi-icon"><Store size={24} /></div>
          <div className="kpi-value">{stores}</div>
          <div className="kpi-label">Active Stores</div>
          <div className="kpi-change up">All operational</div>
        </div>
      </div>

      {/* Revenue Chart */}
      <div className="dash-card">
        <div className="dash-card-header">
          <div className="dash-card-title">Weekly Revenue</div>
        </div>
        <div className="chart-container">
          {chartData.map((val, i) => (
            <div key={i} className="chart-bar" style={{ height: `${(val / maxChart) * 100}%` }}>
              <div className="chart-bar-value">{fmt(val)}</div>
              <div className="chart-bar-label">{days[i]}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Orders */}
      <div className="dash-card">
        <div className="dash-card-header">
          <div className="dash-card-title">
            Recent Orders
            <span style={{ fontSize: '0.78rem', fontWeight: 400, color: 'var(--text-muted)', marginLeft: 8 }}>
              {periodOrders.length} order{periodOrders.length !== 1 ? 's' : ''} · showing top 10
            </span>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="dash-table">
            <thead>
              <tr>
                <th style={thStyle('id')} onClick={() => handleSort('id')}>Order ID <SortIcon col="id" /></th>
                <th style={thStyle('customer_name')} onClick={() => handleSort('customer_name')}>Customer <SortIcon col="customer_name" /></th>
                <th style={thStyle('total')} onClick={() => handleSort('total')}>Total <SortIcon col="total" /></th>
                <th style={thStyle('status')} onClick={() => handleSort('status')}>Status <SortIcon col="status" /></th>
                <th style={thStyle('created_at')} onClick={() => handleSort('created_at')}>Date &amp; Time <SortIcon col="created_at" /></th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.map(order => (
                <tr key={order.id}>
                  <td style={{ fontWeight: 700, color: 'var(--red)' }}>{order.id}</td>
                  <td>{order.customer_name}</td>
                  <td style={{ fontWeight: 700 }}>{fmt(order.total || 0)}</td>
                  <td><span className={`status-badge ${order.status}`}>{order.status}</span></td>
                  <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    <div>{new Date(order.created_at).toLocaleDateString()}</div>
                    <div style={{ fontSize: '0.75rem', marginTop: 2 }}>{new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}</div>
                  </td>
                </tr>
              ))}
              {recentOrders.length === 0 && (
                <tr><td colSpan="5" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>No orders in this period.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
