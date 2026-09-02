import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../context/ToastContext';
import {
  Flame, Plus, Trash2, Edit2, X, Minus,
  Users, Clock, RefreshCw, Eye, Search, Gift, Loader2, Sparkles, Check, ArrowRight,
  ShoppingBag, Tag, DollarSign, Layers, Zap, Info
} from 'lucide-react';
import { SkelList, SkelTable } from '../../components/Skeleton';
import CustomSelect from '../../components/CustomSelect';
import ConfirmModal from '../../components/ConfirmModal';
import PremiumDateInput from '../../components/PremiumDateInput';
import { useAuth } from '../../context/AuthContext';

function Switch({ checked, onChange, disabled = false, size = 'md' }) {
  const isSm = size === 'sm';
  const width = isSm ? 34 : 44;
  const height = isSm ? 20 : 24;
  const thumbSize = isSm ? 14 : 18;
  const translate = checked ? (width - thumbSize - 3) : 3;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled && onChange) onChange(!checked);
      }}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        width,
        height,
        padding: 0,
        borderRadius: 999,
        background: checked ? 'var(--red)' : 'rgba(0,0,0,0.15)',
        border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background-color 0.2s ease',
        flexShrink: 0,
        outline: 'none',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span
        style={{
          display: 'block',
          width: thumbSize,
          height: thumbSize,
          borderRadius: '50%',
          background: '#ffffff',
          boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
          transform: `translateX(${translate}px)`,
          transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      />
    </button>
  );
}

function StepperInput({ value, onChange, min = 1, max = 9999, step = 1 }) {
  const num = Number(value) || min;
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid var(--border-subtle)', borderRadius: 8, background: 'var(--white)', overflow: 'hidden' }}>
      <button
        type="button"
        onClick={() => onChange(Math.max(min, num - step))}
        disabled={num <= min}
        style={{
          width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'none', border: 'none', cursor: num <= min ? 'not-allowed' : 'pointer',
          color: num <= min ? 'var(--text-muted)' : 'var(--text)', opacity: num <= min ? 0.4 : 1
        }}
      >
        <Minus size={14} />
      </button>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: 50, height: 36, textAlign: 'center', border: 'none', outline: 'none',
          background: 'transparent', fontWeight: 800, fontSize: '0.95rem', color: 'var(--text)',
          fontFamily: 'inherit', padding: 0
        }}
      />
      <button
        type="button"
        onClick={() => onChange(Math.min(max, num + step))}
        disabled={num >= max}
        style={{
          width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'none', border: 'none', cursor: num >= max ? 'not-allowed' : 'pointer',
          color: num >= max ? 'var(--text-muted)' : 'var(--text)', opacity: num >= max ? 0.4 : 1
        }}
      >
        <Plus size={14} />
      </button>
    </div>
  );
}

const EMPTY_PROMO_FORM = {
  title: 'Daily Early Bird: Free Guinea Fowl',
  description: 'Order 3+ Guinea Fowls today and get 1 FREE!',
  badge_text: 'Daily Special',
  banner_message: 'Order 3+ Guinea Fowls today and get 1 FREE!',
  offer_type: 'buy_x_get_y_free',
  qualifying_type: 'guinea_fowl_birds',
  qualifying_product_ids: [],
  qualifying_category_id: '',
  min_qualifying_qty: '3',
  min_order_amount: '',
  reward_type: 'free_product',
  reward_product_id: '',
  reward_product_name: 'Free Guinea Fowl (Daily Promo Reward)',
  reward_qty: '1',
  reward_discount_value: '',
  daily_quota: '20',
  per_customer_daily_limit: '1',
  auto_apply: true,
  promo_code: '',
  start_date: '',
  end_date: '',
  is_active: true,
};

function fmt(n) { return '₦' + Number(n || 0).toLocaleString(); }

