import { useState, useEffect, useMemo } from 'react';
import { Users, DollarSign, Package, Trash2, Download, Mail, Send, Loader2, UserPlus, Repeat2, ChevronUp, ChevronDown, Search, Sparkles } from 'lucide-react';
import * as XLSX from 'xlsx';
import { SkelDashHeader, SkelKpiGrid, SkelTable } from '../../components/Skeleton';
import Pagination from '../../components/Pagination';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import CustomSelect from '../../components/CustomSelect';
import DashCalendar from '../../components/DashCalendar';
import { useToast } from '../../context/ToastContext';
import ConfirmModal from '../../components/ConfirmModal';

const fmt = (n) => '₦' + n.toLocaleString();

const DEFAULT_CAMPAIGN_BODY = `Hi {customer_name},

We have an exciting offer just for you! This weekend only, enjoy 20% off all orders.

Use code SAVE20 at checkout.

Shop now at smokeyhutdelight.com

— The Smokeyhut Delight Team`;

const AUDIENCE_OPTIONS = [
  { value: 'all',                  label: 'All customers with email' },
  { value: 'vip_customers',        label: 'VIP Customers (₦200,000+ spent)' },
  { value: 'high_aov',             label: 'Big Basket Buyers (AOV ₦15,000+)' },
  { value: 'loyal_buyers',         label: 'Loyal Repeat Buyers (3+ orders)' },
  { value: 'top_20_monthly',       label: 'Top 20 Customers' },
  { value: 'weekend_lovers',       label: 'Weekend Grill Lovers (Friday–Sunday)' },
  { value: 'slipped_90',           label: 'Win-Back: Slipped Customers (No orders in 90+ days)' },
  { value: 'inactive_30',          label: 'Customers with no purchase in the last 30 days' },
  { value: 'inactive_60',          label: 'Customers with no purchase in the last 60 days' },
  { value: 'top_10_percent',       label: 'Top 10% of customers by amount spent' },
  { value: 'one_order',            label: 'First-time Buyers (1 order)' },
  { value: 'abandoned_orders',     label: 'Customers with abandoned/cancelled orders' },
];

const SORT_KEY_OPTIONS = [
  { value: 'name', label: 'Sort: Name' },
  { value: 'orders', label: 'Sort: Orders' },
  { value: 'totalSpent', label: 'Sort: Total Spent' },
  { value: 'lastOrder', label: 'Sort: Last Order' },
];

const SORT_DIR_OPTIONS = [
  { value: 'asc', label: 'Order: Ascending' },
  { value: 'desc', label: 'Order: Descending' },
];

