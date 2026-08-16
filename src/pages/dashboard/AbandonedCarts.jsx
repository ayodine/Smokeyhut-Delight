import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ShoppingCart, DollarSign, TrendingDown, CheckCircle2,
  Phone, MessageCircle, Mail, MapPin, Clock, Search,
  RefreshCw, Download, ChevronLeft, ChevronRight, ExternalLink,
  User, Check, AlertCircle, Eye, X, Smartphone, Globe, Calendar, Filter, Loader2
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { SkelKpiGrid, SkelTable, SkelDashHeader } from '../../components/Skeleton';
import DashCalendar from '../../components/DashCalendar';
import CustomSelect from '../../components/CustomSelect';

const fmt = (n) => '₦' + Number(n || 0).toLocaleString();
const PER_PAGE = 30;

const PERIOD_OPTIONS = [
  { label: 'This Month', value: 'month' },
  { label: 'Today',      value: 'today' },
  { label: 'This Week',  value: 'week' },
  { label: 'All Time',   value: 'all_time' },
];

function getPeriodRange(period) {
  const now = new Date();
  let start = null;
  let end = null;
  switch (period) {
    case 'today': {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      start = d.toISOString();
      end = now.toISOString();
      break;
    }
    case 'week': {
      const d = new Date(now);
      d.setDate(now.getDate() - ((now.getDay() + 6) % 7));
      d.setHours(0, 0, 0, 0);
      start = d.toISOString();
      end = now.toISOString();
      break;
    }
    case 'month': {
      const d = new Date(now.getFullYear(), now.getMonth(), 1);
      start = d.toISOString();
      end = now.toISOString();
      break;
    }
    case 'all_time':
    default:
      start = null;
      end = null;
      break;
  }
  return { start, end };
}

