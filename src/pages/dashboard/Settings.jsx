import React, { useState } from 'react';
import { useToast } from '../../context/ToastContext';
import { useSettings } from '../../context/SettingsContext';
import { Settings as SettingsIcon, Store, Bell, Save } from 'lucide-react';

export default function Settings() {
  const { showToast } = useToast();
  const { settings, setSettings } = useSettings();
  
  // Local state for editing before saving
  const [localSettings, setLocalSettings] = useState(settings);

  const set = (k) => (e) => setLocalSettings({ ...localSettings, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const save = () => {
    setSettings(localSettings);
    showToast('Settings saved!', 'Changes applied successfully', 'success');
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
          <div className="form-group"><label>Store Name</label><input value={localSettings.storeName} onChange={set('storeName')} /></div>
          <div className="form-row">
            <div className="form-group"><label>Email</label><input value={localSettings.email} onChange={set('email')} /></div>
            <div className="form-group"><label>Phone</label><input value={localSettings.phone} onChange={set('phone')} /></div>
          </div>
        </div>

        <div className="dash-card">
          <h3 style={{ fontFamily: "'Mona Sans', 'Mona-Sans', 'Helvetica Neue', sans-serif", fontSize: '1.1rem', marginBottom: 20 }}>Operating Hours</h3>
          <div className="form-row">
            <div className="form-group"><label>Mon – Sat</label><input value={localSettings.weekdayHours} onChange={set('weekdayHours')} /></div>
            <div className="form-group"><label>Sunday</label><input value={localSettings.sundayHours} onChange={set('sundayHours')} /></div>
          </div>
        </div>

        <div className="dash-card">
          <h3 style={{ fontFamily: "'Mona Sans', 'Mona-Sans', 'Helvetica Neue', sans-serif", fontSize: '1.1rem', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Bell size={18} /> Notifications
          </h3>
          {[['notifyOrders', 'New Order Notifications'], ['notifyDelivery', 'Delivery Updates'], ['notifyPayments', 'Payment Alerts']].map(([key, label]) => (
            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer' }}>
              <input type="checkbox" checked={localSettings[key]} onChange={set(key)} style={{ width: 18, height: 18, accentColor: 'var(--red)' }} />
              <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{label}</span>
            </label>
          ))}
        </div>

        <button className="btn-primary" onClick={save} style={{ justifyContent: 'center', padding: '14px 28px', display: 'flex', gap: 8, alignItems: 'center' }}>
          <Save size={18} /> Save Settings
        </button>
      </div>
    </div>
  );
}
