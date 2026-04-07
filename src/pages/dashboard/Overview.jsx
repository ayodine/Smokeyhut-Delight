import React, { useState, useEffect } from 'react';
import { DollarSign, Package, Truck, Store, Loader2 } from 'lucide-react';
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

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><Loader2 className="spin" size={32} color="var(--red)" /></div>;

  return (
    <div>
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
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.map(order => (
                <tr key={order.id}>
                  <td style={{ fontWeight: 700, color: 'var(--red)' }}>{order.id}</td>
                  <td>{order.customer_name}</td>
                  <td style={{ fontWeight: 700 }}>{fmt(order.total || 0)}</td>
                  <td><span className={`status-badge ${order.status}`}>{order.status}</span></td>
                  <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{new Date(order.created_at).toLocaleDateString()}</td>
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