export default function PromoOffers() {
  const { userRole, userPermissions } = useAuth();
  const isAdmin = userRole === 'Admin';
  const canManage = isAdmin || userRole === 'Manager' || (userPermissions || []).includes('Promos:manage') || (userPermissions || []).includes('Coupons:manage');
  const canDelete = isAdmin || userRole === 'Manager' || (userPermissions || []).includes('Promos:delete') || (userPermissions || []).includes('Coupons:delete');
  const { showToast } = useToast();

  const [promos, setPromos] = useState([]);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [allRedemptions, setAllRedemptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Tab & Search
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'active' | 'inactive' | 'claims'
  const [searchQuery, setSearchQuery] = useState('');

  // Drawer & Form
  const [editing, setEditing] = useState(null); // null | 'new' | promo.id
  const [form, setForm] = useState(EMPTY_PROMO_FORM);
  const [saving, setSaving] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);

  // Single Promo Claims Drawer
  const [viewingRedemptions, setViewingRedemptions] = useState(null);
  const [promoClaims, setPromoClaims] = useState([]);
  const [loadingClaims, setLoadingClaims] = useState(false);

  const fetchPromos = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    setRefreshing(true);
    try {
      const { data: rpcData } = await supabase.rpc('get_active_promo_offers');
      const { data: allData, error: allError } = await supabase
        .from('promo_offers')
        .select('*')
        .order('created_at', { ascending: false });

      if (allError) throw allError;

      const merged = (allData || []).map(p => {
        const activeMatch = (rpcData || []).find(r => r.id === p.id);
        return activeMatch
          ? { ...p, ...activeMatch }
          : { ...p, claimed_today: 0, remaining_today: p.daily_quota ?? 999999 };
      });

      setPromos(merged);

      const { data: redData } = await supabase
        .from('promo_redemptions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      setAllRedemptions(redData || []);
    } catch (err) {
      console.error('Error fetching promo data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchPromos();
    supabase.from('products').select('id, name, price, is_active, category_id').eq('is_active', true).then(({ data }) => setProducts(data || []));
    supabase.from('categories').select('id, label').then(({ data }) => setCategories(data || []));
  }, [fetchPromos]);

  const fetchClaimsForPromo = async (promo) => {
    setViewingRedemptions(promo);
    setLoadingClaims(true);
    try {
      const { data, error } = await supabase
        .from('promo_redemptions')
        .select('*')
        .eq('promo_id', promo.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (!error) {
        setPromoClaims(data || []);
      }
    } catch (err) {
      console.error('Error loading claims:', err);
    } finally {
      setLoadingClaims(false);
    }
  };

  const applyPreset = (type) => {
    const gfProduct = products.find(p => p.name.toLowerCase().includes('guinea'));
    if (type === 'guinea_fowl_3') {
      setForm({
        ...EMPTY_PROMO_FORM,
        title: 'Daily Early Bird: Free Guinea Fowl',
        description: 'Order 3+ Guinea Fowls today and get 1 FREE!',
        badge_text: 'Daily Special',
        banner_message: 'Order 3+ Guinea Fowls today and get 1 FREE!',
        qualifying_type: 'guinea_fowl_birds',
        min_qualifying_qty: '3',
        min_order_amount: '',
        reward_product_id: gfProduct ? String(gfProduct.id) : '',
        reward_product_name: gfProduct ? gfProduct.name : 'Free Guinea Fowl',
        reward_qty: '1',
        daily_quota: '20',
        per_customer_daily_limit: '1',
        auto_apply: true,
        is_active: true
      });
    } else if (type === 'spend_20k') {
      setForm({
        ...EMPTY_PROMO_FORM,
        title: 'Spend ₦20,000 Special Gift',
        description: 'Spend ₦20,000 or more and get a free special item!',
        badge_text: 'Spend & Save',
        banner_message: 'Orders over ₦20,000 get a special FREE gift today!',
        qualifying_type: 'min_amount',
        min_qualifying_qty: '1',
        min_order_amount: '20000',
        reward_product_id: gfProduct ? String(gfProduct.id) : '',
        reward_product_name: 'Free Special Side',
        reward_qty: '1',
        daily_quota: '30',
        per_customer_daily_limit: '1',
        auto_apply: true,
        is_active: true
      });
    }
  };

  const startNew = () => {
    const gfProduct = products.find(p => p.name.toLowerCase().includes('guinea'));
    setForm({
      ...EMPTY_PROMO_FORM,
      reward_product_id: gfProduct ? String(gfProduct.id) : '',
      reward_product_name: gfProduct ? gfProduct.name : 'Free Guinea Fowl (Daily Promo Reward)',
    });
    setEditing('new');
  };

  const startEdit = (p) => {
    setForm({
      title: p.title || '',
      description: p.description || '',
      badge_text: p.badge_text || '',
      banner_message: p.banner_message || '',
      offer_type: p.offer_type || 'buy_x_get_y_free',
      qualifying_type: p.qualifying_type || 'guinea_fowl_birds',
      qualifying_product_ids: p.qualifying_product_ids || [],
      qualifying_category_id: p.qualifying_category_id || '',
      min_qualifying_qty: p.min_qualifying_qty != null ? String(p.min_qualifying_qty) : '3',
      min_order_amount: p.min_order_amount != null ? String(p.min_order_amount) : '',
      reward_type: p.reward_type || 'free_product',
      reward_product_id: p.reward_product_id != null ? String(p.reward_product_id) : '',
      reward_product_name: p.reward_product_name || 'Free Guinea Fowl (Daily Promo Reward)',
      reward_qty: p.reward_qty != null ? String(p.reward_qty) : '1',
      reward_discount_value: p.reward_discount_value != null ? String(p.reward_discount_value) : '',
      daily_quota: p.daily_quota != null ? String(p.daily_quota) : '20',
      per_customer_daily_limit: p.per_customer_daily_limit != null ? String(p.per_customer_daily_limit) : '1',
      auto_apply: p.auto_apply ?? true,
      promo_code: p.promo_code || '',
      start_date: p.start_date || '',
      end_date: p.end_date || '',
      is_active: p.is_active ?? true,
    });
    setEditing(p.id);
  };

  const cancel = () => {
    setEditing(null);
    setForm(EMPTY_PROMO_FORM);
  };

  const save = async () => {
    if (!form.title.trim()) {
      showToast('Required', 'Offer title is required', 'error');
      return;
    }
    if (!form.reward_product_name.trim()) {
      showToast('Required', 'Reward name is required', 'error');
      return;
    }

    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      badge_text: form.badge_text.trim() || null,
      banner_message: form.banner_message.trim() || null,
      offer_type: form.offer_type,
      qualifying_type: form.qualifying_type,
      qualifying_product_ids: (form.qualifying_product_ids || []).map(id => Number(id)).filter(Boolean),
      qualifying_category_id: form.qualifying_category_id || null,
      min_qualifying_qty: Number(form.min_qualifying_qty) || 1,
      min_order_amount: form.min_order_amount ? Number(form.min_order_amount) : 0,
      reward_type: form.reward_type,
      reward_product_id: form.reward_product_id ? Number(form.reward_product_id) : null,
      reward_product_name: form.reward_product_name.trim(),
      reward_qty: Number(form.reward_qty) || 1,
      reward_discount_value: form.reward_discount_value ? Number(form.reward_discount_value) : 0,
      daily_quota: form.daily_quota ? Number(form.daily_quota) : null,
      per_customer_daily_limit: Number(form.per_customer_daily_limit) || 1,
      auto_apply: form.auto_apply,
      promo_code: form.promo_code ? form.promo_code.trim().toUpperCase() : null,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      is_active: form.is_active,
      updated_at: new Date().toISOString(),
    };

    setSaving(true);
    try {
      if (editing === 'new') {
        const { error } = await supabase.from('promo_offers').insert([payload]);
        if (error) throw error;
        showToast('Created', `Promo offer "${payload.title}" created`, 'success');
      } else {
        const { error } = await supabase.from('promo_offers').update(payload).eq('id', editing);
        if (error) throw error;
        showToast('Saved', `Promo offer updated`, 'success');
      }
      cancel();
      fetchPromos(true);
    } catch (err) {
      showToast('Error', err.message || 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (p) => {
    const updated = !p.is_active;
    const { error } = await supabase.from('promo_offers').update({ is_active: updated }).eq('id', p.id);
    if (!error) {
      setPromos(prev => prev.map(item => item.id === p.id ? { ...item, is_active: updated } : item));
      showToast(updated ? 'Activated' : 'Deactivated', `"${p.title}" is now ${updated ? 'active' : 'inactive'}`, 'success');
    }
  };

  const deletePromo = (p) => {
    setConfirmAction({
      title: 'Delete Promo Offer',
      message: `Are you sure you want to delete "${p.title}"?`,
      confirmLabel: 'Delete',
      onConfirm: async () => {
        setConfirmAction(prev => ({ ...prev, isLoading: true }));
        const { error } = await supabase.from('promo_offers').delete().eq('id', p.id);
        if (error) {
          showToast('Error', error.message, 'error');
          setConfirmAction(null);
          return;
        }
        showToast('Deleted', `Promo offer removed`, 'success');
        fetchPromos(true);
        setConfirmAction(null);
      }
    });
  };

  const setField = (k) => (e) => setForm(prev => ({ ...prev, [k]: e.target.value }));

  // Filtered
  const filteredPromos = useMemo(() => {
    return promos.filter(p => {
      const matchSearch = !searchQuery || p.title.toLowerCase().includes(searchQuery.toLowerCase()) || (p.description && p.description.toLowerCase().includes(searchQuery.toLowerCase()));
      if (activeTab === 'active') return matchSearch && p.is_active;
      if (activeTab === 'inactive') return matchSearch && !p.is_active;
      return matchSearch;
    });
  }, [promos, searchQuery, activeTab]);

  const filteredRedemptions = useMemo(() => {
    return allRedemptions.filter(r => {
      return !searchQuery || (r.customer_name && r.customer_name.toLowerCase().includes(searchQuery.toLowerCase())) || (r.customer_phone && r.customer_phone.includes(searchQuery)) || (r.order_id && r.order_id.toLowerCase().includes(searchQuery.toLowerCase()));
    });
  }, [allRedemptions, searchQuery]);

  // Overall KPIs
  const activeCount = promos.filter(p => p.is_active).length;
  const inactiveCount = promos.filter(p => !p.is_active).length;
  const totalClaimedToday = promos.reduce((sum, p) => sum + (Number(p.claimed_today) || 0), 0);
  const totalDailyQuota = promos.filter(p => p.is_active).reduce((sum, p) => sum + (p.daily_quota ? Number(p.daily_quota) : 0), 0);
  const totalLifetimeClaims = allRedemptions.length;

  return (
    <div>
      {/* ── HEADER ── */}
      <div className="dash-card-header" style={{ marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: "'Mona Sans', 'Mona-Sans', 'Helvetica Neue', sans-serif", fontSize: '1.4rem', fontWeight: 900, color: 'var(--text)' }}>
            Promo Offers & Daily Quotas
          </h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
            Configure automatic giveaway rewards, conditions, and daily quota limits.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => fetchPromos(false)}
            disabled={refreshing}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, background: 'var(--white)',
              border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '8px 14px',
              cursor: 'pointer', color: 'var(--text)', fontSize: '0.84rem', fontWeight: 700
            }}
          >
            <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
            Refresh
          </button>

          {canManage && (
            <button
              className="btn-primary"
              onClick={startNew}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', fontSize: '0.85rem' }}
            >
              <Plus size={16} /> New Promo Offer
            </button>
          )}
        </div>
      </div>

      {/* ── KPI TILES ── */}
      <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 14, marginBottom: 24 }}>
        <div className="kpi-card green">
          <div className="kpi-icon"><Zap size={24} /></div>
          <div className="kpi-value">{activeCount}</div>
          <div className="kpi-label">Active Promos</div>
          <div className="kpi-change up">{activeCount === 1 ? 'offer running' : 'offers running'}</div>
        </div>
        <div className="kpi-card red">
          <div className="kpi-icon"><Gift size={24} /></div>
          <div className="kpi-value">
            {totalClaimedToday}<span style={{ fontSize: '1rem', fontWeight: 600 }}>{totalDailyQuota > 0 ? ` / ${totalDailyQuota}` : ''}</span>
          </div>
          <div className="kpi-label">Today's Claims</div>
          <div className="kpi-change">{totalDailyQuota > 0 ? `${Math.max(0, totalDailyQuota - totalClaimedToday)} slots left` : 'no quota set'}</div>
        </div>
        <div className="kpi-card blue">
          <div className="kpi-icon"><Users size={24} /></div>
          <div className="kpi-value">{totalLifetimeClaims}</div>
          <div className="kpi-label">Lifetime Claims</div>
          <div className="kpi-change up">total redemptions</div>
        </div>
      </div>

      {/* ── TABS & SEARCH BAR ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 4, background: 'var(--black2)', borderRadius: 10, padding: '4px' }}>
          {[
            { id: 'all',      label: `All (${promos.length})` },
            { id: 'active',   label: `Active (${activeCount})` },
            { id: 'inactive', label: `Inactive (${inactiveCount})` },
            { id: 'claims',   label: `Claims (${allRedemptions.length})` },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '6px 14px', borderRadius: 7, border: 'none',
                background: activeTab === tab.id ? 'var(--white)' : 'transparent',
                color: activeTab === tab.id ? 'var(--text)' : 'var(--text-muted)',
                fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer',
                boxShadow: activeTab === tab.id ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.15s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ position: 'relative', width: 240, maxWidth: '100%' }}>
          <Search size={14} color="var(--text-muted)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            placeholder={activeTab === 'claims' ? 'Search customer or phone...' : 'Search offers...'}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              width: '100%', padding: '8px 10px 8px 30px', borderRadius: 8,
              border: '1px solid var(--border-subtle)', background: 'var(--white)',
              fontSize: '0.82rem', color: 'var(--text)', outline: 'none',
              fontFamily: 'inherit',
            }}
          />
        </div>
      </div>

      {/* ── TAB 1: PROMO OFFERS TABLE ── */}
      {activeTab !== 'claims' && (
        <div className="dash-table-wrapper" style={{ background: 'var(--white)', borderRadius: 12, border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
          {loading ? (
            <SkelTable rows={3} cols={6} />
          ) : filteredPromos.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--text-muted)' }}>
              <p style={{ margin: 0, fontWeight: 600 }}>No promo offers found.</p>
              {canManage && (
                <button
                  className="btn-primary"
                  onClick={startNew}
                  style={{ marginTop: 12, padding: '7px 14px', fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <Plus size={14} /> Create First Promo
                </button>
              )}
            </div>
          ) : (
            <table className="dash-table">
              <thead>
                <tr>
                  <th style={{ minWidth: 260 }}>Offer</th>
                  <th style={{ minWidth: 160 }}>Trigger</th>
                  <th style={{ minWidth: 160 }}>Reward</th>
                  <th style={{ minWidth: 170 }}>Today's Quota</th>
                  <th style={{ minWidth: 120 }}>Status</th>
                  {(canManage || canDelete) && <th style={{ textAlign: 'right', minWidth: 110 }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filteredPromos.map(p => {
                  const claimed = Number(p.claimed_today) || 0;
                  const quota = p.daily_quota;
                  const pct = quota ? Math.min(100, Math.round((claimed / quota) * 100)) : 0;
                  const remaining = p.remaining_today ?? (quota ? Math.max(0, quota - claimed) : 'Unlimited');
                  const isFull = quota && claimed >= quota;

                  return (
                    <tr key={p.id} style={{ opacity: p.is_active ? 1 : 0.55 }}>
                      {/* Offer */}
                      <td style={{ verticalAlign: 'top' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 3 }}>
                          <span style={{ fontWeight: 800, color: 'var(--text)', fontSize: '0.9rem' }}>{p.title}</span>
                          {p.badge_text && (
                            <span style={{ background: 'var(--black2)', color: 'var(--text)', border: '1px solid var(--border-subtle)', padding: '1px 6px', borderRadius: 4, fontSize: '0.7rem', fontWeight: 600 }}>
                              {p.badge_text}
                            </span>
                          )}
                          {p.auto_apply && (
                            <span style={{ background: 'var(--black2)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)', padding: '1px 6px', borderRadius: 4, fontSize: '0.7rem', fontWeight: 600 }}>
                              Auto-apply
                            </span>
                          )}
                        </div>
                        {(p.banner_message || p.description) && (
                          <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', lineHeight: 1.45, fontStyle: 'italic' }}>
                            "{p.banner_message || p.description}"
                          </div>
                        )}
                      </td>

                      {/* Trigger */}
                      <td style={{ verticalAlign: 'top' }}>
                        <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: '0.85rem' }}>
                          {p.qualifying_type === 'guinea_fowl_birds'
                            ? `Buy ${p.min_qualifying_qty}+ Guinea Fowls`
                            : p.qualifying_type === 'category'
                            ? `Buy ${p.min_qualifying_qty}+ in Category`
                            : p.qualifying_type === 'min_amount'
                            ? `Min Order: ${fmt(p.min_order_amount)}`
                            : `Buy ${p.min_qualifying_qty}+ Items`}
                        </div>
                        <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: 2 }}>
                          {p.qualifying_type === 'guinea_fowl_birds' ? 'Whole birds & combo packs' : 'Single or multiple items'}
                        </div>
                      </td>

                      {/* Reward */}
                      <td style={{ verticalAlign: 'top' }}>
                        <div style={{ fontWeight: 800, color: 'var(--text)', fontSize: '0.88rem' }}>
                          {p.reward_qty}× {p.reward_product_name || 'Free Item'}
                        </div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 2 }}>Free (₦0 at checkout)</div>
                      </td>

                      {/* Quota */}
                      <td style={{ verticalAlign: 'top' }}>
                        {quota != null ? (
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, fontSize: '0.8rem', marginBottom: 4 }}>
                              <span style={{ fontWeight: 700, color: 'var(--text)' }}>{claimed} / {quota} claimed</span>
                              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{isFull ? 'Full' : `${remaining} left`}</span>
                            </div>
                            <div style={{ width: '100%', height: 4, background: 'var(--black2)', borderRadius: 2, overflow: 'hidden' }}>
                              <div style={{ width: `${pct}%`, height: '100%', background: 'var(--text)', borderRadius: 2, transition: 'width 0.3s ease' }} />
                            </div>
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Unlimited</span>
                        )}
                      </td>

                      {/* Status */}
                      <td style={{ verticalAlign: 'top' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Switch size="sm" checked={p.is_active} disabled={!canManage} onChange={() => toggleActive(p)} />
                          <span style={{ fontSize: '0.76rem', fontWeight: 700, color: p.is_active ? 'var(--text)' : 'var(--text-muted)' }}>
                            {p.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                      </td>

                      {/* Actions */}
                      {(canManage || canDelete) && (
                        <td style={{ textAlign: 'right', verticalAlign: 'top' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                            <button
                              onClick={() => fetchClaimsForPromo(p)}
                              title="View Claims"
                              style={{
                                background: 'var(--black2)', border: '1px solid var(--border-subtle)', borderRadius: 7,
                                padding: '5px 10px', cursor: 'pointer', color: 'var(--text)', fontSize: '0.76rem', fontWeight: 800,
                                display: 'flex', alignItems: 'center', gap: 4, transition: 'all 0.15s'
                              }}
                            >
                              <Eye size={12} /> {claimed}
                            </button>
                            {canManage && (
                              <button
                                onClick={() => startEdit(p)}
                                title="Edit"
                                style={{
                                  background: 'var(--black2)', border: '1px solid var(--border-subtle)', borderRadius: 7,
                                  padding: '6px 8px', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', transition: 'all 0.15s'
                                }}
                              >
                                <Edit2 size={13} />
                              </button>
                            )}
                            {canDelete && (
                              <button
                                onClick={() => deletePromo(p)}
                                title="Delete"
                                style={{
                                  background: 'none', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 7,
                                  padding: '6px 8px', cursor: 'pointer', color: '#dc2626', display: 'flex', transition: 'all 0.15s'
                                }}
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── TAB 2: CLAIMS HISTORY TABLE ── */}
      {activeTab === 'claims' && (
        <div className="dash-table-wrapper" style={{ background: 'var(--white)', borderRadius: 12, border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
          {filteredRedemptions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
              <p style={{ margin: 0, fontWeight: 600 }}>No customer redemptions recorded.</p>
            </div>
          ) : (
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Contact Info</th>
                  <th>Reward Claimed</th>
                  <th>Order Reference</th>
                  <th>Date & Time (WAT)</th>
                  <th style={{ textAlign: 'right' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredRedemptions.map((r, i) => (
                  <tr key={r.id || i}>
                    <td>
                      <div style={{ fontWeight: 800, color: 'var(--text)', fontSize: '0.88rem' }}>
                        {r.customer_name || 'Guest Customer'}
                      </div>
                    </td>

                    <td style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                      {r.customer_phone || r.customer_email || '—'}
                    </td>

                    <td>
                      <span style={{ fontWeight: 700, color: 'var(--text)', fontSize: '0.86rem' }}>
                        {r.reward_details?.reward_product_name || '1 Free Guinea Fowl'}
                      </span>
                    </td>

                    <td>
                      {r.order_id ? (
                        <span style={{ background: 'var(--black2)', padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--text)' }}>
                          {r.order_id}
                        </span>
                      ) : '—'}
                    </td>

                    <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                      {new Date(r.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })} {new Date(r.created_at).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}
                    </td>

                    <td style={{ textAlign: 'right' }}>
                      <span style={{
                        fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                        background: 'var(--black2)', color: 'var(--text-muted)',
                        border: '1px solid var(--border-subtle)'
                      }}>
                        {r.status ? r.status.toUpperCase() : 'COMPLETED'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── CREATE / EDIT DRAWER (ULTRA-INTUITIVE STEP-BY-STEP BUILDER) ── */}
      {editing !== null && (
        <div className="product-form-modal" onClick={cancel}>
          <div className="product-form-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', height: '100vh', padding: 0, overflow: 'hidden' }}>
            
            {/* Sticky Drawer Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '22px 28px 18px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0, background: 'var(--white)' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(192,32,31,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {editing === 'new' ? <Plus size={16} color="var(--red)" /> : <Edit2 size={15} color="var(--red)" />}
                  </div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 900, color: 'var(--text)', fontFamily: "'Mona Sans', 'Mona-Sans', 'Helvetica Neue', sans-serif" }}>
                    {editing === 'new' ? 'Create Promo Offer' : 'Edit Promo Offer'}
                  </h3>
                </div>
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)', paddingLeft: 42 }}>
                  {editing === 'new' ? 'Set conditions for automatic free gifts and daily limits.' : 'Update this promo offer — changes go live immediately.'}
                </p>
              </div>
              <button onClick={cancel} style={{ background: 'var(--black2)', border: 'none', borderRadius: '50%', width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                <X size={16} />
              </button>
            </div>

            {/* Scrollable Form Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 20, background: 'var(--black)' }}>
              
              {/* QUICK PRESETS (Only shown when creating new) */}
              {editing === 'new' && (
                <div style={{ background: 'var(--black2)', padding: '12px 14px', borderRadius: 10 }}>
                  <div style={{ fontSize: '0.74rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
                    Quick Start Templates
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => applyPreset('guinea_fowl_3')}
                      style={{
                        padding: '6px 12px', borderRadius: 6, fontSize: '0.78rem', fontWeight: 700,
                        background: form.qualifying_type === 'guinea_fowl_birds' && form.min_qualifying_qty === '3' ? 'var(--red)' : 'var(--white)',
                        color: form.qualifying_type === 'guinea_fowl_birds' && form.min_qualifying_qty === '3' ? '#fff' : 'var(--text)',
                        border: form.qualifying_type === 'guinea_fowl_birds' && form.min_qualifying_qty === '3' ? '1px solid var(--red)' : '1px solid var(--border-subtle)',
                        cursor: 'pointer'
                      }}
                    >
                      Buy 3 Guinea Fowls → Get 1 Free
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset('spend_20k')}
                      style={{
                        padding: '6px 12px', borderRadius: 6, fontSize: '0.78rem', fontWeight: 700,
                        background: form.qualifying_type === 'min_amount' ? 'var(--red)' : 'var(--white)',
                        color: form.qualifying_type === 'min_amount' ? '#fff' : 'var(--text)',
                        border: form.qualifying_type === 'min_amount' ? '1px solid var(--red)' : '1px solid var(--border-subtle)',
                        cursor: 'pointer'
                      }}
                    >
                      Spend ₦20,000+ → Free Gift
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 1: TRIGGER RULE (Visual Card Selectors) */}
              <div style={{ background: 'var(--white)', borderRadius: 12, padding: '16px 18px', border: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--red)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 900, flexShrink: 0 }}>1</span>
                  <label style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--text)', margin: 0 }}>
                    When should the customer get a free gift?
                  </label>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 14 }}>
                  {[
                    { id: 'guinea_fowl_birds', label: 'Guinea Fowl Count', sub: 'Whole birds & packs', icon: Flame },
                    { id: 'min_amount',        label: 'Min Cart Total',    sub: 'Total order value (\u20a6)', icon: DollarSign },
                    { id: 'category',          label: 'Product Category',  sub: 'Any item from a category', icon: Layers },
                    { id: 'specific_products', label: 'Specific Items',    sub: 'Selected menu products', icon: Tag }
                  ].map(rule => {
                    const isSel = form.qualifying_type === rule.id;
                    const Icon = rule.icon;
                    return (
                      <div
                        key={rule.id}
                        onClick={() => setForm(p => ({ ...p, qualifying_type: rule.id }))}
                        style={{
                          padding: '11px 13px', borderRadius: 10, cursor: 'pointer',
                          background: isSel ? 'rgba(192,32,31,0.04)' : 'var(--black)',
                          border: isSel ? '2px solid var(--red)' : '1.5px solid var(--border-subtle)',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                          <Icon size={12} color={isSel ? 'var(--red)' : 'var(--text-muted)'} />
                          <span style={{ fontWeight: 800, fontSize: '0.81rem', color: isSel ? 'var(--red)' : 'var(--text)' }}>{rule.label}</span>
                        </div>
                        <div style={{ fontSize: '0.71rem', color: 'var(--text-muted)', lineHeight: 1.35 }}>{rule.sub}</div>
                      </div>
                    );
                  })}
                </div>

                {/* Conditional threshold input depending on trigger type */}
                {form.qualifying_type === 'min_amount' ? (
                  <div style={{ background: 'var(--black2)', padding: '12px', borderRadius: 8, marginTop: 8 }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: 6 }}>
                      Minimum Order Amount (₦)
                    </label>
                    <input
                      type="number"
                      value={form.min_order_amount}
                      onChange={setField('min_order_amount')}
                      placeholder="20000"
                      style={{ width: '100%', background: 'var(--white)', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border-subtle)', fontSize: '0.9rem', fontWeight: 700 }}
                    />
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      {['10000', '15000', '20000', '30000', '50000'].map(amt => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setForm(p => ({ ...p, min_order_amount: amt }))}
                          style={{
                            padding: '4px 8px', borderRadius: 4, fontSize: '0.74rem', fontWeight: 700,
                            background: form.min_order_amount === amt ? 'var(--red)' : 'var(--white)',
                            color: form.min_order_amount === amt ? '#fff' : 'var(--text)',
                            border: form.min_order_amount === amt ? '1px solid var(--red)' : '1px solid var(--border-subtle)',
                            cursor: 'pointer'
                          }}
                        >
                          {fmt(amt)}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : form.qualifying_type === 'category' ? (
                  <div style={{ background: 'var(--black2)', padding: '12px', borderRadius: 8, marginTop: 8 }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: 6 }}>
                      Select Category
                    </label>
                    <CustomSelect
                      value={form.qualifying_category_id}
                      onChange={setField('qualifying_category_id')}
                      options={categories.map(c => ({ value: c.id, label: c.label }))}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>Min Items Required:</span>
                      <StepperInput
                        value={form.min_qualifying_qty}
                        onChange={(v) => setForm(p => ({ ...p, min_qualifying_qty: String(v) }))}
                      />
                    </div>
                  </div>
                ) : (
                  <div style={{ background: 'var(--black)', border: '1.5px solid var(--border-subtle)', padding: '14px 16px', borderRadius: 10 }}>
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: '0.84rem', fontWeight: 800, color: 'var(--text)' }}>Quantity to Qualify</div>
                      <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>
                        {form.qualifying_type === 'guinea_fowl_birds' ? 'Number of Guinea Fowls customer must buy' : 'Items required in cart'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', gap: 5 }}>
                        {['2', '3', '4', '5'].map(q => (
                          <button
                            key={q}
                            type="button"
                            onClick={() => setForm(p => ({ ...p, min_qualifying_qty: q }))}
                            style={{
                              width: 38, height: 38, borderRadius: 8, fontSize: '0.88rem', fontWeight: 800,
                              background: form.min_qualifying_qty === q ? 'var(--red)' : 'var(--white)',
                              color: form.min_qualifying_qty === q ? '#fff' : 'var(--text)',
                              border: form.min_qualifying_qty === q ? '2px solid var(--red)' : '1.5px solid var(--border-subtle)',
                              cursor: 'pointer', transition: 'all 0.15s'
                            }}
                          >{q}</button>
                        ))}
                      </div>
                      <StepperInput value={form.min_qualifying_qty} onChange={(v) => setForm(p => ({ ...p, min_qualifying_qty: String(v) }))} />
                    </div>
                  </div>
                )}
              </div>

              {/* STEP 2: REWARD GIFT */}
              <div style={{ background: 'var(--white)', borderRadius: 12, padding: '16px 18px', border: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--red)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 900, flexShrink: 0 }}>2</span>
                  <label style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--text)', margin: 0 }}>
                    What free gift does the customer receive?
                  </label>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

                  {/* Reward Type Toggle */}
                  <div>
                    <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text)', display: 'block', marginBottom: 8 }}>
                      Reward Type
                    </label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {[
                        { value: 'free_product', label: '🎁 Menu Product', desc: 'A physical item from the menu' },
                        { value: 'free_delivery', label: '🚚 Free Delivery', desc: 'Customer gets free delivery' },
                      ].map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setForm(prev => ({
                            ...prev,
                            reward_type: opt.value,
                            ...(opt.value === 'free_delivery' ? {
                              reward_product_id: '',
                              reward_product_name: 'Free Delivery',
                              reward_qty: '1',
                            } : {
                              reward_product_name: prev.reward_product_name === 'Free Delivery' ? '' : prev.reward_product_name,
                            }),
                          }))}
                          style={{
                            flex: 1, padding: '10px 12px', borderRadius: 9, border: 'none', cursor: 'pointer',
                            textAlign: 'left', transition: 'all 0.15s',
                            background: form.reward_type === opt.value ? 'rgba(192,32,31,0.06)' : 'var(--black)',
                            outline: form.reward_type === opt.value ? '2px solid var(--red)' : '1.5px solid var(--border-subtle)',
                          }}
                        >
                          <div style={{ fontSize: '0.84rem', fontWeight: 800, color: form.reward_type === opt.value ? 'var(--red)' : 'var(--text)' }}>{opt.label}</div>
                          <div style={{ fontSize: '0.71rem', color: 'var(--text-muted)', marginTop: 2 }}>{opt.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Free Product fields */}
                  {form.reward_type !== 'free_delivery' && (
                    <div>
                      <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text)', display: 'block', marginBottom: 4 }}>
                        Choose Menu Product (Reward Gift)
                      </label>
                      <CustomSelect
                        value={form.reward_product_id}
                        onChange={(e) => {
                          const selProd = products.find(p => String(p.id) === String(e.target.value));
                          setForm(prev => ({
                            ...prev,
                            reward_product_id: e.target.value,
                            reward_product_name: selProd ? `Free ${selProd.name} (Daily Promo Reward)` : prev.reward_product_name
                          }));
                        }}
                        options={[
                          { value: '', label: '-- Custom Named Free Item --' },
                          ...products.map(p => ({ value: String(p.id), label: `${p.name} (${fmt(p.price)})` }))
                        ]}
                      />
                    </div>
                  )}

                  {/* Free Delivery confirmation banner */}
                  {form.reward_type === 'free_delivery' && (
                    <div style={{ background: 'rgba(22,163,74,0.07)', border: '1.5px solid rgba(22,163,74,0.25)', borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: '1.4rem', flexShrink: 0 }}>🚚</span>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '0.84rem', color: '#15803d' }}>Free Delivery Selected</div>
                        <div style={{ fontSize: '0.73rem', color: '#166534', marginTop: 2 }}>Qualifying customers will have their delivery fee waived automatically at checkout.</div>
                      </div>
                    </div>
                  )}

                  {/* Display Name + Qty (always visible) */}
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text)', display: 'block', marginBottom: 4 }}>
                        Display Name on Invoice
                      </label>
                      <input
                        value={form.reward_product_name}
                        onChange={setField('reward_product_name')}
                        placeholder={form.reward_type === 'free_delivery' ? 'e.g. Free Delivery' : 'e.g. Free Guinea Fowl'}
                        style={{ width: '100%', padding: '8px 10px', fontSize: '0.84rem', background: 'var(--white)', border: '1px solid var(--border-subtle)', borderRadius: 6 }}
                      />
                    </div>

                    {form.reward_type !== 'free_delivery' && (
                      <div>
                        <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text)', display: 'block', marginBottom: 4 }}>
                          Gift Qty
                        </label>
                        <StepperInput
                          value={form.reward_qty}
                          onChange={(v) => setForm(p => ({ ...p, reward_qty: String(v) }))}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>


              {/* STEP 3: DAILY QUOTA & LIMITS */}
              <div style={{ background: 'var(--white)', borderRadius: 12, padding: '16px 18px', border: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--red)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 900, flexShrink: 0 }}>3</span>
                  <label style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--text)', margin: 0 }}>
                    Daily Quota <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>— Giveaway Cap</span>
                  </label>
                </div>

                <div style={{ background: 'var(--black)', border: '1.5px solid var(--border-subtle)', padding: '14px 16px', borderRadius: 10 }}>
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: '0.84rem', fontWeight: 800, color: 'var(--text)' }}>
                      First <span style={{ color: 'var(--red)' }}>{form.daily_quota || '\u221e'}</span> customers per day
                    </div>
                    <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: 2 }}>Resets automatically at midnight (00:00 WAT).</div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {['10', '20', '30', '50'].map(q => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => setForm(p => ({ ...p, daily_quota: q }))}
                        style={{
                          width: 42, height: 38, borderRadius: 8, fontSize: '0.86rem', fontWeight: 800,
                          background: form.daily_quota === q ? 'var(--red)' : 'var(--white)',
                          color: form.daily_quota === q ? '#fff' : 'var(--text)',
                          border: form.daily_quota === q ? '2px solid var(--red)' : '1.5px solid var(--border-subtle)',
                          cursor: 'pointer', transition: 'all 0.15s'
                        }}
                      >{q}</button>
                    ))}
                    <StepperInput value={form.daily_quota} step={5} onChange={(v) => setForm(p => ({ ...p, daily_quota: String(v) }))} />
                  </div>
                </div>
              </div>

              {/* STEP 4: TITLES & WEBSITE BANNER */}
              <div style={{ background: 'var(--white)', borderRadius: 12, padding: '16px 18px', border: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--red)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 900, flexShrink: 0 }}>4</span>
                  <label style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--text)', margin: 0 }}>Customer Announcement</label>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Offer Title</label>
                    <input
                      value={form.title}
                      onChange={setField('title')}
                      placeholder="e.g. Daily Early Bird: Free Guinea Fowl"
                      style={{ width: '100%', padding: '10px 12px', fontSize: '0.85rem', background: 'var(--black)', border: '1.5px solid var(--border-subtle)', borderRadius: 8, color: 'var(--text)', outline: 'none', fontFamily: 'inherit' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Top Ticker Banner Message</label>
                    <input
                      value={form.banner_message}
                      onChange={setField('banner_message')}
                      placeholder="e.g. Order 3+ Guinea Fowls today and get 1 FREE!"
                      style={{ width: '100%', padding: '10px 12px', fontSize: '0.85rem', background: 'var(--black)', border: '1.5px solid var(--border-subtle)', borderRadius: 8, color: 'var(--text)', outline: 'none', fontFamily: 'inherit' }}
                    />
                  </div>

                  {/* Live Preview Card */}
                  <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ background: 'var(--black2)', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 5, borderBottom: '1px solid var(--border-subtle)' }}>
                      <Eye size={12} color="var(--text-muted)" />
                      <span style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Live Customer Preview</span>
                    </div>
                    <div style={{ padding: '12px 14px', background: 'var(--white)' }}>
                      <div style={{ fontSize: '0.88rem', fontWeight: 900, color: 'var(--text)', marginBottom: 2 }}>
                        {form.title || 'Promo Offer Title'}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 8, fontStyle: 'italic' }}>
                        {form.banner_message || 'Customer ticker announcement goes here'}
                      </div>
                      <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text)' }}>
                        Gift: {form.reward_qty || 1}× {form.reward_product_name || 'Free Item'} (₦0)
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* STEP 5: TOGGLES */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  {
                    key: 'auto_apply',
                    label: 'Auto-apply in cart',
                    sub: 'Free gift added automatically when qualifying items are in cart.',
                    icon: Zap,
                  },
                  {
                    key: 'is_active',
                    label: 'Active status',
                    sub: 'Promo goes live across the storefront immediately.',
                    icon: Flame,
                  }
                ].map(({ key, label, sub, icon: Icon }) => (
                  <div
                    key={key}
                    onClick={() => setForm(p => ({ ...p, [key]: !p[key] }))}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                      background: 'var(--white)', padding: '14px 16px', borderRadius: 12,
                      border: '1px solid var(--border-subtle)', cursor: 'pointer', userSelect: 'none'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                      <div style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--black2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon size={14} color="var(--text-muted)" />
                      </div>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '0.84rem', color: 'var(--text)' }}>{label}</div>
                        <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: 1 }}>{sub}</div>
                      </div>
                    </div>
                    <Switch checked={form[key]} onChange={(v) => setForm(p => ({ ...p, [key]: v }))} />
                  </div>
                ))}
              </div>

            </div>

            {/* Sticky Drawer Footer */}
            <div style={{ display: 'flex', gap: 10, padding: '16px 28px', borderTop: '1px solid var(--border-subtle)', flexShrink: 0, background: 'var(--white)' }}>
              <button
                className="btn-secondary"
                onClick={cancel}
                style={{ flex: 1, padding: '12px', borderRadius: 10, fontWeight: 700, fontSize: '0.88rem' }}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={save}
                disabled={saving}
                style={{ flex: 2, padding: '12px', borderRadius: 10, fontWeight: 800, fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}
              >
                {saving ? <Loader2 size={16} className="spin" /> : <><Check size={16} />{editing === 'new' ? 'Create Promo' : 'Save Changes'}</>}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ── SINGLE PROMO CLAIMS DRAWER ── */}
      {viewingRedemptions !== null && (
        <div className="product-form-modal" onClick={() => setViewingRedemptions(null)}>
          <div className="product-form-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 500, display: 'flex', flexDirection: 'column', height: '100vh', padding: '28px 32px' }}>
            
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', paddingBottom: 16, borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900, color: 'var(--text)' }}>
                  Claims Log
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  {viewingRedemptions.title}
                </p>
              </div>
              <button onClick={() => setViewingRedemptions(null)} className="dash-drawer-close" style={{ background: 'var(--black2)', border: 'none', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <X size={16} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {loadingClaims ? (
                <SkelList rows={4} height={48} />
              ) : promoClaims.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--text-muted)' }}>
                  <p style={{ margin: 0 }}>No customer claims recorded yet.</p>
                </div>
              ) : (
                promoClaims.map((r, i) => (
                  <div
                    key={r.id || i}
                    style={{
                      background: 'var(--black2)',
                      borderRadius: 8,
                      padding: '12px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '0.84rem'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 800, color: 'var(--text)' }}>{r.customer_name || 'Guest Customer'}</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2, fontFamily: 'monospace' }}>
                        {r.customer_phone || r.customer_email || 'No contact'} {r.order_id && `· Order: ${r.order_id}`}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{
                        fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                        background: 'var(--black2)', color: 'var(--text-muted)',
                        border: '1px solid var(--border-subtle)'
                      }}>
                        {r.status?.toUpperCase() || 'COMPLETED'}
                      </span>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>
                        {new Date(r.created_at).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })} · {r.redemption_date}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div style={{ paddingTop: 16, borderTop: '1px solid var(--border-subtle)', flexShrink: 0 }}>
              <button className="btn-secondary" onClick={() => setViewingRedemptions(null)} style={{ width: '100%', padding: '11px', borderRadius: 8, fontWeight: 700 }}>
                Close
              </button>
            </div>

          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        {...confirmAction}
      />
    </div>
  );
}
