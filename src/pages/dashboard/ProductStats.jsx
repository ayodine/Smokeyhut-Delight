import React, { useState, useEffect } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { ArrowLeft, DollarSign, ShoppingBag, TrendingUp, Users } from 'lucide-react';
import { SkelKpiGrid, SkelTable } from '../../components/Skeleton';
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
    const day = d.getDay();
    d.setDate(d.getDate() - ((day + 6) % 7));
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

const RANK1_STYLE = {
  ...RANK_STYLE, background: 'var(--red)', color: '#fff',
};

function TopList({ title, rows, error, valueLabel = '', isCurrency = false }) {
  return (
    <div className="dash-card">
      <div className="dash-card-header" style={{ marginBottom: 14 }}>
        <div className="dash-card-title" style={{ fontSize: '0.95rem' }}>{title}</div>
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
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '6px 8px', borderRadius: 8,
                background: i === 0 ? 'rgba(192,32,31,0.06)' : 'transparent',
              }}
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

export default function ProductStats() {
  const { selectedStore } = useOutletContext() || {};
  const [period, setPeriod]   = useState('month');
  const [kpis,   setKpis]     = useState(null);
  const [lists,  setLists]    = useState(null);
  const [kpiErr, setKpiErr]   = useState(false);
  const [listErr,setListErr]  = useState(false);
  const [loading,setLoading]  = useState(true);

  useEffect(() => { fetchAll(); }, [selectedStore, period]);

  const fetchAll = async () => {
    setLoading(true);
    setKpiErr(false);
    setListErr(false);

    const storeParam = selectedStore && selectedStore !== 'all' ? Number(selectedStore) : null;
    const startParam = periodStart(period);

    const [kpisRes, listsRes] = await Promise.all([
      supabase.rpc('get_product_stats_kpis',  { p_store_id: storeParam, p_start: startParam }),
      supabase.rpc('get_product_stats_lists', { p_store_id: storeParam, p_start: startParam }),
    ]);

    if (kpisRes.error)  setKpiErr(true);  else setKpis(kpisRes.data);
    if (listsRes.error) setListErr(true); else setLists(listsRes.data);
    setLoading(false);
  };

  const avgOrder = kpis && kpis.order_count > 0
    ? kpis.revenue / kpis.order_count
    : 0;

  return (
    <div>
      <div className="dash-card-header" style={{ marginBottom: 20, alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Link to="/admin/products" style={{ color: 'var(--text-muted)', display: 'flex' }}>
            <ArrowLeft size={20} />
          </Link>
          <div className="dash-card-title" style={{ fontFamily: "'Mona Sans','Mona-Sans','Helvetica Neue',sans-serif", fontSize: '1.4rem' }}>
            Product Stats
          </div>
        </div>
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
          <SkelKpiGrid count={4} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16, marginTop: 8 }}>
            {Array.from({ length: 6 }).map((_, i) => <SkelTable key={i} rows={5} cols={2} />)}
          </div>
        </>
      ) : (
        <>
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

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
            <TopList title="Best Performing Products"     rows={lists?.top_by_revenue}   error={listErr} isCurrency />
            <TopList title="Top Most Sold Products"       rows={lists?.top_by_units}      error={listErr} valueLabel="units" />
            <TopList title="Top Delivery Locations"       rows={lists?.top_locations}     error={listErr} valueLabel="orders" />
            <TopList title="Top Product by Qty Per Order" rows={lists?.top_qty_per_order} error={listErr} valueLabel="avg qty" />
            <TopList title="Top Performing Customers"     rows={lists?.top_customers}     error={listErr} valueLabel="orders" />
            <TopList title="Top Categories"               rows={lists?.top_categories}    error={listErr} isCurrency />
          </div>
        </>
      )}
    </div>
  );
}
