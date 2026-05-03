import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../context/ToastContext';
import { MapPin, Plus, Trash2, Edit2, Check, X } from 'lucide-react';
import { SkelList } from '../../components/Skeleton';
import { fetchFlatAreas } from '../../lib/deliveryMatcher';

export default function DeliveryZones() {
  const { showToast } = useToast();
  const [areas, setAreas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ name: '', price: '', aliases: '' });

  const refresh = async () => {
    setLoading(true);
    const flat = await fetchFlatAreas(supabase);
    setAreas(flat);
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  const findOrCreateZone = async (price) => {
    const priceNum = Number(price) || 0;
    const { data: existing } = await supabase
      .from('delivery_zones')
      .select('id')
      .eq('price', priceNum)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();
    if (existing) return existing.id;
    const priceLabel = priceNum === 0 ? 'Free Delivery' : `₦${Number(priceNum).toLocaleString()} Zone`;
    const slug = `zone-${priceNum}-${Date.now()}`;
    const { data, error } = await supabase
      .from('delivery_zones')
      .insert([{ name: priceLabel, slug, price: priceNum, is_active: true }])
      .select('id')
      .single();
    if (error) throw error;
    return data.id;
  };

  const saveLocation = async () => {
    if (!form.name.trim()) { showToast('Required', 'Location name is required', 'error'); return; }
    const aliases = form.aliases.split(',').map(a => a.trim()).filter(Boolean);
    try {
      if (editingId === 'new') {
        const zoneId = await findOrCreateZone(form.price);
        const { error } = await supabase.from('delivery_areas').insert([{
          name: form.name.trim(), aliases, zone_id: zoneId,
        }]);
        if (error) throw error;
      } else {
        const existing = areas.find(a => a.id === editingId);
        const payload = { name: form.name.trim(), aliases };
        if (Number(form.price) !== existing?.price) {
          payload.zone_id = await findOrCreateZone(form.price);
        }
        const { error } = await supabase.from('delivery_areas').update(payload).eq('id', editingId);
        if (error) throw error;
      }
      showToast('Saved', 'Location saved', 'success');
      setEditingId(null);
      await refresh();
    } catch (err) {
      showToast('Error', err.message, 'error');
    }
  };

  const deleteLocation = async (id) => {
    if (!confirm('Delete this delivery location?')) return;
    const { error } = await supabase.from('delivery_areas').delete().eq('id', id);
    if (error) { showToast('Error', error.message, 'error'); return; }
    showToast('Deleted', 'Location removed', 'success');
    await refresh();
  };

  const fmt = (n) => '₦' + Number(n).toLocaleString();

  return (
    <div>
      <div className="dash-card-header" style={{ marginBottom: 24 }}>
        <div className="dash-card-title" style={{ fontFamily: "'Mona Sans', 'Mona-Sans', 'Helvetica Neue', sans-serif", fontSize: '1.4rem', display: 'flex', alignItems: 'center', gap: 8 }}>
          <MapPin size={24} color="var(--red)" /> Delivery Locations
        </div>
        <button
          className="btn-primary"
          style={{ padding: '8px 16px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6 }}
          onClick={() => { setEditingId('new'); setForm({ name: '', price: '', aliases: '' }); }}
        >
          <Plus size={16} /> Add Location
        </button>
      </div>

      <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: 20 }}>
        Manage delivery locations and their fees. Customers type their area at checkout and are matched automatically.
      </p>

      {editingId === 'new' && (
        <div className="dash-card" style={{ marginBottom: 16, border: '2px solid var(--red)' }}>
          <h4 style={{ margin: '0 0 16px', fontFamily: "'Mona Sans', 'Mona-Sans', sans-serif" }}>New Location</h4>
          <div className="form-row">
            <div className="form-group">
              <label>Location Name</label>
              <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Abule Egba" autoFocus />
            </div>
            <div className="form-group">
              <label>Delivery Fee (₦)</label>
              <input type="number" value={form.price} onChange={e => setForm(p => ({ ...p, price: e.target.value }))} placeholder="3000" />
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: 16 }}>
            <label>Aliases (comma-separated, optional)</label>
            <input value={form.aliases} onChange={e => setForm(p => ({ ...p, aliases: e.target.value }))} placeholder="abule-egba, abule egba road" />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary" style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6 }} onClick={saveLocation}><Check size={16} /> Save Location</button>
            <button className="btn-secondary" style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setEditingId(null)}><X size={16} /> Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <SkelList rows={8} height={48} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {areas.map(area => (
            <div key={area.id} className="dash-card" style={{ padding: 0, overflow: 'hidden' }}>
              {editingId === area.id ? (
                <div style={{ padding: '16px 20px' }}>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Location Name</label>
                      <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} autoFocus />
                    </div>
                    <div className="form-group">
                      <label>Delivery Fee (₦)</label>
                      <input type="number" value={form.price} onChange={e => setForm(p => ({ ...p, price: e.target.value }))} />
                    </div>
                  </div>
                  <div className="form-group" style={{ marginBottom: 16 }}>
                    <label>Aliases</label>
                    <input value={form.aliases} onChange={e => setForm(p => ({ ...p, aliases: e.target.value }))} />
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn-primary" style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6 }} onClick={saveLocation}><Check size={16} /> Save</button>
                    <button className="btn-secondary" style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setEditingId(null)}><X size={16} /> Cancel</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px' }}>
                  <MapPin size={15} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{area.name}</div>
                    {area.aliases?.length > 0 && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: 2 }}>
                        {area.aliases.join(', ')}
                      </div>
                    )}
                  </div>
                  <div style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--red)', flexShrink: 0 }}>
                    {fmt(area.price)}
                  </div>
                  <button
                    onClick={() => { setEditingId(area.id); setForm({ name: area.name, price: String(area.price), aliases: (area.aliases || []).join(', ') }); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 6 }}
                  >
                    <Edit2 size={15} />
                  </button>
                  <button
                    onClick={() => deleteLocation(area.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 6 }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              )}
            </div>
          ))}

          {areas.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
              No delivery locations yet. Click "Add Location" to create the first one.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
