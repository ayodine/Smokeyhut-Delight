import React, { useState, useEffect } from 'react';
import { DollarSign, Package, Truck, Store, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { SkelKpiGrid, SkelTable, SkelLine } from '../../components/Skeleton';
import { supabase } from '../../lib/supabase';
import { useOutletContext } from 'react-router-dom';

const fmt = (n) => '₦' + n.toLocaleString();
const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function Overview() {
  const { selectedStore } = useOutletContext() || {};
  const [orders, setOrders] = useState([]);
  const [stores, setStores] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [selectedStore]);

  const fetchData = async () => {
    setLoading(true);
    let ordersQuery = supabase.from('orders').select('*').order('created_at', { ascending: false });
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

  const totalRevenue = orders.reduce((s, o) => s + (o.status !== 'cancelled' ? Number(o.total) : 0), 0);
  const todayOrders = orders.filter(o => {
    const d = new Date(o.created_at);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  }).length;
  
  const pendingShipments = orders.filter(o => ['pending', 'processing'].includes(o.status)).length;
  const recentOrders = orders.slice(0, 5);

  const exportToExcel = () => {
    const wb = XLSX.utils.book_new();

    // Sheet 1: Summary
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Metric', 'Value'],
      ['Total Revenue (₦)', totalRevenue],
      ['Orders Today', todayOrders],
      ['Pending Shipments', pendingShipments],
      ['Active Stores', stores],
    ]), 'Summary');

    // Sheet 2: Weekly Revenue
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Day', 'Revenue (₦)'],
      ...days.map((d, i) => [d, chartData[i]]),
    ]), 'Weekly Revenue');

    // Sheet 3: All Orders
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Order ID', 'Customer', 'Total (₦)', 'Status', 'Date'],
      ...orders.map(o => [
        o.id,
        o.customer_name,
        Number(o.total || 0),
        o.status,
        new Date(o.created_at).toLocaleDateString(),
      ]),
    ]), 'All Orders');

    XLSX.writeFile(wb, `smokeyhut-overview-${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // Weekly revenue: Mon–Sun of the current week
  const chartData = (() => {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sun,1=Mon,...6=Sat
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
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

      {/* KPIs */}
      <div className="kpi-grid">
        <div className="kpi-card red">
          <div className="kpi-icon"><DollarSign size={24} /></div>
          <div className="kpi-value">{fmt(totalRevenue)}</div>
          <div className="kpi-label">Total Revenue</div>
          <div className="kpi-change up">All time</div>
        </div>
        <div className="kpi-card blue">
          <div className="kpi-icon"><Package size={24} /></div>
          <div className="kpi-value">{todayOrders}</div>
          <div className="kpi-label">Orders Today</div>
          <div className="kpi-change up">↑ Live</div>
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
          <div className="dash-card-title">Recent Orders</div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="dash-table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Customer</th>
                <th>Total</th>
                <th>Status</th>
                <th>Date &amp; Time</th>
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
                    <div style={{ fontSize: '0.75rem', marginTop: 2 }}>{new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                  </td>
                </tr>
              ))}
              {recentOrders.length === 0 && (
                <tr><td colSpan="5" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>No recent orders.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
