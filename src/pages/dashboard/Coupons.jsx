import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../context/ToastContext';
import {
  Tag, Plus, Trash2, Edit2, Check, X, ToggleLeft, ToggleRight,
  Users, UserPlus, Search, Download, Shield, Sparkles, CheckCircle2,
  Clock, ArrowRight, Upload, Phone, Mail, ExternalLink, Copy, Minus, AlertCircle, ShoppingBag
} from 'lucide-react';
import { SkelList } from '../../components/Skeleton';
import CustomSelect from '../../components/CustomSelect';
import ConfirmModal from '../../components/ConfirmModal';
import PremiumDateInput from '../../components/PremiumDateInput';
import { useAuth } from '../../context/AuthContext';
import * as XLSX from 'xlsx';

const EMPTY_FORM = {
  code: '',
  type: 'percent',
  value: '',
  min_order_amount: '',
  max_uses: '',
  expires_at: '',
  is_active: true,
  is_restricted: false,
  max_uses_per_customer: 1
};

function fmt(n) { return '₦' + Number(n).toLocaleString(); }

function normalizePhone(p) {
  if (!p) return '';
  const digits = String(p).replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

export default function Coupons() {
  const { userRole, userPermissions } = useAuth();
  const isAdmin = userRole === 'Admin';
  const canManage = isAdmin || userRole === 'Manager' || (userPermissions || []).includes('Coupons:manage');
  const canDelete = isAdmin || userRole === 'Manager' || (userPermissions || []).includes('Coupons:delete');
  const { showToast } = useToast();

  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null | 'new' | coupon.id
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);

  // Customer Management Drawer state
  const [managingCoupon, setManagingCoupon] = useState(null); // coupon object or null

  const fetchCoupons = async () => {
    const { data, error } = await supabase
      .from('coupons')
      .select('*, coupon_eligible_customers(count)')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching coupons:', error);
    } else {
      // Format with eligible count
      const formatted = (data || []).map(c => ({
        ...c,
        eligible_count: c.coupon_eligible_customers?.[0]?.count || 0
      }));
      setCoupons(formatted);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchCoupons();
  }, []);

  const startNew = () => {
    setForm(EMPTY_FORM);
    setEditing('new');
  };

  const startEdit = (c) => {
    setForm({
      code: c.code,
      type: c.type,
      value: String(c.value),
      min_order_amount: c.min_order_amount != null ? String(c.min_order_amount) : '',
      max_uses: c.max_uses != null ? String(c.max_uses) : '',
      expires_at: c.expires_at ? c.expires_at.slice(0, 10) : '',
      is_active: c.is_active,
      is_restricted: c.is_restricted ?? false,
      max_uses_per_customer: c.max_uses_per_customer ?? 1
    });
    setEditing(c.id);
  };

  const cancel = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
  };

  const save = async () => {
    if (!form.code.trim()) {
      showToast('Required', 'Coupon code is required', 'error');
      return;
    }
    let finalValue = form.value;
    if (form.type === 'free_guinea_fowl') {
      finalValue = 0;
    } else {
      if (!finalValue || isNaN(Number(finalValue)) || Number(finalValue) <= 0) {
        showToast('Required', 'Enter a valid discount value', 'error');
        return;
      }
      if (form.type === 'percent' && Number(finalValue) > 100) {
        showToast('Invalid', 'Percentage discount cannot exceed 100%', 'error');
        return;
      }
    }

    const payload = {
      code: form.code.trim().toUpperCase(),
      type: form.type,
      value: Number(finalValue),
      min_order_amount: form.min_order_amount ? Number(form.min_order_amount) : null,
      max_uses: form.max_uses ? Number(form.max_uses) : null,
      expires_at: form.expires_at || null,
      is_active: form.is_active,
      is_restricted: Boolean(form.is_restricted),
      max_uses_per_customer: Math.max(1, Number(form.max_uses_per_customer) || 1)
    };

    setSaving(true);
    if (editing === 'new') {
      const { error } = await supabase.from('coupons').insert([{ ...payload, uses: 0 }]);
      if (error) {
        showToast('Error', error.message, 'error');
        setSaving(false);
        return;
      }
      showToast('Created', `Coupon ${payload.code} created successfully`, 'success');
    } else {
      const { error } = await supabase.from('coupons').update(payload).eq('id', editing);
      if (error) {
        showToast('Error', error.message, 'error');
        setSaving(false);
        return;
      }
      showToast('Saved', `Coupon ${payload.code} updated`, 'success');
    }
    setSaving(false);
    cancel();
    fetchCoupons();
  };

  const toggleActive = async (c) => {
    await supabase.from('coupons').update({ is_active: !c.is_active }).eq('id', c.id);
    fetchCoupons();
  };

  const deleteCoupon = (c) => {
    setConfirmAction({
      title: 'Delete Coupon',
      message: `Are you sure you want to delete coupon "${c.code}"? Any whitelisted customers and settings for this coupon will also be deleted.`,
      onConfirm: async () => {
        setConfirmAction(prev => ({ ...prev, isLoading: true }));
        const { error } = await supabase.from('coupons').delete().eq('id', c.id);
        if (error) {
          showToast('Error', error.message, 'error');
          setConfirmAction(null);
          return;
        }
        showToast('Deleted', `Coupon ${c.code} deleted`, 'success');
        fetchCoupons();
        setConfirmAction(null);
      }
    });
  };

  const setField = (k) => (e) => setForm(prev => ({ ...prev, [k]: e.target.value }));

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Tag size={22} color="var(--red)" />
          <h2 style={{ margin: 0, fontWeight: 900 }}>Coupons</h2>
        </div>
        {canManage && editing === null && (
          <button className="btn-primary" onClick={startNew} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px' }}>
            <Plus size={16} /> New Coupon
          </button>
        )}
      </div>

      {/* Create / Edit Modal */}
      {editing !== null && (
        <div className="product-form-modal" onClick={cancel}>
          <div className="product-form-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <h3 style={{ marginTop: 0, marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{editing === 'new' ? 'Create Coupon' : 'Edit Coupon'}</span>
              <button onClick={cancel} className="dash-drawer-close">
                <X size={16} />
              </button>
            </h3>

            <div style={{ display: 'grid', gap: 16 }}>
              <div className="form-group">
                <label style={{ fontWeight: 700, fontSize: '0.85rem' }}>Coupon Code *</label>
                <input
                  value={form.code}
                  onChange={e => setForm(p => ({ ...p, code: e.target.value.toUpperCase() }))}
                  placeholder="e.g. WELCOME10 or FREEFOWL08"
                  style={{ textTransform: 'uppercase', fontWeight: 700 }}
                />
              </div>

              <div className="form-group">
                <label style={{ fontWeight: 700, fontSize: '0.85rem' }}>Discount Type *</label>
                <CustomSelect
                  value={form.type}
                  onChange={setField('type')}
                  options={[
                    { value: 'percent', label: 'Percentage Discount (%)' },
                    { value: 'fixed', label: 'Fixed Amount Discount (₦)' },
                    { value: 'free_guinea_fowl', label: 'Free Guinea Fowl (1 Free Item)' }
                  ]}
                />
              </div>

              {form.type !== 'free_guinea_fowl' && (
                <div className="form-group">
                  <label style={{ fontWeight: 700, fontSize: '0.85rem' }}>Value * {form.type === 'percent' ? '(%)' : '(₦)'}</label>
                  <input
                    type="number"
                    min="0"
                    value={form.value}
                    onChange={setField('value')}
                    placeholder={form.type === 'percent' ? '10' : '500'}
                  />
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label style={{ fontWeight: 700, fontSize: '0.85rem' }}>Min Order (₦)</label>
                  <input
                    type="number"
                    min="0"
                    value={form.min_order_amount}
                    onChange={setField('min_order_amount')}
                    placeholder="Optional"
                  />
                </div>
                <div className="form-group">
                  <label style={{ fontWeight: 700, fontSize: '0.85rem' }}>Total Max Uses</label>
                  <input
                    type="number"
                    min="0"
                    value={form.max_uses}
                    onChange={setField('max_uses')}
                    placeholder="Unlimited"
                  />
                </div>
              </div>

              <div className="form-group">
                <label style={{ fontWeight: 700, fontSize: '0.85rem' }}>Expiration Date</label>
                <PremiumDateInput value={form.expires_at} onChange={setField('expires_at')} />
              </div>

              {/* Restriction Settings */}
              <div style={{
                background: form.is_restricted ? 'rgba(239, 68, 68, 0.06)' : 'rgba(0,0,0,0.03)',
                border: `1px solid ${form.is_restricted ? 'rgba(239, 68, 68, 0.25)' : 'var(--border-subtle)'}`,
                borderRadius: 10,
                padding: '14px 16px',
                display: 'grid',
                gap: 12
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Shield size={16} color={form.is_restricted ? 'var(--red)' : 'var(--text-muted)'} />
                      Restrict to Eligible Customers
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>
                      Only whitelisted customers (by phone/email) will be allowed to use this coupon.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    id="is_restricted"
                    checked={form.is_restricted}
                    onChange={e => setForm(p => ({ ...p, is_restricted: e.target.checked }))}
                    style={{ width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--red)' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 4, borderTop: '1px solid var(--border-subtle)', paddingTop: 10 }}>
                  <label style={{ fontWeight: 700, fontSize: '0.82rem' }}>Uses Allowed Per Customer</label>
                  <input
                    type="number"
                    min="1"
                    value={form.max_uses_per_customer}
                    onChange={e => setForm(p => ({ ...p, max_uses_per_customer: e.target.value }))}
                    placeholder="1"
                    style={{ maxWidth: 140 }}
                  />
                  <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                    Default times an eligible customer can redeem (can also be customized per customer).
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 0', borderTop: '1px solid var(--border-subtle)' }}>
                <input
                  type="checkbox"
                  id="is_active"
                  checked={form.is_active}
                  onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))}
                  style={{ width: 16, height: 16, cursor: 'pointer' }}
                />
                <label htmlFor="is_active" style={{ cursor: 'pointer', fontSize: '0.9rem', fontWeight: 700 }}>
                  Active (Can be applied at checkout)
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button className="btn-secondary" onClick={cancel} style={{ flex: 1, padding: '12px' }}>
                Cancel
              </button>
              <button className="btn-primary" onClick={save} disabled={saving} style={{ flex: 1, padding: '12px' }}>
                {saving ? 'Saving...' : 'Save Coupon'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Coupons List */}
      {loading ? (
        <SkelList rows={4} height={78} />
      ) : coupons.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
          <Tag size={48} style={{ opacity: 0.3, marginBottom: 16 }} />
          <p>No coupons yet. Create one to get started.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {coupons.map(c => (
            <div key={c.id} style={{
              background: 'var(--card-bg)',
              border: `1px solid ${c.is_active ? 'var(--border-subtle)' : 'rgba(255,255,255,0.05)'}`,
              borderRadius: 14,
              padding: '18px 22px',
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              flexWrap: 'wrap',
              opacity: c.is_active ? 1 : 0.6,
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
            }}>
              {/* Code badge */}
              <div style={{
                background: 'var(--black2)',
                padding: '6px 14px',
                borderRadius: 8,
                fontWeight: 900,
                fontSize: '1.05rem',
                letterSpacing: '0.05em',
                fontFamily: 'monospace',
                color: 'var(--text)',
                flexShrink: 0
              }}>
                {c.code}
              </div>

              {/* Discount Value */}
              <div style={{ flexShrink: 0 }}>
                <span style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--red)' }}>
                  {c.type === 'percent' ? `${c.value}% off` : c.type === 'free_guinea_fowl' ? '1 Free Guinea Fowl' : `${fmt(c.value)} off`}
                </span>
              </div>

              {/* Badges: Restriction & Status */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {c.is_restricted ? (
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '3px 10px',
                    borderRadius: 20,
                    fontWeight: 700,
                    fontSize: '0.75rem',
                    background: 'rgba(239, 68, 68, 0.12)',
                    color: 'var(--red)'
                  }}>
                    <Shield size={12} /> Restricted ({c.eligible_count} Eligible)
                  </span>
                ) : (
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '3px 10px',
                    borderRadius: 20,
                    fontWeight: 700,
                    fontSize: '0.75rem',
                    background: 'rgba(59, 130, 246, 0.1)',
                    color: '#2563eb'
                  }}>
                    <Sparkles size={12} /> Public (All Customers)
                  </span>
                )}

                <span style={{
                  padding: '3px 10px',
                  borderRadius: 20,
                  fontWeight: 700,
                  fontSize: '0.75rem',
                  background: c.is_active ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.06)',
                  color: c.is_active ? '#16a34a' : 'var(--text-muted)'
                }}>
                  {c.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>

              {/* Meta details */}
              <div style={{ flex: 1, display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                {c.min_order_amount != null && <span>Min Order: {fmt(c.min_order_amount)}</span>}
                <span>Redeemed: <strong>{c.uses ?? 0}</strong>{c.max_uses != null ? ` / ${c.max_uses}` : ''}</span>
                <span>Per Customer: {c.max_uses_per_customer || 1}x</span>
                {c.expires_at && <span>Expires: {new Date(c.expires_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                {/* Manage Customers & Redemptions Button */}
                <button
                  onClick={() => setManagingCoupon(c)}
                  style={{
                    background: 'var(--white)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 8,
                    padding: '8px 14px',
                    cursor: 'pointer',
                    color: 'var(--text)',
                    fontWeight: 700,
                    fontSize: '0.82rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                  }}
                  title="Manage Eligible Customers & Redemption History"
                >
                  <Users size={15} color="var(--red)" />
                  <span>Customers</span>
                  {c.eligible_count > 0 && (
                    <span style={{
                      background: 'var(--red)',
                      color: '#fff',
                      fontSize: '0.7rem',
                      fontWeight: 800,
                      padding: '1px 6px',
                      borderRadius: 10
                    }}>
                      {c.eligible_count}
                    </span>
                  )}
                </button>

                {canManage && (
                  <>
                    <button
                      onClick={() => toggleActive(c)}
                      title={c.is_active ? 'Deactivate' : 'Activate'}
                      style={{ background: 'none', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '7px 10px', cursor: 'pointer', color: c.is_active ? '#16a34a' : 'var(--text-muted)', display: 'flex' }}
                    >
                      {c.is_active ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                    </button>
                    <button
                      onClick={() => startEdit(c)}
                      title="Edit Coupon Settings"
                      style={{ background: 'none', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '7px 10px', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}
                    >
                      <Edit2 size={16} />
                    </button>
                  </>
                )}

                {canDelete && (
                  <button
                    onClick={() => deleteCoupon(c)}
                    title="Delete Coupon"
                    style={{ background: 'none', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '7px 10px', cursor: 'pointer', color: '#ef4444', display: 'flex' }}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Customer Whitelist & Redemption Management Drawer */}
      {managingCoupon && (
        <CustomerManagerDrawer
          coupon={managingCoupon}
          onClose={() => {
            setManagingCoupon(null);
            fetchCoupons();
          }}
          canManage={canManage}
        />
      )}

      <ConfirmModal
        isOpen={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        {...confirmAction}
      />
    </div>
  );
}

// ----------------------------------------------------------------------------------
// Customer Whitelist & Redemption Management Drawer
// ----------------------------------------------------------------------------------

function CustomerManagerDrawer({ coupon, onClose, canManage }) {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState('unredeemed'); // 'unredeemed' | 'redeemed' | 'add'
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [eligibleCustomers, setEligibleCustomers] = useState([]);
  const [redeemedOrders, setRedeemedOrders] = useState([]);

  const [confirmDelete, setConfirmDelete] = useState(null);

  // Add customer sub-state
  const [addMode, setAddMode] = useState('order_lookup'); // 'order_lookup' | 'manual' | 'bulk'
  const [orderQuery, setOrderQuery] = useState('');
  const [lookingUpOrder, setLookingUpOrder] = useState(false);
  const [foundOrder, setFoundOrder] = useState(null);
  const [orderMaxUses, setOrderMaxUses] = useState(coupon.max_uses_per_customer || 1);

  // Manual form state
  const [manualForm, setManualForm] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    reference_order_id: '',
    max_uses: coupon.max_uses_per_customer || 1
  });
  const [addingManual, setAddingManual] = useState(false);

  // Bulk paste state
  const [bulkText, setBulkText] = useState('');
  const [bulkMaxUses, setBulkMaxUses] = useState(coupon.max_uses_per_customer || 1);
  const [addingBulk, setAddingBulk] = useState(false);

  // Inline limit updater
  const [savingLimitId, setSavingLimitId] = useState(null);

  const fetchDrawerData = async () => {
    setLoading(true);

    // 1. Fetch eligible customers
    const { data: eligibleData, error: eligibleError } = await supabase
      .from('coupon_eligible_customers')
      .select('*')
      .eq('coupon_id', coupon.id)
      .order('created_at', { ascending: false });

    if (eligibleError) {
      console.error('Error fetching eligible customers:', eligibleError);
    }

    // 2. Fetch redeemed orders
    const { data: ordersData, error: ordersError } = await supabase
      .from('orders')
      .select('id, customer_name, customer_phone, customer_email, total, coupon_discount, status, created_at, delivery_address')
      .ilike('coupon_code', coupon.code)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false });

    if (ordersError) {
      console.error('Error fetching orders:', ordersError);
    }

    setEligibleCustomers(eligibleData || []);
    setRedeemedOrders(ordersData || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchDrawerData();
  }, [coupon.id]);

  // Correlate redeemed counts per eligible customer
  const enrichedEligible = useMemo(() => {
    return eligibleCustomers.map(cust => {
      const custDigits = normalizePhone(cust.customer_phone);
      const custEmail = (cust.customer_email || '').toLowerCase().trim();

      // Count matching completed orders
      const matchingOrders = redeemedOrders.filter(o => {
        const oDigits = normalizePhone(o.customer_phone);
        const oEmail = (o.customer_email || '').toLowerCase().trim();
        const phoneMatch = custDigits && oDigits && custDigits === oDigits;
        const emailMatch = custEmail && oEmail && custEmail === oEmail;
        return phoneMatch || emailMatch;
      });

      const usedCount = matchingOrders.length;
      const maxAllowed = cust.max_uses || coupon.max_uses_per_customer || 1;
      const remainingUses = Math.max(0, maxAllowed - usedCount);
      const isFullyRedeemed = usedCount >= maxAllowed;

      return {
        ...cust,
        usedCount,
        maxAllowed,
        remainingUses,
        isFullyRedeemed,
        matchingOrders
      };
    });
  }, [eligibleCustomers, redeemedOrders, coupon.max_uses_per_customer]);

  // Filter unredeemed list
  const unredeemedList = useMemo(() => {
    return enrichedEligible.filter(c => {
      // Must have remaining uses
      if (c.isFullyRedeemed) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase().trim();
      return (
        (c.customer_name || '').toLowerCase().includes(q) ||
        (c.customer_phone || '').includes(q) ||
        (c.customer_email || '').toLowerCase().includes(q) ||
        (c.reference_order_id || '').toLowerCase().includes(q)
      );
    });
  }, [enrichedEligible, search]);

  // Filter redeemed orders list
  const filteredRedeemedOrders = useMemo(() => {
    if (!search.trim()) return redeemedOrders;
    const q = search.toLowerCase().trim();
    return redeemedOrders.filter(o =>
      (o.id || '').toLowerCase().includes(q) ||
      (o.customer_name || '').toLowerCase().includes(q) ||
      (o.customer_phone || '').includes(q) ||
      (o.customer_email || '').toLowerCase().includes(q)
    );
  }, [redeemedOrders, search]);

  // 1-Click Order Lookup
  const handleLookupOrder = async (e) => {
    e?.preventDefault();
    const cleanId = orderQuery.trim().replace(/^#/, '');
    if (!cleanId) return;

    setLookingUpOrder(true);
    setFoundOrder(null);

    const { data, error } = await supabase
      .from('orders')
      .select('id, customer_name, customer_phone, customer_email, delivery_address, total, created_at')
      .ilike('id', `%${cleanId}%`)
      .limit(1)
      .maybeSingle();

    setLookingUpOrder(false);
    if (error || !data) {
      showToast('Order not found', `Could not find an order matching "${cleanId}"`, 'error');
      return;
    }
    setFoundOrder(data);
  };

  const handleAddFoundOrder = async () => {
    if (!foundOrder) return;

    // Check if already in whitelist
    const phoneDigits = normalizePhone(foundOrder.customer_phone);
    const email = (foundOrder.customer_email || '').toLowerCase().trim();

    const exists = eligibleCustomers.some(c =>
      (phoneDigits && normalizePhone(c.customer_phone) === phoneDigits) ||
      (email && (c.customer_email || '').toLowerCase().trim() === email)
    );

    if (exists) {
      showToast('Already Eligible', 'This customer is already in the eligible whitelist for this coupon.', 'error');
      return;
    }

    const { error } = await supabase.from('coupon_eligible_customers').insert([{
      coupon_id: coupon.id,
      customer_name: foundOrder.customer_name,
      customer_phone: foundOrder.customer_phone,
      customer_email: foundOrder.customer_email,
      customer_address: foundOrder.delivery_address,
      reference_order_id: foundOrder.id,
      max_uses: Math.max(1, Number(orderMaxUses) || 1)
    }]);

    if (error) {
      showToast('Error', error.message, 'error');
      return;
    }

    showToast('Customer Added', `${foundOrder.customer_name} added to whitelist for ${coupon.code}`, 'success');
    setFoundOrder(null);
    setOrderQuery('');
    fetchDrawerData();
    setActiveTab('unredeemed');
  };

  // Manual Customer Addition
  const handleAddManual = async (e) => {
    e?.preventDefault();
    if (!manualForm.phone.trim() && !manualForm.email.trim()) {
      showToast('Missing Contact', 'Please provide at least a phone number or email address', 'error');
      return;
    }

    setAddingManual(true);
    const { error } = await supabase.from('coupon_eligible_customers').insert([{
      coupon_id: coupon.id,
      customer_name: manualForm.name.trim() || null,
      customer_phone: manualForm.phone.trim() || null,
      customer_email: manualForm.email.trim() || null,
      customer_address: manualForm.address.trim() || null,
      reference_order_id: manualForm.reference_order_id.trim() || null,
      max_uses: Math.max(1, Number(manualForm.max_uses) || 1)
    }]);
    setAddingManual(false);

    if (error) {
      showToast('Error', error.message, 'error');
      return;
    }

    showToast('Customer Added', `${manualForm.name || manualForm.phone} added to whitelist`, 'success');
    setManualForm({
      name: '',
      phone: '',
      email: '',
      address: '',
      reference_order_id: '',
      max_uses: coupon.max_uses_per_customer || 1
    });
    fetchDrawerData();
    setActiveTab('unredeemed');
  };

  // Bulk Paste Addition
  const handleAddBulk = async () => {
    if (!bulkText.trim()) {
      showToast('Empty list', 'Please paste at least one phone number or email', 'error');
      return;
    }

    setAddingBulk(true);
    const lines = bulkText.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
    const toInsert = [];

    for (const item of lines) {
      if (item.includes('@')) {
        toInsert.push({
          coupon_id: coupon.id,
          customer_email: item.toLowerCase(),
          max_uses: Math.max(1, Number(bulkMaxUses) || 1)
        });
      } else if (/\d{7,15}/.test(item)) {
        toInsert.push({
          coupon_id: coupon.id,
          customer_phone: item,
          max_uses: Math.max(1, Number(bulkMaxUses) || 1)
        });
      } else if (item.startsWith('SHD-') || item.startsWith('#SHD-')) {
        toInsert.push({
          coupon_id: coupon.id,
          reference_order_id: item.replace(/^#/, ''),
          max_uses: Math.max(1, Number(bulkMaxUses) || 1)
        });
      }
    }

    if (toInsert.length === 0) {
      showToast('Invalid items', 'No valid phone numbers, emails, or order IDs detected', 'error');
      setAddingBulk(false);
      return;
    }

    const { error } = await supabase.from('coupon_eligible_customers').insert(toInsert);
    setAddingBulk(false);

    if (error) {
      showToast('Error', error.message, 'error');
      return;
    }

    showToast('Success', `Added ${toInsert.length} eligible customer entries`, 'success');
    setBulkText('');
    fetchDrawerData();
    setActiveTab('unredeemed');
  };

  // Update Max Uses inline
  const handleUpdateLimit = async (customerId, newLimit) => {
    const val = Math.max(1, Number(newLimit) || 1);
    setSavingLimitId(customerId);
    const { error } = await supabase
      .from('coupon_eligible_customers')
      .update({ max_uses: val })
      .eq('id', customerId);

    setSavingLimitId(null);
    if (error) {
      showToast('Error', error.message, 'error');
      return;
    }
    showToast('Updated', `Limit updated to ${val} use(s)`, 'success');
    fetchDrawerData();
  };

  // Remove customer from whitelist
  const handleRemoveCustomer = (customer) => {
    setConfirmDelete({
      title: 'Remove Customer from Whitelist?',
      message: `Remove "${customer.customer_name || customer.customer_phone || customer.customer_email}" from ${coupon.code}? They will no longer be eligible to use this coupon.`,
      onConfirm: async () => {
        const { error } = await supabase.from('coupon_eligible_customers').delete().eq('id', customer.id);
        if (error) {
          showToast('Error', error.message, 'error');
          setConfirmDelete(null);
          return;
        }
        showToast('Removed', 'Customer removed from whitelist', 'success');
        setConfirmDelete(null);
        fetchDrawerData();
      }
    });
  };

  // Export to Excel
  const exportEligibleExcel = () => {
    if (unredeemedList.length === 0) {
      showToast('Nothing to export', 'No unredeemed customers to export', 'error');
      return;
    }
    const rows = unredeemedList.map((c, i) => ({
      '#': i + 1,
      'Customer Name': c.customer_name || '—',
      'Phone Number': c.customer_phone || '—',
      'Email Address': c.customer_email || '—',
      'Reference Order ID': c.reference_order_id || '—',
      'Delivery Address': c.customer_address || '—',
      'Max Allowed Uses': c.maxAllowed,
      'Uses Completed': c.usedCount,
      'Remaining Uses': c.remainingUses,
      'Date Added': new Date(c.created_at).toLocaleDateString('en-NG')
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Eligible Customers');
    XLSX.writeFile(wb, `Coupon_${coupon.code}_Eligible_Unredeemed.xlsx`);
    showToast('Exported', 'Excel spreadsheet downloaded', 'success');
  };

  const exportRedeemedExcel = () => {
    if (redeemedOrders.length === 0) {
      showToast('Nothing to export', 'No redeemed orders yet', 'error');
      return;
    }
    const rows = redeemedOrders.map((o, i) => ({
      '#': i + 1,
      'Order ID': o.id,
      'Customer Name': o.customer_name || '—',
      'Phone Number': o.customer_phone || '—',
      'Email Address': o.customer_email || '—',
      'Order Total (₦)': o.total,
      'Coupon Discount (₦)': o.coupon_discount || 0,
      'Order Status': o.status,
      'Date Redeemed': new Date(o.created_at).toLocaleString('en-NG')
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Redeemed Orders');
    XLSX.writeFile(wb, `Coupon_${coupon.code}_Redeemed_Orders.xlsx`);
    showToast('Exported', 'Excel spreadsheet downloaded', 'success');
  };

  const totalRedeemedRevenue = redeemedOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
  const totalDiscountGiven = redeemedOrders.reduce((sum, o) => sum + (Number(o.coupon_discount) || 0), 0);

  return (
    <div className="product-form-modal" onClick={onClose}>
      <div
        className="product-form-card"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: 860, width: '94vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}
      >
        {/* Drawer Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ background: 'var(--black2)', padding: '5px 12px', borderRadius: 8, fontWeight: 900, fontFamily: 'monospace', fontSize: '1.1rem', color: 'var(--text)' }}>
                {coupon.code}
              </div>
              <span style={{ fontWeight: 800, color: 'var(--red)', fontSize: '0.95rem' }}>
                {coupon.type === 'percent' ? `${coupon.value}% off` : coupon.type === 'free_guinea_fowl' ? '1 Free Guinea Fowl' : `${fmt(coupon.value)} off`}
              </span>
              {coupon.is_restricted ? (
                <span style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--red)', fontSize: '0.75rem', fontWeight: 800, padding: '3px 8px', borderRadius: 12 }}>
                  Restricted Whitelist
                </span>
              ) : (
                <span style={{ background: 'rgba(59,130,246,0.1)', color: '#2563eb', fontSize: '0.75rem', fontWeight: 800, padding: '3px 8px', borderRadius: 12 }}>
                  Public Coupon
                </span>
              )}
            </div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 4 }}>
              Manage customer eligibility whitelist, customize usage limits, and track redemption history.
            </div>
          </div>
          <button onClick={onClose} className="dash-drawer-close" style={{ margin: 0 }}>
            <X size={18} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', background: 'rgba(0,0,0,0.02)', padding: '0 24px' }}>
          <button
            onClick={() => setActiveTab('unredeemed')}
            style={{
              padding: '14px 18px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'unredeemed' ? '2px solid var(--red)' : '2px solid transparent',
              color: activeTab === 'unredeemed' ? 'var(--red)' : 'var(--text-muted)',
              fontWeight: 800,
              fontSize: '0.88rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}
          >
            <Clock size={16} />
            <span>Eligible (Unredeemed)</span>
            <span style={{
              background: activeTab === 'unredeemed' ? 'var(--red)' : 'rgba(0,0,0,0.08)',
              color: activeTab === 'unredeemed' ? '#fff' : 'var(--text-muted)',
              fontSize: '0.72rem',
              padding: '1px 7px',
              borderRadius: 10,
              fontWeight: 800
            }}>
              {enrichedEligible.filter(c => !c.isFullyRedeemed).length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('redeemed')}
            style={{
              padding: '14px 18px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'redeemed' ? '2px solid var(--red)' : '2px solid transparent',
              color: activeTab === 'redeemed' ? 'var(--red)' : 'var(--text-muted)',
              fontWeight: 800,
              fontSize: '0.88rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}
          >
            <CheckCircle2 size={16} />
            <span>Redeemed Orders</span>
            <span style={{
              background: activeTab === 'redeemed' ? 'var(--red)' : 'rgba(0,0,0,0.08)',
              color: activeTab === 'redeemed' ? '#fff' : 'var(--text-muted)',
              fontSize: '0.72rem',
              padding: '1px 7px',
              borderRadius: 10,
              fontWeight: 800
            }}>
              {redeemedOrders.length}
            </span>
          </button>

          {canManage && (
            <button
              onClick={() => setActiveTab('add')}
              style={{
                padding: '14px 18px',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === 'add' ? '2px solid var(--red)' : '2px solid transparent',
                color: activeTab === 'add' ? 'var(--red)' : 'var(--text-muted)',
                fontWeight: 800,
                fontSize: '0.88rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginLeft: 'auto'
              }}
            >
              <UserPlus size={16} />
              <span>Add / Import Customers</span>
            </button>
          )}
        </div>

        {/* Tab Body */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          {/* TAB 1: UNREDEEMED CUSTOMERS */}
          {activeTab === 'unredeemed' && (
            <div>
              {/* Toolbar */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
                  <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search by name, phone, email, or order ID..."
                    style={{ paddingLeft: 34, width: '100%', fontSize: '0.85rem' }}
                  />
                  {search && (
                    <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                      <X size={14} />
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={exportEligibleExcel}
                    className="btn-secondary"
                    style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', padding: '8px 14px' }}
                    title="Export unredeemed list to Excel spreadsheet"
                  >
                    <Download size={14} /> Export Excel
                  </button>
                  {canManage && (
                    <button
                      onClick={() => setActiveTab('add')}
                      className="btn-primary"
                      style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', padding: '8px 14px' }}
                    >
                      <Plus size={14} /> Add Customer
                    </button>
                  )}
                </div>
              </div>

              {/* Table */}
              {loading ? (
                <SkelList rows={4} height={54} />
              ) : unredeemedList.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-muted)', background: 'rgba(0,0,0,0.02)', borderRadius: 12 }}>
                  <Users size={36} style={{ opacity: 0.3, marginBottom: 12 }} />
                  <h4 style={{ margin: 0, fontWeight: 800 }}>No unredeemed customers found</h4>
                  <p style={{ margin: '6px 0 16px', fontSize: '0.85rem' }}>
                    {search ? 'Try clearing your search query' : 'All whitelisted customers have already redeemed, or none have been added yet.'}
                  </p>
                  {canManage && !search && (
                    <button className="btn-primary" onClick={() => setActiveTab('add')} style={{ fontSize: '0.85rem' }}>
                      <UserPlus size={14} style={{ marginRight: 6 }} /> Add Customers Now
                    </button>
                  )}
                </div>
              ) : (
                <div style={{ overflowX: 'auto', border: '1px solid var(--border-subtle)', borderRadius: 10 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ background: 'rgba(0,0,0,0.03)', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', fontWeight: 700 }}>
                        <th style={{ padding: '10px 14px' }}>Customer</th>
                        <th style={{ padding: '10px 14px' }}>Contact Info</th>
                        <th style={{ padding: '10px 14px' }}>Reference Order</th>
                        <th style={{ padding: '10px 14px', textAlign: 'center' }}>Allowed Uses</th>
                        <th style={{ padding: '10px 14px', textAlign: 'center' }}>Remaining</th>
                        {canManage && <th style={{ padding: '10px 14px', textAlign: 'right' }}>Action</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {unredeemedList.map(c => (
                        <tr key={c.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                          {/* Name & Address */}
                          <td style={{ padding: '12px 14px' }}>
                            <div style={{ fontWeight: 800, color: 'var(--text)' }}>
                              {c.customer_name || 'Customer'}
                            </div>
                            {c.customer_address && (
                              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.customer_address}>
                                {c.customer_address}
                              </div>
                            )}
                          </td>

                          {/* Phone & Email with Copy */}
                          <td style={{ padding: '12px 14px' }}>
                            {c.customer_phone && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'monospace', fontWeight: 700 }}>
                                <Phone size={12} color="var(--text-muted)" />
                                <span>{c.customer_phone}</span>
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(c.customer_phone);
                                    showToast('Copied', 'Phone copied to clipboard', 'info');
                                  }}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--text-muted)' }}
                                  title="Copy phone"
                                >
                                  <Copy size={11} />
                                </button>
                              </div>
                            )}
                            {c.customer_email && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>
                                <Mail size={12} />
                                <span>{c.customer_email}</span>
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(c.customer_email);
                                    showToast('Copied', 'Email copied to clipboard', 'info');
                                  }}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--text-muted)' }}
                                  title="Copy email"
                                >
                                  <Copy size={11} />
                                </button>
                              </div>
                            )}
                          </td>

                          {/* Reference Order ID */}
                          <td style={{ padding: '12px 14px' }}>
                            {c.reference_order_id ? (
                              <span style={{ background: 'var(--black2)', padding: '3px 8px', borderRadius: 6, fontFamily: 'monospace', fontWeight: 800, fontSize: '0.78rem' }}>
                                #{c.reference_order_id.replace(/^#/, '')}
                              </span>
                            ) : (
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Direct Entry</span>
                            )}
                          </td>

                          {/* Allowed Uses (Inline Stepper) */}
                          <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                            {canManage ? (
                              <div style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid var(--border-subtle)', borderRadius: 6, background: '#fff' }}>
                                <button
                                  onClick={() => handleUpdateLimit(c.id, Math.max(1, c.maxAllowed - 1))}
                                  disabled={c.maxAllowed <= 1 || savingLimitId === c.id}
                                  style={{ width: 26, height: 26, border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                >
                                  <Minus size={12} />
                                </button>
                                <span style={{ width: 28, textAlign: 'center', fontWeight: 800, fontSize: '0.85rem' }}>
                                  {c.maxAllowed}
                                </span>
                                <button
                                  onClick={() => handleUpdateLimit(c.id, c.maxAllowed + 1)}
                                  disabled={savingLimitId === c.id}
                                  style={{ width: 26, height: 26, border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                >
                                  <Plus size={12} />
                                </button>
                              </div>
                            ) : (
                              <span style={{ fontWeight: 800 }}>{c.maxAllowed}</span>
                            )}
                          </td>

                          {/* Remaining Uses */}
                          <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                            <span style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: 10,
                              fontWeight: 800,
                              fontSize: '0.75rem',
                              background: c.remainingUses > 0 ? 'rgba(34,197,94,0.12)' : 'rgba(0,0,0,0.06)',
                              color: c.remainingUses > 0 ? '#16a34a' : 'var(--text-muted)'
                            }}>
                              {c.remainingUses} left
                            </span>
                          </td>

                          {/* Actions */}
                          {canManage && (
                            <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                              <button
                                onClick={() => handleRemoveCustomer(c)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 4 }}
                                title="Remove customer from whitelist"
                              >
                                <Trash2 size={16} />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: REDEEMED ORDERS */}
          {activeTab === 'redeemed' && (
            <div>
              {/* Summary KPIs */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 18 }}>
                <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '12px 16px' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700 }}>Total Redemptions</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--text)', marginTop: 2 }}>{redeemedOrders.length}</div>
                </div>
                <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '12px 16px' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700 }}>Total Sales with Coupon</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#16a34a', marginTop: 2 }}>{fmt(totalRedeemedRevenue)}</div>
                </div>
                <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '12px 16px' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700 }}>Total Discount Given</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--red)', marginTop: 2 }}>{fmt(totalDiscountGiven)}</div>
                </div>
              </div>

              {/* Toolbar */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
                  <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search redeemed orders by order ID, name, phone..."
                    style={{ paddingLeft: 34, width: '100%', fontSize: '0.85rem' }}
                  />
                </div>
                <button
                  onClick={exportRedeemedExcel}
                  className="btn-secondary"
                  style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', padding: '8px 14px' }}
                >
                  <Download size={14} /> Export Redeemed Orders
                </button>
              </div>

              {/* Orders Table */}
              {loading ? (
                <SkelList rows={4} height={54} />
              ) : filteredRedeemedOrders.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-muted)', background: 'rgba(0,0,0,0.02)', borderRadius: 12 }}>
                  <ShoppingBag size={36} style={{ opacity: 0.3, marginBottom: 12 }} />
                  <h4 style={{ margin: 0, fontWeight: 800 }}>No redeemed orders yet</h4>
                  <p style={{ margin: '6px 0 0', fontSize: '0.85rem' }}>
                    {search ? 'No orders match your search filter' : 'When an eligible customer completes an order with this coupon code, it will automatically appear here.'}
                  </p>
                </div>
              ) : (
                <div style={{ overflowX: 'auto', border: '1px solid var(--border-subtle)', borderRadius: 10 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ background: 'rgba(0,0,0,0.03)', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', fontWeight: 700 }}>
                        <th style={{ padding: '10px 14px' }}>Order ID</th>
                        <th style={{ padding: '10px 14px' }}>Customer</th>
                        <th style={{ padding: '10px 14px' }}>Contact</th>
                        <th style={{ padding: '10px 14px', textAlign: 'right' }}>Total Paid</th>
                        <th style={{ padding: '10px 14px', textAlign: 'right' }}>Discount</th>
                        <th style={{ padding: '10px 14px' }}>Date</th>
                        <th style={{ padding: '10px 14px', textAlign: 'center' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRedeemedOrders.map(o => (
                        <tr key={o.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                          <td style={{ padding: '12px 14px' }}>
                            <a
                              href={`/admin/orders?search=${o.id}`}
                              target="_blank"
                              rel="noreferrer"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'monospace', fontWeight: 800, color: 'var(--red)', textDecoration: 'none' }}
                            >
                              #{o.id} <ExternalLink size={11} />
                            </a>
                          </td>
                          <td style={{ padding: '12px 14px', fontWeight: 800, color: 'var(--text)' }}>
                            {o.customer_name || 'Customer'}
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            <div style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{o.customer_phone || '—'}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{o.customer_email || '—'}</div>
                          </td>
                          <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 800 }}>
                            {fmt(o.total)}
                          </td>
                          <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 800, color: 'var(--red)' }}>
                            {o.coupon_discount ? fmt(o.coupon_discount) : 'Free Item'}
                          </td>
                          <td style={{ padding: '12px 14px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            {new Date(o.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                            <span style={{
                              padding: '2px 8px',
                              borderRadius: 12,
                              fontSize: '0.72rem',
                              fontWeight: 800,
                              background: o.status === 'delivered' ? 'rgba(34,197,94,0.12)' : o.status === 'processing' ? 'rgba(59,130,246,0.1)' : 'rgba(0,0,0,0.06)',
                              color: o.status === 'delivered' ? '#16a34a' : o.status === 'processing' ? '#2563eb' : 'var(--text)'
                            }}>
                              {o.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: ADD / IMPORT CUSTOMERS */}
          {activeTab === 'add' && canManage && (
            <div style={{ maxWidth: 640, margin: '0 auto' }}>
              {/* Mode Switcher */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 20, background: 'rgba(0,0,0,0.03)', padding: 4, borderRadius: 10 }}>
                <button
                  type="button"
                  onClick={() => setAddMode('order_lookup')}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: 'none',
                    fontWeight: 800,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                    background: addMode === 'order_lookup' ? '#fff' : 'transparent',
                    color: addMode === 'order_lookup' ? 'var(--text)' : 'var(--text-muted)',
                    boxShadow: addMode === 'order_lookup' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'
                  }}
                >
                  ⚡ Quick Order Lookup
                </button>
                <button
                  type="button"
                  onClick={() => setAddMode('manual')}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: 'none',
                    fontWeight: 800,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                    background: addMode === 'manual' ? '#fff' : 'transparent',
                    color: addMode === 'manual' ? 'var(--text)' : 'var(--text-muted)',
                    boxShadow: addMode === 'manual' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'
                  }}
                >
                  📝 Manual Form
                </button>
                <button
                  type="button"
                  onClick={() => setAddMode('bulk')}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: 'none',
                    fontWeight: 800,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                    background: addMode === 'bulk' ? '#fff' : 'transparent',
                    color: addMode === 'bulk' ? 'var(--text)' : 'var(--text-muted)',
                    boxShadow: addMode === 'bulk' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'
                  }}
                >
                  📋 Bulk Paste
                </button>
              </div>

              {/* Mode 1: Quick Order Lookup */}
              {addMode === 'order_lookup' && (
                <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: 20 }}>
                  <div style={{ fontWeight: 800, fontSize: '0.95rem', marginBottom: 4 }}>
                    Look up customer from an existing order
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 16 }}>
                    Type an Order ID (e.g. <code>SHD-06595</code>) to automatically retrieve customer details and qualify them in 1 click.
                  </div>

                  <form onSubmit={handleLookupOrder} style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                    <input
                      value={orderQuery}
                      onChange={e => setOrderQuery(e.target.value)}
                      placeholder="e.g. SHD-06595 or 06595"
                      style={{ flex: 1, fontWeight: 700 }}
                    />
                    <button type="submit" className="btn-secondary" disabled={lookingUpOrder} style={{ padding: '10px 18px', fontWeight: 800 }}>
                      {lookingUpOrder ? 'Searching...' : 'Lookup Order'}
                    </button>
                  </form>

                  {/* Order Lookup Result Card */}
                  {foundOrder && (
                    <div style={{
                      background: 'rgba(34,197,94,0.05)',
                      border: '1px solid rgba(34,197,94,0.25)',
                      borderRadius: 10,
                      padding: 16,
                      marginTop: 12
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <div style={{ fontWeight: 900, color: 'var(--text)', fontSize: '1rem' }}>
                          #{foundOrder.id} — {foundOrder.customer_name}
                        </div>
                        <span style={{ background: '#16a34a', color: '#fff', fontSize: '0.72rem', fontWeight: 800, padding: '2px 8px', borderRadius: 8 }}>
                          Found
                        </span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: '0.83rem', marginBottom: 14 }}>
                        <div><strong>Phone:</strong> {foundOrder.customer_phone || '—'}</div>
                        <div><strong>Email:</strong> {foundOrder.customer_email || '—'}</div>
                        <div style={{ gridColumn: 'span 2' }}><strong>Address:</strong> {foundOrder.delivery_address || '—'}</div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>Allowed Uses:</span>
                          <input
                            type="number"
                            min="1"
                            value={orderMaxUses}
                            onChange={e => setOrderMaxUses(e.target.value)}
                            style={{ width: 60, padding: '4px 8px', textAlign: 'center', fontWeight: 800 }}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={handleAddFoundOrder}
                          className="btn-primary"
                          style={{ padding: '8px 18px', fontSize: '0.85rem' }}
                        >
                          <Check size={14} style={{ marginRight: 6 }} /> Add to Whitelist
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Mode 2: Manual Customer Form */}
              {addMode === 'manual' && (
                <form onSubmit={handleAddManual} style={{ background: 'var(--card-bg)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: 20, display: 'grid', gap: 14 }}>
                  <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>Manually Add Eligible Customer</div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="form-group">
                      <label style={{ fontWeight: 700, fontSize: '0.82rem' }}>Customer Name</label>
                      <input
                        value={manualForm.name}
                        onChange={e => setManualForm(p => ({ ...p, name: e.target.value }))}
                        placeholder="e.g. John Doe"
                      />
                    </div>
                    <div className="form-group">
                      <label style={{ fontWeight: 700, fontSize: '0.82rem' }}>Phone Number *</label>
                      <input
                        value={manualForm.phone}
                        onChange={e => setManualForm(p => ({ ...p, phone: e.target.value }))}
                        placeholder="e.g. 08012345678"
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="form-group">
                      <label style={{ fontWeight: 700, fontSize: '0.82rem' }}>Email Address *</label>
                      <input
                        type="email"
                        value={manualForm.email}
                        onChange={e => setManualForm(p => ({ ...p, email: e.target.value }))}
                        placeholder="e.g. user@example.com"
                      />
                    </div>
                    <div className="form-group">
                      <label style={{ fontWeight: 700, fontSize: '0.82rem' }}>Reference Order ID (optional)</label>
                      <input
                        value={manualForm.reference_order_id}
                        onChange={e => setManualForm(p => ({ ...p, reference_order_id: e.target.value }))}
                        placeholder="e.g. SHD-06595"
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label style={{ fontWeight: 700, fontSize: '0.82rem' }}>Address / Delivery Note (optional)</label>
                    <input
                      value={manualForm.address}
                      onChange={e => setManualForm(p => ({ ...p, address: e.target.value }))}
                      placeholder="e.g. 17b Kingsley Emu Street Lekki Phase 1"
                    />
                  </div>

                  <div className="form-group">
                    <label style={{ fontWeight: 700, fontSize: '0.82rem' }}>Allowed Number of Times to Use</label>
                    <input
                      type="number"
                      min="1"
                      value={manualForm.max_uses}
                      onChange={e => setManualForm(p => ({ ...p, max_uses: e.target.value }))}
                      style={{ maxWidth: 120, fontWeight: 800 }}
                    />
                  </div>

                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={addingManual}
                    style={{ marginTop: 8, padding: '12px', fontWeight: 800 }}
                  >
                    {addingManual ? 'Adding Customer...' : 'Add Customer to Whitelist'}
                  </button>
                </form>
              )}

              {/* Mode 3: Bulk Paste */}
              {addMode === 'bulk' && (
                <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: 20 }}>
                  <div style={{ fontWeight: 800, fontSize: '0.95rem', marginBottom: 4 }}>Bulk Paste Whitelist</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 14 }}>
                    Paste a list of customer phone numbers, email addresses, or order IDs. You can separate them with newlines or commas.
                  </div>

                  <textarea
                    rows={6}
                    value={bulkText}
                    onChange={e => setBulkText(e.target.value)}
                    placeholder={"08012345678\n09087654321\ncustomer@example.com\nSHD-06595"}
                    style={{ width: '100%', padding: 12, fontSize: '0.88rem', fontFamily: 'monospace', borderRadius: 8, border: '1px solid var(--border-subtle)', resize: 'vertical' }}
                  />

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>Allowed Uses per customer:</span>
                      <input
                        type="number"
                        min="1"
                        value={bulkMaxUses}
                        onChange={e => setBulkMaxUses(e.target.value)}
                        style={{ width: 60, padding: '4px 8px', textAlign: 'center', fontWeight: 800 }}
                      />
                    </div>

                    <button
                      onClick={handleAddBulk}
                      disabled={addingBulk}
                      className="btn-primary"
                      style={{ padding: '10px 20px', fontWeight: 800 }}
                    >
                      {addingBulk ? 'Processing...' : 'Process & Add All'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        {...confirmDelete}
      />
    </div>
  );
}
