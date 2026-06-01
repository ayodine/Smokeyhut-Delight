import React, { useState, useEffect } from 'react';
import { MapPin, Phone, Edit2, Trash2, X, Store as StoreIcon, Loader2, DollarSign, Package } from 'lucide-react';
import { SkelDashHeader, SkelStoreCard } from '../../components/Skeleton';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import ConfirmModal from '../../components/ConfirmModal';

const fmt = (n) => '₦' + n.toLocaleString();

export default function Stores() {
  const { userRole, userPermissions } = useAuth();
  const isAdmin = userRole === 'Admin';
  const canManage = isAdmin || userRole === 'Manager' || (userPermissions || []).includes('Stores:manage');
  const canDelete = isAdmin || userRole === 'Manager' || (userPermissions || []).includes('Stores:delete');
  const [storeList, setStoreList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    name: '',
    address: '',
    phone: '',
    zones: '',
    weekdayHours: '8:00am - 6:00pm',
    sundayHours: '10:00am - 5:00pm'
  });
  const [confirmAction, setConfirmAction] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const [storesRes, ordersRes] = await Promise.all([
      supabase.from('stores').select('*').order('id', { ascending: true }),
      supabase.from('orders')
        .select('store_id, total, status')
        .is('deleted_at', null),
    ]);

    const allOrders = ordersRes.data || [];
    // Orders with no store assigned (WhatsApp, manual) appear in every store's view on
    // the Orders page — mirror that same logic here so the numbers stay consistent.
    const unassigned = allOrders.filter(o => o.store_id === null || o.store_id === undefined);

    const enriched = (storesRes.data || []).map(store => {
      const storeOrders = [
        ...allOrders.filter(o => Number(o.store_id) === Number(store.id)),
        ...unassigned,
      ];
      const activeOrders = storeOrders.filter(o => o.status !== 'cancelled');
      return {
        ...store,
        revenue: activeOrders.reduce((sum, o) => sum + Number(o.total || 0), 0),
        orders: activeOrders.length,
        pending: storeOrders.filter(o => o.status === 'pending').length,
      };
    });

    setStoreList(enriched);
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
      hours: {
        weekday: form.weekdayHours || '8:00am - 6:00pm',
        sunday: form.sundayHours || '10:00am - 5:00pm'
      }
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

  const handleDelete = (store) => {
    setConfirmAction({
      title: 'Delete Store',
      message: `Are you sure you want to delete "${store.name}"?`,
      onConfirm: async () => {
        setConfirmAction(prev => ({ ...prev, isLoading: true }));
        await supabase.from('stores').delete().eq('id', store.id);
        setStoreList(storeList.filter(s => s.id !== store.id));
        setConfirmAction(null);
      }
    });
  };

  if (loading) return (
    <div>
      <SkelDashHeader hasButton />
      <div className="store-cards">
        <SkelStoreCard /><SkelStoreCard /><SkelStoreCard />
      </div>
    </div>
  );

  return (
    <div>
      <div className="dash-card-header" style={{ marginBottom: 24 }}>
        <div className="dash-card-title" style={{ fontFamily: "'Mona Sans', 'Mona-Sans', 'Helvetica Neue', sans-serif", fontSize: '1.4rem' }}>Store Management</div>
        {canManage && (
          <button className="btn-primary" style={{ padding: '8px 16px', fontSize: '0.88rem' }} onClick={() => {
            setEditing(null);
            setForm({
              name: '',
              address: '',
              phone: '',
              zones: '',
              weekdayHours: '8:00am - 6:00pm',
              sundayHours: '10:00am - 5:00pm'
            });
            setShowModal(true);
          }}>
            + Add Store
          </button>
        )}
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
                <button 
                  className={`store-toggle ${store.is_active ? 'active' : 'inactive'}`} 
                  onClick={() => canManage && toggleStore(store.id, store.is_active)} 
                  style={{ cursor: canManage ? 'pointer' : 'not-allowed' }}
                  aria-label={`Toggle ${store.name}`} 
                />
              </div>

              <div style={{ fontSize: '0.82rem', color: store.is_active ? '#22c55e' : 'var(--text-muted)', fontWeight: 700, marginBottom: 16 }}>
                {store.is_active ? '● Active' : '○ Inactive'}
              </div>

              <div className="store-stats">
                <div className="kpi-card red" style={{ padding: '14px 12px' }}>
                  <div className="kpi-icon" style={{ marginBottom: 4 }}><DollarSign size={16} /></div>
                  <div className="kpi-value" style={{ fontSize: '1.25rem' }}>{fmt(store.revenue || 0)}</div>
                  <div className="kpi-label">Revenue</div>
                </div>
                <div className="kpi-card blue" style={{ padding: '14px 12px' }}>
                  <div className="kpi-icon" style={{ marginBottom: 4 }}><Package size={16} /></div>
                  <div className="kpi-value" style={{ fontSize: '1.25rem' }}>{store.orders || 0}</div>
                  <div className="kpi-label">Orders</div>
                </div>
                <div className="kpi-card yellow" style={{ padding: '14px 12px' }}>
                  <div className="kpi-icon" style={{ marginBottom: 4 }}><Package size={16} /></div>
                  <div className="kpi-value" style={{ fontSize: '1.25rem' }}>{store.pending || 0}</div>
                  <div className="kpi-label">Pending</div>
                </div>
                <div className="kpi-card purple" style={{ padding: '14px 12px' }}>
                  <div className="kpi-icon" style={{ marginBottom: 4 }}><Phone size={16} /></div>
                  <div className="kpi-value" style={{ fontSize: '0.95rem', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{store.phone}</div>
                  <div className="kpi-label">Phone</div>
                </div>
              </div>

              <div style={{ marginTop: 16, padding: '16px', background: 'var(--black2)', borderRadius: 12 }}>
                <div style={{ fontWeight: 800, fontSize: '0.82rem', marginBottom: 8, color: 'var(--text)' }}>Operating Hours</div>
                <div style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>Mon–Sat: <span style={{ color: 'var(--text)', fontWeight: 600 }}>{hours.weekday}</span></div>
                <div style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>Sunday: <span style={{ color: 'var(--text)', fontWeight: 600 }}>{hours.sunday}</span></div>
              </div>

              <div style={{ marginTop: 16, fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 20 }}>
                <strong style={{ color: 'var(--text)', display: 'block', marginBottom: 6, fontSize: '0.82rem' }}>Delivery Zones:</strong>
                <div style={{ lineHeight: 1.5 }}>{zones.length > 0 ? zones.join(', ') : 'None assigned'}</div>
              </div>

              {(canManage || canDelete) && (
                <div style={{ display: 'flex', gap: 12, borderTop: '1px solid var(--border-subtle)', paddingTop: 20 }}>
                  {canManage && (
                    <button style={{ flex: 1, padding: '10px', borderRadius: 10, background: 'var(--black2)', border: 'none', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--text)', transition: 'all 0.2s' }} 
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--gray-light)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'var(--black2)' }}
                      onClick={() => {
                        setEditing(store.id);
                        setForm({
                          name: store.name,
                          address: store.address,
                          phone: store.phone,
                          zones: zones.join(', '),
                          weekdayHours: hours.weekday || '8:00am - 6:00pm',
                          sundayHours: hours.sunday || '10:00am - 5:00pm'
                        });
                        setShowModal(true);
                      }}>
                      <Edit2 size={16} /> Edit
                    </button>
                  )}
                  {canDelete && (
                    <button style={{ flex: 1, padding: '10px', borderRadius: 10, background: '#fee2e2', color: '#991b1b', border: 'none', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all 0.2s' }} 
                      onMouseEnter={e => { e.currentTarget.style.background = '#fca5a5' }}
                      onMouseLeave={e => { e.currentTarget.style.background = '#fee2e2' }}
                      onClick={() => handleDelete(store)}>
                      <Trash2 size={16} /> Delete
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {storeList.length === 0 && <div style={{ color: 'var(--text-muted)' }}>No stores available.</div>}
      </div>

      {showModal && (
        <div className="product-form-modal" onClick={() => setShowModal(false)}>
          <div className="product-form-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 450 }}>
            <h3 style={{ marginTop: 0, marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <StoreIcon size={20} color="var(--red)" /> {editing ? 'Edit' : 'Add'} Store
              </div>
              <button onClick={() => setShowModal(false)} className="dash-drawer-close">
                <X size={16} />
              </button>
            </h3>
            
            <div className="form-group"><label>Store Name</label><input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Lagos Ikeja" /></div>
            <div className="form-group"><label>Address</label><input value={form.address} onChange={e => setForm({...form, address: e.target.value})} placeholder="123 Main St..." /></div>
            <div className="form-group"><label>Phone Number</label><input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="080..." /></div>
            <div className="form-group"><label>Delivery Zones (comma separated)</label><input value={form.zones} onChange={e => setForm({...form, zones: e.target.value})} placeholder="Ikeja, Maryland, Oshodi" /></div>
            <div className="form-row" style={{ display: 'flex', gap: 12 }}>
              <div className="form-group" style={{ flex: 1 }}><label>Mon–Sat Hours</label><input value={form.weekdayHours} onChange={e => setForm({...form, weekdayHours: e.target.value})} placeholder="8:00am - 6:00pm" /></div>
              <div className="form-group" style={{ flex: 1 }}><label>Sunday Hours</label><input value={form.sundayHours} onChange={e => setForm({...form, sundayHours: e.target.value})} placeholder="10:00am - 5:00pm" /></div>
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 32 }}>
              <button onClick={() => setShowModal(false)} className="btn-secondary" style={{ flex: 1 }}>
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving} className="btn-primary" style={{ flex: 1, justifyContent: 'center' }}>
                {saving ? <Loader2 size={16} className="spin" /> : 'Save'}
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
