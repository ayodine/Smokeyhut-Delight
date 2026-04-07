import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../context/ToastContext';
import { MapPin, Plus, Trash2, Edit2, Check, X, ChevronDown, ChevronRight } from 'lucide-react';

export default function DeliveryZones() {
  const { showToast } = useToast();
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedZone, setExpandedZone] = useState(null);
  const [editingZone, setEditingZone] = useState(null); // zone id or 'new'
  const [zoneForm, setZoneForm] = useState({ name: '', price: '' });
  const [editingArea, setEditingArea] = useState(null); // { zoneId, areaId or 'new' }
  const [areaForm, setAreaForm] = useState({ name: '', aliases: '' });

  const fetchZones = async () => {
    const { data } = await supabase
      .from('delivery_zones')
      .select('*, delivery_areas(*)')
      .order('name');
    setZones(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchZones(); }, []);

  const saveZone = async () => {
    if (!zoneForm.name.trim()) { showToast('Required', 'Zone name is required', 'error'); return; }
    const slug = zoneForm.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const payload = { name: zoneForm.name.trim(), slug, price: Number(zoneForm.price) || 0 };

    if (editingZone === 'new') {
      const { error } = await supabase.from('delivery_zones').insert([{ ...payload, is_active: true }]);
      if (error) { showToast('Error', error.message, 'error'); return; }
    } else {
      const { error } = await supabase.from('delivery_zones').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editingZone);
      if (error) { showToast('Error', error.message, 'error'); return; }
    }
    showToast('Saved', 'Delivery zone saved', 'success');
    setEditingZone(null);
    fetchZones();
  };

  const deleteZone = async (id) => {
    if (!confirm('Delete this zone and all its areas?')) return;
    const { error } = await supabase.from('delivery_zones').delete().eq('id', id);
    if (error) { showToast('Error', error.message, 'error'); return; }
    showToast('Deleted', 'Zone deleted', 'success');
    fetchZones();
  };

  const toggleZone = async (zone) => {
    await supabase.from('delivery_zones').update({ is_active: !zone.is_active, updated_at: new Date().toISOString() }).eq('id', zone.id);
    fetchZones();
  };

  const saveArea = async () => {
    if (!areaForm.name.trim()) { showToast('Required', 'Area name is required', 'error'); return; }
    const aliases = areaForm.aliases.split(',').map(a => a.trim()).filter(Boolean);
    const payload = { name: areaForm.name.trim(), aliases, zone_id: editingArea.zoneId };

    if (editingArea.areaId === 'new') {
      const { error } = await supabase.from('delivery_areas').insert([payload]);
      if (error) { showToast('Error', error.message, 'error'); return; }
    } else {
      const { error } = await supabase.from('delivery_areas').update({ name: payload.name, aliases: payload.aliases }).eq('id', editingArea.areaId);
      if (error) { showToast('Error', error.message, 'error'); return; }
    }
    showToast('Saved', 'Area saved', 'success');
    setEditingArea(null);
    fetchZones();
  };

  const deleteArea = async (id) => {
    const { error } = await supabase.from('delivery_areas').delete().eq('id', id);
    if (error) { showToast('Error', error.message, 'error'); return; }
    fetchZones();
  };

  const fmt = (n) => '₦' + Number(n).toLocaleString();

  return (
    <div>
      <div className="dash-card-header" style={{ marginBottom: 24 }}>
        <div className="dash-card-title" style={{ fontFamily: "'Mona Sans', 'Mona-Sans', 'Helvetica Neue', sans-serif", fontSize: '1.4rem', display: 'flex', alignItems: 'center', gap: 8 }}>
          <MapPin size={24} color="var(--red)" /> Delivery Zones
        </div>
        <button
          className="btn-primary"
          style={{ padding: '8px 16px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6 }}
          onClick={() => { setEditingZone('new'); setZoneForm({ name: '', price: '' }); }}
        >
          <Plus size={16} /> Add Zone
        </button>
      </div>

      <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: 20 }}>
        Manage delivery zones and the areas that fall within each zone. Customers type their area at checkout and are matched to the correct zone and price.
      </p>

      {/* New zone form */}
      {editingZone === 'new' && (
        <div className="dash-card" style={{ marginBottom: 16, border: '2px solid var(--red)' }}>
          <h4 style={{ margin: '0 0 16px', fontFamily: "'Mona Sans', 'Mona-Sans', sans-serif" }}>New Zone</h4>
          <div className="form-row">
            <div className="form-group"><label>Zone Name</label><input value={zoneForm.name} onChange={e => setZoneForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Lagos Island" autoFocus /></div>
            <div className="form-group"><label>Delivery Price (₦)</label><input type="number" value={zoneForm.price} onChange={e => setZoneForm(p => ({ ...p, price: e.target.value }))} placeholder="3000" /></div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary" style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6 }} onClick={saveZone}><Check size={16} /> Save Zone</button>
            <button className="btn-secondary" style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setEditingZone(null)}><X size={16} /> Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ color: 'var(--text-muted)', padding: 20 }}>Loading zones...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {zones.map(zone => (
            <div key={zone.id} className="dash-card" style={{ padding: 0, overflow: 'hidden' }}>
              {/* Zone header row */}
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', cursor: 'pointer' }}
                onClick={() => setExpandedZone(expandedZone === zone.id ? null : zone.id)}
              >
                {expandedZone === zone.id
                  ? <ChevronDown size={18} color="var(--text-muted)" />
                  : <ChevronRight size={18} color="var(--text-muted)" />
                }
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{zone.name}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {fmt(zone.price)} · {zone.delivery_areas?.length || 0} areas
                  </div>
                </div>
                <div
                  onClick={e => { e.stopPropagation(); toggleZone(zone); }}
                  style={{
                    padding: '4px 10px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer',
                    background: zone.is_active ? 'rgba(192,32,31,0.12)' : 'var(--black2)',
                    color: zone.is_active ? 'var(--red)' : 'var(--text-muted)',
                    border: `1px solid ${zone.is_active ? 'rgba(192,32,31,0.3)' : 'var(--border-subtle)'}`,
                  }}
                >
                  {zone.is_active ? 'Active' : 'Inactive'}
                </div>
                <button
                  onClick={e => { e.stopPropagation(); setEditingZone(zone.id); setZoneForm({ name: zone.name, price: zone.price }); setExpandedZone(zone.id); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 6 }}
                >
                  <Edit2 size={15} />
                </button>
                <button
                  onClick={e => { e.stopPropagation(); deleteZone(zone.id); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 6 }}
                >
                  <Trash2 size={15} />
                </button>
              </div>

              {/* Inline zone edit form */}
              {editingZone === zone.id && (
                <div style={{ padding: '0 20px 16px', borderTop: '1px solid var(--border-subtle)' }}>
                  <div className="form-row" style={{ marginTop: 16 }}>
                    <div className="form-group"><label>Zone Name</label><input value={zoneForm.name} onChange={e => setZoneForm(p => ({ ...p, name: e.target.value }))} /></div>
                    <div className="form-group"><label>Price (₦)</label><input type="number" value={zoneForm.price} onChange={e => setZoneForm(p => ({ ...p, price: e.target.value }))} /></div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn-primary" style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6 }} onClick={saveZone}><Check size={16} /> Save</button>
                    <button className="btn-secondary" style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setEditingZone(null)}><X size={16} /> Cancel</button>
                  </div>
                </div>
              )}

              {/* Areas panel */}
              {expandedZone === zone.id && (
                <div style={{ borderTop: '1px solid var(--border-subtle)', padding: '16px 20px', background: 'var(--black2)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Areas in this zone</span>
                    <button
                      className="btn-secondary"
                      style={{ padding: '4px 10px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 4 }}
                      onClick={() => { setEditingArea({ zoneId: zone.id, areaId: 'new' }); setAreaForm({ name: '', aliases: '' }); }}
                    >
                      <Plus size={12} /> Add Area
                    </button>
                  </div>

                  {/* New area form */}
                  {editingArea?.zoneId === zone.id && editingArea?.areaId === 'new' && (
                    <div style={{ background: 'var(--card-bg)', borderRadius: 10, padding: '14px 16px', marginBottom: 10, border: '1px solid var(--red)' }}>
                      <div className="form-row">
                        <div className="form-group" style={{ marginBottom: 8 }}>
                          <label style={{ fontSize: '0.78rem' }}>Area Name</label>
                          <input value={areaForm.name} onChange={e => setAreaForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Lekki Phase 1" autoFocus />
                        </div>
                        <div className="form-group" style={{ marginBottom: 8 }}>
                          <label style={{ fontSize: '0.78rem' }}>Aliases (comma-separated)</label>
                          <input value={areaForm.aliases} onChange={e => setAreaForm(p => ({ ...p, aliases: e.target.value }))} placeholder="lekki, lekki 1, lekki phase1" />
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn-primary" style={{ padding: '6px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 4 }} onClick={saveArea}><Check size={13} /> Save Area</button>
                        <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 4 }} onClick={() => setEditingArea(null)}><X size={13} /> Cancel</button>
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {zone.delivery_areas?.map(area => (
                      <div key={area.id}>
                        {editingArea?.areaId === area.id ? (
                          <div style={{ background: 'var(--card-bg)', borderRadius: 10, padding: '14px 16px', border: '1px solid var(--red)' }}>
                            <div className="form-row">
                              <div className="form-group" style={{ marginBottom: 8 }}>
                                <label style={{ fontSize: '0.78rem' }}>Area Name</label>
                                <input value={areaForm.name} onChange={e => setAreaForm(p => ({ ...p, name: e.target.value }))} />
                              </div>
                              <div className="form-group" style={{ marginBottom: 8 }}>
                                <label style={{ fontSize: '0.78rem' }}>Aliases</label>
                                <input value={areaForm.aliases} onChange={e => setAreaForm(p => ({ ...p, aliases: e.target.value }))} />
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button className="btn-primary" style={{ padding: '6px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 4 }} onClick={saveArea}><Check size={13} /> Save</button>
                              <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 4 }} onClick={() => setEditingArea(null)}><X size={13} /> Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--card-bg)', borderRadius: 8 }}>
                            <span style={{ flex: 1, fontSize: '0.88rem', fontWeight: 500 }}>{area.name}</span>
                            {area.aliases?.length > 0 && (
                              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                {area.aliases.join(', ')}
                              </span>
                            )}
                            <button
                              onClick={() => { setEditingArea({ zoneId: zone.id, areaId: area.id }); setAreaForm({ name: area.name, aliases: (area.aliases || []).join(', ') }); }}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}
                            >
                              <Edit2 size={13} />
                            </button>
                            <button
                              onClick={() => deleteArea(area.id)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 4 }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                    {(!zone.delivery_areas || zone.delivery_areas.length === 0) && (
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: '6px 0' }}>No areas added yet. Add areas so customers can find this zone.</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}

          {zones.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
              No delivery zones yet. Click "Add Zone" to create the first one.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
