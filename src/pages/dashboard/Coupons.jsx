import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../context/ToastContext';
import { Tag, Plus, Trash2, Edit2, Check, X, ToggleLeft, ToggleRight } from 'lucide-react';
import { SkelList } from '../../components/Skeleton';
import CustomSelect from '../../components/CustomSelect';
import ConfirmModal from '../../components/ConfirmModal';
import PremiumDateInput from '../../components/PremiumDateInput';

import { useAuth } from '../../context/AuthContext';

const EMPTY_FORM = { code: '', type: 'percent', value: '', min_order_amount: '', max_uses: '', expires_at: '', is_active: true };

function fmt(n) { return '₦' + Number(n).toLocaleString(); }

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

  const fetch = async () => {
    const { data } = await supabase.from('coupons').select('*').order('created_at', { ascending: false });
    setCoupons(data || []);
    setLoading(false);
  };

  useEffect(() => { fetch(); }, []);

  const startNew = () => { setForm(EMPTY_FORM); setEditing('new'); };

  const startEdit = (c) => {
    setForm({
      code: c.code,
      type: c.type,
      value: String(c.value),
      min_order_amount: c.min_order_amount != null ? String(c.min_order_amount) : '',
      max_uses: c.max_uses != null ? String(c.max_uses) : '',
      expires_at: c.expires_at ? c.expires_at.slice(0, 10) : '',
      is_active: c.is_active,
    });
    setEditing(c.id);
  };

  const cancel = () => { setEditing(null); setForm(EMPTY_FORM); };

  const save = async () => {
    if (!form.code.trim()) { showToast('Required', 'Coupon code is required', 'error'); return; }
    if (!form.value || isNaN(Number(form.value)) || Number(form.value) <= 0) {
      showToast('Required', 'Enter a valid discount value', 'error'); return;
    }
    if (form.type === 'percent' && Number(form.value) > 100) {
      showToast('Invalid', 'Percentage discount cannot exceed 100%', 'error'); return;
    }

    const payload = {
      code: form.code.trim().toUpperCase(),
      type: form.type,
      value: Number(form.value),
      min_order_amount: form.min_order_amount ? Number(form.min_order_amount) : null,
      max_uses: form.max_uses ? Number(form.max_uses) : null,
      expires_at: form.expires_at || null,
      is_active: form.is_active,
    };

    setSaving(true);
    if (editing === 'new') {
      const { error } = await supabase.from('coupons').insert([{ ...payload, uses: 0 }]);
      if (error) { showToast('Error', error.message, 'error'); setSaving(false); return; }
      showToast('Created', `Coupon ${payload.code} created`, 'success');
    } else {
      const { error } = await supabase.from('coupons').update(payload).eq('id', editing);
      if (error) { showToast('Error', error.message, 'error'); setSaving(false); return; }
      showToast('Saved', `Coupon ${payload.code} updated`, 'success');
    }
    setSaving(false);
    cancel();
    fetch();
  };

  const toggleActive = async (c) => {
    await supabase.from('coupons').update({ is_active: !c.is_active }).eq('id', c.id);
    fetch();
  };

  const deleteCoupon = (c) => {
    setConfirmAction({
      title: 'Delete Coupon',
      message: `Are you sure you want to delete coupon "${c.code}"?`,
      onConfirm: async () => {
        setConfirmAction(prev => ({ ...prev, isLoading: true }));
        const { error } = await supabase.from('coupons').delete().eq('id', c.id);
        if (error) { showToast('Error', error.message, 'error'); setConfirmAction(null); return; }
        showToast('Deleted', `Coupon ${c.code} deleted`, 'success');
        fetch();
        setConfirmAction(null);
      }
    });
  };

  const set = (k) => (e) => setForm(prev => ({ ...prev, [k]: e.target.value }));

  return (
    <div>
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

      {/* Create / Edit form (Drawer) */}
      {editing !== null && (
        <div className="product-form-modal" onClick={cancel}>
          <div className="product-form-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 450 }}>
            <h3 style={{ marginTop: 0, marginBottom: 24 }}>
              {editing === 'new' ? 'Create Coupon' : 'Edit Coupon'}
              <button onClick={cancel} className="dash-drawer-close">
                <X size={16} />
              </button>
            </h3>
            <div style={{ display: 'grid', gap: 16 }}>
              <div className="form-group">
                <label>Code *</label>
                <input value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value.toUpperCase() }))} placeholder="e.g. WELCOME10" />
              </div>
              <div className="form-group">
                <label>Type *</label>
                <CustomSelect 
                  value={form.type} 
                  onChange={set('type')} 
                  options={[
                    { value: 'percent', label: 'Percentage (%)' },
                    { value: 'fixed', label: 'Fixed Amount (₦)' }
                  ]} 
                />
              </div>
              <div className="form-group">
                <label>Value * {form.type === 'percent' ? '(%)' : '(₦)'}</label>
                <input type="number" min="0" value={form.value} onChange={set('value')} placeholder={form.type === 'percent' ? '10' : '500'} />
              </div>
              <div className="form-group">
                <label>Min Order Amount (₦)</label>
                <input type="number" min="0" value={form.min_order_amount} onChange={set('min_order_amount')} placeholder="Optional" />
              </div>
              <div className="form-group">
                <label>Max Uses</label>
                <input type="number" min="0" value={form.max_uses} onChange={set('max_uses')} placeholder="Unlimited" />
              </div>
              <div className="form-group">
                <label>Expires On</label>
                <PremiumDateInput value={form.expires_at} onChange={set('expires_at')} />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, marginBottom: 24, padding: '16px 0', borderTop: '1px solid var(--border-subtle)', borderBottom: '1px solid var(--border-subtle)' }}>
              <input
                type="checkbox"
                id="is_active"
                checked={form.is_active}
                onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))}
                style={{ width: 16, height: 16, cursor: 'pointer' }}
              />
              <label htmlFor="is_active" style={{ cursor: 'pointer', fontSize: '0.9rem', fontWeight: 700 }}>Active (visible to customers)</label>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-secondary" onClick={cancel} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px' }}>
                Cancel
              </button>
              <button className="btn-primary" onClick={save} disabled={saving} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px' }}>
                {saving ? 'Saving...' : 'Save Coupon'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Coupons list */}
      {loading ? (
        <SkelList rows={4} height={68} />
      ) : coupons.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
          <Tag size={48} style={{ opacity: 0.3, marginBottom: 16 }} />
          <p>No coupons yet. Create one to get started.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {coupons.map(c => (
            <div key={c.id} style={{
              background: 'var(--card-bg)', border: `1px solid ${c.is_active ? 'var(--border-subtle)' : 'rgba(255,255,255,0.05)'}`,
              borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
              opacity: c.is_active ? 1 : 0.5,
            }}>
              {/* Code badge */}
              <div style={{ background: 'var(--black2)', padding: '6px 14px', borderRadius: 8, fontWeight: 900, fontSize: '1rem', letterSpacing: '0.05em', fontFamily: 'monospace', color: 'var(--text)', flexShrink: 0 }}>
                {c.code}
              </div>

              {/* Discount */}
              <div style={{ flexShrink: 0 }}>
                <span style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--red)' }}>
                  {c.type === 'percent' ? `${c.value}% off` : `${fmt(c.value)} off`}
                </span>
              </div>

              {/* Meta */}
              <div style={{ flex: 1, display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                {c.min_order_amount != null && <span>Min: {fmt(c.min_order_amount)}</span>}
                <span>Uses: {c.uses ?? 0}{c.max_uses != null ? ` / ${c.max_uses}` : ''}</span>
                {c.expires_at && <span>Expires: {new Date(c.expires_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
                <span style={{
                  padding: '2px 10px', borderRadius: 20, fontWeight: 700, fontSize: '0.75rem',
                  background: c.is_active ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.06)',
                  color: c.is_active ? '#16a34a' : 'var(--text-muted)',
                }}>
                  {c.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>

              {/* Actions */}
              {(canManage || canDelete) && (
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  {canManage && (
                    <>
                      <button
                        onClick={() => toggleActive(c)}
                        title={c.is_active ? 'Deactivate' : 'Activate'}
                        style={{ background: 'none', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', color: c.is_active ? '#16a34a' : 'var(--text-muted)', display: 'flex' }}
                      >
                        {c.is_active ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                      </button>
                      <button
                        onClick={() => startEdit(c)}
                        style={{ background: 'none', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}
                      >
                        <Edit2 size={16} />
                      </button>
                    </>
                  )}
                  {canDelete && (
                    <button
                      onClick={() => deleteCoupon(c)}
                      style={{ background: 'none', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', color: '#ef4444', display: 'flex' }}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
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
