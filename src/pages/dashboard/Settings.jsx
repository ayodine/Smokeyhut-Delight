import React, { useState, useEffect } from 'react';
import { useToast } from '../../context/ToastContext';
import { useSettings } from '../../context/SettingsContext';
import { supabase } from '../../lib/supabase';
import { fetchFlatAreas } from '../../lib/deliveryMatcher';
import { DEFAULT_PROMO_AREA_FEES } from '../../lib/deliveryPromoSeed';
import { Settings as SettingsIcon, Store, Bell, Save, Radio, Trash2, Plus, Pencil, Check, X, Landmark, Loader2, Truck, ChevronDown, ChevronUp, Search } from 'lucide-react';

import { useAuth } from '../../context/AuthContext';

export default function Settings() {
  const { userRole, userPermissions } = useAuth();
  const isAdmin = userRole === 'Admin';
  const canManage = isAdmin || userRole === 'Manager' || (userPermissions || []).includes('Settings:manage');
  const { showToast } = useToast();
  const { settings, setSettings } = useSettings();
  
  const [localSettings, setLocalSettings] = useState(settings);
  const [newTicker, setNewTicker] = useState('');
  const [saving, setSaving] = useState(false);

  // Sync when context updates (e.g. after Supabase fetch completes on mount).
  // If the delivery promo has no fee table yet (row not seeded in DB), pre-fill
  // it with the bundled defaults so the first save creates the full config.
  useEffect(() => {
    setLocalSettings(() => {
      const next = { ...settings };
      const dp = next.deliveryPromo;
      if (!dp || Object.keys(dp.area_fees || {}).length === 0) {
        next.deliveryPromo = { enabled: false, product_ids: [], ...dp, area_fees: DEFAULT_PROMO_AREA_FEES };
      }
      return next;
    });
  }, [settings]);
  const [editingIdx, setEditingIdx] = useState(null);
  const [editingText, setEditingText] = useState('');

  const set = (k) => (e) => setLocalSettings({ ...localSettings, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const save = async () => {
    setSaving(true);
    const { error } = await setSettings(localSettings);
    setSaving(false);
    if (error) {
      showToast('Error saving settings', error.message, 'error');
    } else {
      showToast('Settings saved!', 'Changes applied successfully', 'success');
    }
  };

  const tickerItems = localSettings.tickerItems || [];

  const addTicker = () => {
    const text = newTicker.trim();
    if (!text) return;
    setLocalSettings(prev => ({ ...prev, tickerItems: [...(prev.tickerItems || []), text] }));
    setNewTicker('');
  };

  const deleteTicker = (i) => {
    setLocalSettings(prev => ({ ...prev, tickerItems: prev.tickerItems.filter((_, idx) => idx !== i) }));
  };

  const startEdit = (i) => { setEditingIdx(i); setEditingText(tickerItems[i]); };
  const saveEdit = () => {
    if (!editingText.trim()) return;
    setLocalSettings(prev => ({
      ...prev,
      tickerItems: prev.tickerItems.map((t, i) => i === editingIdx ? editingText.trim() : t),
    }));
    setEditingIdx(null);
  };

  // ── Delivery Promo ──
  const emptyPromo = { enabled: false, product_ids: [], area_fees: {} };
  const promo = localSettings.deliveryPromo || emptyPromo;
  const [promoProducts, setPromoProducts] = useState([]);
  const [areaOptions, setAreaOptions] = useState([]);
  const [promoSearch, setPromoSearch] = useState('');
  const [showPromoFees, setShowPromoFees] = useState(false);
  const [newPromoArea, setNewPromoArea] = useState('');
  const [newPromoFee, setNewPromoFee] = useState('');

  useEffect(() => {
    supabase.from('products').select('id,name,price').eq('is_active', true).order('name')
      .then(({ data }) => setPromoProducts(data || []));
    fetchFlatAreas(supabase).then(setAreaOptions);
  }, []);

  const setPromo = (patch) => setLocalSettings(prev => ({
    ...prev,
    deliveryPromo: { ...(prev.deliveryPromo || emptyPromo), ...patch },
  }));

  const togglePromoProduct = (id) => {
    const ids = (promo.product_ids || []).map(String);
    setPromo({
      product_ids: ids.includes(String(id))
        ? (promo.product_ids || []).filter(p => String(p) !== String(id))
        : [...(promo.product_ids || []), id],
    });
  };

  const setPromoAreaFee = (name, fee) => {
    const n = Math.max(0, Number(fee) || 0);
    setPromo({ area_fees: { ...(promo.area_fees || {}), [name]: n } });
  };

  const removePromoArea = (name) => {
    const next = { ...(promo.area_fees || {}) };
    delete next[name];
    setPromo({ area_fees: next });
  };

  const addPromoArea = () => {
    const name = newPromoArea.toLowerCase().trim();
    if (!name) return;
    setPromoAreaFee(name, newPromoFee);
    setNewPromoArea('');
    setNewPromoFee('');
  };

  const promoFeeEntries = Object.entries(promo.area_fees || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .filter(([name]) => name.includes(promoSearch.toLowerCase().trim()));
  const promoAreaChoices = areaOptions.filter(a => !(promo.area_fees || {})[a.name.toLowerCase().trim()]);

  return (
    <div>
      <div className="dash-card-header" style={{ marginBottom: 24 }}>
        <div className="dash-card-title" style={{ fontFamily: "'Mona Sans', 'Mona-Sans', 'Helvetica Neue', sans-serif", fontSize: '1.4rem', display: 'flex', alignItems: 'center', gap: 8 }}>
          <SettingsIcon size={24} color="var(--red)" /> Store Settings
        </div>
      </div>

      <div style={{ display: 'grid', gap: 24, maxWidth: 700 }}>
        <div className="dash-card">
          <h3 style={{ fontFamily: "'Mona Sans', 'Mona-Sans', 'Helvetica Neue', sans-serif", fontSize: '1.1rem', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Store size={18} /> General
          </h3>
          <div className="form-group"><label>Store Name</label><input value={localSettings.storeName} onChange={set('storeName')} disabled={!canManage} /></div>
          <div className="form-row">
            <div className="form-group"><label>Email</label><input value={localSettings.email} onChange={set('email')} disabled={!canManage} /></div>
            <div className="form-group"><label>Phone</label><input value={localSettings.phone} onChange={set('phone')} disabled={!canManage} /></div>
          </div>
        </div>

        <div className="dash-card">
          <h3 style={{ fontFamily: "'Mona Sans', 'Mona-Sans', 'Helvetica Neue', sans-serif", fontSize: '1.1rem', marginBottom: 20 }}>Operating Hours</h3>
          <div className="form-row">
            <div className="form-group"><label>Mon – Sat</label><input value={localSettings.weekdayHours} onChange={set('weekdayHours')} disabled={!canManage} /></div>
            <div className="form-group"><label>Sunday</label><input value={localSettings.sundayHours} onChange={set('sundayHours')} disabled={!canManage} /></div>
          </div>
        </div>

        <div className="dash-card">
          <h3 style={{ fontFamily: "'Mona Sans', 'Mona-Sans', 'Helvetica Neue', sans-serif", fontSize: '1.1rem', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Bell size={18} /> Notifications
          </h3>
          {[['notifyOrders', 'New Order Notifications'], ['notifyDelivery', 'Delivery Updates'], ['notifyPayments', 'Payment Alerts']].map(([key, label]) => (
            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border-subtle)', cursor: canManage ? 'pointer' : 'not-allowed', opacity: canManage ? 1 : 0.7 }}>
              <input type="checkbox" checked={localSettings[key]} onChange={set(key)} style={{ width: 18, height: 18, accentColor: 'var(--red)' }} disabled={!canManage} />
              <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{label}</span>
            </label>
          ))}
        </div>

        <div className="dash-card">
          <h3 style={{ fontFamily: "'Mona Sans', 'Mona-Sans', 'Helvetica Neue', sans-serif", fontSize: '1.1rem', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Radio size={18} /> Ticker Messages
          </h3>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 16 }}>
            These messages scroll across the top banner of the storefront.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {tickerItems.map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '8px 12px' }}>
                {editingIdx === i ? (
                  <>
                    <input
                      value={editingText}
                      onChange={e => setEditingText(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && saveEdit()}
                      style={{ flex: 1, border: 'none', background: 'transparent', fontSize: '0.88rem', outline: 'none', fontFamily: 'inherit' }}
                      autoFocus
                    />
                    <button onClick={saveEdit} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#16a34a', padding: 4 }}><Check size={16} /></button>
                    <button onClick={() => setEditingIdx(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}><X size={16} /></button>
                  </>
                ) : (
                  <>
                    <span style={{ flex: 1, fontSize: '0.88rem', color: 'var(--text)' }}>{item}</span>
                    {canManage && (
                      <>
                        <button onClick={() => startEdit(i)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}><Pencil size={15} /></button>
                        <button onClick={() => deleteTicker(i)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--red)', padding: 4 }}><Trash2 size={15} /></button>
                      </>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>

          {canManage && (
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={newTicker}
                onChange={e => setNewTicker(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addTicker()}
                placeholder="Add a new ticker message..."
                style={{ flex: 1 }}
              />
              <button onClick={addTicker} className="btn-primary" style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Plus size={16} /> Add
              </button>
            </div>
          )}
        </div>

        <div className="dash-card">
          <h3 style={{ fontFamily: "'Mona Sans', 'Mona-Sans', 'Helvetica Neue', sans-serif", fontSize: '1.1rem', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Landmark size={18} /> Bank Transfer Details
          </h3>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 16 }}>
            Shown to customers after they place an order so they know where to send payment.
          </p>
          <div className="form-group"><label>Bank Name</label><input value={localSettings.bankName || ''} onChange={set('bankName')} placeholder="e.g. GTBank" disabled={!canManage} /></div>
          <div className="form-group"><label>Account Name</label><input value={localSettings.accountName || ''} onChange={set('accountName')} placeholder="e.g. Smokeyhut Delight" disabled={!canManage} /></div>
          <div className="form-group"><label>Account Number</label><input value={localSettings.accountNumber || ''} onChange={set('accountNumber')} placeholder="e.g. 0123456789" disabled={!canManage} /></div>
        </div>

        <div className="dash-card">
          <h3 style={{ fontFamily: "'Mona Sans', 'Mona-Sans', 'Helvetica Neue', sans-serif", fontSize: '1.1rem', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Truck size={18} /> Delivery Promo
          </h3>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 16 }}>
            Discounted delivery fees for orders containing <strong>only</strong> the selected product(s). Normal zone fees are untouched — switching this off restores regular pricing instantly.
          </p>

          <label style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border-subtle)', cursor: canManage ? 'pointer' : 'not-allowed', opacity: canManage ? 1 : 0.7, marginBottom: 14 }}>
            <input type="checkbox" checked={!!promo.enabled} onChange={e => setPromo({ enabled: e.target.checked })} style={{ width: 18, height: 18, accentColor: 'var(--red)' }} disabled={!canManage} />
            <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Promo is {promo.enabled ? 'ON' : 'OFF'}</span>
          </label>

          {promo.enabled && (promo.product_ids || []).length === 0 && (
            <div style={{ padding: '10px 13px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, marginBottom: 14, fontSize: '0.82rem', color: '#78350f' }}>
              ⚠️ The promo is ON but no product is selected, so customers won't see promo fees yet. Pick the promo product below.
            </div>
          )}

          <div className="form-group">
            <label>Promo product(s)</label>
            <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '4px 12px' }}>
              {promoProducts.length === 0 && <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', padding: '8px 0' }}>Loading products…</p>}
              {promoProducts.map(p => (
                <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border-subtle)', cursor: canManage ? 'pointer' : 'not-allowed' }}>
                  <input type="checkbox" checked={(promo.product_ids || []).map(String).includes(String(p.id))} onChange={() => togglePromoProduct(p.id)} style={{ width: 16, height: 16, accentColor: 'var(--red)' }} disabled={!canManage} />
                  <span style={{ fontSize: '0.85rem', flex: 1 }}>{p.name}</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>₦{Number(p.price).toLocaleString()}</span>
                </label>
              ))}
            </div>
          </div>

          <button onClick={() => setShowPromoFees(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)', fontWeight: 700, fontSize: '0.88rem', padding: '6px 0', fontFamily: 'inherit' }}>
            {showPromoFees ? <ChevronUp size={16} /> : <ChevronDown size={16} />} Promo delivery fees ({Object.keys(promo.area_fees || {}).length} areas)
          </button>

          {showPromoFees && (
            <div style={{ marginTop: 10 }}>
              <div style={{ position: 'relative', marginBottom: 10 }}>
                <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input value={promoSearch} onChange={e => setPromoSearch(e.target.value)} placeholder="Search areas..." style={{ width: '100%', paddingLeft: 34, boxSizing: 'border-box' }} />
              </div>
              <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '4px 12px', marginBottom: 12 }}>
                {promoFeeEntries.length === 0 && <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', padding: '8px 0' }}>No areas match.</p>}
                {promoFeeEntries.map(([name, fee]) => (
                  <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                    <span style={{ fontSize: '0.85rem', flex: 1, textTransform: 'capitalize' }}>{name}</span>
                    <span style={{ fontSize: '0.78rem', color: fee === 0 ? '#16a34a' : 'var(--text-muted)', fontWeight: 700, minWidth: 34, textAlign: 'right' }}>{fee === 0 ? 'Free' : '₦'}</span>
                    <input type="number" min="0" step="100" value={fee} onChange={e => setPromoAreaFee(name, e.target.value)} disabled={!canManage} style={{ width: 90, padding: '6px 8px', boxSizing: 'border-box' }} />
                    {canManage && <button onClick={() => removePromoArea(name)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--red)', padding: 4 }}><Trash2 size={14} /></button>}
                  </div>
                ))}
              </div>
              {canManage && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <select value={newPromoArea} onChange={e => setNewPromoArea(e.target.value)} style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-subtle)', fontFamily: 'inherit', fontSize: '0.85rem' }}>
                    <option value="">Add an area…</option>
                    {promoAreaChoices.map(a => <option key={a.id} value={a.name}>{a.name} (normal ₦{Number(a.price).toLocaleString()})</option>)}
                  </select>
                  <input type="number" min="0" step="100" value={newPromoFee} onChange={e => setNewPromoFee(e.target.value)} placeholder="Promo fee" style={{ width: 110, boxSizing: 'border-box' }} />
                  <button onClick={addPromoArea} disabled={!newPromoArea} className="btn-primary" style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 6, opacity: newPromoArea ? 1 : 0.5 }}>
                    <Plus size={16} /> Add
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {canManage && (
          <button 
            className="btn-primary" 
            onClick={save} 
            disabled={saving}
            style={{ justifyContent: 'center', padding: '14px 28px', display: 'flex', gap: 8, alignItems: 'center', opacity: saving ? 0.7 : 1 }}
          >
            {saving ? (
              <>
                <Loader2 size={18} className="spin" /> Saving...
              </>
            ) : (
              <>
                <Save size={18} /> Save Settings
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