const SVG_ARROW = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`;

export default function Customers() {
  const { userRole, userPermissions } = useAuth();
  const isAdmin = userRole === 'Admin';
  const canManage = isAdmin || userRole === 'Manager' || (userPermissions || []).includes('Customers:manage');
  const canDelete = isAdmin || userRole === 'Manager' || (userPermissions || []).includes('Customers:delete');

  const [tab, setTab] = useState('directory');
  const [allCustomers, setAllCustomers] = useState([]);
  const [rawOrders, setRawOrders] = useState([]);
  const [overviewDateFilter, setOverviewDateFilter] = useState(''); // YYYY-MM-DD
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const PER_PAGE = 20;
  const [sortKey, setSortKey] = useState('lastOrder');
  const [sortDir, setSortDir] = useState('desc');

  // Campaign state
  const [campaigns, setCampaigns] = useState([]);
  const [campsLoading, setCampsLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [form, setForm] = useState({ name: '', subject: '', body: DEFAULT_CAMPAIGN_BODY, audience: 'all', dateFilter: { start: null, end: null } });
  const [sendResult, setSendResult] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const [excludedEmails, setExcludedEmails] = useState(new Set());
  const [recipientSearch, setRecipientSearch] = useState('');
  // Campaign detail / logs
  const [detailCampaign, setDetailCampaign] = useState(null);
  const [campaignLogs, setCampaignLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    // Only run if range selection is complete or cleared
    const isFilterIncomplete = form.dateFilter && form.dateFilter.start && !form.dateFilter.end;
    if (isFilterIncomplete) return;

    setExcludedEmails(new Set());
    setRecipientSearch('');
  }, [form.audience, form.dateFilter]);

  useEffect(() => { fetchData(); }, []);
  useEffect(() => { if (tab === 'campaigns') fetchCampaigns(); }, [tab]);
  useEffect(() => { setPage(1); }, [search]);

  const fetchData = async () => {
    setLoading(true);
    
    let allOrders = [];
    let pageNum = 0;
    const PAGE_SIZE = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('orders')
        .select('customer_name, customer_email, customer_phone, total, created_at, status')
        .order('created_at', { ascending: false })
        .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1);

      if (error) {
        console.error('Error fetching orders chunk:', error);
        hasMore = false;
      } else if (!data || data.length === 0) {
        hasMore = false;
      } else {
        allOrders = [...allOrders, ...data];
        if (data.length < PAGE_SIZE) {
          hasMore = false;
        } else {
          pageNum++;
        }
      }
    }

    if (allOrders.length > 0) {
      setRawOrders(allOrders);
      const map = {};
      allOrders.forEach(o => {
        const key = o.customer_phone || o.customer_email || o.customer_name;
        if (!key) return;
        if (!map[key]) {
          map[key] = { id: key, name: o.customer_name, email: o.customer_email, phone: o.customer_phone, orders: 0, totalSpent: 0, lastOrder: null, hasPendingOrder: false, hasCancelledOrder: false, weekendOrders: 0, monthlySpent: 0 };
        }
        if (o.status !== 'cancelled') {
          map[key].totalSpent += Number(o.total || 0);
          
          // Track current calendar month spent for Top 20 customers of the month
          const orderDate = new Date(o.created_at);
          const now = new Date();
          if (orderDate.getMonth() === now.getMonth() && orderDate.getFullYear() === now.getFullYear()) {
            map[key].monthlySpent += Number(o.total || 0);
          }
        } else {
          map[key].hasCancelledOrder = true;
        }
        if (o.status === 'pending') {
          map[key].hasPendingOrder = true;
        }
        map[key].orders += 1;
        
        // Track weekend orders (Friday, Saturday, Sunday)
        const date = new Date(o.created_at);
        const day = date.getDay(); // 0 = Sunday, 5 = Friday, 6 = Saturday
        if (day === 0 || day === 5 || day === 6) {
          map[key].weekendOrders += 1;
        }

        const d = new Date(o.created_at).getTime();
        if (!map[key].lastOrder || d > new Date(map[key].lastOrder).getTime()) map[key].lastOrder = o.created_at;
      });
      setAllCustomers(Object.values(map));
    }
    setLoading(false);
  };

  const { customers, kpis } = useMemo(() => {
    if (!overviewDateFilter) {
      // All-time mode
      const totalSpend = allCustomers.reduce((s, c) => s + c.totalSpent, 0);
      const totalOrdersCount = allCustomers.reduce((s, c) => s + c.orders, 0);
      const newCust = allCustomers.filter(c => c.orders === 1).length;
      const retCust = allCustomers.filter(c => c.orders >= 2).length;
      
      return {
        customers: allCustomers,
        kpis: {
          totalCustomers: allCustomers.length,
          totalSpent: totalSpend,
          totalOrders: totalOrdersCount,
          newCustomers: newCust,
          returningCustomers: retCust
        }
      };
    }

    // Date filtered mode
    const dayOrders = rawOrders.filter(o => o.created_at && new Date(o.created_at).toLocaleDateString('en-CA') === overviewDateFilter);
    const activeCustomerKeys = new Set(dayOrders.map(o => o.customer_phone || o.customer_email || o.customer_name).filter(Boolean));
    
    // Total Spent on that day (excluding cancelled)
    const daySpend = dayOrders.filter(o => o.status !== 'cancelled').reduce((sum, o) => sum + Number(o.total || 0), 0);
    
    // Find the very first order date for every customer in all rawOrders
    const customerFirstOrderDates = {};
    rawOrders.forEach(o => {
      const key = o.customer_phone || o.customer_email || o.customer_name;
      if (!key) return;
      const time = new Date(o.created_at).getTime();
      if (!customerFirstOrderDates[key] || time < customerFirstOrderDates[key].time) {
        customerFirstOrderDates[key] = { time, dateStr: new Date(o.created_at).toLocaleDateString('en-CA') };
      }
    });

    const newCust = Array.from(activeCustomerKeys).filter(key => customerFirstOrderDates[key]?.dateStr === overviewDateFilter).length;
    const retCust = activeCustomerKeys.size - newCust;

    // The customers list for the directory table should be the full profiles of customers active on this day
    const dayCustomersList = allCustomers.filter(c => activeCustomerKeys.has(c.id));

    return {
      customers: dayCustomersList,
      kpis: {
        totalCustomers: activeCustomerKeys.size,
        totalSpent: daySpend,
        totalOrders: dayOrders.length,
        newCustomers: newCust,
        returningCustomers: retCust
      }
    };
  }, [allCustomers, rawOrders, overviewDateFilter]);

  const fetchCampaigns = async () => {
    setCampsLoading(true);
    const { data } = await supabase.from('email_campaigns').select('*').order('created_at', { ascending: false });
    if (data) setCampaigns(data);
    setCampsLoading(false);
  };

  const filtered = customers.filter(c =>
    String(c.name || '').toLowerCase().includes(search.toLowerCase()) ||
    String(c.email || '').toLowerCase().includes(search.toLowerCase()) ||
    String(c.phone || '').toLowerCase().includes(search.toLowerCase())
  );

  const sortedCustomers = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      let av, bv;
      if (sortKey === 'totalSpent') {
        av = Number(a.totalSpent || 0);
        bv = Number(b.totalSpent || 0);
      } else if (sortKey === 'orders') {
        av = Number(a.orders || 0);
        bv = Number(b.orders || 0);
      } else if (sortKey === 'lastOrder') {
        av = a.lastOrder ? new Date(a.lastOrder).getTime() : 0;
        bv = b.lastOrder ? new Date(b.lastOrder).getTime() : 0;
      } else {
        av = String(a[sortKey] || '').toLowerCase();
        bv = String(b[sortKey] || '').toLowerCase();
      }
      
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [filtered, sortKey, sortDir]);

  const pagedCustomers = sortedCustomers.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const getAudience = (filter, dateFilter) => {
    let list = allCustomers.filter(c => c.email && c.email.trim() !== '');
    
    // Deduplicate by email address automatically so each unique email only receives one campaign email
    const seenEmails = new Set();
    list = list.filter(c => {
      const emailLower = c.email.trim().toLowerCase();
      if (seenEmails.has(emailLower)) return false;
      seenEmails.add(emailLower);
      return true;
    });
    
    // Apply Date range Filter (except for slipped_90, inactive_30, inactive_60, top_20_monthly which represent special logic)
    const isSpecialSegment = ['slipped_90', 'inactive_30', 'inactive_60', 'top_20_monthly'].includes(filter);
    if (!isSpecialSegment && dateFilter) {
      const { start, end } = dateFilter;
      if (start) {
        list = list.filter(c => c.lastOrder && new Date(c.lastOrder).toLocaleDateString('en-CA') >= start);
      }
      if (end) {
        list = list.filter(c => c.lastOrder && new Date(c.lastOrder).toLocaleDateString('en-CA') <= end);
      }
    }
    
    if (filter === 'vip_customers') {
      list = list.filter(c => c.totalSpent >= 200000);
    }
    else if (filter === 'high_aov') {
      list = list.filter(c => c.orders > 0 && (c.totalSpent / c.orders) >= 15000);
    }
    else if (filter === 'loyal_buyers') {
      list = list.filter(c => c.orders >= 3);
    }
    else if (filter === 'top_20_monthly') {
      const spentMap = {};
      const { start, end } = dateFilter || {};
      
      rawOrders.forEach(o => {
        if (o.status === 'cancelled') return;
        const key = o.customer_phone || o.customer_email || o.customer_name;
        if (!key) return;
        
        const orderDateStr = new Date(o.created_at).toLocaleDateString('en-CA');
        if (start && orderDateStr < start) return;
        if (end && orderDateStr > end) return;
        
        spentMap[key] = (spentMap[key] || 0) + Number(o.total || 0);
      });
      
      // Filter list to only customers who spent something in the selected range, then sort by spent
      let segmentList = list.filter(c => (spentMap[c.id] || 0) > 0);
      segmentList = segmentList.map(c => ({
        ...c,
        rangeSpent: spentMap[c.id]
      }));
      segmentList.sort((a, b) => b.rangeSpent - a.rangeSpent);
      
      list = segmentList.slice(0, 20);
    }
    else if (filter === 'weekend_lovers') {
      list = list.filter(c => c.weekendOrders && (c.weekendOrders / c.orders) >= 0.5);
    }
    else if (filter === 'slipped_90') {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 90);
      list = list.filter(c => c.lastOrder && new Date(c.lastOrder) < cutoff);
    }
    else if (filter === 'inactive_30') {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);
      list = list.filter(c => c.lastOrder && new Date(c.lastOrder) < cutoff);
    }
    else if (filter === 'inactive_60') {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 60);
      list = list.filter(c => c.lastOrder && new Date(c.lastOrder) < cutoff);
    }
    else if (filter === 'top_10_percent') {
      const sorted = [...list].sort((a, b) => b.totalSpent - a.totalSpent);
      const limit = Math.ceil(sorted.length * 0.1);
      const topIds = new Set(sorted.slice(0, limit).map(c => c.id));
      list = list.filter(c => topIds.has(c.id));
    }
    else if (filter === 'one_order') {
      list = list.filter(c => c.orders === 1);
    }
    else if (filter === 'abandoned_orders') {
      list = list.filter(c => c.hasCancelledOrder);
    }
    
    return list;
  };

  const fullAudienceList = getAudience(form.audience, form.dateFilter);
  const audienceList = fullAudienceList.filter(c => !excludedEmails.has(c.email.trim().toLowerCase()));
  const noEmailCount = customers.filter(c => !c.email).length;

  // ── Export ──────────────────────────────────────────────────────────────
  const exportCSV = () => {
    const rows = [
      ['Name', 'Email', 'Phone', 'Orders', 'Total Spent (₦)', 'Last Order'],
      ...customers.map(c => [
        c.name, c.email, c.phone,
        c.orders, c.totalSpent,
        c.lastOrder ? new Date(c.lastOrder).toLocaleDateString() : '',
      ]),
    ];
    const csv = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `smokeyhut-customers-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Name', 'Email', 'Phone', 'Orders', 'Total Spent (₦)', 'Last Order'],
      ...customers.map(c => [
        c.name, c.email, c.phone,
        c.orders, c.totalSpent,
        c.lastOrder ? new Date(c.lastOrder).toLocaleDateString() : '',
      ]),
    ]), 'Customers');
    XLSX.writeFile(wb, `smokeyhut-customers-${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleDelete = (phone) => {
    setConfirmAction({
      title: 'Remove Customer',
      message: 'Remove this customer from the directory? Their orders will remain.',
      onConfirm: async () => {
        setConfirmAction(prev => ({ ...prev, isLoading: true }));
        await supabase.from('orders').update({ customer_name: 'Deleted Customer', customer_email: null }).eq('customer_phone', phone);
        setAllCustomers(prev => prev.filter(c => c.id !== phone));
        showToast('Customer removed', '', 'success');
        setConfirmAction(null);
      }
    });
  };

  // ── View campaign detail logs ─────────────────────────────────────────────
  const viewCampaignDetail = async (campaign) => {
    setDetailCampaign(campaign);
    setCampaignLogs([]);
    setLogsLoading(true);
    const { data } = await supabase
      .from('campaign_logs')
      .select('*')
      .eq('campaign_id', campaign.id)
      .order('created_at', { ascending: true });
    setCampaignLogs(data || []);
    setLogsLoading(false);
  };

  // ── Send campaign ────────────────────────────────────────────────────────
  const sendCampaign = () => {
    if (!form.name.trim() || !form.subject.trim() || !form.body.trim()) {
      return showToast('Error', 'Please fill in campaign name, subject, and message body.', 'error');
    }
    if (audienceList.length === 0) {
      return showToast('Error', 'No recipients with email addresses match the selected audience filter.', 'error');
    }

    setConfirmAction({
      title: 'Send Campaign',
      message: `Send "${form.subject}" to ${audienceList.length} recipient${audienceList.length !== 1 ? 's' : ''}?`,
      isDestructive: false,
      confirmText: 'Send Now',
      onConfirm: async () => {
        setConfirmAction(prev => ({ ...prev, isLoading: true }));
        setSending(true);
        setSendResult(null);
        let campaignId = null;

        try {
          const recipients = audienceList.map(c => ({ email: c.email, name: c.name || '' }));

          // 1. Insert campaign record first to get the ID for per-email logging
          const { data: campaignRow, error: insertErr } = await supabase
            .from('email_campaigns')
            .insert({
              name: form.name,
              subject: form.subject,
              body: form.body,
              audience: form.audience,
              recipient_count: recipients.length,
              sent_count: 0,
              status: 'sending',
            })
            .select('id')
            .single();
          if (insertErr) throw new Error(insertErr.message);
          campaignId = campaignRow.id;

          // 2. Invoke edge function — passes campaign_id so it can log each email
          const { data: result, error } = await supabase.functions.invoke('send-campaign', {
            body: { subject: form.subject, body: form.body, recipients, campaign_id: campaignId },
          });
          if (error) throw new Error(error.message || 'Send failed');

          // 3. Update campaign with final counts and status
          await supabase.from('email_campaigns').update({
            sent_count: result?.sent ?? recipients.length,
            status: result?.failed > 0 ? 'partial' : 'sent',
          }).eq('id', campaignId);

          setSendResult({ sent: result?.sent ?? recipients.length, failed: result?.failed ?? 0 });
          setForm({ name: '', subject: '', body: DEFAULT_CAMPAIGN_BODY, audience: 'all', dateFilter: { start: null, end: null } });
          showToast('Success', `Campaign sent`, 'success');
          fetchCampaigns();
        } catch (err) {
          // Mark campaign as failed if we already created the record
          if (campaignId) {
            await supabase.from('email_campaigns').update({ status: 'failed' }).eq('id', campaignId);
          }
          showToast('Error sending campaign', err.message, 'error');
        } finally {
          setSending(false);
          setConfirmAction(null);
        }
      }
    });
  };

  const sendTestCampaign = async () => {
    if (!form.subject.trim() || !form.body.trim()) {
      return showToast('Error', 'Please fill in subject and message body.', 'error');
    }
    const testEmail = window.prompt("Enter test email address to send a preview to:");
    if (!testEmail) return;
    if (!testEmail.includes('@')) {
      return showToast('Error', 'Please enter a valid email address.', 'error');
    }

    setSendingTest(true);
    try {
      const recipients = [{ email: testEmail, name: 'Test Customer' }];
      const { data: result, error } = await supabase.functions.invoke('send-campaign', {
        body: { subject: `[TEST] ${form.subject}`, body: form.body, recipients },
      });

      if (error) throw new Error(error.message || 'Send failed');

      showToast('Success', `Test email sent to ${testEmail}`, 'success');
    } catch (err) {
      showToast('Error sending test', err.message, 'error');
    } finally {
      setSendingTest(false);
    }
  };

  if (loading) return (
    <div>
      <SkelDashHeader hasButton />
      <SkelKpiGrid count={3} />
      <SkelTable rows={8} cols={5} />
    </div>
  );

  // ── Styles ───────────────────────────────────────────────────────────────
  const tabBtn = (active) => ({
    display: 'flex', alignItems: 'center', gap: 7,
    padding: '9px 20px', borderRadius: 8, border: '1px solid var(--border-subtle)',
    background: active ? 'var(--red)' : 'var(--white)',
    color: active ? '#fff' : 'var(--text)',
    fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer',
    fontFamily: "'DM Sans',sans-serif",
  });

  const dlBtn = (bg) => ({
    display: 'flex', alignItems: 'center', gap: 7,
    padding: '0 16px', borderRadius: 8, border: '1px solid var(--border-subtle)',
    background: bg, color: '#fff', fontWeight: 700, fontSize: '0.82rem',
    cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
    height: '38px', boxSizing: 'border-box',
  });

  const selectStyle = {
    appearance: 'none', WebkitAppearance: 'none',
    paddingRight: 36, backgroundImage: SVG_ARROW,
    backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center',
  };

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

  const thStyle = (col) => ({ cursor: 'pointer', userSelect: 'none', background: sortKey === col ? 'rgba(0,0,0,0.05)' : undefined });

  return (
    <div>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontFamily: "'Mona Sans','Mona-Sans','Helvetica Neue',sans-serif", fontSize: '1.4rem', fontWeight: 900, marginBottom: 4 }}>Customers</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{customers.length} unique customers from order history.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => setTab('directory')} style={tabBtn(tab === 'directory')}>Directory</button>
          {canManage && (
            <button onClick={() => setTab('campaigns')} style={tabBtn(tab === 'campaigns')}>
              <Mail size={14} /> Email Campaigns
            </button>
          )}
        </div>
      </div>

      {/* ── DIRECTORY TAB ── */}
      {tab === 'directory' && (
        <>
          <div className="kpi-grid" style={{ marginBottom: 24 }}>
            <div className="kpi-card blue">
              <div className="kpi-icon"><Users size={24} /></div>
              <div className="kpi-value">{kpis.totalCustomers}</div>
              <div className="kpi-label">Total Customers</div>
            </div>
            <div className="kpi-card green">
              <div className="kpi-icon"><DollarSign size={24} /></div>
              <div className="kpi-value">{fmt(kpis.totalSpent)}</div>
              <div className="kpi-label">Total Spend</div>
            </div>
            <div className="kpi-card yellow">
              <div className="kpi-icon"><Package size={24} /></div>
              <div className="kpi-value">{kpis.totalOrders}</div>
              <div className="kpi-label">Total Orders</div>
            </div>
            <div className="kpi-card blue">
              <div className="kpi-icon"><UserPlus size={24} /></div>
              <div className="kpi-value">{kpis.newCustomers}</div>
              <div className="kpi-label">New Customers</div>
            </div>
            <div className="kpi-card green">
              <div className="kpi-icon"><Repeat2 size={24} /></div>
              <div className="kpi-value">{kpis.returningCustomers}</div>
              <div className="kpi-label">Returning Customers</div>
            </div>
          </div>

          <div style={{
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
            flexWrap: 'wrap',
            gap: 12,
            width: '100%'
          }}>
            {/* Search and Date Filter */}
            <div style={{
              display: 'flex',
              gap: 10,
              alignItems: 'center',
              flexWrap: 'wrap',
              flex: '1 1 auto',
              minWidth: '280px'
            }}>
              <div style={{ position: 'relative', width: 220, height: '38px' }}>
                <Search
                  size={16}
                  color="var(--text-muted)"
                  style={{
                    position: 'absolute',
                    left: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    pointerEvents: 'none'
                  }}
                />
                <input
                  className="dash-search"
                  placeholder="Search customers..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={{
                    margin: 0,
                    width: '100%',
                    height: '100%',
                    boxSizing: 'border-box',
                    paddingLeft: 38,
                    textAlign: 'left'
                  }}
                />
              </div>
              <DashCalendar
                value={overviewDateFilter}
                onChange={v => {
                  setOverviewDateFilter(v);
                  setPage(1);
                }}
                style={{ height: '38px', boxSizing: 'border-box' }}
              />
            </div>
            
            {/* Sorting controls & Actions */}
            <div style={{
              display: 'flex',
              gap: 10,
              alignItems: 'center',
              flexWrap: 'wrap',
              justifyContent: 'flex-end',
              flex: '1 1 auto',
              minWidth: '280px'
            }}>
              <CustomSelect
                value={sortKey}
                onChange={e => {
                  setSortKey(e.target.value);
                  setPage(1);
                }}
                options={SORT_KEY_OPTIONS}
                style={{ width: 180, height: '38px', boxSizing: 'border-box' }}
              />
              <CustomSelect
                value={sortDir}
                onChange={e => {
                  setSortDir(e.target.value);
                  setPage(1);
                }}
                options={SORT_DIR_OPTIONS}
                style={{ width: 180, height: '38px', boxSizing: 'border-box' }}
              />
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button onClick={exportCSV} style={dlBtn('#0284c7')}><Download size={14} /> CSV</button>
                <button onClick={exportExcel} style={dlBtn('#16a34a')}><Download size={14} /> Excel</button>
              </div>
            </div>
          </div>

          <div className="dash-card" style={{ padding: '16px 12px', overflow: 'hidden' }}>
            <div className="dash-table-wrapper" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <table className="dash-table" style={{ width: '100%', minWidth: '750px', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th onClick={() => handleSort('name')} style={thStyle('name')}>Name <SortIcon col="name" /></th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th onClick={() => handleSort('orders')} style={thStyle('orders')}>Orders <SortIcon col="orders" /></th>
                    <th onClick={() => handleSort('totalSpent')} style={thStyle('totalSpent')}>Total Spent <SortIcon col="totalSpent" /></th>
                    <th onClick={() => handleSort('lastOrder')} style={thStyle('lastOrder')}>Last Order <SortIcon col="lastOrder" /></th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedCustomers.map(c => (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 700 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span>{c.name}</span>
                          <span style={{
                            fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.03em',
                            padding: '2px 8px', borderRadius: 20, flexShrink: 0,
                            ...(c.orders === 1
                              ? { background: '#dbeafe', color: '#1d4ed8' }
                              : { background: '#dcfce7', color: '#15803d' })
                          }}>
                            {c.orders === 1 ? 'New' : 'Returning'}
                          </span>
                        </div>
                      </td>
                      <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.email}>
                        {c.email || <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>{c.phone || '—'}</td>
                      <td style={{ fontWeight: 600 }}>{c.orders}</td>
                      <td style={{ fontWeight: 700, color: 'var(--green)', whiteSpace: 'nowrap' }}>{fmt(c.totalSpent)}</td>
                      <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {c.lastOrder ? new Date(c.lastOrder).toLocaleDateString() : 'Never'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {canDelete && (
                          <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: '4px 8px' }} onClick={() => handleDelete(c.phone)}>
                            <Trash2 size={16} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan="7" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>No customers found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <Pagination page={page} total={filtered.length} perPage={PER_PAGE} onChange={setPage} />
          </div>
        </>
      )}

      {/* ── EMAIL CAMPAIGNS TAB ── */}
      {tab === 'campaigns' && (
        <>
          {/* Success banner */}
          {sendResult && (
            <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: 10, padding: '12px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
              <Send size={16} color="#16a34a" />
              <span style={{ fontWeight: 700, color: '#166534' }}>
                Campaign sent — {sendResult.sent} delivered{sendResult.failed > 0 ? `, ${sendResult.failed} failed` : ''}.
              </span>
              <button onClick={() => setSendResult(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#166534', fontSize: '1.1rem' }}>×</button>
            </div>
          )}

          {/* Responsive grid for Form + Live Preview */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: 24,
            marginBottom: 24,
            alignItems: 'start'
          }}>
            {/* LEFT COLUMN: COMPOSE FORM */}
            <div className="dash-card" style={{ margin: 0 }}>
              <div className="dash-card-header" style={{ marginBottom: 20 }}>
                <div className="dash-card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Sparkles size={18} color="var(--red)" />
                  Compose Campaign
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: 16 }}>
                <label>Campaign Name</label>
                <input
                  placeholder="e.g. Easter Weekend Promo"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  style={{ width: '100%', boxSizing: 'border-box' }}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 16 }}>
                <label>Target Audience</label>
                <CustomSelect
                  value={form.audience}
                  onChange={e => setForm(f => ({ ...f, audience: e.target.value }))}
                  options={AUDIENCE_OPTIONS}
                  style={{ width: '100%' }}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 16 }}>
                <label>Last Order Date Range (Optional)</label>
                <DashCalendar
                  range={true}
                  value={form.dateFilter}
                  onChange={v => setForm(f => ({ ...f, dateFilter: v }))}
                  placeholder="Filter by customer last order date range"
                  wrapperStyle={{ width: '100%' }}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 16 }}>
                <label>Subject Line</label>
                <input
                  placeholder="e.g. 🔥 20% Off All Orders This Weekend Only!"
                  value={form.subject}
                  onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 20 }}>
                <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span>Message Body</span>
                  <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'none', letterSpacing: '0' }}>
                    Use <code>{'{customer_name}'}</code> to personalize
                  </span>
                </label>
                <textarea
                  rows={12}
                  placeholder={`Hi {customer_name},\n\nWe have an exciting offer just for you! This weekend only, enjoy 20% off all orders.\n\nUse code SAVE20 at checkout.\n\nShop now at smokeyhutdelight.com\n\n— The Smokeyhut Delight Team`}
                  value={form.body}
                  onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                  style={{ resize: 'vertical', minHeight: '320px' }}
                />
              </div>

              {/* Audience preview + send button */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', background: 'var(--black2)', borderRadius: 10, flexWrap: 'wrap', gap: 12, border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Recipients: </span>
                  <span style={{ fontWeight: 800, color: audienceList.length > 0 ? '#16a34a' : '#dc2626' }}>{audienceList.length}</span>
                  <span style={{ color: 'var(--text-muted)', marginLeft: 12 }}>·</span>
                  <span style={{ color: 'var(--text-muted)', marginLeft: 12 }}>{noEmailCount} have no email</span>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    onClick={sendTestCampaign}
                    disabled={sending || sendingTest}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '10px 20px', borderRadius: 8, border: '1px solid var(--border-subtle)',
                      background: 'var(--white)',
                      color: 'var(--text)', fontWeight: 700, fontSize: '0.88rem',
                      cursor: sending || sendingTest ? 'not-allowed' : 'pointer',
                      fontFamily: "'DM Sans',sans-serif",
                    }}
                  >
                    {sendingTest
                      ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Test...</>
                      : <>Send Test</>
                    }
                  </button>
                  <button
                    onClick={sendCampaign}
                    disabled={sending || sendingTest || audienceList.length === 0}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '10px 24px', borderRadius: 8, border: 'none',
                      background: sending || sendingTest || audienceList.length === 0 ? '#9ca3af' : 'var(--red)',
                      color: '#fff', fontWeight: 700, fontSize: '0.88rem',
                      cursor: sending || sendingTest || audienceList.length === 0 ? 'not-allowed' : 'pointer',
                      fontFamily: "'DM Sans',sans-serif",
                    }}
                  >
                    {sending
                      ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Sending...</>
                      : <><Send size={15} /> Send Campaign</>
                    }
                  </button>
                </div>
              </div>

              {/* RECIPIENT MAILING LIST CARD */}
              <div className="dash-card" style={{ margin: '24px 0 0 0' }}>
                <div className="dash-card-header" style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                  <div className="dash-card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Users size={18} color="var(--red)" />
                    Mailing List ({audienceList.length} of {fullAudienceList.length} active)
                  </div>
                  {excludedEmails.size > 0 && (
                    <button
                      onClick={() => setExcludedEmails(new Set())}
                      style={{
                        background: 'none', border: 'none', color: 'var(--red)',
                        fontSize: '0.78rem', fontWeight: 800, cursor: 'pointer',
                        padding: 0, textTransform: 'uppercase', letterSpacing: '0.05em'
                      }}
                    >
                      Reset Exclusions ({excludedEmails.size})
                    </button>
                  )}
                </div>

                {/* Search input */}
                <div style={{ position: 'relative', marginBottom: 16 }}>
                  <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                  <input
                    type="text"
                    placeholder="Search list by name or email..."
                    value={recipientSearch}
                    onChange={e => setRecipientSearch(e.target.value)}
                    style={{
                      width: '100%', boxSizing: 'border-box',
                      padding: '10px 12px 10px 36px', fontSize: '0.85rem',
                      borderRadius: 8, border: '1px solid var(--border-subtle)',
                      background: 'var(--white)', color: 'var(--text)',
                      fontFamily: 'inherit', outline: 'none'
                    }}
                  />
                </div>

                {/* Bulk toggle and info */}
                {(() => {
                  const searched = fullAudienceList.filter(c => 
                    c.name?.toLowerCase().includes(recipientSearch.toLowerCase()) || 
                    c.email?.toLowerCase().includes(recipientSearch.toLowerCase())
                  );
                  const allSearchedIncluded = searched.every(c => !excludedEmails.has(c.email.trim().toLowerCase()));
                  const someSearchedIncluded = searched.some(c => !excludedEmails.has(c.email.trim().toLowerCase()));
                  
                  const toggleAllRecipients = () => {
                    const next = new Set(excludedEmails);
                    if (allSearchedIncluded) {
                      searched.forEach(c => {
                        next.add(c.email.trim().toLowerCase());
                      });
                    } else {
                      searched.forEach(c => {
                        next.delete(c.email.trim().toLowerCase());
                      });
                    }
                    setExcludedEmails(next);
                  };

                  return (
                    <>
                      {searched.length > 0 && (
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 14px',
                          background: 'var(--black2)',
                          borderRadius: 8,
                          marginBottom: 12,
                          border: '1px solid var(--border-subtle)'
                        }}>
                          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text)' }}>
                            <input
                              type="checkbox"
                              checked={allSearchedIncluded && searched.length > 0}
                              ref={el => {
                                if (el) {
                                  el.indeterminate = !allSearchedIncluded && someSearchedIncluded;
                                }
                              }}
                              onChange={toggleAllRecipients}
                              style={{
                                width: '16px',
                                height: '16px',
                                marginRight: '10px',
                                cursor: 'pointer',
                                accentColor: 'var(--red)'
                              }}
                            />
                            <span>Include All ({searched.length} matching)</span>
                          </label>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                            {searched.filter(c => !excludedEmails.has(c.email.trim().toLowerCase())).length} selected
                          </div>
                        </div>
                      )}

                      {/* Scrollable list */}
                      <div style={{
                        maxHeight: '280px', overflowY: 'auto',
                        display: 'flex', flexDirection: 'column', gap: 8,
                        paddingRight: 4
                      }}>
                        {fullAudienceList.length === 0 && (
                          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic' }}>
                            No recipients in the selected audience segment.
                          </div>
                        )}

                        {fullAudienceList.length > 0 && searched.length === 0 && (
                          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic' }}>
                            No match found for "{recipientSearch}"
                          </div>
                        )}

                        {searched.map(c => {
                          const emailKey = c.email.trim().toLowerCase();
                          const isExcluded = excludedEmails.has(emailKey);
                          
                          return (
                            <div
                              key={c.id}
                              style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '10px 12px', background: isExcluded ? 'rgba(0,0,0,0.2)' : 'var(--black2)',
                                borderRadius: 8, border: '1px solid var(--border-subtle)',
                                opacity: isExcluded ? 0.45 : 1, transition: 'all 0.15s'
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', minWidth: 0, flex: 1 }}>
                                <input
                                  type="checkbox"
                                  checked={!isExcluded}
                                  onChange={() => {
                                    const next = new Set(excludedEmails);
                                    if (isExcluded) {
                                      next.delete(emailKey);
                                    } else {
                                      next.add(emailKey);
                                    }
                                    setExcludedEmails(next);
                                  }}
                                  style={{
                                    width: '16px',
                                    height: '16px',
                                    marginRight: '12px',
                                    cursor: 'pointer',
                                    accentColor: 'var(--red)',
                                    flexShrink: 0
                                  }}
                                />
                                <div style={{ minWidth: 0, flex: 1, paddingRight: 12 }}>
                                  <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {c.name || 'Anonymous Customer'}
                                  </div>
                                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                                    {c.email}
                                  </div>
                                  <div style={{ fontSize: '0.72rem', color: 'var(--red)', fontWeight: 600, marginTop: 4 }}>
                                    {form.audience === 'top_20_monthly' ? (
                                      form.dateFilter && (form.dateFilter.start || form.dateFilter.end)
                                        ? `₦${Number(c.rangeSpent || 0).toLocaleString()} spent in range`
                                        : `₦${Number(c.rangeSpent || c.totalSpent || 0).toLocaleString()} spent (all-time)`
                                    ) : (
                                      `₦${Number(c.totalSpent || 0).toLocaleString()} total spent · ${c.orders} order${c.orders !== 1 ? 's' : ''}`
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>

            {/* RIGHT COLUMN: LIVE EMAIL MOCKUP PREVIEW */}
            <div className="dash-card" style={{ margin: 0, position: 'sticky', top: 20 }}>
              <div className="dash-card-header" style={{ marginBottom: 20 }}>
                <div className="dash-card-title">Live Preview</div>
              </div>
              
              {/* Mockup email client container */}
              <div style={{
                background: 'var(--white)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 14,
                boxShadow: '0 12px 40px rgba(0,0,0,0.06)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column'
              }}>
                {/* macOS control header bar */}
                <div style={{
                  background: 'var(--black2)',
                  padding: '12px 16px',
                  borderBottom: '1px solid var(--border-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444' }}></span>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#fbbf24' }}></span>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#10b981' }}></span>
                  </div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                    Smokey Mail Preview
                  </span>
                  <div style={{ width: 42 }}></div> {/* Spacer */}
                </div>

                {/* Email metadata header */}
                <div style={{ padding: '16px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--white)', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex' }}>
                    <span style={{ width: 64, color: 'var(--text-muted)', fontWeight: 600 }}>From:</span>
                    <span style={{ color: 'var(--text)', fontWeight: 700 }}>
                      Smokeyhut Delight <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>&lt;Smokeyhutdelight01@gmail.com&gt;</span>
                    </span>
                  </div>
                  <div style={{ display: 'flex' }}>
                    <span style={{ width: 64, color: 'var(--text-muted)', fontWeight: 600 }}>To:</span>
                    <span style={{ color: 'var(--text)', fontWeight: 600 }}>
                      Sarah Olowookere <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>&lt;sarah.o@gmail.com&gt;</span>
                    </span>
                  </div>
                  <div style={{ display: 'flex', borderTop: '1px solid rgba(0,0,0,0.04)', paddingTop: 8 }}>
                    <span style={{ width: 64, color: 'var(--text-muted)', fontWeight: 600 }}>Subject:</span>
                    <span style={{ color: 'var(--text)', fontWeight: 800 }}>
                      {form.subject || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontWeight: 400 }}>Enter a subject line...</span>}
                    </span>
                  </div>
                </div>

                {/* Email body preview area */}
                <div style={{
                  background: '#111',
                  padding: '20px',
                  fontFamily: 'Arial, sans-serif'
                }}>
                  <div style={{
                    maxWidth: '100%',
                    background: '#1a1a1a',
                    borderRadius: 12,
                    overflow: 'hidden',
                    border: '1px solid var(--border-subtle)'
                  }}>
                    {/* Header banner */}
                    <div style={{ background: '#c0201f', padding: '16px 24px', textAlign: 'center' }}>
                      <div style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 10 }}>
                        <img src="/logo.svg" alt="Smokeyhut Logo" style={{ height: 32, display: 'block' }} />
                      </div>
                      <div style={{ display: 'inline-block', verticalAlign: 'middle' }}>
                        <span style={{ color: '#fff', fontSize: '1.15rem', letterSpacing: '0.03em', fontWeight: 900, fontFamily: 'Arial, sans-serif' }}>
                          Smokeyhut Delight
                        </span>
                      </div>
                    </div>
                    {/* Content */}
                    <div style={{ padding: '24px 20px', minHeight: '180px' }}>
                      <h2 style={{ color: '#fff', marginTop: 0, marginBottom: 20, fontSize: '1.25rem', fontWeight: 'bold', fontFamily: 'Arial, sans-serif' }}>
                        {form.subject || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontWeight: 400 }}>Campaign Subject</span>}
                      </h2>
                      {(() => {
                        const text = form.body;
                        if (!text) {
                          return (
                            <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.88rem', textAlign: 'center', marginTop: 40 }}>
                              Write a message body on the left to see the live personalization preview here.
                            </div>
                          );
                        }
                        const parts = text.split('{customer_name}');
                        return (
                          <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.8, color: '#bbb', fontSize: '0.88rem' }}>
                            {parts.map((p, idx) => (
                              <span key={idx}>
                                {p}
                                {idx < parts.length - 1 && (
                                  <span style={{
                                    background: 'rgba(192,32,31,0.2)',
                                    color: '#ff4d4d',
                                    fontWeight: 800,
                                    padding: '2px 8px',
                                    borderRadius: 4,
                                    margin: '0 2px',
                                    display: 'inline-block',
                                    border: '1px solid rgba(192,32,31,0.4)',
                                    fontSize: '0.82rem'
                                  }}>
                                    Sarah
                                  </span>
                                )}
                              </span>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                    {/* Footer */}
                    <div style={{
                      padding: '16px 20px',
                      background: '#0d0d0d',
                      textAlign: 'center',
                      fontSize: '0.72rem',
                      color: '#555',
                      lineHeight: '1.5',
                      borderTop: '1px solid rgba(255,255,255,0.02)'
                    }}>
                      You are receiving this because you ordered from Smokeyhut Delight.<br />
                      Smokeyhut Delight &middot; Lagos, Nigeria &middot; © {new Date().getFullYear()}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Campaign history */}
          <div className="dash-card">
            <div className="dash-card-header" style={{ marginBottom: 16 }}>
              <div className="dash-card-title">Campaign History</div>
            </div>
            {campsLoading ? (
              <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
            ) : campaigns.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <Mail size={32} style={{ opacity: 0.3, marginBottom: 10 }} />
                <div>No campaigns sent yet. Compose your first one above.</div>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th>Campaign</th><th>Subject</th><th>Audience</th>
                      <th>Recipients</th><th>Sent</th><th>Status</th><th>Date</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map(c => {
                      const getStatusBadge = (status) => {
                        const styleMap = {
                          sent:    { bg: 'rgba(22,163,74,0.06)', color: '#16a34a', border: '1px solid rgba(22,163,74,0.2)' },
                          partial: { bg: 'rgba(234,179,8,0.06)', color: '#ca8a04', border: '1px solid rgba(234,179,8,0.2)' },
                          failed:  { bg: 'rgba(239,68,68,0.06)', color: '#dc2626', border: '1px solid rgba(239,68,68,0.2)' },
                          sending: { bg: 'rgba(59,130,246,0.06)', color: '#2563eb', border: '1px solid rgba(59,130,246,0.2)' },
                        }[status] || { bg: 'var(--black2)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' };
                        return (
                          <span style={{
                            padding: '4px 12px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 800,
                            textTransform: 'uppercase', letterSpacing: '0.04em', display: 'inline-block', ...styleMap
                          }}>{status}</span>
                        );
                      };
                      const failed = (c.recipient_count || 0) - (c.sent_count || 0);
                      return (
                        <tr key={c.id}>
                          <td style={{ fontWeight: 700 }}>{c.name}</td>
                          <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.subject}</td>
                          <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            {AUDIENCE_OPTIONS.find(o => o.value === c.audience)?.label || c.audience}
                          </td>
                          <td style={{ fontWeight: 600 }}>{c.recipient_count ?? '—'}</td>
                          <td style={{ fontSize: '0.82rem' }}>
                            <span style={{ color: '#16a34a', fontWeight: 700 }}>{c.sent_count ?? '—'}</span>
                            {failed > 0 && <span style={{ color: '#dc2626', fontWeight: 700, marginLeft: 4 }}>/ {failed} fail</span>}
                          </td>
                          <td>{getStatusBadge(c.status)}</td>
                          <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                            {new Date(c.created_at).toLocaleDateString()}
                          </td>
                          <td>
                            <button
                              onClick={() => viewCampaignDetail(c)}
                              style={{ background: 'none', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '5px 12px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}
                            >
                              View Details
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      <ConfirmModal 
        isOpen={!!confirmAction} 
        onClose={() => setConfirmAction(null)} 
        {...confirmAction} 
      />

      {/* ── Campaign Log Detail Modal ── */}
      {detailCampaign && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={() => setDetailCampaign(null)}
        >
          <div
            style={{ background: 'var(--card-bg)', borderRadius: 16, width: '100%', maxWidth: 720, maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid var(--border-subtle)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: '1rem', marginBottom: 4 }}>{detailCampaign.name}</div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{detailCampaign.subject}</div>
              </div>
              <button onClick={() => setDetailCampaign(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', flexShrink: 0, padding: 4 }}>
                <X size={18} />
              </button>
            </div>

            {/* Stats bar */}
            <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              {[
                { label: 'Total', value: detailCampaign.recipient_count ?? '—', color: 'var(--text)' },
                { label: 'Delivered', value: detailCampaign.sent_count ?? '—', color: '#16a34a' },
                { label: 'Failed', value: Math.max(0, (detailCampaign.recipient_count || 0) - (detailCampaign.sent_count || 0)), color: '#dc2626' },
                { label: 'Sent', value: new Date(detailCampaign.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }), color: 'var(--text-muted)' },
              ].map(({ label, value, color }) => (
                <div key={label}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>{label}</div>
                  <div style={{ fontWeight: 800, fontSize: '1rem', color }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Log table */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {logsLoading ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading logs...</div>
              ) : campaignLogs.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                  <Mail size={32} style={{ opacity: 0.3, marginBottom: 10 }} />
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>No per-email logs available</div>
                  <div style={{ fontSize: '0.82rem' }}>Detailed logging applies to campaigns sent after this feature was added.</div>
                </div>
              ) : (
                <table className="dash-table" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Name</th>
                      <th>Status</th>
                      <th>Error</th>
                      <th>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaignLogs.map(log => (
                      <tr key={log.id}>
                        <td style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{log.email}</td>
                        <td style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{log.name || '—'}</td>
                        <td>
                          <span style={{
                            padding: '3px 10px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 800,
                            textTransform: 'uppercase', letterSpacing: '0.04em', display: 'inline-block',
                            ...(log.status === 'sent'
                              ? { background: 'rgba(22,163,74,0.08)', color: '#16a34a', border: '1px solid rgba(22,163,74,0.2)' }
                              : { background: 'rgba(239,68,68,0.08)', color: '#dc2626', border: '1px solid rgba(239,68,68,0.2)' })
                          }}>
                            {log.status}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.78rem', color: '#dc2626', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {log.error || '—'}
                        </td>
                        <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                          {new Date(log.created_at).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
