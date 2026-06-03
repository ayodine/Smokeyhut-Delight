import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { DollarSign, ShoppingBag, TrendingUp, TrendingDown, Users, ChevronRight, ArrowLeft, Search, X } from 'lucide-react';
import { SkelKpiGrid, SkelTopListCard, SkelFilterPills, SkelTable } from '../../components/Skeleton';
import { supabase } from '../../lib/supabase';
import DashCalendar from '../../components/DashCalendar';

const fmt    = (n) => '₦' + Number(n).toLocaleString();
const fmtNum = (n) => Number(n).toLocaleString();

const PERIODS = [
  { key: 'today',  label: 'Today' },
  { key: 'week',   label: 'This Week' },
  { key: 'month',  label: 'This Month' },
  { key: 'all',    label: 'All Time' },
];

function getPeriodParams(key, customDate) {
  const now = new Date();
  if (key === 'today') {
    const d = new Date(now); d.setHours(0, 0, 0, 0); return { start: d.toISOString(), end: null };
  }
  if (key === 'week') {
    const d = new Date(now);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    d.setHours(0, 0, 0, 0);
    return { start: d.toISOString(), end: null };
  }
  if (key === 'month') {
    return { start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), end: null };
  }
  if (key === 'custom' && customDate) {
    const s = customDate.start ? new Date(`${customDate.start}T00:00:00`) : null;
    const e = customDate.end ? new Date(`${customDate.end}T23:59:59.999`) : null;
    return { start: s ? s.toISOString() : null, end: e ? e.toISOString() : null };
  }
  return { start: null, end: null };
}

function getPreviousPeriodParams(key, customDate) {
  const now = new Date();
  if (key === 'today') {
    const start = new Date(now); start.setDate(now.getDate() - 1); start.setHours(0, 0, 0, 0);
    const end = new Date(now); end.setHours(0, 0, 0, 0);
    return { start: start.toISOString(), end: end.toISOString(), label: 'vs yesterday' };
  }
  if (key === 'week') {
    const start = new Date(now); start.setDate(now.getDate() - ((now.getDay() + 6) % 7) - 7); start.setHours(0, 0, 0, 0);
    const end = new Date(now); end.setDate(now.getDate() - ((now.getDay() + 6) % 7)); end.setHours(0, 0, 0, 0);
    return { start: start.toISOString(), end: end.toISOString(), label: 'vs last week' };
  }
  if (key === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start: start.toISOString(), end: end.toISOString(), label: 'vs last month' };
  }
  if (key === 'custom' && customDate && customDate.start && customDate.end) {
    const s = new Date(`${customDate.start}T00:00:00`);
    const e = new Date(`${customDate.end}T23:59:59.999`);
    const diffTime = Math.abs(e - s);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const start = new Date(s); start.setDate(s.getDate() - diffDays);
    const end = new Date(s); end.setMilliseconds(-1);
    return { start: start.toISOString(), end: end.toISOString(), label: `vs prev ${diffDays}d` };
  }
  // For 'all' or fallback
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 1);
  return { start: start.toISOString(), end: end.toISOString(), label: 'vs last month' };
}

function normalizeProductName(name) {
  if (!name) return '';
  let normalized = name.trim();
  
  // Match any variation of "chopped" (with/without parentheses, with/without spaces) at the end
  const choppedRegex = /\s*\(?\s*CHOPPED\s*\)?\s*$/i;
  
  if (choppedRegex.test(normalized)) {
    normalized = normalized.replace(choppedRegex, '').trim() + ' (CHOPPED)';
  }
  
  return normalized;
}

function mergeProductRows(rows) {
  if (!rows || rows.length === 0) return rows;
  const map = {};
  rows.forEach(r => {
    const normName = normalizeProductName(r.name || '');
    if (!map[normName]) {
      map[normName] = { ...r, name: normName, value: 0 };
    }
    map[normName].value += Number(r.value || 0);
  });
  const merged = Object.values(map);
  merged.sort((a, b) => b.value - a.value);
  return merged;
}

