import { useState, useEffect, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Package, Search, X } from 'lucide-react';
import { SkelKpiGrid, SkelFilterPills, SkelTable } from '../../components/Skeleton';
import { supabase } from '../../lib/supabase';
import DashCalendar from '../../components/DashCalendar';
import CustomSelect from '../../components/CustomSelect';
import { STATUS_FILTERS, DEFAULT_STATUS, toStatusParam, statusLabelFor } from '../../lib/orderStatusFilter';

const fmt    = (n) => '₦' + Number(n).toLocaleString();
const fmtNum = (n) => Number(n).toLocaleString();

const STATUS_COLOR = { pending: '#f59e0b', pending_payment: '#f59e0b', paid: '#3b82f6', processing: '#3b82f6', shipped: '#8b5cf6', delivered: '#16a34a', cancelled: '#ef4444' };

const PERIODS = [
  { value: 'today',  label: 'Today' },
  { value: 'week',   label: 'This Week' },
  { value: 'month',  label: 'This Month' },
  { value: 'all',    label: 'All Time' },
];

// Card colour variants cycled through for visual variety.
const VARIANTS = ['green', 'blue', 'yellow', 'red', 'purple'];

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

// Collapse "CHOPPED" variants onto the base product name, matching ProductStats.
function normalizeProductName(name) {
  if (!name) return '';
  let normalized = name.trim();
  const choppedRegex = /\s*\(?\s*CHOPPED\s*\)?\s*$/i;
  if (choppedRegex.test(normalized)) {
    normalized = normalized.replace(choppedRegex, '').trim() + ' (CHOPPED)';
  }
  return normalized;
}

// Merge rows by normalised name, summing units + revenue, sorted by units desc.
function mergeByUnits(rows) {
  if (!rows || rows.length === 0) return [];
  const map = {};
  rows.forEach(r => {
    const name = normalizeProductName(r.name || '');
    if (!map[name]) map[name] = { name, units: 0, revenue: 0 };
    map[name].units   += Number(r.units || 0);
    map[name].revenue += Number(r.revenue || 0);
  });
  return Object.values(map).sort((a, b) => b.units - a.units);
}

