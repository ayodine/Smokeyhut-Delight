import { useState, useEffect } from 'react';
import { Users, DollarSign, Package, Trash2, Download, Mail, Send, Loader2, UserPlus, Repeat2, ChevronUp, ChevronDown, Search, Sparkles, X, TrendingUp, TrendingDown, Crown, Star, User, Copy, Phone, MapPin, Calendar, MessageCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { SkelDashHeader, SkelKpiGrid, SkelTable } from '../../components/Skeleton';
import Pagination from '../../components/Pagination';
import { supabase } from '../../lib/supabase';
import { splitRegularBatch, RESEND_AUDIENCE_CAP } from '../../lib/campaignAudience';
import { isSent, isFailed, isPending } from '../../lib/campaignStatus';
import { useAuth } from '../../context/AuthContext';
import CustomSelect from '../../components/CustomSelect';
import DashCalendar from '../../components/DashCalendar';
import { useToast } from '../../context/ToastContext';
import ConfirmModal from '../../components/ConfirmModal';

const fmt = (n) => '₦' + n.toLocaleString();

// Supabase caps a single response at 1000 rows. Larger segments (e.g. the
// "regular" tier, 1300+ customers) would silently truncate, so a campaign would
// miss everyone past row 1000. Page through in 1000-row windows until a short
// page signals the end, accumulating the full audience.
const fetchFullAudience = async (audience, start, end) => {
  const PAGE_SIZE = 1000;
  const allRows = [];
  let from = 0;
  while (true) {
    const { data: page, error } = await supabase
      .rpc('get_campaign_audience', { p_audience: audience, p_start: start, p_end: end })
      .range(from, from + PAGE_SIZE - 1);
    if (error) return { data: null, error };
    if (page && page.length) allRows.push(...page);
    if (!page || page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return { data: allRows, error: null };
};

const DEFAULT_CAMPAIGN_BODY = `Hi {customer_name},

We have an exciting offer just for you! This weekend only, enjoy 20% off all orders.

Use code SAVE20 at checkout.

Shop now at smokeyhutdelight.com

— The Smokeyhut Delight Team`;

const SINGLE_EMAIL_TEMPLATES = [
  {
    name: 'Checking In',
    subject: 'Thinking of you from Smokeyhut Delight!',
    body: (name) => `Hi ${name},\n\nIt's been a while since your last order, and we miss you! We wanted to check in and see how you're doing. Let us know if you have any questions or feedback. Hope to grill for you again soon!\n\nBest,\nThe Smokeyhut Delight Team`
  },
  {
    name: 'Win Back Promo',
    subject: 'We miss you! Here is 15% off your next order 🎁',
    body: (name) => `Hi ${name},\n\nWe haven't seen you in a bit, so we wanted to treat you to 15% off your next meal! Use the coupon code MISSYOU at checkout.\n\nShop now at smokeyhutdelight.com\n\nHope to see you soon!\n\nBest,\nThe Smokeyhut Delight Team`
  },
  {
    name: 'Feedback Inquiry',
    subject: "We'd love your feedback on your experience",
    body: (name) => `Hi ${name},\n\nAs one of our valued customers, your opinion is extremely important to us. How was your last experience with Smokeyhut Delight? We would love to hear your thoughts so we can improve.\n\nThank you for your time!\n\nWarm regards,\nThe Smokeyhut Delight Team`
  }
];

const formatWhatsAppLink = (phone) => {
  if (!phone) return '';
  let clean = phone.replace(/\D/g, '');
  if (clean.startsWith('0')) {
    clean = '234' + clean.substring(1);
  }
  if (clean.length === 10 && !clean.startsWith('234')) {
    clean = '234' + clean;
  }
  return `https://wa.me/${clean}`;
};

const AUDIENCE_OPTIONS = [
  { value: 'all',                  label: 'All customers with email' },
  { value: 'vip',                  label: 'Segment: VIP Customers' },
  { value: 'standard',             label: 'Segment: Standard Customers' },
  { value: 'regular',              label: 'Segment: Regular Customers' },
  { value: 'vip_customers',        label: 'VIP Customers (₦200,000+ spent - Legacy)' },
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
  const [overviewDateFilter, setOverviewDateFilter] = useState({ start: null, end: null });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const PER_PAGE = 20;
  const [sortKey, setSortKey] = useState('lastOrder');
  const [sortDir, setSortDir] = useState('desc');

  // Customer Group/Tier state
  const [groupTimeframe, setGroupTimeframe] = useState('all_time');
  const [groupFilter, setGroupFilter] = useState('all');
  const [groupCounts, setGroupCounts] = useState({ vip: 0, standard: 0, regular: 0 });

  // Customer profile drawer & tiers navigation state
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerOrders, setCustomerOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [activeTierTab, setActiveTierTab] = useState('vip');
  const [drawerMode, setDrawerMode] = useState('profile'); // 'profile' or 'email'
  const [singleEmailSubject, setSingleEmailSubject] = useState('');
  const [singleEmailBody, setSingleEmailBody] = useState('');
  const [sendingSingleEmail, setSendingSingleEmail] = useState(false);

  // Sync groupFilter with activeTierTab when in tiers view, or reset when in directory view
  useEffect(() => {
    if (tab === 'tiers') {
      setGroupFilter(activeTierTab);
      setPage(1);
    } else if (tab === 'directory') {
      setGroupFilter('all');
      setGroupTimeframe('all_time');
      setPage(1);
    }
  }, [tab, activeTierTab]);

  // Server-side loaded data
  const [directoryCustomers, setDirectoryCustomers] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [kpis, setKpis] = useState({ totalCustomers: 0, totalSpent: 0, totalOrders: 0, newCustomers: 0, returningCustomers: 0, noEmailCount: 0 });
  const [growth, setGrowth] = useState({ totalCustomers: null, totalSpent: null, totalOrders: null, newCustomers: null, returningCustomers: null });
  const [campaignAudience, setCampaignAudience] = useState([]);
  const [campaignProgress, setCampaignProgress] = useState(null);

  const [kpiLoading, setKpiLoading] = useState(false);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [audienceLoading, setAudienceLoading] = useState(false);

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
  const [mailingListExpanded, setMailingListExpanded] = useState(false);
  // Campaign detail / logs
  const [detailCampaign, setDetailCampaign] = useState(null);
  const [campaignLogs, setCampaignLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const { showToast } = useToast();

  const [editingEmailId, setEditingEmailId] = useState(null);
  const [editedEmailValue, setEditedEmailValue] = useState('');

  const saveEditedEmail = async (customerId, oldEmail) => {
    const newEmail = editedEmailValue.trim();
    if (!newEmail) return showToast('Error', 'Email address cannot be empty.', 'error');
    if (!newEmail.includes('@') || newEmail.endsWith('.')) {
      return showToast('Error', 'Please enter a valid email address (cannot end with a dot).', 'error');
    }
    
    // 1. Update local React state (campaignAudience) so it updates in the UI list instantly
    setCampaignAudience(prev => prev.map(c => c.id === customerId ? { ...c, email: newEmail } : c));
    setEditingEmailId(null);

    // 2. Persist the change to the database orders table
    try {
      console.log(`Updating customer email from "${oldEmail}" to "${newEmail}" in orders...`);
      const { error: orderErr } = await supabase
        .from('orders')
        .update({ customer_email: newEmail })
        .eq('customer_email', oldEmail);

      if (orderErr) {
        console.error('Database update error for orders:', orderErr);
        showToast('Warning', 'Email updated locally but failed to save to database orders.', 'warning');
      } else {
        // 3. Persist the change to campaign_logs table (in case there are existing logs)
        const { error: logErr } = await supabase
          .from('campaign_logs')
          .update({ email: newEmail })
          .eq('email', oldEmail);
        
        if (logErr) {
          console.error('Database update error for campaign_logs:', logErr);
        }
        
        showToast('Success', 'Email address updated successfully!', 'success');
      }
    } catch (err) {
      console.error('Exception updating email:', err);
    }
  };

  useEffect(() => {
    // Only run if range selection is complete or cleared
    const isFilterIncomplete = form.dateFilter && form.dateFilter.start && !form.dateFilter.end;
    if (isFilterIncomplete) return;

    setExcludedEmails(new Set());
    setRecipientSearch('');
  }, [form.audience, form.dateFilter]);

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  // Fetch customer group counts when timeframe changes
  useEffect(() => {
    const fetchGroupCounts = async () => {
      const { data, error } = await supabase.rpc('get_customer_group_counts', {
        p_group_timeframe: groupTimeframe,
      });
      if (!error && data && data.length > 0) {
        setGroupCounts({
          vip: Number(data[0].vip_count || 0),
          standard: Number(data[0].standard_count || 0),
          regular: Number(data[0].regular_count || 0),
        });
      }
    };
    fetchGroupCounts();
  }, [groupTimeframe]);

  // Fetch directory data when pagination, sorting, search, or date filter changes
  useEffect(() => {
    const fetchDirectory = async () => {
      setDirectoryLoading(true);
      const { data, error } = await supabase.rpc('get_customers_directory', {
        p_start: overviewDateFilter.start ? overviewDateFilter.start + 'T00:00:00' : null,
        p_end: overviewDateFilter.end ? overviewDateFilter.end + 'T23:59:59' : null,
        p_search: debouncedSearch,
        p_sort_key: sortKey,
        p_sort_dir: sortDir,
        p_limit: PER_PAGE,
        p_offset: (page - 1) * PER_PAGE,
        p_group_timeframe: groupTimeframe,
        p_group_filter: groupFilter,
      });
      if (error) {
        console.error('Error fetching directory:', error);
        showToast('Error loading customer directory', error.message || 'Unknown error', 'error');
        setDirectoryCustomers([]);
        setTotalCount(0);
      } else if (data) {
        const mapped = data.map(item => ({
          id: item.agg_id,
          name: item.agg_name,
          email: item.agg_email,
          phone: item.agg_phone,
          orders: Number(item.agg_orders),
          totalSpent: Number(item.agg_total_spent),
          lastOrder: item.agg_last_order,
          customer_group: item.customer_group,
          cnt: Number(item.cnt)
        }));
        setDirectoryCustomers(mapped);
        const countVal = mapped[0]?.cnt ?? 0;
        setTotalCount(countVal);
      } else {
        setDirectoryCustomers([]);
        setTotalCount(0);
      }
      setDirectoryLoading(false);
    };
    
    // Skip loading directory if it's not complete custom range
    const isIncomplete = overviewDateFilter.start && !overviewDateFilter.end;
    if (!isIncomplete) {
      fetchDirectory();
    }
  }, [page, debouncedSearch, sortKey, sortDir, overviewDateFilter, groupTimeframe, groupFilter, showToast]);

  // Fetch KPIs and growth when date filter changes
  useEffect(() => {
    const fetchKpisAndGrowth = async () => {
      setKpiLoading(true);
      
      let currentStart = null, currentEnd = null;
      let previousStart = null, previousEnd = null;
      let labelSuffix = 'vs last month';

      const hasFilter = overviewDateFilter && (overviewDateFilter.start || overviewDateFilter.end);
      if (hasFilter) {
        const { start, end } = overviewDateFilter;
        currentStart = start ? start + 'T00:00:00' : null;
        currentEnd = end ? end + 'T23:59:59' : null;

        if (start && end) {
          const s = new Date(`${start}T00:00:00`);
          const e = new Date(`${end}T23:59:59.999`);
          const diffTime = Math.abs(e - s);
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          const prevS = new Date(s); prevS.setDate(s.getDate() - diffDays);
          const prevE = new Date(s); prevE.setMilliseconds(-1);
          previousStart = prevS.toISOString();
          previousEnd = prevE.toISOString();

          const isFullMonth = s.getDate() === 1 && new Date(e.getTime() + 1).getDate() === 1;
          const startsOnFirst = s.getDate() === 1;
          if (isFullMonth) labelSuffix = 'vs last month';
          else if (startsOnFirst) labelSuffix = 'vs last month (MTD)';
          else labelSuffix = `vs prev ${diffDays}d`;
        }
      } else {
        const mtd = getMTDPeriods();
        currentStart = mtd.current.start;
        currentEnd = mtd.current.end;
        previousStart = mtd.previous.start;
        previousEnd = mtd.previous.end;
        labelSuffix = 'vs last month (MTD)';
      }

      const [currentRes, previousRes] = await Promise.all([
        supabase.rpc('get_customers_kpis', { p_start: currentStart, p_end: currentEnd }),
        previousStart 
          ? supabase.rpc('get_customers_kpis', { p_start: previousStart, p_end: previousEnd })
          : Promise.resolve({ data: null })
      ]);

      const curr = currentRes.data || { totalCustomers: 0, totalSpent: 0, totalOrders: 0, newCustomers: 0, returningCustomers: 0, noEmailCount: 0 };
      const prev = previousRes.data || { totalCustomers: 0, totalSpent: 0, totalOrders: 0, newCustomers: 0, returningCustomers: 0, noEmailCount: 0 };

      const getPercentChange = (cVal, pVal) => {
        if (!pVal || pVal === 0) return cVal > 0 ? 100 : 0;
        return ((cVal - pVal) / pVal) * 100;
      };

      setKpis(curr);
      setGrowth({
        totalCustomers: { pct: getPercentChange(curr.totalCustomers, prev.totalCustomers), label: labelSuffix },
        totalSpent: { pct: getPercentChange(curr.totalSpent, prev.totalSpent), label: labelSuffix },
        totalOrders: { pct: getPercentChange(curr.totalOrders, prev.totalOrders), label: labelSuffix },
        newCustomers: { pct: getPercentChange(curr.newCustomers, prev.newCustomers), label: labelSuffix },
        returningCustomers: { pct: getPercentChange(curr.returningCustomers, prev.returningCustomers), label: labelSuffix }
      });
      setKpiLoading(false);
      setLoading(false);
    };

    const isIncomplete = overviewDateFilter.start && !overviewDateFilter.end;
    if (!isIncomplete) {
      fetchKpisAndGrowth();
    }
  }, [overviewDateFilter]);

  // Fetch campaign audience list when audience rules or campaign date filters change
  useEffect(() => {
    if (tab !== 'campaigns') return;
    
    const fetchCampaignAudience = async () => {
      setAudienceLoading(true);
      const { data, error } = await fetchFullAudience(
        form.audience,
        form.dateFilter?.start ? form.dateFilter.start + 'T00:00:00' : null,
        form.dateFilter?.end ? form.dateFilter.end + 'T23:59:59' : null,
      );
      if (!error && data) {
        const seen = new Set();
        const mapped = [];
        data.forEach(item => {
          if (!item.agg_email) return;
          const emailKey = item.agg_email.trim().toLowerCase();
          if (!seen.has(emailKey)) {
            seen.add(emailKey);
            mapped.push({
              id: item.agg_id,
              name: item.agg_name,
              email: item.agg_email,
              phone: item.agg_phone,
              orders: Number(item.agg_orders),
              totalSpent: Number(item.agg_total_spent),
              lastOrder: item.agg_last_order
            });
          }
        });
        setCampaignAudience(mapped);
      } else {
        setCampaignAudience([]);
      }
      setAudienceLoading(false);
    };

    const isCampaignFilterIncomplete = form.dateFilter && form.dateFilter.start && !form.dateFilter.end;
    if (!isCampaignFilterIncomplete) {
      fetchCampaignAudience();
    }
  }, [tab, form.audience, form.dateFilter]);

  // Auto-refresh logs for currently sending campaigns
  useEffect(() => {
    if (!detailCampaign || detailCampaign.status !== 'sending') return;

    const interval = setInterval(async () => {
      const { data } = await supabase
        .from('campaign_logs')
        .select('*')
        .eq('campaign_id', detailCampaign.id)
        .order('created_at', { ascending: true });
      
      if (data) {
        setCampaignLogs(data);
        
        const actualSent = data.filter(log => isSent(log.status)).length;
        const actualFailed = data.filter(log => isFailed(log.status, log.error)).length;
        const pendingCount = data.filter(log => isPending(log.status, log.error)).length;
        
        let newStatus = 'sending';
        if (pendingCount === 0) {
          newStatus = actualFailed > 0 ? (actualSent > 0 ? 'partial' : 'failed') : 'sent';
        }
        
        const updates = {
          sent_count: actualSent,
          failed_count: actualFailed,
          status: newStatus
        };
        
        if (detailCampaign.sent_count !== actualSent || detailCampaign.failed_count !== actualFailed || detailCampaign.status !== newStatus) {
          await supabase.from('email_campaigns').update(updates).eq('id', detailCampaign.id);
          setDetailCampaign(prev => prev ? { ...prev, ...updates } : null);
          setCampaigns(prev => prev.map(c => c.id === detailCampaign.id ? { ...c, ...updates } : c));
        }
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [detailCampaign]);

  const getMTDPeriods = () => {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    const currentDay = today.getDate();
    
    const currStart = new Date(currentYear, currentMonth, 1).toLocaleDateString('en-CA');
    const currEnd = today.toLocaleDateString('en-CA');
    
    const prevStart = new Date(currentYear, currentMonth - 1, 1).toLocaleDateString('en-CA');
    const lastDayOfPrevMonth = new Date(currentYear, currentMonth, 0).getDate();
    const targetDay = Math.min(currentDay, lastDayOfPrevMonth);
    const prevEnd = new Date(currentYear, currentMonth - 1, targetDay).toLocaleDateString('en-CA');
    
    return {
      current: { start: currStart, end: currEnd },
      previous: { start: prevStart, end: prevEnd }
    };
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

  const fetchCampaigns = async () => {
    setCampsLoading(true);
    const { data } = await supabase.from('email_campaigns').select('*').order('created_at', { ascending: false });
    if (data) setCampaigns(data);
    setCampsLoading(false);
  };

  useEffect(() => {
    if (tab === 'campaigns') {
      fetchCampaigns();
    }
  }, [tab]);

  const fullAudienceList = campaignAudience;
  const audienceList = fullAudienceList.filter(c => !excludedEmails.has(c.email.trim().toLowerCase()));
  const noEmailCount = kpis.noEmailCount || 0;

  const fetchAllForExport = async () => {
    const { data } = await supabase.rpc('get_customers_directory', {
      p_start: overviewDateFilter.start ? overviewDateFilter.start + 'T00:00:00' : null,
      p_end: overviewDateFilter.end ? overviewDateFilter.end + 'T23:59:59' : null,
      p_search: debouncedSearch,
      p_sort_key: sortKey,
      p_sort_dir: sortDir,
      p_limit: 10000,
      p_offset: 0
    });
    return data || [];
  };

  const exportCSV = async () => {
    const list = await fetchAllForExport();
    const rows = [
      ['Name', 'Email', 'Phone', 'Orders', 'Total Spent (₦)', 'Last Order'],
      ...list.map(c => [
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

  const exportExcel = async () => {
    const list = await fetchAllForExport();
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Name', 'Email', 'Phone', 'Orders', 'Total Spent (₦)', 'Last Order'],
      ...list.map(c => [
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
        setDirectoryCustomers(prev => prev.filter(c => c.phone !== phone));
        showToast('Customer removed', '', 'success');
        setConfirmAction(null);
      }
    });
  };

  const openCustomerDrawer = async (customer) => {
    setSelectedCustomer(customer);
    setDrawerMode('profile');
    setSingleEmailSubject('');
    setSingleEmailBody('');
    setCustomerOrders([]);
    setOrdersLoading(true);
    
    let query = supabase.from('orders').select('*, order_items(*)').is('deleted_at', null);
    if (customer.phone) {
      query = query.eq('customer_phone', customer.phone);
    } else if (customer.email) {
      query = query.eq('customer_email', customer.email);
    } else {
      query = query.eq('customer_name', customer.name);
    }
    
    const { data, error } = await query.order('created_at', { ascending: false });
    if (!error && data) {
      setCustomerOrders(data);
    } else {
      console.error('Error fetching customer orders:', error);
      showToast('Error loading orders', error?.message || 'Unknown error', 'error');
    }
    setOrdersLoading(false);
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
    const logs = data || [];
    setCampaignLogs(logs);
    setLogsLoading(false);

    if (logs.length > 0) {
      const actualSent = logs.filter(log => isSent(log.status)).length;
      const actualFailed = logs.filter(log => isFailed(log.status, log.error)).length;
      const pendingCount = logs.filter(log => isPending(log.status, log.error)).length;
      
      const expectedStatus = campaign.status === 'sending' && pendingCount > 0
        ? 'sending' 
        : (pendingCount > 0 ? 'partial' : (actualFailed > 0 ? (actualSent > 0 ? 'partial' : 'failed') : 'sent'));
        
      if (campaign.sent_count !== actualSent || campaign.failed_count !== actualFailed || campaign.status !== expectedStatus) {
        await supabase
          .from('email_campaigns')
          .update({
            sent_count: actualSent,
            failed_count: actualFailed,
            status: expectedStatus
          })
          .eq('id', campaign.id);
          
        setDetailCampaign(prev => prev ? { ...prev, sent_count: actualSent, failed_count: actualFailed, status: expectedStatus } : null);
        setCampaigns(prev => prev.map(c => c.id === campaign.id ? { ...c, sent_count: actualSent, failed_count: actualFailed, status: expectedStatus } : c));
      }
    } else if (campaign.status === 'sending' && (campaign.sent_count !== 0 || campaign.failed_count !== 0)) {
      await supabase
        .from('email_campaigns')
        .update({
          sent_count: 0,
          failed_count: 0
        })
        .eq('id', campaign.id);
      setDetailCampaign(prev => prev ? { ...prev, sent_count: 0, failed_count: 0 } : null);
      setCampaigns(prev => prev.map(c => c.id === campaign.id ? { ...c, sent_count: 0, failed_count: 0 } : c));
    }
  };
 
  // ── Retry failed campaign emails ───────────────────────────────────────────
  const handleRetryFailed = async (campaign) => {
    setSending(true);
    try {
      // Query the database directly for logs with status === 'failed' (failed and unattempted)
      const { data: failedLogs, error } = await supabase
        .from('campaign_logs')
        .select('*')
        .eq('campaign_id', campaign.id)
        .eq('status', 'failed');

      if (error) {
        console.error('Error fetching failed campaign logs:', error);
        throw new Error(`Failed to query campaign logs: ${error.message}`);
      }
      let toRetry = failedLogs || [];
      console.log(`Found ${toRetry.length} failed logs initially.`);

      if (toRetry.length === 0) {
        // If there are no failed logs, check if any logs exist at all for this campaign
        const { count, error: countErr } = await supabase
          .from('campaign_logs')
          .select('*', { count: 'exact', head: true })
          .eq('campaign_id', campaign.id);

        if (countErr) {
          console.error('Error checking campaign logs count:', countErr);
          showToast('Error', `Failed to count campaign logs: ${countErr.message}`, 'error');
        } else {
          console.log(`Campaign logs count in DB: ${count}`);
          if (!count || count === 0) {
            // Self-healing: Pre-population failed previously. Let's initialize logs now!
            console.log(`Attempting self-healing for campaign ${campaign.id} (audience: ${campaign.audience})...`);
            const { data: audData, error: audErr } = await fetchFullAudience(campaign.audience, null, null);

            if (audErr) {
              console.error('Error fetching campaign audience during retry:', audErr);
              showToast('Error', `Failed to fetch audience: ${audErr.message}`, 'error');
            } else if (audData) {
              console.log(`Fetched ${audData.length} recipients for self-healing.`);
              const seen = new Set();
              const uniqueRecipients = [];
              audData.forEach(item => {
                if (!item.agg_email) return;
                const emailKey = item.agg_email.trim().toLowerCase();
                if (!seen.has(emailKey)) {
                  seen.add(emailKey);
                  uniqueRecipients.push({ email: item.agg_email.trim(), name: item.agg_name || '' });
                }
              });

              console.log(`Deduplicated to ${uniqueRecipients.length} unique recipients.`);

              if (uniqueRecipients.length > 0) {
                // Pre-populate campaign_logs in batches
                const batchSize = 100;
                for (let i = 0; i < uniqueRecipients.length; i += batchSize) {
                  const batch = uniqueRecipients.slice(i, i + batchSize).map(r => ({
                    campaign_id: campaign.id,
                    email: r.email,
                    name: r.name || null,
                    status: 'failed',
                    error: 'Pending execution'
                  }));
                  console.log(`Inserting batch of ${batch.length} logs...`);
                  const { error: logErr } = await supabase.from('campaign_logs').insert(batch);
                  if (logErr) {
                    console.error('Error inserting campaign logs batch:', logErr);
                    throw new Error(`Failed to write logs to DB: ${logErr.message}`);
                  }
                }

                // Instead of re-fetching from database (which might fail/return empty due to RLS/session checks),
                // we map uniqueRecipients directly to the format expected by the retry execution block.
                toRetry = uniqueRecipients.map(r => ({
                  campaign_id: campaign.id,
                  email: r.email,
                  name: r.name || null,
                  status: 'failed',
                  error: 'Pending execution'
                }));
                console.log(`Successfully mapped ${toRetry.length} self-healed logs for retry.`);
              } else {
                showToast('Info', 'No recipients with valid emails found in the audience segment.', 'info');
              }
            }
          }
        }
      }

      if (toRetry.length === 0) {
        showToast('Info', 'No undelivered recipients found for this campaign.', 'info');
        setSending(false);
        return;
      }

      setConfirmAction({
        title: 'Retry Failed/Remaining Emails',
        message: `Retry sending this campaign to ${toRetry.length} undelivered recipient${toRetry.length !== 1 ? 's' : ''}?`,
        isDestructive: false,
        confirmText: 'Retry Now',
        onConfirm: async () => {
          setConfirmAction(prev => ({ ...prev, isLoading: true }));
          try {
            const recipients = toRetry.map(log => ({
              email: log.email,
              name: log.name || ''
            }));

            // Update status to sending
            await supabase
              .from('email_campaigns')
              .update({ status: 'sending' })
              .eq('id', campaign.id);

            if (detailCampaign && detailCampaign.id === campaign.id) {
              setDetailCampaign(prev => ({ ...prev, status: 'sending' }));
            }

            // Reset all to-be-retried logs to 'Pending execution' in campaign_logs first
            // to show them properly as pending in the UI during retry
            const emailsToReset = toRetry.map(log => log.email.trim());
            const { error: resetErr } = await supabase
              .from('campaign_logs')
              .update({
                status: 'failed',
                error: 'Pending execution'
              })
              .eq('campaign_id', campaign.id)
              .in('email', emailsToReset);

            if (resetErr) {
              console.error('Failed to reset logs status for retry:', resetErr);
            }

            // Keep chunks small: the edge function now waits ~1.5s between each
            // email to dodge Gmail's burst throttle, so a chunk of 15 stays well
            // under the edge-function timeout (~15 x 1.5s + send time).
            const CHUNK_SIZE = 15;
            let retriedSent = 0;
            let retriedFailed = 0;
            setCampaignProgress({ title: 'Retrying failed emails...', sent: 0, failed: 0, total: recipients.length });

            for (let i = 0; i < recipients.length; i += CHUNK_SIZE) {
              const chunk = recipients.slice(i, i + CHUNK_SIZE);
              
              const { data: chunkRes, error: invokeErr } = await supabase.functions.invoke('send-campaign', {
                body: {
                  subject: campaign.subject,
                  body: campaign.body,
                  recipients: chunk,
                  campaign_id: campaign.id,
                  retry: true
                }
              });

              if (invokeErr) {
                console.error(`Edge function invoke error for retry batch starting at index ${i}:`, invokeErr);
                retriedFailed += chunk.length;
                const emailsInChunk = chunk.map(r => r.email.trim());
                await supabase
                  .from('campaign_logs')
                  .update({
                    status: 'failed',
                    error: invokeErr.message || 'SMTP Connection Timeout or Rate Limit exceeded'
                  })
                  .eq('campaign_id', campaign.id)
                  .in('email', emailsInChunk);
              } else {
                retriedSent += chunkRes?.sent || 0;
                retriedFailed += chunkRes?.failed || 0;
              }

              // Update progress state
              setCampaignProgress({
                title: `Retrying batch ${Math.floor(i / CHUNK_SIZE) + 1} of ${Math.ceil(recipients.length / CHUNK_SIZE)}...`,
                sent: retriedSent,
                failed: retriedFailed,
                total: recipients.length
              });

              // Query DB logs to get final counts for the whole campaign
              const { data: logs } = await supabase
                .from('campaign_logs')
                .select('*')
                .eq('campaign_id', campaign.id);
              
              const actualSent = logs ? logs.filter(l => isSent(l.status)).length : 0;
              const actualFailed = logs ? logs.filter(l => isFailed(l.status, l.error)).length : 0;
              const pendingCount = logs ? logs.filter(l => isPending(l.status, l.error)).length : 0;

              const isFinished = (i + CHUNK_SIZE) >= recipients.length;
              let currentStatus = 'sending';
              if (isFinished) {
                currentStatus = pendingCount > 0 ? 'partial' : (actualFailed > 0 ? (actualSent > 0 ? 'partial' : 'failed') : 'sent');
              }

              await supabase.from('email_campaigns').update({
                sent_count: actualSent,
                failed_count: actualFailed,
                status: currentStatus
              }).eq('id', campaign.id);

              if (detailCampaign && detailCampaign.id === campaign.id) {
                setDetailCampaign(prev => prev ? { ...prev, sent_count: actualSent, failed_count: actualFailed, status: currentStatus } : null);
                if (logs) setCampaignLogs(logs);
              }
              setCampaigns(prev => prev.map(c => c.id === campaign.id ? { ...c, sent_count: actualSent, failed_count: actualFailed, status: currentStatus } : c));

              if (!isFinished) {
                await new Promise(resolve => setTimeout(resolve, 1500));
              }
            }

            showToast('Success', 'Retry batch completed successfully', 'success');
          } catch (err) {
            // Mark campaign status/counts based on current database state
            const { data: logs } = await supabase
              .from('campaign_logs')
              .select('*')
              .eq('campaign_id', campaign.id);

            const actualSent = logs ? logs.filter(l => isSent(l.status)).length : 0;
            const actualFailed = logs ? logs.filter(l => isFailed(l.status, l.error)).length : 0;
            const pendingCount = logs ? logs.filter(l => isPending(l.status, l.error)).length : 0;

            let finalStatus = 'failed';
            if (actualSent > 0 || pendingCount > 0) {
              finalStatus = 'partial';
            }

            await supabase.from('email_campaigns').update({
              sent_count: actualSent,
              failed_count: actualFailed,
              status: finalStatus,
            }).eq('id', campaign.id);

            if (detailCampaign && detailCampaign.id === campaign.id) {
              setDetailCampaign(prev => prev ? { ...prev, sent_count: actualSent, failed_count: actualFailed, status: finalStatus } : null);
              if (logs) setCampaignLogs(logs);
            }
            setCampaigns(prev => prev.map(c => c.id === campaign.id ? { ...c, sent_count: actualSent, failed_count: actualFailed, status: finalStatus } : c));

            showToast('Error during retry', err.message, 'error');
          } finally {
            setSending(false);
            setCampaignProgress(null);
            setConfirmAction(null);
          }
        }
      });
    } catch (err) {
      showToast('Error preparing retry', err.message, 'error');
      setSending(false);
    }
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
          const seen = new Set();
          const recipients = [];
          audienceList.forEach(c => {
            if (!c.email) return;
            const emailKey = c.email.trim().toLowerCase();
            if (!seen.has(emailKey)) {
              seen.add(emailKey);
              recipients.push({ email: c.email.trim(), name: c.name || '', lastOrder: c.lastOrder });
            }
          });

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
              failed_count: 0,
              status: 'sending',
            })
            .select('id')
            .single();
          if (insertErr) throw new Error(insertErr.message);
          campaignId = campaignRow.id;

          // 1.5 Pre-populate campaign_logs as 'failed' with 'Pending execution' in batches of 100
          const batchSize = 100;
          for (let i = 0; i < recipients.length; i += batchSize) {
            const batch = recipients.slice(i, i + batchSize).map(r => ({
              campaign_id: campaignId,
              email: r.email,
              name: r.name || null,
              status: 'failed',
              error: 'Pending execution'
            }));
            const { error: logErr } = await supabase
              .from('campaign_logs')
              .insert(batch);
            if (logErr) {
              throw new Error(`Failed to initialize campaign logs: ${logErr.message}`);
            }
          }

          // Regular tier: send the most-recent 1000 via Resend broadcast; the rest
          // fall through to the Gmail loop below. Other tiers send entirely via Gmail.
          let gmailRecipients = recipients;
          let resendQueued = 0;
          if (form.audience === 'regular') {
            const { resend: resendBatch, gmail: overflow } = splitRegularBatch(recipients, RESEND_AUDIENCE_CAP);
            gmailRecipients = overflow;
            if (resendBatch.length > 0) {
              setCampaignProgress({ title: `Queuing ${resendBatch.length} to Resend…`, sent: 0, failed: 0, total: recipients.length });
              const { data: bRes, error: bErr } = await supabase.functions.invoke('send-broadcast', {
                body: {
                  subject: form.subject,
                  body: form.body,
                  recipients: resendBatch.map(r => ({ email: r.email, name: r.name })),
                  campaign_id: campaignId,
                },
              });
              if (bErr) {
                console.error('send-broadcast failed:', bErr);
                showToast('Resend error', bErr.message || 'Broadcast failed; remaining sent via Gmail.', 'error');
              } else {
                resendQueued = bRes?.queued || resendBatch.length;
              }
            }
          }

          // 2. Invoke edge function in batches.
          // Keep chunks small: the edge function now waits ~1.5s between each
          // email to dodge Gmail's burst throttle, so a chunk of 15 stays well
          // under the edge-function timeout (~15 x 1.5s + send time).
          const CHUNK_SIZE = 15;
          let accumulatedSent = 0;
          let accumulatedFailed = 0;
          setCampaignProgress({ title: 'Sending Campaign...', sent: 0, failed: 0, total: recipients.length });

          for (let i = 0; i < gmailRecipients.length; i += CHUNK_SIZE) {
            const chunk = gmailRecipients.slice(i, i + CHUNK_SIZE);
            
            const { data: chunkRes, error: invokeErr } = await supabase.functions.invoke('send-campaign', {
              body: {
                subject: form.subject,
                body: form.body,
                recipients: chunk,
                campaign_id: campaignId
              }
            });

            if (invokeErr) {
              console.error(`Edge function invoke error for batch starting at index ${i}:`, invokeErr);
              accumulatedFailed += chunk.length;
              const emailsInChunk = chunk.map(r => r.email.trim());
              await supabase
                .from('campaign_logs')
                .update({
                  status: 'failed',
                  error: invokeErr.message || 'SMTP Connection Timeout or Rate Limit exceeded'
                })
                .eq('campaign_id', campaignId)
                .in('email', emailsInChunk);
            } else {
              accumulatedSent += chunkRes?.sent || 0;
              accumulatedFailed += chunkRes?.failed || 0;
            }

            // Update progress state
            setCampaignProgress({
              title: `Sending batch ${Math.floor(i / CHUNK_SIZE) + 1} of ${Math.ceil(gmailRecipients.length / CHUNK_SIZE)}...`,
              sent: accumulatedSent,
              failed: accumulatedFailed,
              total: recipients.length
            });

            // Update the email_campaigns status/counts in real-time in the database
            const isFinished = (i + CHUNK_SIZE) >= gmailRecipients.length;
            let currentStatus = 'sending';
            if (isFinished) {
              currentStatus = accumulatedFailed > 0 ? (accumulatedSent > 0 ? 'partial' : 'failed') : 'sent';
            }

            await supabase
              .from('email_campaigns')
              .update({
                sent_count: accumulatedSent,
                failed_count: accumulatedFailed,
                status: currentStatus
              })
              .eq('id', campaignId);
            
            fetchCampaigns();

            if (!isFinished) {
              await new Promise(resolve => setTimeout(resolve, 1500));
            }
          }

          if (gmailRecipients.length === 0 && resendQueued > 0) {
            await supabase.from('email_campaigns')
              .update({ status: 'sending', sent_count: 0, failed_count: 0 })
              .eq('id', campaignId);
            // Webhook will move counts/status as delivery events arrive.
          }

          setSendResult({ sent: accumulatedSent + resendQueued, failed: accumulatedFailed, resendQueued });
          setForm({ name: '', subject: '', body: DEFAULT_CAMPAIGN_BODY, audience: 'all', dateFilter: { start: null, end: null } });
          showToast('Success', resendQueued > 0
            ? `Campaign sent: ${resendQueued} queued to Resend + ${accumulatedSent} via Gmail (${accumulatedFailed} failed)`
            : `Campaign completed: ${accumulatedSent} sent, ${accumulatedFailed} failed`, 'success');
          fetchCampaigns();
        } catch (err) {
          // Mark campaign as failed/partial based on actual logs
          if (campaignId) {
            const { data: logs } = await supabase
              .from('campaign_logs')
              .select('status, error')
              .eq('campaign_id', campaignId);

            const actualSent = logs ? logs.filter(l => isSent(l.status)).length : 0;
            const actualFailed = logs ? logs.filter(l => isFailed(l.status, l.error)).length : 0;
            const pendingCount = logs ? logs.filter(l => isPending(l.status, l.error)).length : 0;
            
            let finalStatus = 'failed';
            if (actualSent > 0 || pendingCount > 0) {
              finalStatus = 'partial';
            }

            await supabase.from('email_campaigns').update({
              sent_count: actualSent,
              failed_count: actualFailed,
              status: finalStatus,
            }).eq('id', campaignId);
          }
          showToast('Error sending campaign', err.message, 'error');
          fetchCampaigns();
        } finally {
          setSending(false);
          setCampaignProgress(null);
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
      const { error } = await supabase.functions.invoke('send-campaign', {
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
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{totalCount} unique customers from order history.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => setTab('directory')} style={tabBtn(tab === 'directory')}>Directory</button>
          <button onClick={() => { setTab('tiers'); setActiveTierTab('vip'); }} style={tabBtn(tab === 'tiers')}>Customer Tiers</button>
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
          {/* KPI Cards Grid */}
          {kpiLoading ? (
            <div style={{ marginBottom: 24 }}><SkelKpiGrid count={4} /></div>
          ) : (
            <div className="kpi-grid" style={{ marginBottom: 24 }}>
              <div className="kpi-card blue">
                <div className="kpi-icon"><Users size={24} /></div>
                <div className="kpi-value">{kpis.totalCustomers}</div>
                <div className="kpi-label">Total Customers</div>
                {renderKPIBadge(growth.totalCustomers)}
              </div>

              <div className="kpi-card yellow">
                <div className="kpi-icon"><Package size={24} /></div>
                <div className="kpi-value">{kpis.totalOrders}</div>
                <div className="kpi-label">Total Orders</div>
                {renderKPIBadge(growth.totalOrders)}
              </div>
              <div className="kpi-card blue">
                <div className="kpi-icon"><UserPlus size={24} /></div>
                <div className="kpi-value">{kpis.newCustomers}</div>
                <div className="kpi-label">New Customers</div>
                {renderKPIBadge(growth.newCustomers)}
              </div>
              <div className="kpi-card green">
                <div className="kpi-icon"><Repeat2 size={24} /></div>
                <div className="kpi-value">{kpis.returningCustomers}</div>
                <div className="kpi-label">Returning Customers</div>
                {renderKPIBadge(growth.returningCustomers)}
              </div>
            </div>
          )}

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
                range={true}
                value={overviewDateFilter}
                onChange={v => {
                  setOverviewDateFilter(v);
                  setPage(1);
                }}
                placeholder="Filter by date range"
                style={{ height: '38px', boxSizing: 'border-box' }}
              />
            </div>
            
            {/* Actions */}
            <div style={{
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              flexWrap: 'wrap',
              justifyContent: 'flex-end',
              flex: '1 1 auto',
              minWidth: '280px'
            }}>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button onClick={exportCSV} style={dlBtn('#0284c7')}><Download size={14} /> CSV</button>
                <button onClick={exportExcel} style={dlBtn('#16a34a')}><Download size={14} /> Excel</button>
              </div>
            </div>
          </div>

          <div className="dash-card" style={{ padding: '16px 12px', overflow: 'hidden' }}>
            {directoryLoading ? (
              <SkelTable rows={8} cols={8} />
            ) : (
              <div className="dash-table-wrapper" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                <table className="dash-table" style={{ width: '100%', minWidth: '750px', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th onClick={() => handleSort('name')} style={thStyle('name')}>Name <SortIcon col="name" /></th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Tier</th>
                    <th onClick={() => handleSort('orders')} style={thStyle('orders')}>Orders <SortIcon col="orders" /></th>
                    <th onClick={() => handleSort('totalSpent')} style={thStyle('totalSpent')}>Total Spent <SortIcon col="totalSpent" /></th>
                    <th onClick={() => handleSort('lastOrder')} style={thStyle('lastOrder')}>Last Order <SortIcon col="lastOrder" /></th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {directoryCustomers.map(c => (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 700 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span 
                            style={{ 
                              cursor: 'pointer', 
                              color: 'var(--red)', 
                              textDecoration: 'underline', 
                              textDecorationColor: 'transparent', 
                              transition: 'all 0.2s' 
                            }}
                            onMouseEnter={e => e.target.style.textDecorationColor = 'var(--red)'}
                            onMouseLeave={e => e.target.style.textDecorationColor = 'transparent'}
                            onClick={() => openCustomerDrawer(c)}
                          >
                            {c.name}
                          </span>
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
                      <td>
                        {c.customer_group === 'vip' && (
                          <span style={{
                            fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.03em',
                            padding: '4px 10px', borderRadius: 20, whiteSpace: 'nowrap',
                            background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a',
                            display: 'inline-flex', alignItems: 'center', gap: 4
                          }}>
                            <Crown size={11} /> VIP
                          </span>
                        )}
                        {c.customer_group === 'standard' && (
                          <span style={{
                            fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.03em',
                            padding: '4px 10px', borderRadius: 20, whiteSpace: 'nowrap',
                            background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd',
                            display: 'inline-flex', alignItems: 'center', gap: 4
                          }}>
                            <Star size={11} /> Standard
                          </span>
                        )}
                        {c.customer_group === 'regular' && (
                          <span style={{
                            fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.03em',
                            padding: '4px 10px', borderRadius: 20, whiteSpace: 'nowrap',
                            background: '#f3f4f6', color: '#4b5563', border: '1px solid #e5e7eb',
                            display: 'inline-flex', alignItems: 'center', gap: 4
                          }}>
                            <User size={11} /> Regular
                          </span>
                        )}
                      </td>
                      <td style={{ fontWeight: 705 }}>{c.orders}</td>
                      <td style={{ fontWeight: 705, color: 'var(--green)', whiteSpace: 'nowrap' }}>{fmt(c.totalSpent)}</td>
                      <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {c.lastOrder ? new Date(c.lastOrder).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Never'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
                          <button
                            onClick={() => openCustomerDrawer(c)}
                            style={{
                              background: 'var(--white)',
                              border: '1px solid var(--border-subtle)',
                              borderRadius: 8,
                              padding: '6px 14px',
                              cursor: 'pointer',
                              fontSize: '0.78rem',
                              fontWeight: 750,
                              color: 'var(--text-muted)',
                              whiteSpace: 'nowrap',
                              transition: 'all 0.2s',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                            }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(192,32,31,0.4)'; e.currentTarget.style.color = 'var(--red)'; }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                          >
                            View Profile
                          </button>
                          {canDelete && (
                            <button
                              onClick={() => handleDelete(c.phone)}
                              style={{
                                background: 'rgba(192,32,31,0.06)',
                                border: '1px solid rgba(192,32,31,0.2)',
                                borderRadius: 8,
                                padding: '6px 10px',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                              onMouseEnter={e => { e.currentTarget.style.background = 'var(--red)'; e.currentTarget.style.borderColor = 'var(--red)'; e.currentTarget.style.color = '#fff'; }}
                              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(192,32,31,0.06)'; e.currentTarget.style.borderColor = 'rgba(192,32,31,0.2)'; e.currentTarget.style.color = 'var(--red)'; }}
                              title="Delete Customer"
                            >
                              <Trash2 size={14} style={{ display: 'block' }} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {directoryCustomers.length === 0 && (
                    <tr>
                      <td colSpan="8" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>No customers found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            )}
            <Pagination page={page} total={totalCount} perPage={PER_PAGE} onChange={setPage} />
          </div>
        </>
      )}

      {/* ── CUSTOMER TIERS TAB ── */}
      {tab === 'tiers' && (
        <>
          {/* Interactive Tier Sub-tabs (VIP, Standard, Regular Cards) */}
          {/* Interactive Tier Sub-tabs (VIP, Standard, Regular Cards) */}
          <div className="kpi-grid" style={{ marginBottom: 24 }}>
            {/* VIP Card */}
            <div 
              onClick={() => setActiveTierTab('vip')}
              className="kpi-card"
              style={{
                cursor: 'pointer',
                borderColor: activeTierTab === 'vip' ? 'var(--red)' : undefined,
                background: activeTierTab === 'vip' ? 'rgba(192, 32, 31, 0.03)' : undefined,
                boxShadow: activeTierTab === 'vip' ? '0 8px 24px rgba(192, 32, 31, 0.08)' : undefined,
                transform: activeTierTab === 'vip' ? 'translateY(-2px)' : undefined,
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
            >
              <div className="kpi-icon" style={{ background: '#fef3c7', color: '#b45309', marginBottom: 20 }}>
                <Crown size={24} />
              </div>
              <div className="kpi-value">{groupCounts.vip}</div>
              <div className="kpi-label">VIP Customers</div>
              
              <div style={{
                position: 'absolute', top: 24, right: 24,
                background: activeTierTab === 'vip' ? 'rgba(192, 32, 31, 0.1)' : 'var(--card-bg2)',
                color: activeTierTab === 'vip' ? 'var(--red)' : 'var(--text-muted)',
                fontWeight: 800,
                fontSize: '0.72rem',
                padding: '4px 10px',
                borderRadius: '20px',
                border: '1px solid var(--border-subtle)',
                whiteSpace: 'nowrap'
              }} title="Spend requirement">
                {groupTimeframe === 'week' ? '₦15k+' : groupTimeframe === 'month' ? '₦40k+' : '₦150k+'}
              </div>
            </div>

            {/* Standard Card */}
            <div 
              onClick={() => setActiveTierTab('standard')}
              className="kpi-card"
              style={{
                cursor: 'pointer',
                borderColor: activeTierTab === 'standard' ? 'var(--red)' : undefined,
                background: activeTierTab === 'standard' ? 'rgba(192, 32, 31, 0.03)' : undefined,
                boxShadow: activeTierTab === 'standard' ? '0 8px 24px rgba(192, 32, 31, 0.08)' : undefined,
                transform: activeTierTab === 'standard' ? 'translateY(-2px)' : undefined,
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
            >
              <div className="kpi-icon" style={{ background: '#e0f2fe', color: '#0369a1', marginBottom: 20 }}>
                <Star size={24} />
              </div>
              <div className="kpi-value">{groupCounts.standard}</div>
              <div className="kpi-label">Standard Customers</div>
              
              <div style={{
                position: 'absolute', top: 24, right: 24,
                background: activeTierTab === 'standard' ? 'rgba(192, 32, 31, 0.1)' : 'var(--card-bg2)',
                color: activeTierTab === 'standard' ? 'var(--red)' : 'var(--text-muted)',
                fontWeight: 800,
                fontSize: '0.72rem',
                padding: '4px 10px',
                borderRadius: '20px',
                border: '1px solid var(--border-subtle)',
                whiteSpace: 'nowrap'
              }} title="Spend requirement">
                {groupTimeframe === 'week' ? '₦5k+' : groupTimeframe === 'month' ? '₦15k+' : '₦50k+'}
              </div>
            </div>

            {/* Regular Card */}
            <div 
              onClick={() => setActiveTierTab('regular')}
              className="kpi-card"
              style={{
                cursor: 'pointer',
                borderColor: activeTierTab === 'regular' ? 'var(--red)' : undefined,
                background: activeTierTab === 'regular' ? 'rgba(192, 32, 31, 0.03)' : undefined,
                boxShadow: activeTierTab === 'regular' ? '0 8px 24px rgba(192, 32, 31, 0.08)' : undefined,
                transform: activeTierTab === 'regular' ? 'translateY(-2px)' : undefined,
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
            >
              <div className="kpi-icon" style={{ background: '#f3f4f6', color: '#4b5563', marginBottom: 20 }}>
                <User size={24} />
              </div>
              <div className="kpi-value">{groupCounts.regular}</div>
              <div className="kpi-label">Regular Customers</div>
              
              <div style={{
                position: 'absolute', top: 24, right: 24,
                background: activeTierTab === 'regular' ? 'rgba(192, 32, 31, 0.1)' : 'var(--card-bg2)',
                color: activeTierTab === 'regular' ? 'var(--red)' : 'var(--text-muted)',
                fontWeight: 800,
                fontSize: '0.72rem',
                padding: '4px 10px',
                borderRadius: '20px',
                border: '1px solid var(--border-subtle)',
                whiteSpace: 'nowrap'
              }} title="Spend requirement">
                Regular
              </div>
            </div>
          </div>

          {/* Filters Bar */}
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
                  placeholder="Search tier customers..."
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
              
              <CustomSelect
                value={groupTimeframe}
                onChange={e => {
                  setGroupTimeframe(e.target.value);
                  setPage(1);
                }}
                options={[
                  { value: 'all_time', label: 'Group: All-Time Tiers' },
                  { value: 'month', label: 'Group: Last 30 Days Tiers' },
                  { value: 'week', label: 'Group: Last 7 Days Tiers' },
                ]}
                style={{ width: 180, height: '38px', boxSizing: 'border-box' }}
              />
            </div>

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

          {/* Tiers Table View */}
          <div className="dash-card" style={{ padding: '16px 12px', overflow: 'hidden' }}>
            <div className="dash-table-wrapper" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <table className="dash-table" style={{ width: '100%', minWidth: '750px', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th onClick={() => handleSort('name')} style={thStyle('name')}>Name <SortIcon col="name" /></th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Tier</th>
                    <th onClick={() => handleSort('orders')} style={thStyle('orders')}>Orders <SortIcon col="orders" /></th>
                    <th onClick={() => handleSort('totalSpent')} style={thStyle('totalSpent')}>Total Spent <SortIcon col="totalSpent" /></th>
                    <th onClick={() => handleSort('lastOrder')} style={thStyle('lastOrder')}>Last Order <SortIcon col="lastOrder" /></th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {directoryCustomers.map(c => (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 700 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span 
                            style={{ 
                              cursor: 'pointer', 
                              color: 'var(--red)', 
                              textDecoration: 'underline', 
                              textDecorationColor: 'transparent', 
                              transition: 'all 0.2s' 
                            }}
                            onMouseEnter={e => e.target.style.textDecorationColor = 'var(--red)'}
                            onMouseLeave={e => e.target.style.textDecorationColor = 'transparent'}
                            onClick={() => openCustomerDrawer(c)}
                          >
                            {c.name}
                          </span>
                          {c.orders === 1 && (
                            <span style={{
                              fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.03em',
                              padding: '2px 8px', borderRadius: 20, flexShrink: 0,
                              background: '#dbeafe', color: '#1d4ed8'
                            }}>
                              New
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.email}>
                        {c.email || <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>{c.phone || '—'}</td>
                      <td>
                        {c.customer_group === 'vip' && (
                          <span style={{
                            fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.03em',
                            padding: '4px 10px', borderRadius: 20, whiteSpace: 'nowrap',
                            background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a',
                            display: 'inline-flex', alignItems: 'center', gap: 4
                          }}>
                            <Crown size={11} /> VIP
                          </span>
                        )}
                        {c.customer_group === 'standard' && (
                          <span style={{
                            fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.03em',
                            padding: '4px 10px', borderRadius: 20, whiteSpace: 'nowrap',
                            background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd',
                            display: 'inline-flex', alignItems: 'center', gap: 4
                          }}>
                            <Star size={11} /> Standard
                          </span>
                        )}
                        {c.customer_group === 'regular' && (
                          <span style={{
                            fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.03em',
                            padding: '4px 10px', borderRadius: 20, whiteSpace: 'nowrap',
                            background: '#f3f4f6', color: '#4b5563', border: '1px solid #e5e7eb',
                            display: 'inline-flex', alignItems: 'center', gap: 4
                          }}>
                            <User size={11} /> Regular
                          </span>
                        )}
                      </td>
                      <td style={{ fontWeight: 705 }}>{c.orders}</td>
                      <td style={{ fontWeight: 705, color: 'var(--green)', whiteSpace: 'nowrap' }}>{fmt(c.totalSpent)}</td>
                      <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {c.lastOrder ? new Date(c.lastOrder).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Never'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
                          <button
                            onClick={() => openCustomerDrawer(c)}
                            style={{
                              background: 'var(--white)',
                              border: '1px solid var(--border-subtle)',
                              borderRadius: 8,
                              padding: '6px 14px',
                              cursor: 'pointer',
                              fontSize: '0.78rem',
                              fontWeight: 750,
                              color: 'var(--text-muted)',
                              whiteSpace: 'nowrap',
                              transition: 'all 0.2s',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                            }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(192,32,31,0.4)'; e.currentTarget.style.color = 'var(--red)'; }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                          >
                            View Profile
                          </button>
                          {canDelete && (
                            <button
                              onClick={() => handleDelete(c.phone)}
                              style={{
                                background: 'rgba(192,32,31,0.06)',
                                border: '1px solid rgba(192,32,31,0.2)',
                                borderRadius: 8,
                                padding: '6px 10px',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                              onMouseEnter={e => { e.currentTarget.style.background = 'var(--red)'; e.currentTarget.style.borderColor = 'var(--red)'; e.currentTarget.style.color = '#fff'; }}
                              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(192,32,31,0.06)'; e.currentTarget.style.borderColor = 'rgba(192,32,31,0.2)'; e.currentTarget.style.color = 'var(--red)'; }}
                              title="Delete Customer"
                            >
                              <Trash2 size={14} style={{ display: 'block' }} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {directoryCustomers.length === 0 && (
                    <tr>
                      <td colSpan="8" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>No customers found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <Pagination page={page} total={totalCount} perPage={PER_PAGE} onChange={setPage} />
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
          <div className="campaigns-grid">
            {/* LEFT COLUMN: COMPOSE FORM */}
            <div className="dash-card" style={{ margin: 0, borderTop: '4px solid var(--red)' }}>
              <div className="dash-card-header" style={{ marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid var(--border-subtle)' }}>
                <div className="dash-card-title" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '1.15rem' }}>
                  <Sparkles size={20} color="var(--red)" />
                  Compose Campaign
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4, fontWeight: 500 }}>
                  Craft and send premium personalized emails to target your customer segments.
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 6 }}>Campaign Name</label>
                <input
                  placeholder="e.g. Easter Weekend Promo"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="premium-input"
                />
              </div>

              <div className="form-group" style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 6 }}>Target Audience</label>
                <CustomSelect
                  value={form.audience}
                  onChange={e => setForm(f => ({ ...f, audience: e.target.value }))}
                  options={AUDIENCE_OPTIONS}
                  style={{ width: '100%' }}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 6 }}>Last Order Date Range (Optional)</label>
                <DashCalendar
                  range={true}
                  value={form.dateFilter}
                  onChange={v => setForm(f => ({ ...f, dateFilter: v }))}
                  placeholder="Filter by customer last order date range"
                  wrapperStyle={{ width: '100%' }}
                />
              </div>





              {/* Audience preview + send button */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', background: 'var(--card-bg2)', borderRadius: 10, flexWrap: 'wrap', gap: 12, border: '1px solid var(--border-subtle)', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.01)' }}>
                <div style={{ fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Recipients: </span>
                  <span style={{ fontWeight: 900, color: audienceList.length > 0 ? '#16a34a' : '#dc2626' }}>{audienceList.length}</span>
                  <span style={{ color: 'var(--text-muted)', marginLeft: 10 }}>·</span>
                  <span style={{ color: 'var(--text-muted)', marginLeft: 10, fontWeight: 500 }}>{noEmailCount} without email</span>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    onClick={sendTestCampaign}
                    disabled={sending || sendingTest}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '10px 20px', borderRadius: 8, border: '1px solid var(--border-subtle)',
                      background: 'var(--white)',
                      color: 'var(--text)', fontWeight: 700, fontSize: '0.85rem',
                      cursor: sending || sendingTest ? 'not-allowed' : 'pointer',
                      fontFamily: "'DM Sans',sans-serif",
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={e => { if (!sending && !sendingTest) { e.currentTarget.style.background = 'var(--black2)'; } }}
                    onMouseLeave={e => { if (!sending && !sendingTest) { e.currentTarget.style.background = 'var(--white)'; } }}
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
                      color: '#fff', fontWeight: 750, fontSize: '0.85rem',
                      cursor: sending || sendingTest || audienceList.length === 0 ? 'not-allowed' : 'pointer',
                      fontFamily: "'DM Sans',sans-serif",
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={e => { if (!sending && !sendingTest && audienceList.length > 0) { e.currentTarget.style.background = 'var(--red-dark)'; } }}
                    onMouseLeave={e => { if (!sending && !sendingTest && audienceList.length > 0) { e.currentTarget.style.background = 'var(--red)'; } }}
                  >
                    {sending
                      ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Sending...</>
                      : <><Send size={15} /> Send Campaign</>
                    }
                  </button>
                </div>
              </div>

              {campaignProgress && (
                <div style={{ width: '100%', marginTop: 12, padding: '12px 16px', background: 'var(--black2)', border: '1px solid var(--border-subtle)', borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', fontWeight: 700 }}>
                    <span style={{ color: 'var(--red)' }}>{campaignProgress.title || 'Sending Campaign...'}</span>
                    <span style={{ color: 'var(--text)' }}>{campaignProgress.sent + campaignProgress.failed} / {campaignProgress.total} ({Math.round(((campaignProgress.sent + campaignProgress.failed) / campaignProgress.total) * 100)}%)</span>
                  </div>
                  <div style={{ height: 6, background: 'rgba(0,0,0,0.1)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: 'var(--red)', width: `${((campaignProgress.sent + campaignProgress.failed) / (campaignProgress.total || 1)) * 100}%`, transition: 'width 0.3s ease' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                    <span style={{ color: '#16a34a', fontWeight: 600 }}>Delivered: {campaignProgress.sent}</span>
                    <span style={{ color: '#dc2626', fontWeight: 600 }}>Failed: {campaignProgress.failed}</span>
                  </div>
                </div>
              )}

              {/* COLLAPSIBLE MAILING LIST ACCORDION */}
              <div className="dash-card" style={{ margin: '20px 0 0 0', padding: '16px 20px', border: '1px solid var(--border-subtle)', boxShadow: '0 2px 8px rgba(0,0,0,0.01)' }}>
                <div 
                  onClick={() => setMailingListExpanded(!mailingListExpanded)}
                  style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    cursor: 'pointer',
                    userSelect: 'none'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Users size={18} color="var(--red)" />
                    <span style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text)' }}>
                      Configure Recipients
                    </span>
                    <span style={{ 
                      padding: '2px 8px', 
                      borderRadius: 12, 
                      background: 'rgba(22,163,74,0.08)', 
                      color: '#16a34a', 
                      fontSize: '0.72rem', 
                      fontWeight: 800 
                    }}>
                      {audienceList.length} selected
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                      {mailingListExpanded ? 'Hide details' : 'Customize exclusions'}
                    </span>
                    <ChevronDown 
                      size={16} 
                      style={{ 
                        transform: mailingListExpanded ? 'rotate(180deg)' : 'none', 
                        transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)', 
                        color: 'var(--text-muted)' 
                      }} 
                    />
                  </div>
                </div>

                <div className={`accordion-wrapper${mailingListExpanded ? ' expanded' : ' collapsed'}`}>
                  <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 16, marginTop: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                        Search and uncheck customers to exclude them from this mailing list.
                      </div>
                      {excludedEmails.size > 0 && (
                        <button
                          onClick={() => setExcludedEmails(new Set())}
                          style={{
                            background: 'none', border: 'none', color: 'var(--red)',
                            fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer',
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
                        className="premium-input"
                        style={{ paddingLeft: 36, fontSize: '0.85rem' }}
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
                              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 650 }}>
                                {searched.filter(c => !excludedEmails.has(c.email.trim().toLowerCase())).length} selected
                              </div>
                            </div>
                          )}

                          {/* Scrollable list */}
                          <div className="custom-scrollbar" style={{
                            maxHeight: '260px', overflowY: 'auto',
                            display: 'flex', flexDirection: 'column', gap: 8,
                            paddingRight: 4
                          }}>
                            {audienceLoading ? (
                              <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                <Loader2 size={16} className="spin" style={{ display: 'inline-block', marginRight: 8, verticalAlign: 'middle' }} />
                                Loading audience preview...
                              </div>
                            ) : (
                              <>
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
                                        display: 'flex', alignItems: 'center', justifySpace: 'between',
                                        padding: '10px 12px', background: isExcluded ? 'rgba(0,0,0,0.03)' : 'var(--black2)',
                                        borderRadius: 8, border: '1px solid var(--border-subtle)',
                                        opacity: isExcluded ? 0.55 : 1, transition: 'all 0.15s'
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
                                          {editingEmailId === c.id ? (
                                            <div 
                                              style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}
                                              onClick={e => e.stopPropagation()}
                                            >
                                              <input
                                                type="text"
                                                value={editedEmailValue}
                                                onChange={e => setEditedEmailValue(e.target.value)}
                                                style={{
                                                  background: 'var(--black1)',
                                                  border: '1px solid var(--border-subtle)',
                                                  borderRadius: 6,
                                                  padding: '2px 8px',
                                                  fontSize: '0.75rem',
                                                  color: 'var(--text)',
                                                  width: '100%',
                                                  maxWidth: 240,
                                                  fontFamily: 'inherit'
                                                }}
                                                autoFocus
                                              />
                                              <button
                                                onClick={() => saveEditedEmail(c.id, c.email)}
                                                style={{ 
                                                  background: '#16a34a', 
                                                  color: '#fff', 
                                                  border: 'none', 
                                                  borderRadius: 4, 
                                                  padding: '4px 8px', 
                                                  fontSize: '0.7rem', 
                                                  fontWeight: 700, 
                                                  cursor: 'pointer' 
                                                }}
                                              >
                                                Save
                                              </button>
                                              <button
                                                onClick={() => setEditingEmailId(null)}
                                                style={{ 
                                                  background: 'var(--black3)', 
                                                  color: 'var(--text-muted)', 
                                                  border: '1px solid var(--border-subtle)', 
                                                  borderRadius: 4, 
                                                  padding: '4px 8px', 
                                                  fontSize: '0.7rem', 
                                                  fontWeight: 500,
                                                  cursor: 'pointer' 
                                                }}
                                              >
                                                Cancel
                                              </button>
                                            </div>
                                          ) : (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {c.email}
                                              </span>
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  e.preventDefault();
                                                  setEditingEmailId(c.id);
                                                  setEditedEmailValue(c.email);
                                                }}
                                                style={{
                                                  background: 'rgba(192,32,31,0.08)',
                                                  border: 'none',
                                                  borderRadius: 4,
                                                  cursor: 'pointer',
                                                  padding: '2px 6px',
                                                  fontSize: '0.68rem',
                                                  color: 'var(--red)',
                                                  fontWeight: 800,
                                                  transition: 'all 0.15s'
                                                }}
                                                onMouseEnter={el => el.currentTarget.style.background = 'var(--red)'}
                                                onMouseLeave={el => { el.currentTarget.style.background = 'rgba(192,32,31,0.08)'; el.currentTarget.style.color = 'var(--red)'; }}
                                              >
                                                Edit Email
                                              </button>
                                            </div>
                                          )}
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
                              </>
                            )}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: LIVE EMAIL MOCKUP PREVIEW */}
            <div className="dash-card" style={{ margin: 0, position: 'sticky', top: 20, boxShadow: '0 8px 32px rgba(0,0,0,0.04)', borderTop: '4px solid var(--red)' }}>
              <div className="dash-card-header" style={{ marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid var(--border-subtle)' }}>
                <div className="dash-card-title" style={{ fontSize: '1.15rem' }}>Live Preview</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4, fontWeight: 500 }}>
                  Real-time preview of how customers will receive your email.
                </div>
              </div>
              
              {/* Mockup email client container */}
              <div style={{
                background: 'var(--white)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 14,
                boxShadow: '0 16px 48px rgba(0,0,0,0.08)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                transition: 'all 0.3s ease'
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
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                    Smokey Mail preview
                  </span>
                  <div style={{ width: 42 }}></div> {/* Spacer */}
                </div>

                {/* Email metadata header */}
                <div style={{ padding: '16px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--white)', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex' }}>
                    <span style={{ width: 64, color: 'var(--text-muted)', fontWeight: 700 }}>From:</span>
                    <span style={{ color: 'var(--text)', fontWeight: 800 }}>
                      Smokeyhut Delight <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>&lt;Smokeyhutdelight01@gmail.com&gt;</span>
                    </span>
                  </div>
                  <div style={{ display: 'flex' }}>
                    <span style={{ width: 64, color: 'var(--text-muted)', fontWeight: 700 }}>To:</span>
                    <span style={{ color: 'var(--text)', fontWeight: 700 }}>
                      Sarah Olowookere <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>&lt;sarah.o@gmail.com&gt;</span>
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', borderTop: '1px solid rgba(0,0,0,0.03)', paddingTop: 8 }}>
                    <span style={{ width: 64, color: 'var(--text-muted)', fontWeight: 700 }}>Subject:</span>
                    <input
                      type="text"
                      placeholder="Enter a subject line..."
                      value={form.subject}
                      onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                      style={{
                        flex: 1,
                        background: 'transparent',
                        border: 'none',
                        outline: 'none',
                        color: 'var(--text)',
                        fontWeight: 800,
                        fontSize: '0.85rem',
                        fontFamily: 'inherit',
                        padding: 0,
                      }}
                    />
                  </div>
                </div>

                {/* Email body preview area */}
                <div style={{
                  background: '#111',
                  padding: '24px',
                  fontFamily: 'Arial, sans-serif'
                }}>
                  <div style={{
                    maxWidth: '100%',
                    background: '#1a1a1a',
                    borderRadius: 12,
                    overflow: 'hidden',
                    border: '1px solid rgba(255,255,255,0.05)'
                  }}>
                    {/* Header banner */}
                    <div style={{ background: 'var(--red)', padding: '20px 24px', textAlign: 'center' }}>
                      <div style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 10 }}>
                        <img src="/logo.svg" alt="Smokeyhut Logo" style={{ height: 36, display: 'block' }} />
                      </div>
                      <div style={{ display: 'inline-block', verticalAlign: 'middle' }}>
                        <span style={{ color: '#fff', fontSize: '1.2rem', letterSpacing: '0.04em', fontWeight: 900, fontFamily: 'Arial, sans-serif' }}>
                          Smokeyhut Delight
                        </span>
                      </div>
                    </div>
                    {/* Content (Inline WYSIWYG Message Body Editor) */}
                    <div style={{ padding: '28px 24px', minHeight: '180px' }}>
                      <input
                        type="text"
                        placeholder="Campaign Subject"
                        value={form.subject}
                        onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                        style={{
                          width: '100%',
                          background: 'transparent',
                          border: 'none',
                          outline: 'none',
                          color: '#fff',
                          marginTop: 0,
                          marginBottom: 20,
                          fontSize: '1.25rem',
                          fontWeight: 'bold',
                          fontFamily: 'Arial, sans-serif',
                          borderBottom: '1px solid rgba(255,255,255,0.05)',
                          paddingBottom: 12,
                        }}
                      />
                      
                      {/* Interactive edit helper inside the preview mockup */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12, borderBottom: '1px dashed rgba(255,255,255,0.08)', marginBottom: 16 }}>
                        <span style={{ fontSize: '0.75rem', color: '#888', fontWeight: 705, display: 'flex', alignItems: 'center', gap: 6 }}>
                          ✏️ Edit Email Content Directly Below
                        </span>
                        <span style={{ fontSize: '0.72rem', color: '#888', fontWeight: 500 }}>
                          Click <span onClick={() => setForm(f => ({ ...f, body: f.body + '{customer_name}' }))} className="personalization-tag" style={{ border: '1px dashed rgba(255,255,255,0.2)', color: '#fff', background: 'rgba(255,255,255,0.05)' }} title="Insert customer name tag">{'{customer_name}'}</span> to personalize
                        </span>
                      </div>

                      <textarea
                        rows={12}
                        placeholder="Write your email body here... Click to edit. Use {customer_name} to insert customer name personalization."
                        value={form.body}
                        onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                        style={{
                          width: '100%',
                          minHeight: '260px',
                          background: 'transparent',
                          border: 'none',
                          outline: 'none',
                          color: '#ccc',
                          fontFamily: 'Arial, sans-serif',
                          fontSize: '0.88rem',
                          lineHeight: 1.8,
                          resize: 'vertical',
                          padding: 0,
                        }}
                      />
                    </div>
                    {/* Footer */}
                    <div style={{
                      padding: '16px 20px',
                      background: '#0c0c0c',
                      textAlign: 'center',
                      fontSize: '0.72rem',
                      color: '#555',
                      lineHeight: '1.6',
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
          <div className="dash-card" style={{ borderTop: '4px solid var(--red)' }}>
            <div className="dash-card-header" style={{ marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid var(--border-subtle)' }}>
              <div className="dash-card-title" style={{ fontSize: '1.15rem' }}>Campaign History</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4, fontWeight: 500 }}>
                Historical log of all sent and pending email campaigns.
              </div>
            </div>
            {campsLoading ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: 10 }} />
                <div>Loading campaigns...</div>
              </div>
            ) : campaigns.length === 0 ? (
              <div style={{ padding: '50px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <Mail size={36} style={{ opacity: 0.3, marginBottom: 12 }} />
                <div style={{ fontWeight: 700, marginBottom: 4 }}>No campaigns sent yet</div>
                <div style={{ fontSize: '0.85rem' }}>Compose and send your first mailing list promo above.</div>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th>Campaign</th><th>Subject</th><th>Audience</th>
                      <th>Recipients</th><th>Delivery (Sent/Failed)</th><th>Status</th><th>Date</th><th></th>
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
                            padding: '6px 14px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 800,
                            textTransform: 'uppercase', letterSpacing: '0.04em', display: 'inline-flex', alignItems: 'center', ...styleMap
                          }}>
                            <span className={`pulse-dot ${status}`} />
                            {status}
                          </span>
                        );
                      };
                      const total = c.recipient_count || 0;
                      const delivered = c.sent_count || 0;
                      const failed = c.failed_count || 0;
                      const remaining = Math.max(0, total - (delivered + failed));
                      const successPct = total > 0 ? (delivered / total) * 100 : 0;
                      const failPct = total > 0 ? (failed / total) * 100 : 0;
                      return (
                        <tr key={c.id} style={{ transition: 'background 0.2s' }}>
                          <td style={{ fontWeight: 800, color: 'var(--text)' }}>{c.name}</td>
                          <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.subject}</td>
                          <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                            {AUDIENCE_OPTIONS.find(o => o.value === c.audience)?.label || c.audience}
                          </td>
                          <td style={{ fontWeight: 700, color: 'var(--text)' }}>{c.recipient_count ?? '—'}</td>
                          <td style={{ verticalAlign: 'middle' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              <div style={{ fontSize: '0.82rem' }}>
                                <span style={{ color: '#16a34a', fontWeight: 800 }} title="Delivered">{delivered}</span>
                                {failed > 0 && <span style={{ color: '#dc2626', fontWeight: 800, marginLeft: 4 }} title="Failed">/ {failed} failed</span>}
                                {remaining > 0 && <span style={{ color: 'var(--text-muted)', fontWeight: 600, marginLeft: 4 }} title="Remaining">/ {remaining} remaining</span>}
                              </div>
                              {total > 0 && (
                                <div className="delivery-progress-container" title={`${Math.round(successPct)}% delivered, ${Math.round(failPct)}% failed`}>
                                  <div className="delivery-progress-success" style={{ width: `${successPct}%` }} />
                                  <div className="delivery-progress-fail" style={{ width: `${failPct}%` }} />
                                </div>
                              )}
                            </div>
                          </td>
                          <td>{getStatusBadge(c.status)}</td>
                          <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                            {new Date(c.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button
                                onClick={() => viewCampaignDetail(c)}
                                style={{ background: 'var(--white)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 750, color: 'var(--text-muted)', whiteSpace: 'nowrap', transition: 'all 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}
                                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(192,32,31,0.4)'; e.currentTarget.style.color = 'var(--red)'; }}
                                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                              >
                                View Details
                              </button>
                              {(failed > 0 || remaining > 0) && (
                                <button
                                  disabled={sending}
                                  onClick={() => handleRetryFailed(c)}
                                  style={{
                                    background: 'rgba(192,32,31,0.06)',
                                    border: '1px solid rgba(192,32,31,0.2)',
                                    borderRadius: 8,
                                    padding: '6px 14px',
                                    cursor: sending ? 'not-allowed' : 'pointer',
                                    fontSize: '0.78rem',
                                    fontWeight: 750,
                                    color: 'var(--red)',
                                    whiteSpace: 'nowrap',
                                    transition: 'all 0.2s',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                                  }}
                                  onMouseEnter={e => { if (!sending) { e.currentTarget.style.background = 'var(--red)'; e.currentTarget.style.color = '#fff'; } }}
                                  onMouseLeave={e => { if (!sending) { e.currentTarget.style.background = 'rgba(192,32,31,0.06)'; e.currentTarget.style.color = 'var(--red)'; } }}
                                >
                                  Retry Failed
                                </button>
                              )}
                            </div>
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

      {/* ── Customer Profile Drawer ── */}
      <div 
        className={`dash-drawer-overlay ${selectedCustomer ? 'open' : ''}`} 
        onClick={() => setSelectedCustomer(null)}
      />
      <div className={`dash-drawer ${selectedCustomer ? 'open' : ''}`}>
        {selectedCustomer && (
          <>
            <div className="dash-drawer-header">
              {drawerMode === 'email' ? (
                <>
                  <div>
                    <h3 style={{ margin: 0, fontFamily: "'Mona Sans', sans-serif", fontSize: '1.2rem', color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Mail size={20} /> Direct Email
                    </h3>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                      Reach out to {selectedCustomer.name} directly via email
                    </p>
                  </div>
                  <button 
                    onClick={() => setDrawerMode('profile')} 
                    style={{ 
                      background: 'var(--black2)', 
                      border: '1px solid var(--border-subtle)', 
                      borderRadius: 8, 
                      cursor: 'pointer', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      padding: '6px 12px',
                      fontSize: '0.78rem', 
                      fontWeight: 750, 
                      color: 'var(--text)', 
                      marginRight: 10,
                      marginLeft: 'auto',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--red)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-subtle)'}
                  >
                    Back
                  </button>
                </>
              ) : (
                <div>
                  <h3 style={{ margin: 0, fontFamily: "'Mona Sans', sans-serif", fontSize: '1.2rem', color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <User size={20} /> Customer Profile
                  </h3>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                    Detailed history and customer information
                  </p>
                </div>
              )}
              <button className="dash-drawer-close" onClick={() => setSelectedCustomer(null)}><X size={16} /></button>
            </div>

            <div className="dash-drawer-content" style={{ display: 'flex', flexDirection: 'column', gap: 20, height: '100%', overflow: 'hidden' }}>
              {drawerMode === 'email' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%', overflowY: 'auto', paddingRight: 4 }}>
                  {/* Recipient Field */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 6 }}>Recipient Email</label>
                    <input
                      disabled
                      value={selectedCustomer.email || 'No email address registered.'}
                      className="premium-input"
                      style={{ background: 'var(--card-bg2)', cursor: 'not-allowed', width: '100%', boxSizing: 'border-box' }}
                    />
                    {!selectedCustomer.email && (
                      <p style={{ fontSize: '0.75rem', color: 'var(--red)', marginTop: 4, fontWeight: 600 }}>
                        ⚠️ Cannot send email: Customer has no email address.
                      </p>
                    )}
                  </div>

                  {/* Templates Quick Selection */}
                  {selectedCustomer.email && (
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 8 }}>Quick Templates</label>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {SINGLE_EMAIL_TEMPLATES.map((tmpl) => (
                          <button
                            key={tmpl.name}
                            onClick={() => {
                              setSingleEmailSubject(tmpl.subject);
                              setSingleEmailBody(tmpl.body(selectedCustomer.name));
                            }}
                            style={{
                              background: 'var(--white)',
                              border: '1px solid var(--border-subtle)',
                              borderRadius: 20,
                              padding: '4px 12px',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              color: 'var(--text)',
                              cursor: 'pointer',
                              transition: 'all 0.2s',
                            }}
                            onMouseEnter={e => {
                              e.currentTarget.style.borderColor = 'var(--red)';
                              e.currentTarget.style.color = 'var(--red)';
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.borderColor = 'var(--border-subtle)';
                              e.currentTarget.style.color = 'var(--text)';
                            }}
                          >
                            {tmpl.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Subject Field */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 6 }}>Subject</label>
                    <input
                      placeholder="Enter email subject..."
                      value={singleEmailSubject}
                      onChange={e => setSingleEmailSubject(e.target.value)}
                      className="premium-input"
                      disabled={!selectedCustomer.email || sendingSingleEmail}
                      style={{ width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>

                  {/* Message Body Field */}
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 180 }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 6 }}>Message Body</label>
                    <textarea
                      placeholder="Write your email here..."
                      value={singleEmailBody}
                      onChange={e => setSingleEmailBody(e.target.value)}
                      className="premium-input"
                      style={{ flex: 1, minHeight: 180, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5, width: '100%', boxSizing: 'border-box' }}
                      disabled={!selectedCustomer.email || sendingSingleEmail}
                    />
                  </div>
                </div>
              ) : (
                <>
                  {/* Profile Overview */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, background: 'var(--card-bg2)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: 16 }}>
                    <div style={{
                      width: 56, height: 56, borderRadius: '50%',
                      background: 'var(--red)', color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '1.25rem', fontWeight: 800, flexShrink: 0
                    }}>
                      {(() => {
                        const name = selectedCustomer.name || '';
                        return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?';
                      })()}
                    </div>
                    <div>
                      <div style={{ fontWeight: 850, fontSize: '1.1rem', color: 'var(--text)', marginBottom: 4 }}>
                        {selectedCustomer.name}
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        {selectedCustomer.customer_group === 'vip' && (
                          <span style={{
                            fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.03em',
                            padding: '3px 8px', borderRadius: 20,
                            background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a',
                            display: 'inline-flex', alignItems: 'center', gap: 4
                          }}>
                            <Crown size={11} /> VIP Member
                          </span>
                        )}
                        {selectedCustomer.customer_group === 'standard' && (
                          <span style={{
                            fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.03em',
                            padding: '3px 8px', borderRadius: 20,
                            background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd',
                            display: 'inline-flex', alignItems: 'center', gap: 4
                          }}>
                            <Star size={11} /> Standard Member
                          </span>
                        )}
                        {selectedCustomer.customer_group === 'regular' && (
                          <span style={{
                            fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.03em',
                            padding: '3px 8px', borderRadius: 20,
                            background: '#f3f4f6', color: '#4b5563', border: '1px solid #e5e7eb',
                            display: 'inline-flex', alignItems: 'center', gap: 4
                          }}>
                            <User size={11} /> Regular Member
                          </span>
                        )}

                        {/* Dynamic Active Status Retention Badge */}
                        {(() => {
                          if (!selectedCustomer.lastOrder) {
                            return (
                              <span style={{
                                fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.03em',
                                padding: '3px 8px', borderRadius: 20,
                                background: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca',
                                display: 'inline-flex', alignItems: 'center'
                              }}>
                                Churned
                              </span>
                            );
                          }
                          const lastDate = new Date(selectedCustomer.lastOrder);
                          const now = new Date();
                          const lastMidnight = new Date(lastDate.getFullYear(), lastDate.getMonth(), lastDate.getDate());
                          const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                          const diffDays = Math.floor((nowMidnight - lastMidnight) / (1000 * 60 * 60 * 24));
                          
                          if (diffDays <= 30) {
                            return (
                              <span style={{
                                fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.03em',
                                padding: '3px 8px', borderRadius: 20,
                                background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0',
                                display: 'inline-flex', alignItems: 'center'
                              }}>
                                Active
                              </span>
                            );
                          } else if (diffDays <= 60) {
                            return (
                              <span style={{
                                fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.03em',
                                padding: '3px 8px', borderRadius: 20,
                                background: '#fef9c3', color: '#854d0e', border: '1px solid #fef08a',
                                display: 'inline-flex', alignItems: 'center'
                              }}>
                                Inactive
                              </span>
                            );
                          } else if (diffDays <= 90) {
                            return (
                              <span style={{
                                fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.03em',
                                padding: '3px 8px', borderRadius: 20,
                                background: '#ffedd5', color: '#9a3412', border: '1px solid #fed7aa',
                                display: 'inline-flex', alignItems: 'center'
                              }}>
                                Slipped
                              </span>
                            );
                          } else {
                            return (
                              <span style={{
                                fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.03em',
                                padding: '3px 8px', borderRadius: 20,
                                background: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca',
                                display: 'inline-flex', alignItems: 'center'
                              }}>
                                Churned
                              </span>
                            );
                          }
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* Contact Details */}
                  <div style={{ background: 'var(--white)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: 16 }}>
                    <h4 style={{ margin: '0 0 12px 0', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      Contact Information
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.88rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}><Mail size={14} /> Email:</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontWeight: 650 }}>{selectedCustomer.email || '—'}</span>
                          {selectedCustomer.email && (
                            <button 
                              onClick={() => {
                                navigator.clipboard.writeText(selectedCustomer.email);
                                showToast('Copied', 'Email copied to clipboard', 'success');
                              }}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
                              title="Copy Email"
                            >
                              <Copy size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}><Phone size={14} /> Phone:</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontWeight: 650 }}>{selectedCustomer.phone || '—'}</span>
                          {selectedCustomer.phone && (
                            <button 
                              onClick={() => {
                                navigator.clipboard.writeText(selectedCustomer.phone);
                                showToast('Copied', 'Phone number copied to clipboard', 'success');
                              }}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
                              title="Copy Phone"
                            >
                              <Copy size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, borderTop: '1px solid var(--border-subtle)', paddingTop: 10 }}>
                        <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 700 }}><MapPin size={14} /> Primary Address:</span>
                        <span style={{ fontWeight: 600, color: 'var(--text)', lineHeight: '1.4' }}>
                          {customerOrders[0]?.delivery_address || 'No address registered.'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Stat Boxes (2x2 Grid with Last Purchase) */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                    <div style={{ background: 'var(--card-bg2)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: 12, textAlign: 'center' }}>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 800, marginBottom: 4 }}>Spent</div>
                      <div style={{ fontWeight: 900, fontSize: '1.05rem', color: 'var(--green)' }}>{fmt(selectedCustomer.totalSpent)}</div>
                    </div>
                    <div style={{ background: 'var(--card-bg2)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: 12, textAlign: 'center' }}>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 800, marginBottom: 4 }}>Orders</div>
                      <div style={{ fontWeight: 900, fontSize: '1.05rem', color: 'var(--text)' }}>{selectedCustomer.orders}</div>
                    </div>
                    <div style={{ background: 'var(--card-bg2)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: 12, textAlign: 'center' }}>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 800, marginBottom: 4 }}>AOV</div>
                      <div style={{ fontWeight: 900, fontSize: '1.05rem', color: 'var(--text)' }}>
                        {fmt(selectedCustomer.orders > 0 ? selectedCustomer.totalSpent / selectedCustomer.orders : 0)}
                      </div>
                    </div>
                    <div style={{ background: 'var(--card-bg2)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: 12, textAlign: 'center' }}>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 800, marginBottom: 4 }}>Last Purchase</div>
                      <div style={{ fontWeight: 900, fontSize: '0.92rem', color: 'var(--text)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }} title={selectedCustomer.lastOrder ? new Date(selectedCustomer.lastOrder).toLocaleDateString() : 'Never'}>
                        {(() => {
                          if (!selectedCustomer.lastOrder) return 'Never';
                          const lastDate = new Date(selectedCustomer.lastOrder);
                          const now = new Date();
                          const lastMidnight = new Date(lastDate.getFullYear(), lastDate.getMonth(), lastDate.getDate());
                          const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                          const diffTime = nowMidnight - lastMidnight;
                          const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                          if (diffDays <= 0) return 'Today';
                          if (diffDays === 1) return 'Yesterday';
                          return `${diffDays}d ago`;
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* Recent Orders List (Optimized height to stretch with flexbox) */}
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                    <h4 style={{ margin: '0 0 10px 0', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      Recent Orders {ordersLoading && <Loader2 size={12} className="spin" style={{ marginLeft: 6 }} />}
                    </h4>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, overflowY: 'auto', paddingRight: 4 }}>
                      {ordersLoading ? (
                        <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>Loading customer orders...</div>
                      ) : customerOrders.length === 0 ? (
                        <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', background: 'var(--card-bg2)', borderRadius: 12, border: '1px dashed var(--border-subtle)' }}>
                          No orders found.
                        </div>
                      ) : (
                        customerOrders.map(order => (
                          <div key={order.id} style={{ background: 'var(--card-bg2)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: 12 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 4 }}>
                              <span style={{ fontWeight: 800, fontSize: '0.85rem', color: 'var(--text)' }}>#{order.id}</span>
                              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <Calendar size={12} />
                                {new Date(order.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}
                              </span>
                            </div>
                            
                            {/* Order Items */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8, paddingLeft: 6, borderLeft: '2px solid var(--border-subtle)' }}>
                              {(order.order_items || []).map((item, idx) => (
                                <div key={idx} style={{ fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between' }}>
                                  <span><strong style={{ color: 'var(--text)' }}>{item.qty}x</strong> {item.name}</span>
                                  <span style={{ color: 'var(--text-muted)' }}>{fmt(item.price * item.qty)}</span>
                                </div>
                              ))}
                            </div>
                            
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.82rem', borderTop: '1px solid rgba(0,0,0,0.04)', paddingTop: 6 }}>
                              <span className={`status-badge ${order.status}`} style={{ transform: 'scale(0.85)', transformOrigin: 'left center' }}>{order.status}</span>
                              <strong style={{ color: 'var(--text)', fontSize: '0.88rem' }}>{fmt(order.total)}</strong>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Drawer Footer */}
            <div className="dash-drawer-footer" style={{ gap: 10 }}>
              {drawerMode === 'email' ? (
                <>
                  <button
                    onClick={() => setDrawerMode('profile')}
                    style={{
                      background: 'var(--white)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 8,
                      padding: '8px 16px',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                      fontWeight: 750,
                      color: 'var(--text-muted)',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.2)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; }}
                  >
                    Cancel
                  </button>
                  
                  <button
                    disabled={!selectedCustomer.email || !singleEmailSubject.trim() || !singleEmailBody.trim() || sendingSingleEmail}
                    onClick={async () => {
                      setSendingSingleEmail(true);
                      try {
                        const recipients = [{ email: selectedCustomer.email, name: selectedCustomer.name || '' }];
                        const { data, error } = await supabase.functions.invoke('send-campaign', {
                          body: { subject: singleEmailSubject, body: singleEmailBody, recipients },
                        });

                        if (error) throw new Error(error.message || 'Send failed');
                        
                        if (data?.failed > 0) {
                          throw new Error('SMTP send failed. Please check the recipient email address.');
                        }

                        showToast('Success', `Email sent successfully to ${selectedCustomer.name}`, 'success');
                        setDrawerMode('profile');
                      } catch (err) {
                        showToast('Error sending email', err.message, 'error');
                      } finally {
                        setSendingSingleEmail(false);
                      }
                    }}
                    style={{
                      background: (!selectedCustomer.email || !singleEmailSubject.trim() || !singleEmailBody.trim() || sendingSingleEmail) ? '#9ca3af' : 'var(--red)',
                      border: 'none',
                      borderRadius: 8,
                      padding: '8px 20px',
                      cursor: (!selectedCustomer.email || !singleEmailSubject.trim() || !singleEmailBody.trim() || sendingSingleEmail) ? 'not-allowed' : 'pointer',
                      fontSize: '0.8rem',
                      fontWeight: 750,
                      color: '#fff',
                      marginLeft: 'auto',
                      transition: 'all 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6
                    }}
                    onMouseEnter={e => { if (selectedCustomer.email && singleEmailSubject.trim() && singleEmailBody.trim() && !sendingSingleEmail) e.currentTarget.style.background = 'rgba(192,32,31,0.9)'; }}
                    onMouseLeave={e => { if (selectedCustomer.email && singleEmailSubject.trim() && singleEmailBody.trim() && !sendingSingleEmail) e.currentTarget.style.background = 'var(--red)'; }}
                  >
                    {sendingSingleEmail ? (
                      <>
                        <Loader2 size={14} className="spin" /> Sending...
                      </>
                    ) : (
                      <>
                        <Send size={14} /> Send Email
                      </>
                    )}
                  </button>
                </>
              ) : (
                <>
                  <a
                    href={selectedCustomer.phone ? formatWhatsAppLink(selectedCustomer.phone) : undefined}
                    target={selectedCustomer.phone ? "_blank" : undefined}
                    rel="noopener noreferrer"
                    onClick={e => {
                      if (!selectedCustomer.phone) {
                        e.preventDefault();
                        showToast('Info', 'Customer has no phone number registered.', 'info');
                      }
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      background: selectedCustomer.phone ? '#25D366' : '#9ca3af',
                      border: 'none',
                      borderRadius: 8,
                      padding: '8px 16px',
                      cursor: selectedCustomer.phone ? 'pointer' : 'not-allowed',
                      fontSize: '0.8rem',
                      fontWeight: 750,
                      color: '#fff',
                      textDecoration: 'none',
                      transition: 'all 0.2s',
                      boxSizing: 'border-box'
                    }}
                    onMouseEnter={e => { if (selectedCustomer.phone) { e.currentTarget.style.background = '#128C7E'; } }}
                    onMouseLeave={e => { if (selectedCustomer.phone) { e.currentTarget.style.background = '#25D366'; } }}
                  >
                    <MessageCircle size={14} /> WhatsApp
                  </a>

                  <button
                    onClick={() => {
                      if (selectedCustomer.email) {
                        setDrawerMode('email');
                        setSingleEmailSubject('');
                        setSingleEmailBody(`Hi ${selectedCustomer.name || 'Valued Customer'},\n\n`);
                      } else {
                        showToast('Info', 'Customer has no email address registered.', 'info');
                      }
                    }}
                    style={{
                      background: 'var(--red)',
                      border: '1px solid var(--red)',
                      borderRadius: 8,
                      padding: '8px 16px',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                      fontWeight: 750,
                      color: '#fff',
                      marginLeft: 'auto',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(192,32,31,0.9)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'var(--red)'; }}
                  >
                    Send Email
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>

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
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: '1rem', marginBottom: 4 }}>{detailCampaign.name}</div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{detailCampaign.subject}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {Math.max(0, (detailCampaign.recipient_count || 0) - (detailCampaign.sent_count || 0)) > 0 && (
                  <button
                    disabled={sending || logsLoading}
                    onClick={() => handleRetryFailed(detailCampaign)}
                    style={{
                      background: 'var(--red)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 8,
                      padding: '8px 16px',
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      cursor: (sending || logsLoading) ? 'not-allowed' : 'pointer',
                      fontFamily: "'DM Sans', sans-serif",
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6
                    }}
                  >
                    {sending ? (
                      <>
                        <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
                        Retrying...
                      </>
                    ) : (
                      <>
                        <Send size={13} />
                        Retry Failed
                      </>
                    )}
                  </button>
                )}
                <button onClick={() => setDetailCampaign(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', flexShrink: 0, padding: 4 }}>
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Stats bar */}
            <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              {[
                { label: 'Total', value: detailCampaign.recipient_count ?? '—', color: 'var(--text)' },
                { label: 'Delivered', value: detailCampaign.sent_count ?? 0, color: '#16a34a' },
                { label: 'Failed', value: detailCampaign.failed_count ?? 0, color: '#dc2626' },
                { 
                  label: 'Remaining', 
                  value: Math.max(0, (detailCampaign.recipient_count || 0) - ((detailCampaign.sent_count || 0) + (detailCampaign.failed_count || 0))), 
                  color: 'var(--text-muted)' 
                },
                { label: 'Sent Date', value: new Date(detailCampaign.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }), color: 'var(--text-muted)' },
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
                    {(() => {
                      const allLogsToShow = campaignLogs.map(log => {
                        if (isPending(log.status, log.error)) {
                          return {
                            ...log,
                            status: 'pending',
                            error: 'Not attempted (Timeout/Interrupted)'
                          };
                        }
                        return log;
                      });

                      return allLogsToShow.map(log => (
                        <tr key={log.id}>
                          <td style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{log.email}</td>
                          <td style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{log.name || '—'}</td>
                          <td>
                            <span style={{
                              padding: '3px 10px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 800,
                              textTransform: 'uppercase', letterSpacing: '0.04em', display: 'inline-block',
                              ...(isSent(log.status)
                                ? { background: 'rgba(22,163,74,0.08)', color: '#16a34a', border: '1px solid rgba(22,163,74,0.2)' }
                                : log.status === 'pending'
                                ? { background: 'rgba(107,114,128,0.08)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }
                                : { background: 'rgba(239,68,68,0.08)', color: '#dc2626', border: '1px solid rgba(239,68,68,0.2)' })
                            }}>
                              {log.status}
                            </span>
                          </td>
                          <td style={{ fontSize: '0.78rem', color: log.status === 'pending' ? 'var(--text-muted)' : '#dc2626', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {log.error || '—'}
                          </td>
                          <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                            {log.status === 'pending' ? '—' : new Date(log.created_at).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </td>
                        </tr>
                      ));
                    })()}
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
