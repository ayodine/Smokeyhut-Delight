import React, { useState, useEffect } from 'react';
import { DollarSign, Landmark, Banknote, CreditCard, ChevronLeft, ChevronRight } from 'lucide-react';
import { SkelKpiGrid, SkelTable, SkelDashHeader, SkelFilterPills } from '../../components/Skeleton';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useOutletContext } from 'react-router-dom';
import DashCalendar from '../../components/DashCalendar';

const fmt = (n) => '₦' + Number(n || 0).toLocaleString();

function paymentBadge(status) {
  if (['pending', 'pending_payment'].includes(status)) return { cls: 'pending', label: 'Pending' };
  if (status === 'cancelled') return { cls: 'cancelled', label: 'Failed' };
  return { cls: 'delivered', label: 'Paid' };
}
const PER_PAGE = 50;
const EMPTY_KPIS = { total: 0, bank_transfer: 0, cash: 0, pos: 0 };

const PERIODS = [
  { label: 'Today',      value: 'today' },
  { label: 'This Week',  value: 'week' },
  { label: 'This Month', value: 'month' },
  { label: 'This Year',  value: 'year' },
];

function getPeriodRange(period) {
  const now = new Date();
  let from;
  switch (period) {
    case 'today': { const d = new Date(now); d.setHours(0,0,0,0); from = d; break; }
    case 'week':  { const d = new Date(now); d.setDate(now.getDate() - ((now.getDay() + 6) % 7)); d.setHours(0,0,0,0); from = d; break; }
    case 'month': { from = new Date(now.getFullYear(), now.getMonth(), 1); break; }
    case 'year':  { from = new Date(now.getFullYear(), 0, 1); break; }
    default: return { from: '', to: '' };
  }
  const toDate = new Date(now);
  return {
    from: from.toISOString().slice(0, 10),
    to:   toDate.toISOString().slice(0, 10),
  };
}

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, color: 'red', background: '#fee2e2', borderRadius: 12 }}>
          <h2>Dashboard Crash Detected</h2>
          <p>{this.state.error?.message}</p>
          <pre style={{ fontSize: 10, marginTop: 10 }}>{this.state.error?.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

function PaymentsContent() {
  const { selectedStore } = useOutletContext() || {};
  const { userRole } = useAuth();
  const isAdmin = userRole === 'Admin';   // revenue KPIs are Admin-only
  const [payments, setPayments] = useState([]);
  const [kpis, setKpis] = useState(EMPTY_KPIS);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState({ start: null, end: null });
  const [period, setPeriod]   = useState('');
  const [page, setPage]       = useState(1);
  const [total, setTotal]     = useState(0);
  const methods = ['all', 'bank_transfer', 'cash', 'pos'];

  useEffect(() => { setPage(1); }, [selectedStore, filter, dateFilter, period]);
  useEffect(() => {
    // Only fetch if date filter selection is complete
    const isDateFilterIncomplete = !period && dateFilter && dateFilter.start && !dateFilter.end;
    if (isDateFilterIncomplete) return;
    fetchData();
  }, [selectedStore, filter, dateFilter, period, page]);

  const fetchData = async () => {
    setLoading(true);
    const storeParam = selectedStore && selectedStore !== 'all' ? Number(selectedStore) : null;

    let q = supabase
      .from('orders')
      .select('id, customer_name, customer_email, total, payment_method, status, created_at, store_id', { count: 'exact' })
      .is('deleted_at', null)
      .not('payment_method', 'is', null)
      .order('created_at', { ascending: false })
      .range((page - 1) * PER_PAGE, page * PER_PAGE - 1);

    const activePeriod = period ? getPeriodRange(period) : { from: dateFilter?.start, to: dateFilter?.end };

    if (selectedStore && selectedStore !== 'all') q = q.eq('store_id', selectedStore);
    if (filter !== 'all') q = q.eq('payment_method', filter);
    if (activePeriod.from) q = q.gte('created_at', activePeriod.from + 'T00:00:00');
    if (activePeriod.to)   q = q.lte('created_at', activePeriod.to   + 'T23:59:59');

    let kpiFallbackQuery = supabase
      .from('orders')
      .select('status, total, payment_method')
      .is('deleted_at', null)
      .not('payment_method', 'is', null)
      .in('status', ['processing', 'shipped', 'delivered']);
    if (selectedStore && selectedStore !== 'all') kpiFallbackQuery = kpiFallbackQuery.eq('store_id', selectedStore);

    const [kpisRes, ordersRes, kpiFallbackRes] = await Promise.all([
      supabase.rpc('get_payment_kpis', { p_store_id: storeParam }),
      q,
      kpiFallbackQuery,
    ]);

    setPayments(ordersRes.data || []);
    setTotal(ordersRes.count || 0);

    if (kpisRes.data) {
      setKpis(kpisRes.data);
    } else {
      const confirmed = kpiFallbackRes.data || [];
      const sum = (method) => confirmed.filter(p => p.payment_method === method).reduce((s, p) => s + Number(p.total), 0);
      setKpis({
        total:         confirmed.reduce((s, p) => s + Number(p.total), 0),
        bank_transfer: sum('bank_transfer'),
        cash:          sum('cash'),
        pos:           sum('pos'),
      });
    }
    setLoading(false);
  };

  const totalPages = Math.ceil(total / PER_PAGE);

  if (loading) return (
    <div>
      <SkelDashHeader />
      {isAdmin && <SkelKpiGrid count={4} />}
      <SkelFilterPills count={4} />
      <SkelTable rows={8} cols={5} />
    </div>
  );

  return (
    <div>
      <div className="dash-card-header" style={{ marginBottom: 20 }}>
        <div className="dash-card-title" style={{ fontFamily: "'Mona Sans', 'Mona-Sans', 'Helvetica Neue', sans-serif", fontSize: '1.4rem' }}>Payments & Transactions</div>
      </div>

      {isAdmin && (
      <div className="kpi-grid" style={{ marginBottom: 24 }}>
        <div className="kpi-card green">
          <div className="kpi-icon"><DollarSign size={24} /></div>
          <div className="kpi-value">{fmt(kpis.total)}</div>
          <div className="kpi-label">Total Revenue</div>
        </div>
        <div className="kpi-card yellow">
          <div className="kpi-icon"><Landmark size={24} /></div>
          <div className="kpi-value">{fmt(kpis.bank_transfer)}</div>
          <div className="kpi-label">Bank Transfer</div>
        </div>
        <div className="kpi-card red">
          <div className="kpi-icon"><Banknote size={24} /></div>
          <div className="kpi-value">{fmt(kpis.cash)}</div>
          <div className="kpi-label">Cash</div>
        </div>
        <div className="kpi-card blue">
          <div className="kpi-icon"><CreditCard size={24} /></div>
          <div className="kpi-value">{fmt(kpis.pos || 0)}</div>
          <div className="kpi-label">POS</div>
        </div>
      </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div className="dash-filters" style={{ margin: 0 }}>
            {methods.map(m => (
              <button key={m} className={`dash-filter-btn${filter === m ? ' active' : ''}`} onClick={() => setFilter(m)}>
                {m === 'all' ? 'All' : m === 'bank_transfer' ? 'Bank Transfer' : m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {PERIODS.map(p => (
            <button
              key={p.value}
              onClick={() => { setPeriod(period === p.value ? '' : p.value); setDateFilter({ start: null, end: null }); }}
              style={{
                padding: '6px 14px', borderRadius: 20,
                border: `1px solid ${period === p.value ? 'var(--red)' : 'var(--border-subtle)'}`,
                background: period === p.value ? 'var(--red)' : 'var(--white)',
                color: period === p.value ? '#fff' : 'var(--text)',
                fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer',
                fontFamily: "'DM Sans',sans-serif", transition: 'all 0.15s',
              }}
            >{p.label}</button>
          ))}
          <DashCalendar
            range={true}
            value={dateFilter}
            onChange={v => { setDateFilter(v); if (v && (v.start || v.end)) setPeriod(''); }}
            placeholder="Pick a date range"
          />
          {((dateFilter && (dateFilter.start || dateFilter.end)) || period) && (
            <button onClick={() => { setDateFilter({ start: null, end: null }); setPeriod(''); }} style={{ background: 'none', border: 'none', fontSize: '0.8rem', color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 600 }}>
              Clear dates
            </button>
          )}
        </div>
      </div>

      <div className="dash-card">
        <div style={{ overflowX: 'auto' }}>
          <table className="dash-table">
            <thead>
              <tr><th>Order ID</th><th>Customer</th><th>Email</th><th>Amount</th><th>Method</th><th>Status</th><th>Date</th></tr>
            </thead>
            <tbody>
              {payments.map(p => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 700, color: 'var(--red)' }}>{p.id}</td>
                  <td style={{ fontWeight: 600 }}>{p.customer_name}</td>
                  <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{p.customer_email || '—'}</td>
                  <td style={{ fontWeight: 700 }}>{fmt(p.total)}</td>
                  <td style={{ fontSize: '0.82rem' }}>{(p.payment_method || '').replace('_', ' ')}</td>
                  <td>{(() => { const { cls, label } = paymentBadge(p.status); return <span className={`status-badge ${cls}`}>{label}</span>; })()}</td>
                  <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{new Date(p.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
              {payments.length === 0 && (
                <tr><td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No payments found.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderTop: '1px solid var(--border-subtle)' }}>
            <span style={{ fontSize: '0.83rem', color: 'var(--text-muted)' }}>
              {((page - 1) * PER_PAGE) + 1}–{Math.min(page * PER_PAGE, total)} of {total} payments
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => setPage(p => p - 1)}
                disabled={page === 1}
                style={{ background: 'var(--black2)', border: '1px solid var(--border-subtle)', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.4 : 1 }}
              >
                <ChevronLeft size={16} />
              </button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                const p = totalPages <= 5 ? i + 1 : page <= 3 ? i + 1 : page >= totalPages - 2 ? totalPages - 4 + i : page - 2 + i;
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    style={{ background: page === p ? 'var(--red)' : 'var(--black2)', color: page === p ? '#fff' : 'var(--text)', border: '1px solid var(--border-subtle)', borderRadius: 8, width: 32, height: 32, fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}
                  >
                    {p}
                  </button>
                );
              })}
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={page === totalPages}
                style={{ background: 'var(--black2)', border: '1px solid var(--border-subtle)', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: page === totalPages ? 'not-allowed' : 'pointer', opacity: page === totalPages ? 0.4 : 1 }}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Payments() {
  return (
    <ErrorBoundary>
      <PaymentsContent />
    </ErrorBoundary>
  );
}
