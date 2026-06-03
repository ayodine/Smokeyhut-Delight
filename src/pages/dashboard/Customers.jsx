import { useState, useEffect, useMemo } from 'react';
import { Users, DollarSign, Package, Trash2, Download, Mail, Send, Loader2, UserPlus, Repeat2, ChevronUp, ChevronDown, Search, Sparkles, X, TrendingUp, TrendingDown } from 'lucide-react';
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
  const [overviewDateFilter, setOverviewDateFilter] = useState({ start: null, end: null });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const PER_PAGE = 20;
  const [sortKey, setSortKey] = useState('lastOrder');
  const [sortDir, setSortDir] = useState('desc');

  // Server-side loaded data
  const [directoryCustomers, setDirectoryCustomers] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [kpis, setKpis] = useState({ totalCustomers: 0, totalSpent: 0, totalOrders: 0, newCustomers: 0, returningCustomers: 0, noEmailCount: 0 });
  const [growth, setGrowth] = useState({ totalCustomers: null, totalSpent: null, totalOrders: null, newCustomers: null, returningCustomers: null });
  const [campaignAudience, setCampaignAudience] = useState([]);

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
  const [stores, setStores] = useState([]);
  const [mailingListExpanded, setMailingListExpanded] = useState(false);
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

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  // Fetch stores list once on mount
  useEffect(() => {
    const fetchStores = async () => {
      try {
        const { data: storesList, error: storesErr } = await supabase
          .from('stores')
          .select('id, name')
          .order('name');
        if (storesErr) throw storesErr;
        if (storesList) setStores(storesList);
      } catch (e) {
        console.error('Error fetching stores list:', e);
      }
    };
    fetchStores();
  }, []);

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
      });
      if (error) {
        console.error('Error fetching directory:', error);
        showToast('Error loading customer directory', error.message || 'Unknown error', 'error');
        setDirectoryCustomers([]);
        setTotalCount(0);
      } else if (data) {
        setDirectoryCustomers(data);
        setTotalCount(Number(data[0]?.totalCount || 0));
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
  }, [page, debouncedSearch, sortKey, sortDir, overviewDateFilter]);

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
      const { data, error } = await supabase.rpc('get_campaign_audience', {
        p_audience: form.audience,
        p_start: form.dateFilter?.start ? form.dateFilter.start + 'T00:00:00' : null,
        p_end: form.dateFilter?.end ? form.dateFilter.end + 'T23:59:59' : null,
      });
      if (!error && data) {
        setCampaignAudience(data);
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
        
        const actualSent = data.filter(log => log.status === 'sent').length;
        const actualFailed = data.filter(log => log.status === 'failed' && log.error !== 'Pending execution').length;
        const pendingCount = data.filter(log => log.status === 'failed' && log.error === 'Pending execution').length;
        
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
      const actualSent = logs.filter(log => log.status === 'sent').length;
      const actualFailed = logs.filter(log => log.status === 'failed' && log.error !== 'Pending execution').length;
      const total = campaign.recipient_count || 0;
      const pendingCount = logs.filter(log => log.status === 'failed' && log.error === 'Pending execution').length;
      
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

      if (error) throw error;
      const toRetry = failedLogs || [];

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
            const emailsToReset = toRetry.map(log => log.email.trim().toLowerCase());
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

            // Invoke edge function
            let invokeErr = null;
            try {
              const { data: result, error } = await supabase.functions.invoke('send-campaign', {
                body: {
                  subject: campaign.subject,
                  body: campaign.body,
                  recipients,
                  campaign_id: campaign.id,
                  retry: true
                },
              });
              if (error) invokeErr = error;
            } catch (e) {
              invokeErr = e;
            }

            // Fetch actual logs to update final counts and status
            const { data: logs } = await supabase
              .from('campaign_logs')
              .select('*')
              .eq('campaign_id', campaign.id)
              .order('created_at', { ascending: true });

            const actualSent = logs ? logs.filter(l => l.status === 'sent').length : 0;
            const actualFailed = logs ? logs.filter(l => l.status === 'failed' && l.error !== 'Pending execution').length : 0;
            const pendingCount = logs ? logs.filter(l => l.status === 'failed' && l.error === 'Pending execution').length : 0;

            let finalStatus = 'sent';
            if (pendingCount > 0) {
              finalStatus = 'partial';
            } else if (actualFailed > 0) {
              finalStatus = actualSent > 0 ? 'partial' : 'failed';
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

            if (invokeErr) {
              throw new Error(invokeErr.message || 'Retry failed partially');
            }

            showToast('Success', `Retry complete: ${actualSent} sent, ${actualFailed} failed`, 'success');
          } catch (err) {
            // Mark campaign status/counts based on current database state
            const { data: logs } = await supabase
              .from('campaign_logs')
              .select('*')
              .eq('campaign_id', campaign.id);

            const actualSent = logs ? logs.filter(l => l.status === 'sent').length : 0;
            const actualFailed = logs ? logs.filter(l => l.status === 'failed' && l.error !== 'Pending execution').length : 0;
            const pendingCount = logs ? logs.filter(l => l.status === 'failed' && l.error === 'Pending execution').length : 0;

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

          // 2. Invoke edge function — passes campaign_id so it can log each email
          let invokeError = null;
          try {
            const { data: result, error } = await supabase.functions.invoke('send-campaign', {
              body: { subject: form.subject, body: form.body, recipients, campaign_id: campaignId },
            });
            if (error) invokeError = error;
          } catch (e) {
            invokeError = e;
          }

          // 3. Fetch actual logs to update final stats accurately
          const { data: logs } = await supabase
            .from('campaign_logs')
            .select('status, error')
            .eq('campaign_id', campaignId);

          const actualSent = logs ? logs.filter(l => l.status === 'sent').length : 0;
          const actualFailed = logs ? logs.filter(l => l.status === 'failed' && l.error !== 'Pending execution').length : 0;
          const pendingCount = logs ? logs.filter(l => l.status === 'failed' && l.error === 'Pending execution').length : 0;

          let finalStatus = 'sent';
          if (pendingCount > 0) {
            finalStatus = 'partial';
          } else if (actualFailed > 0) {
            finalStatus = actualSent > 0 ? 'partial' : 'failed';
          }

          await supabase.from('email_campaigns').update({
            sent_count: actualSent,
            failed_count: actualFailed,
            status: finalStatus,
          }).eq('id', campaignId);

          if (invokeError) {
            throw new Error(invokeError.message || 'Send failed partially');
          }

          setSendResult({ sent: actualSent, failed: actualFailed });
          setForm({ name: '', subject: '', body: DEFAULT_CAMPAIGN_BODY, audience: 'all', dateFilter: { start: null, end: null } });
          showToast('Success', `Campaign sent: ${actualSent} sent, ${actualFailed} failed`, 'success');
          fetchCampaigns();
        } catch (err) {
          // Mark campaign as failed/partial based on actual logs
          if (campaignId) {
            const { data: logs } = await supabase
              .from('campaign_logs')
              .select('status, error')
              .eq('campaign_id', campaignId);

            const actualSent = logs ? logs.filter(l => l.status === 'sent').length : 0;
            const actualFailed = logs ? logs.filter(l => l.status === 'failed' && l.error !== 'Pending execution').length : 0;
            const pendingCount = logs ? logs.filter(l => l.status === 'failed' && l.error === 'Pending execution').length : 0;
            
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
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{totalCount} unique customers from order history.</p>
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
                  {directoryCustomers.map(c => (
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
                  {directoryCustomers.length === 0 && (
                    <tr>
                      <td colSpan="7" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>No customers found.</td>
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
                        if (log.status === 'failed' && log.error === 'Pending execution') {
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
                              ...(log.status === 'sent'
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