// ─── Per-product order breakdown modal ───────────────────────────────────────
function BreakdownModal({ product, statusLabel, onClose }) {
  const { name, units, revenue, rows, loading } = product;
  const countedUnits = (rows || []).reduce((s, r) => s + Number(r.qty), 0);

  return (
    <div className="product-form-modal" onClick={onClose}>
      <div className="product-form-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 720 }}>
        <h3 style={{ marginTop: 0, marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>{name}</span>
          <button onClick={onClose} className="dash-drawer-close"><X size={16} /></button>
        </h3>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 18 }}>
          {fmtNum(units)} units — {statusLabel} · {fmt(revenue)} revenue
        </div>

        {loading ? (
          <SkelTable rows={8} cols={5} />
        ) : !rows || rows.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>No orders for this product in the selected period.</p>
        ) : (
          <div style={{ overflowX: 'auto', background: 'var(--white)', borderRadius: 12, border: '1px solid var(--border-subtle)' }}>
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Qty</th>
                  <th style={{ textAlign: 'right' }}>Line Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 700, color: 'var(--red)' }}>{r.order_id}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{new Date(r.created_at).toLocaleDateString()}</td>
                    <td>{r.customer_name || '—'}</td>
                    <td>
                      <span style={{
                        background: (STATUS_COLOR[r.status] || '#888') + '22',
                        color: STATUS_COLOR[r.status] || 'var(--text-muted)',
                        padding: '2px 8px', borderRadius: 20, fontWeight: 700, fontSize: '0.72rem',
                      }}>
                        {r.status}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtNum(r.qty)}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(r.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ padding: '12px 16px', fontSize: '0.8rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <span>{rows.length} order line{rows.length !== 1 ? 's' : ''}</span>
              <span>{fmtNum(countedUnits)} units counted — {statusLabel}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ProductsSold() {
  const { selectedStore } = useOutletContext() || {};
  const [period, setPeriod]         = useState('month');
  const [status, setStatus]         = useState(DEFAULT_STATUS);
  const [customDate, setCustomDate] = useState({ start: null, end: null });
  const [rows, setRows]             = useState([]);
  const [err, setErr]               = useState(false);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [detail, setDetail]         = useState(null); // { name, units, revenue, rows, loading }

  const storeParam = selectedStore && selectedStore !== 'all' ? Number(selectedStore) : null;

  const openDetail = async (product) => {
    setDetail({ ...product, rows: [], loading: true });
    const { start, end } = getPeriodParams(period, customDate);
    const { data } = await supabase.rpc('get_product_order_breakdown', {
      p_name: product.name, p_store_id: storeParam, p_start: start, p_end: end,
      p_status: toStatusParam(status),
    });
    setDetail(d => (d && d.name === product.name ? { ...d, rows: data || [], loading: false } : d));
  };

  useEffect(() => {
    const isCustomDateIncomplete = customDate && customDate.start && !customDate.end;
    if (isCustomDateIncomplete) return;

    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setErr(false);
      const { start, end } = getPeriodParams(period, customDate);
      const { data, error } = await supabase.rpc('get_stats_all_products', {
        p_store_id: storeParam, p_start: start, p_end: end,
        p_status: toStatusParam(status),
      });
      if (cancelled) return;
      if (error) { setErr(true); setRows([]); }
      else       { setRows(mergeByUnits(data || [])); }
      setLoading(false);
    };
    run();
    return () => { cancelled = true; };
  }, [selectedStore, period, customDate, status]);

  const q = search.trim().toLowerCase();
  const filtered = useMemo(
    () => (q ? rows.filter(r => r.name.toLowerCase().includes(q)) : rows),
    [rows, q],
  );

  const totalUnits = useMemo(() => rows.reduce((s, r) => s + r.units, 0), [rows]);

  return (
    <div>
      {/* Header + period pills */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <h2 style={{ fontFamily: "'Mona Sans','Mona-Sans','Helvetica Neue',sans-serif", fontSize: '1.4rem', fontWeight: 900, margin: 0 }}>
          Units Sold by Product
        </h2>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="dash-segmented-control">
            {STATUS_FILTERS.map(s => (
              <button
                key={s.key}
                className={`dash-filter-btn${status === s.key ? ' active' : ''}`}
                onClick={() => setStatus(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div style={{ width: 140 }}>
            <CustomSelect
              value={period}
              onChange={(e) => { setPeriod(e.target.value); setCustomDate({ start: null, end: null }); }}
              options={PERIODS}
            />
          </div>
          <DashCalendar
            range={true}
            value={customDate}
            onChange={v => { setCustomDate(v); setPeriod(v && (v.start || v.end) ? 'custom' : 'month'); }}
            placeholder="Pick a date range"
          />
        </div>
      </div>

      {/* Search + summary */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search products…"
            style={{
              width: '100%', paddingLeft: 36, paddingRight: search ? 36 : 12, paddingTop: 10, paddingBottom: 10,
              borderRadius: 8, border: '1px solid var(--border-subtle)',
              background: 'var(--white)', color: 'var(--text)',
              fontSize: '0.9rem', fontFamily: "'DM Sans',sans-serif", outline: 'none',
            }}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 0 }}
            >
              <X size={14} />
            </button>
          )}
        </div>
        {!loading && !err && (
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>
            {fmtNum(rows.length)} product{rows.length !== 1 ? 's' : ''} · {fmtNum(totalUnits)} units sold
          </div>
        )}
      </div>

      {loading ? (
        <>
          <SkelFilterPills count={1} />
          <SkelKpiGrid count={8} />
        </>
      ) : err ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Could not load product data.</p>
      ) : filtered.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          {q ? 'No products match your search.' : 'No products sold in this period.'}
        </p>
      ) : (
        <div className="kpi-grid">
          {filtered.map((r, i) => (
            <div
              key={r.name}
              className={`kpi-card ${VARIANTS[i % VARIANTS.length]}`}
              onClick={() => openDetail(r)}
              role="button"
              tabIndex={0}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r); } }}
              style={{ cursor: 'pointer' }}
            >
              <div className="kpi-icon"><Package size={24} /></div>
              <div className="kpi-value">{fmtNum(r.units)}</div>
              <div className="kpi-label" title={r.name} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.name}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>
                {fmt(r.revenue)} revenue
              </div>
            </div>
          ))}
        </div>
      )}

      {detail && <BreakdownModal product={detail} statusLabel={statusLabelFor(status)} onClose={() => setDetail(null)} />}
    </div>
  );
}
