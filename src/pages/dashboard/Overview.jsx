import React, { useState, useEffect } from 'react';
import { DollarSign, Package, Truck, Store, Download, ChevronUp, ChevronDown, TrendingUp, TrendingDown } from 'lucide-react';
import * as XLSX from 'xlsx';
import { SkelKpiGrid, SkelTable, SkelDashHeader, SkelFilterPills, SkelChart } from '../../components/Skeleton';
import { supabase } from '../../lib/supabase';
import { useOutletContext } from 'react-router-dom';
import DashCalendar from '../../components/DashCalendar';

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

function getPeriodDateRanges(period, customDate) {
  const now = new Date();
  let currentStart = null;
  let currentEnd = now;
  let previousStart = null;
  let previousEnd = null;
  let labelSuffix = '';

  if (period === 'custom' && customDate && customDate.start && customDate.end) {
    currentStart = new Date(`${customDate.start}T00:00:00`);
    currentEnd = new Date(`${customDate.end}T23:59:59.999`);
    const diffTime = Math.abs(currentEnd - currentStart);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    previousStart = new Date(currentStart);
    previousStart.setDate(currentStart.getDate() - diffDays);
    previousEnd = new Date(currentStart);
    previousEnd.setMilliseconds(-1);
    labelSuffix = `vs prev ${diffDays}d`;
  } else {
    switch (period) {
      case 'today': {
        const todayStart = new Date(now);
        todayStart.setHours(0, 0, 0, 0);
        currentStart = todayStart;
        
        const yesterdayStart = new Date(todayStart);
        yesterdayStart.setDate(todayStart.getDate() - 1);
        previousStart = yesterdayStart;
        previousEnd = todayStart;
        labelSuffix = 'vs yesterday';
        break;
      }
      case 'week': {
        const thisWeekStart = new Date(now);
        thisWeekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
        thisWeekStart.setHours(0, 0, 0, 0);
        currentStart = thisWeekStart;
        
        const lastWeekStart = new Date(thisWeekStart);
        lastWeekStart.setDate(thisWeekStart.getDate() - 7);
        previousStart = lastWeekStart;
        previousEnd = thisWeekStart;
        labelSuffix = 'vs last week';
        break;
      }
      case 'month': {
        const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        currentStart = thisMonthStart;
        
        const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        previousStart = lastMonthStart;
        previousEnd = thisMonthStart;
        labelSuffix = 'vs last month';
        break;
      }
      case 'year': {
        const thisYearStart = new Date(now.getFullYear(), 0, 1);
        currentStart = thisYearStart;
        
        const lastYearStart = new Date(now.getFullYear() - 1, 0, 1);
        previousStart = lastYearStart;
        previousEnd = thisYearStart;
        labelSuffix = 'vs last year';
        break;
      }
      case 'all':
      default: {
        const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        currentStart = thisMonthStart;
        
        const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        previousStart = lastMonthStart;
        
        const lastDayOfPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
        const targetDay = Math.min(now.getDate(), lastDayOfPrevMonth);
        const prevMonthEnd = new Date(now.getFullYear(), now.getMonth() - 1, targetDay, now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
        previousEnd = prevMonthEnd;
        labelSuffix = 'vs last month (MTD)';
        break;
      }
    }
  }

  return {
    current: { start: currentStart, end: currentEnd },
    previous: { start: previousStart, end: previousEnd },
    labelSuffix
  };
}

const EMPTY_KPIS = { revenue: 0, order_count: 0, pending_shipments: 0 };

const getKpisForRange = async (sp, start, end) => {
  const now = new Date();
  try {
    if (!start) {
      const { data, error } = await supabase.rpc('get_overview_kpis', { p_store_id: sp, p_start: null });
      if (error) throw error;
      return data || EMPTY_KPIS;
    }
    if (!end || end >= now) {
      const { data, error } = await supabase.rpc('get_overview_kpis', { p_store_id: sp, p_start: start.toISOString() });
      if (error) throw error;
      return data || EMPTY_KPIS;
    }
    const [startRes, endRes] = await Promise.all([
      supabase.rpc('get_overview_kpis', { p_store_id: sp, p_start: start.toISOString() }),
      supabase.rpc('get_overview_kpis', { p_store_id: sp, p_start: end.toISOString() }),
    ]);
    if (startRes.error) throw startRes.error;
    if (endRes.error) throw endRes.error;
    const sData = startRes.data || EMPTY_KPIS;
    const eData = endRes.data || EMPTY_KPIS;
    return {
      revenue: sData.revenue - eData.revenue,
      order_count: sData.order_count - eData.order_count,
      pending_shipments: sData.pending_shipments
    };
  } catch (err) {
    console.warn('RPC failed, falling back to client-side query:', err);
    let q = supabase.from('orders').select('status, total, created_at').is('deleted_at', null);
    if (sp !== null) q = q.eq('store_id', sp);
    if (start) q = q.gte('created_at', start.toISOString());
    if (end) q = q.lt('created_at', end.toISOString());
    const { data } = await q;
    const rows = data || [];
    return {
      revenue: rows.filter(o => ['shipped', 'out_for_delivery', 'arrived', 'delivered'].includes(o.status)).reduce((s, o) => s + Number(o.total || 0), 0),
      order_count: rows.filter(o => ['shipped', 'out_for_delivery', 'arrived', 'delivered'].includes(o.status)).length,
      pending_shipments: rows.filter(o => ['pending', 'processing'].includes(o.status)).length,
    };
  }
};

export default function Overview() {
  const { selectedStore } = useOutletContext() || {};
  const [kpis, setKpis] = useState(EMPTY_KPIS);
  const [growth, setGrowth] = useState({ revenue: null, orders: null });
  const [chartData, setChartData] = useState([0, 0, 0, 0, 0, 0, 0]);
  const [recentOrders, setRecentOrders] = useState([]);
  const [stores, setStores] = useState(0);
  const [loading, setLoading] = useState(true);
  const [kpiLoading, setKpiLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [period, setPeriod] = useState('all');
  const [customDate, setCustomDate] = useState({ start: null, end: null });
  const [sortKey, setSortKey] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');

  const renderKPIBadge = (change) => {
    if (!change) return null;
    const isPositive = change.pct >= 0;
    const className = `kpi-change ${isPositive ? 'up' : 'down'}`;
    const Icon = isPositive ? TrendingUp : TrendingDown;
    
    return (
      <div className={className} style={{ gap: 4, alignSelf: 'flex-start' }}>
        <Icon size={12} style={{ display: 'inline-block', verticalAlign: 'middle' }} />
        <span>{isPositive ? '+' : ''}{change.pct.toFixed(1)}%</span>
        <span style={{ opacity: 0.7, fontWeight: 500, marginLeft: 3 }}>{change.label}</span>
      </div>
    );
  };

  // Full load on store change (fetches chart + stores + KPIs + recent)
  useEffect(() => { fetchAll(period, customDate); }, [selectedStore]);

  // Lightweight re-fetch of KPIs + recent orders when period changes
  useEffect(() => {
    if (!loading) fetchPeriodData(period, customDate);
  }, [period, customDate]);

  const storeParam = () =>
    selectedStore && selectedStore !== 'all' ? Number(selectedStore) : null;

  // Helper: compute weekly chart from an array of order rows
  const computeWeeklyChart = (rows) => {
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    return [0, 1, 2, 3, 4, 5, 6].map(i => {
      const dayStart = new Date(monday); dayStart.setDate(monday.getDate() + i);
      const dayEnd = new Date(dayStart); dayEnd.setHours(23, 59, 59, 999);
      return rows
        .filter(o => o.status !== 'cancelled')
        .filter(o => { const d = new Date(o.created_at); return d >= dayStart && d <= dayEnd; })
        .reduce((s, o) => s + Number(o.total || 0), 0);
    });
  };

  const fetchKpisAndGrowth = async (p, sp, customD) => {
    const ranges = getPeriodDateRanges(p, customD);
    
    const primaryStart = p === 'all' ? null : ranges.current.start;
    const primaryEnd = p === 'all' ? null : ranges.current.end;
    
    const growthCurrStart = ranges.current.start;
    const growthCurrEnd = ranges.current.end;
    const growthPrevStart = ranges.previous.start;
    const growthPrevEnd = ranges.previous.end;
    
    const [primaryKpis, growthCurrKpis, growthPrevKpis] = await Promise.all([
      getKpisForRange(sp, primaryStart, primaryEnd),
      p === 'all' ? getKpisForRange(sp, growthCurrStart, growthCurrEnd) : Promise.resolve(null),
      getKpisForRange(sp, growthPrevStart, growthPrevEnd),
    ]);
    
    const currentForGrowth = p === 'all' ? growthCurrKpis : primaryKpis;
    
    const getPercentChange = (currentVal, previousVal) => {
      if (!previousVal) {
        return currentVal > 0 ? 100 : 0;
      }
      return ((currentVal - previousVal) / previousVal) * 100;
    };
    
    const revenuePct = getPercentChange(currentForGrowth.revenue, growthPrevKpis.revenue);
    const ordersPct = getPercentChange(currentForGrowth.order_count, growthPrevKpis.order_count);
    
    return {
      kpis: primaryKpis,
      growth: {
        revenue: { pct: revenuePct, label: ranges.labelSuffix },
        orders: { pct: ordersPct, label: ranges.labelSuffix }
      }
    };
  };

  const fetchAll = async (p, customD) => {
    setLoading(true);
    const sp = storeParam();
    
    let startDate = null;
    let endDate = null;
    if (p === 'custom' && customD && customD.start && customD.end) {
      startDate = new Date(`${customD.start}T00:00:00`);
      endDate = new Date(`${customD.end}T23:59:59.999`);
    } else {
      startDate = getStartDate(p);
    }

    // Week bounds for chart fallback
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    weekStart.setHours(0, 0, 0, 0);

    let recentQuery = supabase
      .from('orders')
      .select('id,customer_name,total,status,created_at,store_id')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(10);
    if (sp !== null) recentQuery = recentQuery.eq('store_id', sp);
    if (startDate) recentQuery = recentQuery.gte('created_at', startDate.toISOString());
    if (endDate) recentQuery = recentQuery.lte('created_at', endDate.toISOString());

    let chartFallbackQuery = supabase
      .from('orders')
      .select('status, total, created_at')
      .is('deleted_at', null)
      .neq('status', 'cancelled')
      .gte('created_at', weekStart.toISOString());
    if (sp !== null) chartFallbackQuery = chartFallbackQuery.eq('store_id', sp);

    const [kpiGrowthRes, chartRes, recentRes, storesRes, chartFallbackRes] = await Promise.all([
      fetchKpisAndGrowth(p, sp, customD),
      supabase.rpc('get_weekly_revenue_chart', { p_store_id: sp }),
      recentQuery,
      supabase.from('stores').select('id', { count: 'exact' }),
      chartFallbackQuery,
    ]);

    setRecentOrders(recentRes.data || []);
    if (storesRes.data) setStores(storesRes.data.length);

    setKpis(kpiGrowthRes.kpis);
    setGrowth(kpiGrowthRes.growth);

    if (chartRes.data) {
      setChartData(chartRes.data);
    } else {
      setChartData(computeWeeklyChart(chartFallbackRes.data || []));
    }

    setLoading(false);
  };

  const fetchPeriodData = async (p, customD) => {
    const isCustomDateIncomplete = p === 'custom' && customD && customD.start && !customD.end;
    if (isCustomDateIncomplete) return;

    setKpiLoading(true);
    const sp = storeParam();
    
    let startDate = null;
    let endDate = null;
    if (p === 'custom' && customD && customD.start && customD.end) {
      startDate = new Date(`${customD.start}T00:00:00`);
      endDate = new Date(`${customD.end}T23:59:59.999`);
    } else {
      startDate = getStartDate(p);
    }

    let recentQuery = supabase
      .from('orders')
      .select('id,customer_name,total,status,created_at,store_id')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(10);
    if (sp !== null) recentQuery = recentQuery.eq('store_id', sp);
    if (startDate) recentQuery = recentQuery.gte('created_at', startDate.toISOString());
    if (endDate) recentQuery = recentQuery.lte('created_at', endDate.toISOString());

    const [kpiGrowthRes, recentRes] = await Promise.all([
      fetchKpisAndGrowth(p, sp, customD),
      recentQuery,
    ]);

    setRecentOrders(recentRes.data || []);
    setKpis(kpiGrowthRes.kpis);
    setGrowth(kpiGrowthRes.growth);
    setKpiLoading(false);
  };

  // Column sort (applied to the loaded 10 rows)
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

  const sortedOrders = [...recentOrders].sort((a, b) => {
    let av = a[sortKey], bv = b[sortKey];
    if (sortKey === 'total') { av = Number(av || 0); bv = Number(bv || 0); }
    else if (sortKey === 'created_at') { av = new Date(av); bv = new Date(bv); }
    else { av = String(av || '').toLowerCase(); bv = String(bv || '').toLowerCase(); }
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  // Export fetches its own full dataset for the selected period
  const exportToExcel = async () => {
    setExporting(true);
    try {
      const sp = storeParam();
      let startDate = null;
      let endDate = null;
      if (period === 'custom' && customDate && customDate.start && customDate.end) {
        startDate = new Date(`${customDate.start}T00:00:00`);
        endDate = new Date(`${customDate.end}T23:59:59.999`);
      } else {
        startDate = getStartDate(period);
      }
      const periodLabel = period === 'custom' && customDate && customDate.start && customDate.end
        ? `Date: ${new Date(customDate.start).toLocaleDateString()} to ${new Date(customDate.end).toLocaleDateString()}`
        : (PERIODS.find(p => p.value === period)?.label || period);

      let allOrders = [];
      let pageNum = 0;
      const PAGE_SIZE = 1000;
      let hasMore = true;

      while (hasMore) {
        let exportQuery = supabase
          .from('orders')
          .select('id,customer_name,total,status,created_at')
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1);
        if (sp !== null) exportQuery = exportQuery.eq('store_id', sp);
        if (startDate) exportQuery = exportQuery.gte('created_at', startDate.toISOString());
        if (endDate) exportQuery = exportQuery.lte('created_at', endDate.toISOString());

        const { data, error } = await exportQuery;
        if (error) {
          console.error('[Overview Export] Error loading chunk:', error);
          hasMore = false;
        } else if (!data || data.length === 0) {
          hasMore = false;
        } else {
          allOrders = [...allOrders, ...data];
          if (data.length < PAGE_SIZE) hasMore = false;
          else pageNum++;
        }
      }

      const wb = XLSX.utils.book_new();

      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
        ['Period', periodLabel],
        [],
        ['Metric', 'Value'],
        ['Total Revenue (₦)', kpis.revenue],
        ['Orders in Period', kpis.order_count],
        ['Pending Shipments', kpis.pending_shipments],
        ['Active Stores', stores],
      ]), 'Summary');

      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
        ['Day', 'Revenue (₦)'],
        ...days.map((d, i) => [d, chartData[i]]),
      ]), 'Weekly Revenue');

      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
        ['Order ID', 'Customer', 'Total (₦)', 'Status', 'Date'],
        ...allOrders.map(o => [
          o.id,
          o.customer_name,
          Number(o.total || 0),
          o.status,
          new Date(o.created_at).toLocaleDateString(),
        ]),
      ]), 'Orders');

      XLSX.writeFile(wb, `smokeyhut-overview-${period}-${new Date().toISOString().split('T')[0]}.xlsx`);
    } finally {
      setExporting(false);
    }
  };

  const maxChart = Math.max(...chartData, 1);

  if (loading) return (
    <div>
      <SkelDashHeader hasButton />
      <SkelFilterPills count={5} />
      <SkelKpiGrid count={4} />
      <SkelChart height={170} />
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
          disabled={exporting}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '9px 18px', borderRadius: 8, border: '1px solid var(--border-subtle)',
            background: '#16a34a', color: '#fff',
            fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer',
            fontFamily: "'DM Sans',sans-serif", opacity: exporting ? 0.5 : 1,
          }}
        >
          <Download size={15} /> {exporting ? 'Exporting…' : 'Export to Excel'}
        </button>
      </div>

      {/* Period filter */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 24, flexWrap: 'wrap', alignItems: 'center' }}>
        {PERIODS.map(p => (
          <button
            key={p.value}
            onClick={() => { setPeriod(p.value); setCustomDate({ start: null, end: null }); }}
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
        <DashCalendar
          range={true}
          value={customDate}
          onChange={v => { setCustomDate(v); if (v && (v.start || v.end)) setPeriod('custom'); }}
          placeholder="Pick a date range"
        />
        {((customDate && (customDate.start || customDate.end)) || period === 'custom') && (
          <button onClick={() => { setCustomDate({ start: null, end: null }); setPeriod('all'); }} style={{ background: 'none', border: 'none', fontSize: '0.8rem', color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 600 }}>
            Clear dates
          </button>
        )}
      </div>

      {/* KPIs */}
      <div className="kpi-grid" style={{ opacity: kpiLoading ? 0.6 : 1, transition: 'opacity 0.15s' }}>
        <div className="kpi-card red">
          <div className="kpi-icon"><DollarSign size={24} /></div>
          <div className="kpi-value">{fmt(kpis.revenue)}</div>
          <div className="kpi-label">Total Revenue</div>
          {renderKPIBadge(growth.revenue)}
        </div>
        <div className="kpi-card blue">
          <div className="kpi-icon"><Package size={24} /></div>
          <div className="kpi-value">{kpis.order_count}</div>
          <div className="kpi-label">Orders</div>
          {renderKPIBadge(growth.orders)}
        </div>
        <div className="kpi-card yellow">
          <div className="kpi-icon"><Truck size={24} /></div>
          <div className="kpi-value">{kpis.pending_shipments}</div>
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
              {kpis.order_count} total · showing latest 10
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
              {sortedOrders.map(order => (
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
              {sortedOrders.length === 0 && (
                <tr><td colSpan="5" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>No orders in this period.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