function timeAgo(dateString) {
  if (!dateString) return '—';
  const now = new Date();
  const date = new Date(dateString);
  const diffInSec = Math.floor((now - date) / 1000);
  if (diffInSec < 60) return 'Just now';
  if (diffInSec < 3600) return `${Math.floor(diffInSec / 60)}m ago`;
  if (diffInSec < 86400) return `${Math.floor(diffInSec / 3600)}h ago`;
  if (diffInSec < 604800) return `${Math.floor(diffInSec / 86400)}d ago`;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function normalizeNigerianPhone(phone) {
  if (!phone) return '';
  let cleaned = String(phone).replace(/\D/g, '');
  if (cleaned.startsWith('0') && cleaned.length === 11) {
    return '234' + cleaned.slice(1);
  }
  if (cleaned.startsWith('234') && cleaned.length === 13) {
    return cleaned;
  }
  if (cleaned.length === 10) {
    return '234' + cleaned;
  }
  return cleaned;
}

function getStageBadge(stage) {
  switch (stage) {
    case 'cart':
      return { label: 'Cart', bg: '#f3f4f6', color: '#4b5563', border: '#e5e7eb' };
    case 'checkout':
      return { label: 'Checkout', bg: '#fef3c7', color: '#92400e', border: '#fde68a' };
    case 'contact_captured':
      return { label: 'Contact Captured', bg: '#e0f2fe', color: '#0369a1', border: '#bae6fd' };
    case 'payment_pending':
      return { label: 'Payment Pending', bg: '#ffedd5', color: '#c2410c', border: '#fed7aa' };
    case 'converted':
      return { label: 'Converted', bg: '#dcfce7', color: '#15803d', border: '#bbf7d0' };
    default:
      return { label: stage || 'Unknown', bg: '#f3f4f6', color: '#4b5563', border: '#e5e7eb' };
  }
}

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, color: 'red', background: '#fee2e2', borderRadius: 12 }}>
          <h2>Abandoned Carts Crash Detected</h2>
          <p>{this.state.error?.message}</p>
          <pre style={{ fontSize: 10, marginTop: 10 }}>{this.state.error?.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

function AbandonedCartsContent() {
  const { userRole, userPermissions } = useAuth();
  const { showToast } = useToast();
  const isAdmin = userRole === 'Admin';
  const canViewKpi = isAdmin || (userPermissions || []).includes('Orders:view') || (userPermissions || []).includes('Payments:kpi');

  const [stats, setStats] = useState({
    total_sessions: 0,
    converted_sessions: 0,
    abandoned_sessions: 0,
    abandonment_rate: 0,
    lost_revenue: 0,
    recoverable_count: 0,
    recovered_count: 0,
    recovered_revenue: 0,
    stages: { cart: 0, checkout: 0, contact_captured: 0, payment_pending: 0, converted: 0, recovered: 0 },
    funnel: { cart_created: 0, checkout_reached: 0, contact_captured: 0, payment_started: 0, converted: 0 }
  });

  const [records, setRecords] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [initialLoading, setInitialLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('abandoned'); // 'abandoned' | 'recoverable' | 'checkout' | 'contact_captured' | 'payment_pending' | 'recovered' | 'all'
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [period, setPeriod] = useState('month');
  const [dateFilter, setDateFilter] = useState({ start: null, end: null });
  const [page, setPage] = useState(1);
  const [selectedSession, setSelectedSession] = useState(null);
  const [togglingId, setTogglingId] = useState(null);

  // Derive active date range
  const activeRange = useMemo(() => {
    if (period && period !== 'custom') {
      return getPeriodRange(period);
    }
    if (dateFilter?.start && dateFilter?.end) {
      return {
        start: new Date(dateFilter.start).toISOString(),
        end: new Date(dateFilter.end).toISOString(),
      };
    }
    return { start: null, end: null };
  }, [period, dateFilter]);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else if (initialLoading) {
      // keep initialLoading true
    } else {
      setTableLoading(true);
    }

    try {
      // 1. Fetch KPI Stats
      const { data: statsData, error: statsError } = await supabase.rpc('get_abandoned_cart_stats', {
        p_start: activeRange.start,
        p_end: activeRange.end
      });

      if (!statsError && statsData) {
        setStats(statsData);
      }

      // 2. Fetch Paginated Records via server RPC
      const offset = (page - 1) * PER_PAGE;
      const { data: listData, error: listError } = await supabase.rpc('get_abandoned_cart_list', {
        p_start: activeRange.start,
        p_end: activeRange.end,
        p_filter: filter,
        p_search: search || null,
        p_limit: PER_PAGE,
        p_offset: offset
      });

      if (listError) throw listError;

      if (listData) {
        setRecords(listData.data || listData.records || []);
        setTotalCount(listData.total || 0);
      }
    } catch (err) {
      console.error('Failed to fetch cart abandonment data:', err);
      showToast('Error loading carts', err.message, 'error');
    } finally {
      setInitialLoading(false);
      setTableLoading(false);
      setRefreshing(false);
    }
  }, [activeRange, filter, search, page, initialLoading, showToast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleToggleRecovered = async (session, e) => {
    e?.stopPropagation();
    const newStatus = !session.recovered;
    setTogglingId(session.session_id);
    try {
      const { error } = await supabase.rpc('toggle_cart_recovered', {
        p_session_id: session.session_id,
        p_recovered: newStatus
      });
      if (error) throw error;
      showToast('Updated', `Cart marked as ${newStatus ? 'Recovered' : 'Unrecovered'}`, 'success');
      // Update locally
      setRecords(prev => prev.map(r => r.session_id === session.session_id ? { ...r, recovered: newStatus } : r));
      if (selectedSession?.session_id === session.session_id) {
        setSelectedSession(prev => ({ ...prev, recovered: newStatus }));
      }
      // Refresh stats quietly
      supabase.rpc('get_abandoned_cart_stats', { p_start: activeRange.start, p_end: activeRange.end })
        .then(({ data }) => { if (data) setStats(data); });
    } catch (err) {
      showToast('Action Failed', err.message, 'error');
    } finally {
      setTogglingId(null);
    }
  };

  const openWhatsAppOutreach = (session, e) => {
    e?.stopPropagation();
    if (!session.customer_phone) return;
    const phone = normalizeNigerianPhone(session.customer_phone);
    if (!phone) {
      showToast('Invalid Phone', 'No valid phone number found for this lead.', 'error');
      return;
    }

    const firstName = session.customer_name ? session.customer_name.trim().split(' ')[0] : 'there';
    const itemsList = (session.items || []).map(i => `${i.qty}x ${i.name}`).slice(0, 3).join(', ');
    
    // In production, uses live origin (e.g. https://smokeyhutdelight.com); in dev defaults to smokeyhutdelight.com or live origin
    const siteUrl = (typeof window !== 'undefined' && !window.location.hostname.includes('localhost'))
      ? window.location.origin
      : 'https://smokeyhutdelight.com';

    // Using explicit Unicode escape sequences to ensure robust UTF-8 encoding across all browsers and WhatsApp Web redirects
    const wave = '\u{1F44B}';
    const chicken = '\u{1F357}';
    const sparkle = '\u{2728}';

    const msg = [
      `Hello ${firstName}! ${wave}`,
      '',
      `This is Smokeyhut Delights. We noticed you left some delicious items in your cart (${itemsList || 'Smokeyhut Order'}${session.items?.length > 3 ? '...' : ''}).`,
      '',
      'Would you like help completing your order or delivery? You can also complete it here anytime:',
      `${siteUrl}/checkout`,
      '',
      `Let us know if you have any questions! ${chicken}${sparkle}`
    ].join('\n');

    // Using api.whatsapp.com/send directly avoids the wa.me 302 redirect that corrupts multi-byte emojis on desktop browsers
    const url = `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const exportToExcel = () => {
    if (!records.length) {
      showToast('No data to export', 'There are no records in the current view.', 'error');
      return;
    }

    const rows = records.map(r => ({
      'Session ID': r.session_id,
      'Customer Name': r.customer_name || 'Guest',
      'Phone': r.customer_phone || '',
      'Email': r.customer_email || '',
      'Delivery Zone': r.delivery_zone || '',
      'Delivery Address': r.delivery_address || '',
      'Items Count': r.item_count || 0,
      'Items': (r.items || []).map(i => `${i.qty}x ${i.name} (₦${i.price})`).join('; '),
      'Cart Total (NGN)': r.cart_total || 0,
      'Stage': r.stage,
      'Recovered': r.recovered ? 'Yes' : 'No',
      'Order ID': r.order_id || '',
      'Last Active': r.last_active_at ? new Date(r.last_active_at).toLocaleString() : '',
      'Created At': r.created_at ? new Date(r.created_at).toLocaleString() : '',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Abandoned Carts');
    const dateStr = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `Smokeyhut_Abandoned_Carts_${dateStr}.xlsx`);
    showToast('Exported', 'Excel file downloaded successfully', 'success');
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / PER_PAGE));

  if (initialLoading) {
    return (
      <div>
        <SkelDashHeader />
        {canViewKpi && <SkelKpiGrid count={4} />}
        <SkelTable rows={8} cols={6} />
      </div>
    );
  }

  // Calculate Funnel Conversion %
  const funnelCart = stats.funnel?.cart_created ?? stats.total_sessions ?? 0;
  const funnelCheckout = stats.funnel?.checkout_reached ?? 0;
  const funnelContact = stats.funnel?.contact_captured ?? 0;
  const funnelPending = stats.funnel?.payment_started ?? 0;
  const funnelConverted = stats.funnel?.converted ?? stats.converted_sessions ?? 0;

  const getPercent = (count) => {
    if (!funnelCart || funnelCart === 0) return 0;
    return Math.round((count / funnelCart) * 100);
  };

  // Helper for dynamic tab labels with counts (omits count when 0)
  const formatTabLabel = (title, count) => {
    const num = Number(count || 0);
    return num > 0 ? `${title} (${num})` : title;
  };

  return (
    <div>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="dash-card-title" style={{ fontFamily: "'Mona Sans', 'Mona-Sans', 'Helvetica Neue', sans-serif", fontSize: '1.4rem', fontWeight: 800 }}>
            Abandoned Carts & Recovery
          </div>
          <div style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginTop: 2 }}>
            Track drop-offs, recover lost revenue, and re-engage prospective customers
          </div>
        </div>

        {/* Header Controls: Clean Dropdown & Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* Period Dropdown */}
          <div style={{ width: 140 }}>
            <CustomSelect
              value={period}
              onChange={(e) => {
                setPeriod(e.target.value);
                setDateFilter({ start: null, end: null });
                setPage(1);
              }}
              options={PERIOD_OPTIONS}
            />
          </div>

          {/* Custom Date Picker */}
          <DashCalendar
            range={true}
            value={dateFilter}
            onChange={v => {
              setDateFilter(v);
              if (v && (v.start || v.end)) {
                setPeriod('custom');
                setPage(1);
              }
            }}
            placeholder="Custom range"
          />

          {((dateFilter && (dateFilter.start || dateFilter.end)) || (period && period !== 'month')) && (
            <button
              onClick={() => {
                setDateFilter({ start: null, end: null });
                setPeriod('month');
                setPage(1);
              }}
              style={{ background: 'none', border: 'none', fontSize: '0.78rem', color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 600, padding: '4px 6px' }}
            >
              Reset
            </button>
          )}

          <button
            onClick={() => fetchData(true)}
            disabled={refreshing}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 10,
              background: 'var(--card-bg, #fff)', border: '1px solid var(--border-subtle)',
              color: 'var(--text)', fontSize: '0.82rem', fontWeight: 700,
              cursor: 'pointer', transition: 'all 0.15s'
            }}
          >
            <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
            Refresh
          </button>

          <button
            onClick={exportToExcel}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 10,
              background: 'var(--card-bg, #fff)', border: '1px solid var(--border-subtle)',
              color: 'var(--text)', fontSize: '0.82rem', fontWeight: 700,
              cursor: 'pointer', transition: 'all 0.15s'
            }}
          >
            <Download size={14} />
            Export Excel
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      {canViewKpi && (
        <div className="kpi-grid" style={{ marginBottom: 20 }}>
          {/* Lost Revenue */}
          <div className="kpi-card red">
            <div className="kpi-icon"><TrendingDown size={24} /></div>
            <div className="kpi-value">{fmt(stats.lost_revenue)}</div>
            <div className="kpi-label">Lost Revenue</div>
            <div style={{ fontSize: '0.72rem', color: '#991b1b', marginTop: 4, fontWeight: 600 }}>
              {stats.abandoned_sessions} abandoned cart sessions
            </div>
          </div>

          {/* Cart Abandonment Rate */}
          <div className="kpi-card yellow">
            <div className="kpi-icon"><ShoppingCart size={24} /></div>
            <div className="kpi-value">{stats.abandonment_rate}%</div>
            <div className="kpi-label">Abandonment Rate</div>
            <div style={{ fontSize: '0.72rem', color: '#854d0e', marginTop: 4, fontWeight: 600 }}>
              {stats.converted_sessions} converted / {stats.total_sessions} total
            </div>
          </div>

          {/* Recoverable Carts */}
          <div className="kpi-card blue">
            <div className="kpi-icon"><MessageCircle size={24} /></div>
            <div className="kpi-value">{stats.recoverable_count}</div>
            <div className="kpi-label">Recoverable Leads</div>
            <div style={{ fontSize: '0.72rem', color: '#075985', marginTop: 4, fontWeight: 600 }}>
              With phone or email captured
            </div>
          </div>

          {/* Recovered Revenue */}
          <div className="kpi-card green">
            <div className="kpi-icon"><DollarSign size={24} /></div>
            <div className="kpi-value">{fmt(stats.recovered_revenue)}</div>
            <div className="kpi-label">Recovered Revenue</div>
            <div style={{ fontSize: '0.72rem', color: '#166534', marginTop: 4, fontWeight: 600 }}>
              {stats.recovered_count || stats.stages?.recovered || 0} carts marked recovered
            </div>
          </div>
        </div>
      )}

      {/* Sleek Drop-off Funnel Visualizer */}
      <div className="dash-card" style={{ padding: '18px 20px', marginBottom: 20, borderRadius: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#111', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>Checkout Drop-off Funnel</span>
          </div>
          <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', fontWeight: 600 }}>
            {funnelCart} Total Carts Initiated
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
          {/* Step 1: Cart */}
          <div style={{ background: '#fff', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Cart Started
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#111', margin: '2px 0' }}>
              {funnelCart}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              100% of traffic
            </div>
            <div style={{ width: '100%', height: 4, background: '#f1f5f9', borderRadius: 3, marginTop: 6, overflow: 'hidden' }}>
              <div style={{ width: '100%', height: '100%', background: 'var(--red, #c0201f)' }} />
            </div>
          </div>

          {/* Step 2: Checkout */}
          <div style={{ background: '#fff', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Checkout Reached
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#111', margin: '2px 0' }}>
              {funnelCheckout}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              {getPercent(funnelCheckout)}% conversion
            </div>
            <div style={{ width: '100%', height: 4, background: '#f1f5f9', borderRadius: 3, marginTop: 6, overflow: 'hidden' }}>
              <div style={{ width: `${getPercent(funnelCheckout)}%`, height: '100%', background: 'var(--red, #c0201f)' }} />
            </div>
          </div>

          {/* Step 3: Contact Captured */}
          <div style={{ background: '#fff', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Contact Captured
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#111', margin: '2px 0' }}>
              {funnelContact}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              {getPercent(funnelContact)}% reachable leads
            </div>
            <div style={{ width: '100%', height: 4, background: '#f1f5f9', borderRadius: 3, marginTop: 6, overflow: 'hidden' }}>
              <div style={{ width: `${getPercent(funnelContact)}%`, height: '100%', background: 'var(--red, #c0201f)' }} />
            </div>
          </div>

          {/* Step 4: Payment Pending */}
          <div style={{ background: '#fff', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Payment Pending
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#111', margin: '2px 0' }}>
              {funnelPending}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              {getPercent(funnelPending)}% at payment gate
            </div>
            <div style={{ width: '100%', height: 4, background: '#f1f5f9', borderRadius: 3, marginTop: 6, overflow: 'hidden' }}>
              <div style={{ width: `${getPercent(funnelPending)}%`, height: '100%', background: 'var(--red, #c0201f)' }} />
            </div>
          </div>

          {/* Step 5: Converted */}
          <div style={{ background: '#fff', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Completed Orders
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#111', margin: '2px 0' }}>
              {funnelConverted}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              {getPercent(funnelConverted)}% full checkout
            </div>
            <div style={{ width: '100%', height: 4, background: '#f1f5f9', borderRadius: 3, marginTop: 6, overflow: 'hidden' }}>
              <div style={{ width: `${getPercent(funnelConverted)}%`, height: '100%', background: 'var(--red, #c0201f)' }} />
            </div>
          </div>
        </div>
      </div>

      {/* Stage Filter Pills & Search */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div className="dash-filters" style={{ margin: 0, flexWrap: 'wrap' }}>
          {[
            { key: 'abandoned', title: 'All Abandoned', count: stats.abandoned_sessions },
            { key: 'recoverable', title: 'Recoverable', count: stats.recoverable_count },
            { key: 'checkout', title: 'At Checkout', count: stats.stages?.checkout },
            { key: 'contact_captured', title: 'Contact Captured', count: stats.stages?.contact_captured },
            { key: 'recovered', title: 'Recovered', count: stats.recovered_count || stats.stages?.recovered },
          ].map(tab => {
            const label = formatTabLabel(tab.title, tab.count);
            return (
              <button
                key={tab.key}
                className={`dash-filter-btn${filter === tab.key ? ' active' : ''}`}
                onClick={() => {
                  if (filter !== tab.key) {
                    setFilter(tab.key);
                    setPage(1);
                  }
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Search Input */}
        <div style={{ position: 'relative', minWidth: 260 }}>
          <Search size={15} color="#888" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            placeholder="Search by name, phone, email..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            style={{
              width: '100%', padding: '9px 12px 9px 34px',
              borderRadius: 10, border: '1.5px solid var(--border-subtle)',
              background: 'var(--white)', fontSize: '0.84rem', outline: 'none',
              boxSizing: 'border-box'
            }}
          />
          {searchInput && (
            <button
              onClick={() => setSearchInput('')}
              style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#888', padding: 2 }}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Main Abandoned Carts Table */}
      <div className="dash-card" style={{ borderRadius: 16, overflow: 'hidden', position: 'relative' }}>
        {/* Subtle inline table loading overlay (no full page jump) */}
        {tableLoading && (
          <div style={{
            position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.6)',
            zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(1px)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', padding: '8px 16px', borderRadius: 20, boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontSize: '0.82rem', fontWeight: 700, color: '#333' }}>
              <Loader2 size={16} className="spin" color="var(--red)" />
              Updating list...
            </div>
          </div>
        )}

        <div style={{ overflowX: 'auto' }}>
          <table className="dash-table">
            <thead>
              <tr>
                <th>Customer / Lead</th>
                <th>Cart Details</th>
                <th>Stage</th>
                <th>Last Active</th>
                <th>Recovery Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-muted)' }}>
                    <ShoppingCart size={40} style={{ opacity: 0.3, marginBottom: 10 }} />
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)' }}>No abandoned carts found</div>
                    <div style={{ fontSize: '0.82rem', marginTop: 4 }}>Try adjusting the date range or stage filter.</div>
                  </td>
                </tr>
              ) : (
                records.map(record => {
                  const stageStyle = getStageBadge(record.stage);
                  const hasContact = !!(record.customer_phone || record.customer_email);
                  const itemsSummary = (record.items || []).map(i => `${i.qty}x ${i.name}`).slice(0, 2).join(', ');
                  const extraItemsCount = (record.items || []).length - 2;

                  return (
                    <tr
                      key={record.id || record.session_id}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setSelectedSession(record)}
                    >
                      {/* Customer / Lead */}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{
                            width: 36, height: 36, borderRadius: '50%',
                            background: record.customer_name ? '#fee2e2' : '#f1f5f9',
                            color: record.customer_name ? '#c0201f' : '#64748b',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontWeight: 800, fontSize: '0.85rem', flexShrink: 0
                          }}>
                            {record.customer_name ? record.customer_name.charAt(0).toUpperCase() : <User size={18} />}
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#111', display: 'flex', alignItems: 'center', gap: 6 }}>
                              {record.customer_name || 'Guest Shopper'}
                              {record.user_id && (
                                <span style={{ fontSize: '0.65rem', background: '#e0e7ff', color: '#4338ca', padding: '1px 6px', borderRadius: 6, fontWeight: 800 }}>
                                  User
                                </span>
                              )}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2, fontSize: '0.78rem', color: '#64748b' }}>
                              {record.customer_phone && (
                                <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                  <Phone size={12} /> {record.customer_phone}
                                </span>
                              )}
                              {record.customer_email && (
                                <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                  <Mail size={12} /> {record.customer_email}
                                </span>
                              )}
                              {!hasContact && (
                                <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Anonymous session</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Cart Details */}
                      <td>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: '0.92rem', color: 'var(--red)' }}>
                            {fmt(record.cart_total)}
                          </div>
                          <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: 2, maxWidth: 220, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {itemsSummary || 'No items listed'}
                            {extraItemsCount > 0 && ` +${extraItemsCount} more`}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 1 }}>
                            {record.item_count || 0} {(record.item_count || 0) === 1 ? 'item' : 'items'}
                          </div>
                        </div>
                      </td>

                      {/* Stage */}
                      <td>
                        <span style={{
                          display: 'inline-block',
                          padding: '4px 10px', borderRadius: 8,
                          background: stageStyle.bg, color: stageStyle.color,
                          border: `1px solid ${stageStyle.border}`,
                          fontSize: '0.75rem', fontWeight: 800, textTransform: 'capitalize'
                        }}>
                          {stageStyle.label}
                        </span>
                        {record.order_id && (
                          <div style={{ fontSize: '0.72rem', color: '#16a34a', fontWeight: 700, marginTop: 2 }}>
                            Order: #{record.order_id}
                          </div>
                        )}
                      </td>

                      {/* Last Active */}
                      <td>
                        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155' }}>
                          {timeAgo(record.last_active_at)}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 1 }}>
                          {record.last_active_at ? new Date(record.last_active_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                        </div>
                      </td>

                      {/* Recovery Status */}
                      <td>
                        <button
                          onClick={(e) => handleToggleRecovered(record, e)}
                          disabled={togglingId === record.session_id}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            padding: '4px 10px', borderRadius: 20,
                            background: record.recovered ? '#dcfce7' : '#f1f5f9',
                            color: record.recovered ? '#15803d' : '#64748b',
                            border: `1px solid ${record.recovered ? '#86efac' : '#cbd5e1'}`,
                            fontSize: '0.74rem', fontWeight: 800, cursor: 'pointer',
                            transition: 'all 0.15s'
                          }}
                        >
                          {record.recovered ? <Check size={13} /> : null}
                          {record.recovered ? 'Recovered' : 'Mark Recovered'}
                        </button>
                      </td>

                      {/* Actions */}
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }} onClick={(e) => e.stopPropagation()}>
                          {/* WhatsApp Outreach */}
                          {record.customer_phone ? (
                            <button
                              onClick={(e) => openWhatsAppOutreach(record, e)}
                              title="Chat on WhatsApp"
                              style={{
                                padding: '7px 11px', borderRadius: 8,
                                background: '#25D366', color: '#fff', border: 'none',
                                fontWeight: 800, fontSize: '0.78rem', cursor: 'pointer',
                                display: 'inline-flex', alignItems: 'center', gap: 5
                              }}
                            >
                              <MessageCircle size={14} />
                              WhatsApp
                            </button>
                          ) : null}

                          {/* Direct Call */}
                          {record.customer_phone ? (
                            <a
                              href={`tel:${record.customer_phone}`}
                              title="Call Customer"
                              style={{
                                padding: '7px 9px', borderRadius: 8,
                                background: '#f8fafc', color: '#334155', border: '1px solid #e2e8f0',
                                fontWeight: 700, fontSize: '0.78rem', textDecoration: 'none',
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
                              }}
                            >
                              <Phone size={14} />
                            </a>
                          ) : null}

                          {/* View details */}
                          <button
                            onClick={() => setSelectedSession(record)}
                            title="View Full Session Details"
                            style={{
                              padding: '7px 9px', borderRadius: 8,
                              background: '#f8fafc', color: '#334155', border: '1px solid #e2e8f0',
                              fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer',
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
                            }}
                          >
                            <Eye size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderTop: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Showing {((page - 1) * PER_PAGE) + 1}–{Math.min(page * PER_PAGE, totalCount)} of {totalCount} carts
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                style={{
                  padding: '6px 12px', borderRadius: 8,
                  border: '1px solid var(--border-subtle)', background: 'var(--white)',
                  cursor: page <= 1 ? 'not-allowed' : 'pointer', opacity: page <= 1 ? 0.4 : 1,
                  display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem', fontWeight: 700
                }}
              >
                <ChevronLeft size={14} /> Prev
              </button>
              <span style={{ fontSize: '0.82rem', fontWeight: 800, padding: '0 8px' }}>
                {page} / {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                style={{
                  padding: '6px 12px', borderRadius: 8,
                  border: '1px solid var(--border-subtle)', background: 'var(--white)',
                  cursor: page >= totalPages ? 'not-allowed' : 'pointer', opacity: page >= totalPages ? 0.4 : 1,
                  display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem', fontWeight: 700
                }}
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Session Details Modal */}
      {selectedSession && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
          }}
          onClick={() => setSelectedSession(null)}
        >
          <div
            style={{
              background: '#fff', borderRadius: 20, width: '100%', maxWidth: 580,
              maxHeight: '90vh', overflowY: 'auto', padding: 24, boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
              position: 'relative'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: 16, marginBottom: 20 }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: '1.15rem', color: '#0f172a' }}>
                  Abandoned Cart Details
                </div>
                <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2, fontFamily: 'monospace' }}>
                  Session: {selectedSession.session_id}
                </div>
              </div>
              <button
                onClick={() => setSelectedSession(null)}
                style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Customer Profile Card */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 14, padding: '16px', marginBottom: 20 }}>
              <div style={{ fontSize: '0.74rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                Prospective Customer
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '1rem', color: '#0f172a' }}>
                    {selectedSession.customer_name || 'Guest Shopper'}
                  </div>
                  <div style={{ fontSize: '0.84rem', color: '#475569', marginTop: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {selectedSession.customer_phone && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Phone size={13} color="#c0201f" /> {selectedSession.customer_phone}
                      </span>
                    )}
                    {selectedSession.customer_email && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Mail size={13} color="#c0201f" /> {selectedSession.customer_email}
                      </span>
                    )}
                    {selectedSession.delivery_address && (
                      <span style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                        <MapPin size={13} color="#c0201f" style={{ marginTop: 2, flexShrink: 0 }} />
                        {selectedSession.delivery_address} {selectedSession.delivery_zone ? `(${selectedSession.delivery_zone})` : ''}
                      </span>
                    )}
                  </div>
                </div>

                {/* Quick WhatsApp Link in modal */}
                {selectedSession.customer_phone && (
                  <button
                    onClick={(e) => openWhatsAppOutreach(selectedSession, e)}
                    style={{
                      padding: '8px 14px', borderRadius: 10,
                      background: '#25D366', color: '#fff', border: 'none',
                      fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 6
                    }}
                  >
                    <MessageCircle size={15} /> WhatsApp Recovery
                  </button>
                )}
              </div>
            </div>

            {/* Items Breakdown */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: '0.74rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                Cart Items ({selectedSession.item_count || 0})
              </div>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
                {(selectedSession.items || []).map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '12px 14px', borderBottom: idx < (selectedSession.items.length - 1) ? '1px solid #f1f5f9' : 'none',
                      background: idx % 2 === 0 ? '#fff' : '#fafafa'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#1e293b' }}>
                        {item.name}
                      </div>
                      <div style={{ fontSize: '0.76rem', color: '#64748b' }}>
                        Qty: {item.qty} × {fmt(item.price)}
                      </div>
                    </div>
                    <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#0f172a' }}>
                      {fmt((item.price || 0) * (item.qty || 1))}
                    </div>
                  </div>
                ))}
                <div style={{ padding: '12px 14px', background: '#f8fafc', borderTop: '1.5px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 800, fontSize: '0.9rem', color: '#0f172a' }}>Total Cart Value</span>
                  <span style={{ fontWeight: 900, fontSize: '1.1rem', color: 'var(--red)' }}>{fmt(selectedSession.cart_total)}</span>
                </div>
              </div>
            </div>

            {/* Session Metadata & Device */}
            <div style={{ background: '#f8fafc', borderRadius: 12, padding: '14px 16px', fontSize: '0.78rem', color: '#64748b', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
              <div>
                <span style={{ fontWeight: 700, color: '#334155' }}>Stage: </span>
                <span style={{ textTransform: 'capitalize' }}>{selectedSession.stage?.replace('_', ' ')}</span>
              </div>
              <div>
                <span style={{ fontWeight: 700, color: '#334155' }}>Recovery: </span>
                <span>{selectedSession.recovered ? 'Recovered ✅' : 'Not Recovered'}</span>
              </div>
              <div>
                <span style={{ fontWeight: 700, color: '#334155' }}>First Seen: </span>
                <span>{selectedSession.created_at ? new Date(selectedSession.created_at).toLocaleString() : '—'}</span>
              </div>
              <div>
                <span style={{ fontWeight: 700, color: '#334155' }}>Last Active: </span>
                <span>{selectedSession.last_active_at ? new Date(selectedSession.last_active_at).toLocaleString() : '—'}</span>
              </div>
              {selectedSession.metadata?.browser && (
                <div>
                  <span style={{ fontWeight: 700, color: '#334155' }}>Browser: </span>
                  <span>{selectedSession.metadata.browser}</span>
                </div>
              )}
              {selectedSession.metadata?.referrer && (
                <div style={{ gridColumn: 'span 2', wordBreak: 'break-all' }}>
                  <span style={{ fontWeight: 700, color: '#334155' }}>Referrer: </span>
                  <span>{selectedSession.metadata.referrer}</span>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                onClick={(e) => handleToggleRecovered(selectedSession, e)}
                style={{
                  padding: '9px 16px', borderRadius: 10,
                  border: '1px solid var(--border-subtle)', background: selectedSession.recovered ? '#f1f5f9' : '#dcfce7',
                  color: selectedSession.recovered ? '#64748b' : '#15803d',
                  fontWeight: 800, fontSize: '0.84rem', cursor: 'pointer'
                }}
              >
                {selectedSession.recovered ? 'Mark as Unrecovered' : 'Mark as Recovered'}
              </button>
              <button
                onClick={() => setSelectedSession(null)}
                style={{
                  padding: '9px 16px', borderRadius: 10,
                  border: 'none', background: '#0f172a', color: '#fff',
                  fontWeight: 800, fontSize: '0.84rem', cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AbandonedCarts() {
  return (
    <ErrorBoundary>
      <AbandonedCartsContent />
    </ErrorBoundary>
  );
}
