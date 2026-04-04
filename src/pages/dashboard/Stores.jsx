import React, { useState, useEffect } from 'react';
import { MapPin, Phone, Edit2, Trash2, X, Store as StoreIcon, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const fmt = (n) => '₦' + n.toLocaleString();

export default function Stores() {
  const [storeList, setStoreList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', address: '', phone: '', zones: '' });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const { data } = await supabase.from('stores').select('*').order('id', { ascending: true });
    if (data) setStoreList(data);
    setLoading(false);
  };

  const toggleStore = async (id, currentStatus) => {
    await supabase.from('stores').update({ is_active: !currentStatus }).eq('id', id);
    setStoreList(prev => prev.map(s => s.id === id ? { ...s, is_active: !currentStatus } : s));
  };

  const handleSave = async () => {
    if (!form.name || !form.address) return;
    setSaving(true);
    
    // Convert comma-separated string back to an array
    const zonesArray = form.zones ? form.zones.split(',').map(z => z.trim()) : [];

    const data = {
      name: form.name,
      address: form.address,
      phone: form.phone,
      zones: zonesArray,
      hours: { weekday: '8:00am - 6:00pm', sunday: 'Closed' }
    };

    if (editing) {
      await supabase.from('stores').update(data).eq('id', editing);
    } else {
      await supabase.from('stores').insert([data]);
    }

    await fetchData();
    setShowModal(false);
    setSaving(false);
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><Loader2 className="spin" size={32} color="var(--red)" /></div>;

  return (
    <div>
      <div className="dash-card-header" style={{ marginBottom: 24 }}>
        <div className="dash-card-title" style={{ fontFamily: "'Mona Sans', 'Mona-Sans', 'Helvetica Neue', sans-serif", fontSize: '1.4rem' }}>Store Management</div>
        <button className="btn-primary" style={{ padding: '8px 16px', fontSize: '0.88rem' }} onClick={() => { setEditing(null); setForm({ name: '', address: '', phone: '', zones: '' }); setShowModal(true); }}>
          + Add Store
        </button>
      </div>

      <div className="store-cards">
        {storeList.map(store => {
          const zones = Array.isArray(store.zones) ? store.zones : [];
          const hours = store.hours || { weekday: '8:00am - 6:00pm', sunday: 'Closed' };
          
          return (
            <div key={store.id} className="store-card">
              <div className="store-card-header">
                <div>
                  <div className="store-card-name">{store.name}</div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <MapPin size={12} /> {store.address}
                  </div>
                </div>
                <button className={`store-toggle ${store.is_active ? 'active' : 'inactive'}`} onClick={() => toggleStore(store.id, store.is_active)} aria-label={`Toggle ${store.name}`} />
              </div>

              <div style={{ fontSize: '0.82rem', color: store.is_active ? '#22c55e' : 'var(--text-muted)', fontWeight: 700, marginBottom: 16 }}>
                {store.is_active ? '● Active' : '○ Inactive'}
              </div>

              <div className="store-stats">
                <div className="store-stat-card">
                  <div className="store-stat-value">{fmt(store.revenue || 0)}</div>
                  <div className="store-stat-label">Revenue</div>
                </div>
                <div className="store-stat-card">
                  <div className="store-stat-value">{store.orders || 0}</div>
                  <div className="store-stat-label">Orders</div>
                </div>
                <div className="store-stat-card">
                  <div className="store-stat-value">{store.staff || 0}</div>
                  <div className="store-stat-label">Staff</div>
                </div>
                <div className="store-stat-card">
                  <div className="store-stat-value" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Phone size={20} />
                  </div>
                  <div className="store-stat-label">{store.phone}</div>
                </div>
              </div>

              <div style={{ marginTop: 16, padding: '14px', background: 'var(--black2)', borderRadius: 10 }}>
                <div style={{ fontWeight: 800, fontSize: '0.82rem', marginBottom: 8, color: 'var(--text)' }}>Operating Hours</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Mon–Sat: {hours.weekday}</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Sunday: {hours.sunday}</div>
              </div>

              <div style={{ marginTop: 12, fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 16 }}>
                <strong>Delivery Zones:</strong> {zones.join(', ')}
              </div>

              <div style={{ display: 'flex', gap: 12, borderTop: '1px solid var(--border-subtle)', paddingTop: 16 }}>
                <button style={{ flex: 1, padding: '8px', borderRadius: 8, background: 'var(--black2)', border: 'none', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }} onClick={() => { setEditing(store.id); setForm({ name: store.name, address: store.address, phone: store.phone, zones: zones.join(', ') }); setShowModal(true); }}>
                  <Edit2 size={14} /> Edit
                </button>
                <button style={{ flex: 1, padding: '8px', borderRadius: 8, background: '#fee2e2', color: '#991b1b', border: 'none', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }} onClick={async () => { if(window.confirm('Delete store?')) { await supabase.from('stores').delete().eq('id', store.id); setStoreList(storeList.filter(s => s.id !== store.id)); } }}>
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            </div>
          );
        })}
        {storeList.length === 0 && <div style={{ color: 'var(--text-muted)' }}>No stores available.</div>}
      </div>

      {showModal && (
        <div className="product-form-modal">
          <div className="product-form-card" style={{ maxWidth: 450 }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 0, marginBottom: 24 }}>
              <StoreIcon size={20} color="var(--red)" /> {editing ? 'Edit' : 'Add'} Store
            </h3>
            
            <div className="form-group"><label>Store Name</label><input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Lagos Ikeja" /></div>
            <div className="form-group"><label>Address</label><input value={form.address} onChange={e => setForm({...form, address: e.target.value})} placeholder="123 Main St..." /></div>
            <div className="form-group"><label>Phone Number</label><input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="080..." /></div>
            <div className="form-group"><label>Delivery Zones (comma separated)</label><input value={form.zones} onChange={e => setForm({...form, zones: e.target.value})} placeholder="Ikeja, Maryland, Oshodi" /></div>

            <div style={{ display: 'flex', gap: 12, marginTop: 32 }}>
              <button onClick={() => setShowModal(false)} style={{ flex: 1, padding: '12px', background: 'var(--black2)', border: '1px solid var(--border-subtle)', borderRadius: '8px', cursor: 'pointer', fontWeight: 700 }}>
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving} className="btn-primary" style={{ flex: 1, justifyContent: 'center' }}>
                {saving ? <Loader2 size={16} className="spin" /> : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
