import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, DollarSign, ShoppingBag, Truck, Tag, Calendar, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '../../../lib/supabase';
import DashCalendar from '../../../components/DashCalendar';

const fmt = v => `₦${Number(v || 0).toLocaleString('en-NG', { minimumFractionDigits: 0 })}`;

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
    case 'today': { const d = new Date(now); d.setHours(0,0,0,0); return d.toISOString(); }
    case 'week':  { const d = new Date(now); d.setDate(now.getDate() - now.getDay()); d.setHours(0,0,0,0); return d.toISOString(); }
    case 'month': { const d = new Date(now.getFullYear(), now.getMonth(), 1); return d.toISOString(); }
    case 'year':  { const d = new Date(now.getFullYear(), 0, 1); return d.toISOString(); }
    default: return null;
  }
}

const STATUS_COLORS = {
  pending:    { bg: '#fef9c3', color: '#92400e' },
  processing: { bg: '#dbeafe', color: '#1e40af' },
  shipped:    { bg: '#e0f2fe', color: '#075985' },
  delivered:  { bg: '#dcfce7', color: '#166534' },
  cancelled:  { bg: '#fee2e2', color: '#991b1b' },
};

export default function SalesReport() {
  const [period, setPeriod] = useState('month');
  const [customDate, setCustomDate] = useState({ start: null, end: null });
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    revenue: 0, deliveryFees: 0, discounts: 0, expenses: 0,
    orderCount: 0, breakdown: [],
  });

  useEffect(() => { load(); }, [period, customDate]);

  const load = async () => {
    // Only run if range selection is complete or cleared
    const isCustomDateIncomplete = period === 'custom' && customDate && customDate.start && !customDate.end;
    if (isCustomDateIncomplete) return;

    setLoading(true);
    const since = getStartDate(period);

    let ordersQ = supabase
      .from('orders')
      .select('id, status, delivery_fee, coupon_discount, created_at, order_items(price, qty)')
      .is('deleted_at', null);
      
    if (period === 'custom' && customDate && customDate.start && customDate.end) {
      const start = new Date(`${customDate.start}T00:00:00`);
      const end = new Date(`${customDate.end}T23:59:59.999`);
      ordersQ = ordersQ.gte('created_at', start.toISOString()).lte('created_at', end.toISOString());
    } else if (since) {
      ordersQ = ordersQ.gte('created_at', since);
    }

    let expensesQ = supabase.from('expenses').select('amount, date');
    if (period === 'custom' && customDate && customDate.start && customDate.end) {
      expensesQ = expensesQ.gte('date', customDate.start).lte('date', customDate.end);
    } else if (since) {
      expensesQ = expensesQ.gte('date', since.split('T')[0]);
    }

    const [{ data: orders }, { data: expenses }] = await Promise.all([ordersQ, expensesQ]);

    const nonCancelled = (orders || []).filter(o => o.status !== 'cancelled');

    let revenue = 0, deliveryFees = 0, discounts = 0;
    nonCancelled.forEach(o => {
      revenue    += (o.order_items || []).reduce((s, i) => s + i.price * i.qty, 0);
      deliveryFees += o.delivery_fee || 0;
      discounts    += o.coupon_discount || 0;
    });

    const totalExpenses = (expenses || []).reduce((s, e) => s + Number(e.amount || 0), 0);

    const statusList = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
    const breakdown = statusList.map(status => {
      const group = (orders || []).filter(o => o.status === status);
      const total = group.reduce((s, o) => s + (o.order_items || []).reduce((si, i) => si + i.price * i.qty, 0), 0);
      return { status, count: group.length, total };
    });

    setData({ revenue, deliveryFees, discounts, expenses: totalExpenses, orderCount: nonCancelled.length, breakdown });
    setLoading(false);
  };

  const grossRevenue = data.revenue + data.deliveryFees - data.discounts;
  const netProfit    = grossRevenue - data.expenses;

  const exportToExcel = () => {
    const periodLabel = period === 'custom' && customDate && customDate.start && customDate.end
      ? `Date: ${new Date(customDate.start).toLocaleDateString()} to ${new Date(customDate.end).toLocaleDateString()}`
      : (PERIODS.find(p => p.value === period)?.label || period);
    const wb = XLSX.utils.book_new();

    // Sheet 1: Summary
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Period', periodLabel],
      [],
      ['Metric', 'Value (₦)'],
      ['Revenue (Food Sales)', data.revenue],
      ['Delivery Fees Collected', data.deliveryFees],
      ['Coupon Discounts Given', data.discounts],
      ['Gross Revenue', grossRevenue],
      ['Total Expenses', data.expenses],
      ['Net Profit', netProfit],
      [],
      ['Total Orders (excl. cancelled)', data.orderCount],
    ]), 'Summary');

    // Sheet 2: Orders by Status
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Status', 'Order Count', 'Sales Value (₦)', '% of Revenue'],
      ...data.breakdown.map(row => {
        const pct = data.revenue > 0 ? ((row.total / data.revenue) * 100).toFixed(1) : '0.0';
        return [row.status, row.count, row.total, `${pct}%`];
      }),
    ]), 'Orders by Status');

    XLSX.writeFile(wb, `smokeyhut-sales-${period}-${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const kpis = [
    {
      label: 'Revenue',
      desc: 'Total food sales (excl. delivery)',
      value: fmt(data.revenue),
      icon: ShoppingBag,
      color: '#3b82f6',
      bg: '#eff6ff',
    },
    {
      label: 'Gross Revenue',
      desc: 'Revenue + delivery fees − discounts',
      value: fmt(grossRevenue),
      icon: DollarSign,
      color: '#f59e0b',
      bg: '#fffbeb',
    },
    {
      label: 'Net Profit',
      desc: 'Gross revenue − total expenses',
      value: fmt(netProfit),
      icon: netProfit >= 0 ? TrendingUp : TrendingDown,
      color: netProfit >= 0 ? '#16a34a' : '#dc2626',
      bg:    netProfit >= 0 ? '#dcfce7' : '#fee2e2',
    },
  ];

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontFamily: "'Mona Sans','Mona-Sans','Helvetica Neue',sans-serif", fontSize: '1.4rem', fontWeight: 900, marginBottom: 4 }}>Sales Report</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Revenue, gross, and net profit overview.</p>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {PERIODS.map(p => (
            <button
              key={p.value}
              onClick={() => { setPeriod(p.value); setCustomDate({ start: null, end: null }); }}
              style={{
                padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border-subtle)',
                background: period === p.value ? 'var(--red)' : 'var(--white)',
                color:      period === p.value ? '#fff' : 'var(--text)',
                fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
              }}
            >
              {p.label}
            </button>
          ))}
          <DashCalendar
            range={true}
            value={customDate}
            onChange={v => { setCustomDate(v); if (v && (v.start || v.end)) setPeriod('custom'); }}
            placeholder="Pick a date range"
          />
          {((customDate && (customDate.start || customDate.end)) || period === 'custom') && (
            <button onClick={() => { setCustomDate({ start: null, end: null }); setPeriod('month'); }} style={{ background: 'none', border: 'none', fontSize: '0.8rem', color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 600 }}>
              Clear dates
            </button>
          )}
          <button
            onClick={exportToExcel}
            disabled={loading}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '7px 16px', borderRadius: 8, border: '1px solid var(--border-subtle)',
              background: '#16a34a', color: '#fff',
              fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer',
              fontFamily: "'DM Sans',sans-serif", opacity: loading ? 0.5 : 1,
            }}
          >
            <Download size={14} /> Export
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="kpi-grid" style={{ marginBottom: 28 }}>
        {kpis.map(k => {
          const Icon = k.icon;
          return (
            <div key={k.label} className="kpi-card">
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: k.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={20} color={k.color} />
                </div>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 4 }}>{k.label}</div>
              {loading
                ? <div style={{ height: 28, width: '60%', background: 'var(--black3)', borderRadius: 6, animation: 'shimmer 1.5s infinite' }} />
                : <div style={{ fontSize: '1.55rem', fontWeight: 900, color: 'var(--text)', fontFamily: "'Mona Sans','Mona-Sans','Helvetica Neue',sans-serif" }}>{k.value}</div>
              }
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>{k.desc}</div>
            </div>
          );
        })}
      </div>

      {/* Deduction breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 14, marginBottom: 28 }}>
        {[
          { label: 'Delivery Fees Collected', value: data.deliveryFees, icon: Truck,    color: '#0284c7' },
          { label: 'Coupon Discounts Given',  value: data.discounts,    icon: Tag,     color: '#7c3aed' },
          { label: 'Total Expenses',          value: data.expenses,     icon: DollarSign, color: '#dc2626' },
        ].map(item => {
          const Icon = item.icon;
          return (
            <div key={item.label} style={{ background: 'var(--white)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14, boxShadow: 'var(--shadow)' }}>
              <Icon size={18} color={item.color} />
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{item.label}</div>
                {loading
                  ? <div style={{ height: 20, width: 80, background: 'var(--black3)', borderRadius: 4 }} />
                  : <div style={{ fontWeight: 800, fontSize: '1rem' }}>{fmt(item.value)}</div>
                }
              </div>
            </div>
          );
        })}
      </div>

      {/* Orders by status */}
      <div className="dash-card">
        <div className="dash-card-header">
          <div className="dash-card-title">Orders by Status</div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            <Calendar size={13} style={{ verticalAlign: 'text-bottom', marginRight: 4 }} />
            {period === 'custom' && customDate && customDate.start && customDate.end ? `${new Date(customDate.start).toLocaleDateString('en-NG', { dateStyle: 'medium' })} - ${new Date(customDate.end).toLocaleDateString('en-NG', { dateStyle: 'medium' })}` : PERIODS.find(p => p.value === period)?.label}
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="dash-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Orders</th>
                <th>Sales Value</th>
                <th>% of Total</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}><td colSpan="4"><div style={{ height: 16, background: 'var(--black3)', borderRadius: 4, animation: 'shimmer 1.5s infinite' }} /></td></tr>
                  ))
                : data.breakdown.map(row => {
                    const style = STATUS_COLORS[row.status] || {};
                    const pct = data.revenue > 0 ? ((row.total / data.revenue) * 100).toFixed(1) : '0.0';
                    return (
                      <tr key={row.status}>
                        <td><span style={{ padding: '3px 10px', borderRadius: 20, fontSize: '0.78rem', fontWeight: 700, background: style.bg, color: style.color }}>{row.status}</span></td>
                        <td style={{ fontWeight: 700 }}>{row.count}</td>
                        <td style={{ fontWeight: 700 }}>{fmt(row.total)}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ flex: 1, height: 6, background: 'var(--black3)', borderRadius: 4, overflow: 'hidden', minWidth: 60 }}>
                              <div style={{ width: `${pct}%`, height: '100%', background: style.color || 'var(--red)', borderRadius: 4, transition: 'width 0.4s' }} />
                            </div>
                            <span style={{ fontSize: '0.78rem', fontWeight: 700, minWidth: 34 }}>{pct}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
