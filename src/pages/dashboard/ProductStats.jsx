import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { DollarSign, ShoppingBag, TrendingUp, Users, ChevronRight, ArrowLeft, Search, X } from 'lucide-react';
import { SkelKpiGrid, SkelTable, SkelFilterPills } from '../../components/Skeleton';
import { supabase } from '../../lib/supabase';

const fmt    = (n) => '₦' + Number(n).toLocaleString();
const fmtNum = (n) => Number(n).toLocaleString();

const PERIODS = [
  { key: 'today',  label: 'Today' },
  { key: 'week',   label: 'This Week' },
  { key: 'month',  label: 'This Month' },
  { key: 'all',    label: 'All Time' },
];

function periodStart(key) {
  const now = new Date();
  if (key === 'today') {
    const d = new Date(now); d.setHours(0, 0, 0, 0); return d.toISOString();
  }
  if (key === 'week') {
    const d = new Date(now);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }
  if (key === 'month') {
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  }
  return null;
}

const RANK_STYLE = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 22, height: 22, borderRadius: '50%', fontSize: '0.72rem',
  fontWeight: 700, background: 'var(--border-subtle)', color: 'var(--text-muted)',
  flexShrink: 0,
};

const RANK1_STYLE = { ...RANK_STYLE, background: 'var(--red)', color: '#fff' };

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
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '6px 8px', borderRadius: 8,
                background: i === 0 ? 'rgba(192,32,31,0.06)' : 'transparent',
                cursor: onRowClick ? 'pointer' : 'default',
                transition: onRowClick ? 'background 0.12s' : undefined,
              }}
              onMouseEnter={e => { if (onRowClick) e.currentTarget.style.background = 'var(--black2)'; }}
              onMouseLeave={e => { if (onRowClick) e.currentTarget.style.background = i === 0 ? 'rgba(192,32,31,0.06)' : 'transparent'; }}
            >
              <span style={i === 0 ? RANK1_STYLE : RANK_STYLE}>#{i + 1}</span>
              <span style={{ flex: 1, fontWeight: i === 0 ? 600 : 400, fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <button
          onClick={onBack}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, background: 'none',
            border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '7px 14px',
            cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)',
            fontFamily: "'DM Sans',sans-serif",
          }}
        >
          <ArrowLeft size={14} /> Back
        </button>
        <h3 style={{ fontFamily: "'Mona Sans','Mona-Sans',sans-serif", fontSize: '1.1rem', fontWeight: 800, margin: 0 }}>
          {title}
        </h3>
        <div style={{ marginLeft: 'auto', position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
          <input
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="Search…"
            style={{
              paddingLeft: 32, paddingRight: search ? 32 : 12, paddingTop: 8, paddingBottom: 8,
              borderRadius: 8, border: '1px solid var(--border-subtle)',
              background: 'var(--white)', color: 'var(--text)',
              fontSize: '0.85rem', fontFamily: "'DM Sans',sans-serif", outline: 'none', width: 220,
            }}
          />
          {search && (
            <button
              onClick={() => onSearchChange('')}
              style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 0 }}
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      <div className="dash-card">
        {loading ? (
          <SkelTable rows={8} cols={cols.length} />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="dash-table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>#</th>
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
            <div style={{ padding: '10px 16px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
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
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px 16px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--white)', borderRadius: 16,
          width: '100%', maxWidth: 680, maxHeight: '80vh',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 8px 40px rgba(0,0,0,0.22)',
        }}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'Mona Sans','Mona-Sans',sans-serif", fontWeight: 900, fontSize: '1.1rem' }}>
              {customer.name || 'Unknown'}
            </div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 2 }}>{customer.phone}</div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 4 }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Order list */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {customer.loading ? (
            <div style={{ padding: 24 }}><SkelTable rows={5} cols={4} /></div>
          ) : customer.orders.length === 0 ? (
            <p style={{ padding: 24, color: 'var(--text-muted)', fontSize: '0.88rem' }}>No orders found.</p>
          ) : (
            <>
              <div style={{ padding: '10px 24px 4px', fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                {customer.orders.length} order{customer.orders.length !== 1 ? 's' : ''} · all time
              </div>
              {customer.orders.map(order => (
                <div
                  key={order.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 24px', borderBottom: '1px solid var(--border-subtle)',
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
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setKpiErr(false);
      setListErr(false);
      setDrillDown(null);

      const startParam = periodStart(period);
      const [kpisRes, listsRes] = await Promise.all([
        supabase.rpc('get_product_stats_kpis',  { p_store_id: storeParam, p_start: startParam }),
        supabase.rpc('get_product_stats_lists', { p_store_id: storeParam, p_start: startParam }),
      ]);
      if (cancelled) return;
      if (kpisRes.error)  setKpiErr(true);  else setKpis(kpisRes.data);
      if (listsRes.error) setListErr(true); else setLists(listsRes.data);
      setLoading(false);
    };
    run();
    return () => { cancelled = true; };
  }, [selectedStore, period]);

  const avgOrder = kpis && kpis.order_count > 0 ? kpis.revenue / kpis.order_count : 0;

  // ── Drill-down opener ────────────────────────────────────────────────────
  const openDrillDown = async (type, title) => {
    setDrillDown({ type, title, rows: [], loading: true });
    setDrillSearch('');
    const startParam = periodStart(period);

    if (type === 'products' || type === 'products_units') {
      const { data } = await supabase.rpc('get_stats_all_products', { p_store_id: storeParam, p_start: startParam });
      setDrillDown(d => d ? { ...d, rows: data || [], loading: false } : d);
    } else if (type === 'customers') {
      const { data } = await supabase.rpc('get_stats_all_customers', { p_store_id: storeParam, p_start: startParam });
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

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Header + period pills */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <h2 style={{ fontFamily: "'Mona Sans','Mona-Sans','Helvetica Neue',sans-serif", fontSize: '1.4rem', fontWeight: 900, margin: 0 }}>
          Stats
        </h2>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {PERIODS.map(p => (
            <button
              key={p.key}
              className={`dash-filter-btn${period === p.key ? ' active' : ''}`}
              onClick={() => setPeriod(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <>
          <SkelFilterPills count={4} />
          <SkelKpiGrid count={4} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16, marginTop: 8 }}>
            {Array.from({ length: 6 }).map((_, i) => <SkelTable key={i} rows={5} cols={2} />)}
          </div>
        </>
      ) : drillDown ? (
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
      ) : (
        <>
          {/* KPI cards */}
          <div className="kpi-grid" style={{ marginBottom: 24 }}>
            <div className="kpi-card green">
              <div className="kpi-icon"><DollarSign size={24} /></div>
              <div className="kpi-value">{kpiErr ? '—' : fmt(kpis?.revenue ?? 0)}</div>
              <div className="kpi-label">Total Revenue</div>
            </div>
            <div className="kpi-card blue">
              <div className="kpi-icon"><ShoppingBag size={24} /></div>
              <div className="kpi-value">{kpiErr ? '—' : fmtNum(kpis?.units_sold ?? 0)}</div>
              <div className="kpi-label">Total Units Sold</div>
            </div>
            <div className="kpi-card yellow">
              <div className="kpi-icon"><TrendingUp size={24} /></div>
              <div className="kpi-value">{kpiErr ? '—' : fmt(avgOrder)}</div>
              <div className="kpi-label">Average Order Value</div>
            </div>
            <div className="kpi-card red">
              <div className="kpi-icon"><Users size={24} /></div>
              <div className="kpi-value">{kpiErr ? '—' : fmtNum(kpis?.unique_customers ?? 0)}</div>
              <div className="kpi-label">Unique Customers</div>
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

      {/* Customer history modal */}
      {customerModal && (
        <CustomerModal customer={customerModal} onClose={() => setCustomerModal(null)} />
      )}
    </div>
  );
}
