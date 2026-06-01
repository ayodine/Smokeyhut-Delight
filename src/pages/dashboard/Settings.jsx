import React, { useState, useEffect } from 'react';
import { useToast } from '../../context/ToastContext';
import { useSettings } from '../../context/SettingsContext';
import { Settings as SettingsIcon, Store, Bell, Save, Radio, Trash2, Plus, Pencil, Check, X, Landmark, Loader2 } from 'lucide-react';

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

  // Sync when context updates (e.g. after Supabase fetch completes on mount)
  useEffect(() => {
    setLocalSettings(settings);
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