function mergeDrillDownProductRows(rows, type) {
  if (!rows || rows.length === 0) return rows;
  const map = {};
  rows.forEach(r => {
    const normName = normalizeProductName(r.name || '');
    if (!map[normName]) {
      map[normName] = { ...r, name: normName, revenue: 0, units: 0 };
    }
    map[normName].revenue += Number(r.revenue || 0);
    map[normName].units += Number(r.units || 0);
  });
  const merged = Object.values(map);
  if (type === 'products') {
    merged.sort((a, b) => b.revenue - a.revenue);
  } else if (type === 'products_units') {
    merged.sort((a, b) => b.units - a.units);
  }
  return merged;
}

const RANK_STYLE = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 28, height: 28, borderRadius: 8, fontSize: '0.8rem',
  fontWeight: 800, background: 'var(--black2)', color: 'var(--text-muted)',
  flexShrink: 0,
};

const RANK1_STYLE = { ...RANK_STYLE, background: 'var(--red)', color: '#fff', boxShadow: '0 4px 10px rgba(192,32,31,0.2)' };

// ─── TopList panel ───────────────────────────────────────────────────────────
function TopList({ title, rows, error, valueLabel, isCurrency, onExpand, onRowClick }) {
  return (
    <div className="dash-card">
      <div className="dash-card-header" style={{ marginBottom: 14 }}>
        <div className="dash-card-title" style={{ fontSize: '0.95rem' }}>{title}</div>
        {onExpand && (
          <button
            onClick={onExpand}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              background: 'none', border: '1px solid var(--border-subtle)',
              borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
              fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600,
              fontFamily: "'DM Sans',sans-serif",
            }}
          >
            View All <ChevronRight size={12} />
          </button>
        )}
      </div>
      {error ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Could not load data</p>
      ) : !rows || rows.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No data for this period</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows.map((row, i) => (
            <div
              key={i}
              onClick={() => onRowClick && onRowClick(row)}
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '12px 14px', borderRadius: 12,
                background: i === 0 ? 'rgba(192,32,31,0.03)' : 'transparent',
                border: i === 0 ? '1px solid rgba(192,32,31,0.08)' : '1px solid transparent',
                cursor: onRowClick ? 'pointer' : 'default',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={e => { if (onRowClick) { e.currentTarget.style.background = 'var(--black2)'; e.currentTarget.style.transform = 'translateY(-1px)'; } }}
              onMouseLeave={e => { if (onRowClick) { e.currentTarget.style.background = i === 0 ? 'rgba(192,32,31,0.03)' : 'transparent'; e.currentTarget.style.transform = 'translateY(0)'; } }}
            >
              <span style={i === 0 ? RANK1_STYLE : RANK_STYLE}>{i + 1}</span>
              <span style={{ flex: 1, fontWeight: i === 0 ? 700 : 500, fontSize: '0.92rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {row.name || '—'}
              </span>
              <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--red)', flexShrink: 0 }}>
                {isCurrency
                  ? fmt(row.value)
                  : fmtNum(Number(row.value).toFixed(Number(row.value) % 1 === 0 ? 0 : 1))}
                {valueLabel && <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 2 }}>{valueLabel}</span>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Drill-down table ─────────────────────────────────────────────────────────
const DRILL_COLS = {
  products: [
    { key: 'name',    label: 'Product',    render: r => r.name },
    { key: 'revenue', label: 'Revenue',    render: r => fmt(r.revenue) },
    { key: 'units',   label: 'Units Sold', render: r => fmtNum(r.units) },
  ],
  customers: [
    { key: 'customer_name',  label: 'Customer',    render: r => r.customer_name || '—' },
    { key: 'customer_phone', label: 'Phone',        render: r => r.customer_phone },
    { key: 'order_count',    label: 'Orders',       render: r => fmtNum(r.order_count) },
    { key: 'total_spent',    label: 'Total Spent',  render: r => fmt(r.total_spent) },
  ],
  locations: [
    { key: 'name',  label: 'Location', render: r => r.name },
    { key: 'value', label: 'Orders',   render: r => fmtNum(r.value) },
  ],
  categories: [
    { key: 'name',  label: 'Category', render: r => r.name },
    { key: 'value', label: 'Revenue',  render: r => fmt(r.value) },
  ],
  products_units: [
    { key: 'name',    label: 'Product',    render: r => r.name },
    { key: 'units',   label: 'Units Sold', render: r => fmtNum(r.units) },
    { key: 'revenue', label: 'Revenue',    render: r => fmt(r.revenue) },
  ],
};

function DrillDownTable({ type, title, rows, loading, search, onSearchChange, onRowClick, onBack }) {
  const cols = DRILL_COLS[type] || [];
  const q = search.toLowerCase();
  const filtered = rows.filter(r =>
    !q || cols.some(c => String(c.render(r)).toLowerCase().includes(q))
  );

  return (
    <div className="product-form-modal" onClick={onBack}>
      <div className="product-form-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 700 }}>
        <h3 style={{ marginTop: 0, marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {title}
          </div>
          <button onClick={onBack} className="dash-drawer-close">
            <X size={16} />
          </button>
        </h3>
        
        <div style={{ position: 'relative', marginBottom: 20 }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
          <input
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="Search…"
            style={{
              width: '100%', paddingLeft: 36, paddingRight: search ? 36 : 12, paddingTop: 10, paddingBottom: 10,
              borderRadius: 8, border: '1px solid var(--border-subtle)',
              background: 'var(--white)', color: 'var(--text)',
              fontSize: '0.9rem', fontFamily: "'DM Sans',sans-serif", outline: 'none',
            }}
          />
          {search && (
            <button
              onClick={() => onSearchChange('')}
              style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 0 }}
            >
              <X size={14} />
            </button>
          )}
        </div>

        {loading ? (
          <SkelTable rows={8} cols={cols.length} />
        ) : (
          <div style={{ overflowX: 'auto', background: 'var(--white)', borderRadius: 12, border: '1px solid var(--border-subtle)' }}>
            <table className="dash-table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}></th>
                  {cols.map(c => <th key={c.key}>{c.label}</th>)}
                  {onRowClick && <th />}
                 </tr>
              </thead>
              <tbody>
                {filtered.map((row, i) => (
                  <tr
                    key={i}
                    onClick={() => onRowClick && onRowClick(row)}
                    style={{ cursor: onRowClick ? 'pointer' : 'default' }}
                  >
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{i + 1}</td>
                    {cols.map((c, ci) => (
                      <td key={ci} style={ci === 0 ? { fontWeight: 600 } : undefined}>
                        {c.render(row)}
                      </td>
                    ))}
                    {onRowClick && (
                      <td style={{ textAlign: 'right' }}>
                        <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
                      </td>
                    )}
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={cols.length + 2} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>No results</td></tr>
                )}
              </tbody>
            </table>
            <div style={{ padding: '12px 16px', fontSize: '0.8rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border-subtle)' }}>
              {filtered.length} of {rows.length} rows
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Customer history modal ───────────────────────────────────────────────────
function CustomerModal({ customer, onClose }) {
  const statusColor = { pending: '#f59e0b', processing: '#3b82f6', shipped: '#8b5cf6', delivered: '#16a34a', cancelled: '#ef4444' };

  return (
    <div className="product-form-modal" onClick={onClose}>
      <div className="product-form-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
        {/* Header */}
        <div style={{ paddingBottom: 16, borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'Mona Sans','Mona-Sans',sans-serif", fontWeight: 900, fontSize: '1.2rem' }}>
              {customer.name || 'Unknown'}
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 4 }}>{customer.phone}</div>
          </div>
          <button onClick={onClose} className="dash-drawer-close">
            <X size={16} />
          </button>
        </div>

        {/* Order list */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {customer.loading ? (
            <div style={{ padding: '10px 0' }}><SkelTable rows={5} cols={4} /></div>
          ) : customer.orders.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', padding: '10px 0' }}>No orders found.</p>
          ) : (
            <>
              <div style={{ paddingBottom: 8, fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                {customer.orders.length} order{customer.orders.length !== 1 ? 's' : ''} · all time
              </div>
              {customer.orders.map(order => (
                <div
                  key={order.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '16px 0', borderBottom: '1px solid var(--border-subtle)',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--red)' }}>{order.id}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {order.delivery_address || '—'}
                      {order.item_count > 0 && <span style={{ marginLeft: 8 }}>· {order.item_count} item{order.item_count !== 1 ? 's' : ''}</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>{fmt(order.total)}</div>
                    <div style={{ fontSize: '0.75rem', marginTop: 3 }}>
                      <span style={{
                        background: statusColor[order.status] + '22',
                        color: statusColor[order.status] || 'var(--text-muted)',
                        padding: '2px 8px', borderRadius: 20, fontWeight: 700,
                      }}>
                        {order.status}
                      </span>
                    </div>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', flexShrink: 0, textAlign: 'right', minWidth: 60 }}>
                    {new Date(order.created_at).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Stats() {
  const { selectedStore } = useOutletContext() || {};
  const [period, setPeriod]     = useState('month');
  const [customDate, setCustomDate] = useState({ start: null, end: null });
  const [kpis,   setKpis]       = useState(null);
  const [lists,  setLists]      = useState(null);
  const [kpiErr, setKpiErr]     = useState(false);
  const [listErr,setListErr]    = useState(false);
  const [loading,setLoading]    = useState(true);

  // Drill-down state
  const [drillDown,    setDrillDown]    = useState(null);
  // { type, title, rows, loading }
  const [drillSearch,  setDrillSearch]  = useState('');

  // Customer history modal
  const [customerModal, setCustomerModal] = useState(null);
  // { name, phone, orders, loading }

  const storeParam = selectedStore && selectedStore !== 'all' ? Number(selectedStore) : null;

  useEffect(() => {
    // Only fetch if date filter selection is complete (both start and end are set, or both are null)
    const isCustomDateIncomplete = customDate && customDate.start && !customDate.end;
    if (isCustomDateIncomplete) return;

    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setKpiErr(false);
      setListErr(false);
      setDrillDown(null);

      const { start: startParam, end: endParam } = getPeriodParams(period, customDate);
      const prevParams = getPreviousPeriodParams(period, customDate);

      const [kpisRes, listsRes, prevKpisRes] = await Promise.all([
        supabase.rpc('get_product_stats_kpis',  { p_store_id: storeParam, p_start: startParam, p_end: endParam }),
        supabase.rpc('get_product_stats_lists', { p_store_id: storeParam, p_start: startParam, p_end: endParam }),
        period === 'all' 
          ? Promise.resolve({ data: null }) 
          : supabase.rpc('get_product_stats_kpis',  { p_store_id: storeParam, p_start: prevParams.start, p_end: prevParams.end }),
      ]);
      if (cancelled) return;
      
      if (kpisRes.error) {
        setKpiErr(true);
      } else {
        const currData = kpisRes.data || {};
        let growth = null;
        let unitsGrowth = null;
        let aovGrowth = null;
        let customersGrowth = null;
        if (period !== 'all' && prevKpisRes.data) {
          const prevData = prevKpisRes.data || {};
          
          // Revenue / Total Spend growth
          const revenue = currData.revenue ?? 0;
          const prevRevenue = prevData.revenue ?? 0;
          const pct = prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue) * 100 : (revenue > 0 ? 100 : 0);
          growth = { pct, label: prevParams.label };

          // Total Units Sold growth
          const units = currData.units_sold ?? 0;
          const prevUnits = prevData.units_sold ?? 0;
          const unitsPct = prevUnits > 0 ? ((units - prevUnits) / prevUnits) * 100 : (units > 0 ? 100 : 0);
          unitsGrowth = { pct: unitsPct, label: prevParams.label };

          // Average Order Value (AOV) growth
          const currAOV = currData.order_count > 0 ? (currData.revenue ?? 0) / currData.order_count : 0;
          const prevAOV = prevData.order_count > 0 ? (prevData.revenue ?? 0) / prevData.order_count : 0;
          const aovPct = prevAOV > 0 ? ((currAOV - prevAOV) / prevAOV) * 100 : (currAOV > 0 ? 100 : 0);
          aovGrowth = { pct: aovPct, label: prevParams.label };

          // Unique Customers growth
          const customers = currData.unique_customers ?? 0;
          const prevCustomers = prevData.unique_customers ?? 0;
          const customersPct = prevCustomers > 0 ? ((customers - prevCustomers) / prevCustomers) * 100 : (customers > 0 ? 100 : 0);
          customersGrowth = { pct: customersPct, label: prevParams.label };
        }
        setKpis({
          ...currData,
          growth,
          unitsGrowth,
          aovGrowth,
          customersGrowth
        });
      }
      
      if (listsRes.error) {
        setListErr(true);
      } else {
        const data = listsRes.data || {};
        const processed = {
          ...data,
          top_by_revenue: mergeProductRows(data.top_by_revenue),
          top_by_units: mergeProductRows(data.top_by_units),
          top_qty_per_order: mergeProductRows(data.top_qty_per_order),
        };
        setLists(processed);
      }
      setLoading(false);
    };
    run();
    return () => { cancelled = true; };
  }, [selectedStore, period, customDate]);

  const avgOrder = kpis && kpis.order_count > 0 ? kpis.revenue / kpis.order_count : 0;

  // ── Drill-down opener ────────────────────────────────────────────────────
  const openDrillDown = async (type, title) => {
    setDrillDown({ type, title, rows: [], loading: true });
    setDrillSearch('');
    const { start: startParam, end: endParam } = getPeriodParams(period, customDate);

    if (type === 'products' || type === 'products_units') {
      const { data } = await supabase.rpc('get_stats_all_products', { p_store_id: storeParam, p_start: startParam, p_end: endParam });
      const mergedRows = mergeDrillDownProductRows(data || [], type);
      setDrillDown(d => d ? { ...d, rows: mergedRows, loading: false } : d);
    } else if (type === 'customers') {
      const { data } = await supabase.rpc('get_stats_all_customers', { p_store_id: storeParam, p_start: startParam, p_end: endParam });
      setDrillDown(d => d ? { ...d, rows: data || [], loading: false } : d);
    } else if (type === 'locations') {
      // use lists data directly — no separate RPC needed for locations
      const rows = (lists?.top_locations || []).map(r => ({ name: r.name, value: r.value }));
      setDrillDown({ type, title, rows, loading: false });
    } else if (type === 'categories') {
      const rows = (lists?.top_categories || []).map(r => ({ name: r.name, value: r.value }));
      setDrillDown({ type, title, rows, loading: false });
    }
  };

  // ── Customer history opener ───────────────────────────────────────────────
  const openCustomerHistory = async (name, phone) => {
    setCustomerModal({ name, phone, orders: [], loading: true });
    const { data } = await supabase.rpc('get_customer_order_history', {
      p_phone: phone,
      p_store_id: storeParam,
    });
    setCustomerModal(m => m ? { ...m, orders: data || [], loading: false } : null);
  };

  const handleTopListCustomerClick = (row) => {
    openCustomerHistory(row.name, row.phone);
  };

  const handleDrillRowClick = (row) => {
    if (drillDown?.type === 'customers') {
      openCustomerHistory(row.customer_name, row.customer_phone);
    }
  };

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

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Header + period pills */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <h2 style={{ fontFamily: "'Mona Sans','Mona-Sans','Helvetica Neue',sans-serif", fontSize: '1.4rem', fontWeight: 900, margin: 0 }}>
          Stats
        </h2>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="dash-segmented-control">
            {PERIODS.map(p => (
              <button
                key={p.key}
                className={`dash-filter-btn${period === p.key ? ' active' : ''}`}
                onClick={() => { setPeriod(p.key); setCustomDate({ start: null, end: null }); }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <DashCalendar
            range={true}
            value={customDate}
            onChange={v => { setCustomDate(v); setPeriod(v && (v.start || v.end) ? 'custom' : 'month'); }}
            placeholder="Pick a date range"
          />
        </div>
      </div>

      {loading ? (
        <>
          <SkelFilterPills count={5} />
          <SkelKpiGrid count={4} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16, marginTop: 8 }}>
            {Array.from({ length: 6 }).map((_, i) => <SkelTopListCard key={i} />)}
          </div>
        </>
      ) : (
        <>
          {/* KPI cards */}
          <div className="kpi-grid" style={{ marginBottom: 24 }}>
            <div className="kpi-card green">
              <div className="kpi-icon"><DollarSign size={24} /></div>
              <div className="kpi-value">{kpiErr ? '—' : fmt(kpis?.revenue ?? 0)}</div>
              <div className="kpi-label">Total Spend</div>
              {renderKPIBadge(kpis?.growth)}
            </div>
            <div className="kpi-card blue">
              <div className="kpi-icon"><ShoppingBag size={24} /></div>
              <div className="kpi-value">{kpiErr ? '—' : fmtNum(kpis?.units_sold ?? 0)}</div>
              <div className="kpi-label">Total Units Sold</div>
              {renderKPIBadge(kpis?.unitsGrowth)}
            </div>
            <div className="kpi-card yellow">
              <div className="kpi-icon"><TrendingUp size={24} /></div>
              <div className="kpi-value">{kpiErr ? '—' : fmt(avgOrder)}</div>
              <div className="kpi-label">Average Order Value</div>
              {renderKPIBadge(kpis?.aovGrowth)}
            </div>
            <div className="kpi-card red">
              <div className="kpi-icon"><Users size={24} /></div>
              <div className="kpi-value">{kpiErr ? '—' : fmtNum(kpis?.unique_customers ?? 0)}</div>
              <div className="kpi-label">Unique Customers</div>
              {renderKPIBadge(kpis?.customersGrowth)}
            </div>
          </div>

          {/* Top-list grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16, alignItems: 'start' }}>
            <TopList
              title="Best Performing Products"
              rows={lists?.top_by_revenue}
              error={listErr}
              isCurrency
              onExpand={() => openDrillDown('products', 'Products by Revenue')}
            />
            <TopList
              title="Top Most Sold Products"
              rows={lists?.top_by_units}
              error={listErr}
              valueLabel="units"
              onExpand={() => openDrillDown('products_units', 'Products by Units Sold')}
            />
            <TopList
              title="Top Delivery Locations"
              rows={lists?.top_locations}
              error={listErr}
              valueLabel="orders"
              onExpand={() => openDrillDown('locations', 'All Delivery Locations')}
            />
            <TopList
              title="Top Product by Qty Per Order"
              rows={lists?.top_qty_per_order}
              error={listErr}
              valueLabel="avg qty"
            />
            <TopList
              title="Top Performing Customers"
              rows={lists?.top_customers}
              error={listErr}
              valueLabel="orders"
              onExpand={() => openDrillDown('customers', 'All Customers')}
              onRowClick={handleTopListCustomerClick}
            />
            <TopList
              title="Top Categories"
              rows={lists?.top_categories}
              error={listErr}
              isCurrency
              onExpand={() => openDrillDown('categories', 'All Categories')}
            />
          </div>
        </>
      )}

      {drillDown && (
        <DrillDownTable
          type={drillDown.type}
          title={drillDown.title}
          rows={drillDown.rows}
          loading={drillDown.loading}
          search={drillSearch}
          onSearchChange={setDrillSearch}
          onRowClick={drillDown.type === 'customers' ? handleDrillRowClick : null}
          onBack={() => setDrillDown(null)}
        />
      )}

      {/* Customer history modal */}
      {customerModal && (
        <CustomerModal customer={customerModal} onClose={() => setCustomerModal(null)} />
      )}
    </div>
  );
}
