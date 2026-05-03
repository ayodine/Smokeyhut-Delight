import { useState, useEffect } from 'react';
import {
  Plus, Loader2, Edit2, Check, X, AlertTriangle, Trash2,
  Package, TrendingDown, ArrowUp, ArrowDown, RefreshCw,
  Archive, BarChart2, ClipboardList, Filter,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useToast } from '../../../context/ToastContext';
import { useAuth } from '../../../context/AuthContext';

const fmt   = v => `₦${Number(v || 0).toLocaleString('en-NG')}`;
const num   = v => Number(v) || 0;
const today = () => new Date().toISOString().split('T')[0];
const firstOfMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};

const UNITS = ['units', 'kg', 'g', 'litres', 'ml', 'bags', 'packs', 'pieces', 'bottles', 'rolls', 'crates', 'boxes'];
const EMPTY_ITEM = { name: '', unit: 'units', unit_cost: '', low_stock_threshold: '5' };
const EMPTY_MOV  = { item_id: '', type: 'IN', quantity: '', reference: '', note: '' };

const TYPE_BADGE = {
  IN:         { bg: 'rgba(34,197,94,0.15)',  color: '#16a34a', label: 'IN' },
  OUT:        { bg: 'rgba(239,68,68,0.15)',  color: '#dc2626', label: 'OUT' },
  ADJUSTMENT: { bg: 'rgba(99,102,241,0.15)', color: '#4f46e5', label: 'ADJ' },
};

const pill = (active) => ({
  padding: '8px 20px', borderRadius: 20, fontWeight: 700, fontSize: '0.85rem',
  cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", transition: 'all 0.15s',
  border: `1px solid ${active ? 'var(--red)' : 'var(--border-subtle)'}`,
  background: active ? 'var(--red)' : 'transparent',
  color: active ? '#fff' : 'var(--text)',
});

const INPUT_S = {
  width: '100%', padding: '11px 14px', borderRadius: 8,
  border: '1px solid var(--border-subtle)', background: 'var(--black)',
  color: 'var(--text)', fontSize: '0.9rem', fontFamily: "'DM Sans',sans-serif",
  outline: 'none', boxSizing: 'border-box',
};

const SELECT_S = {
  ...INPUT_S,
  padding: '11px 36px 11px 14px',
  WebkitAppearance: 'none', appearance: 'none', cursor: 'pointer',
  backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%235C5247' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E\")",
  backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center',
};

function stockColor(stock, threshold) {
  if (stock <= 0)          return '#ef4444';
  if (stock <= threshold)  return '#f59e0b';
  return '#22c55e';
}

function fmtDt(iso) {
  return new Date(iso).toLocaleString('en-NG', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export default function Inventory() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [tab, setTab]       = useState('stock');
  const [items, setItems]   = useState([]);
  const [stockMap, setStockMap] = useState({});   // { [item_id]: computed stock }
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);

  // ── Item modal ───────────────────────────────────────────────────────────────
  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItemId, setEditingItemId] = useState(null);
  const [itemForm, setItemForm]   = useState(EMPTY_ITEM);
  const [savingItem, setSavingItem] = useState(false);
  const [deletingItem, setDeletingItem] = useState(null);

  // ── Record movement modal ────────────────────────────────────────────────────
  const [showMovModal, setShowMovModal] = useState(false);
  const [movForm, setMovForm]   = useState(EMPTY_MOV);
  const [savingMov, setSavingMov] = useState(false);

  // ── Item detail modal ────────────────────────────────────────────────────────
  const [detailItem, setDetailItem]   = useState(null);
  const [detailMovs, setDetailMovs]   = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // ── Movement filters (Movements tab) ────────────────────────────────────────
  const [movTypeFilter, setMovTypeFilter] = useState('all');
  const [movItemFilter, setMovItemFilter] = useState('all');
  const [movFrom, setMovFrom] = useState('');
  const [movTo,   setMovTo]   = useState('');
  const [movLoading, setMovLoading] = useState(false);

  // ── Report ───────────────────────────────────────────────────────────────────
  const [reportFrom, setReportFrom] = useState(firstOfMonth());
  const [reportTo,   setReportTo]   = useState(today());
  const [reportData, setReportData] = useState([]);
  const [reportLoading, setReportLoading] = useState(false);

  // ─── Core fetches ────────────────────────────────────────────────────────────
  const fetchItemsAndStock = async () => {
    const [{ data: iData }, { data: mData }] = await Promise.all([
      supabase.from('inventory_items').select('*').eq('is_active', true).order('name'),
      supabase.from('inventory_movements').select('item_id, type, quantity'),
    ]);

    const iList = iData || [];
    const mList = mData || [];

    const map = {};
    iList.forEach(i => { map[i.id] = 0; });
    mList.forEach(m => {
      if (map[m.item_id] === undefined) map[m.item_id] = 0;
      if      (m.type === 'IN')  map[m.item_id] += num(m.quantity);
      else if (m.type === 'OUT') map[m.item_id] -= num(m.quantity);
      else                       map[m.item_id] += num(m.quantity); // ADJUSTMENT (signed)
    });

    setItems(iList);
    setStockMap(map);
  };

  const fetchMovements = async () => {
    setMovLoading(true);
    let q = supabase
      .from('inventory_movements')
      .select('id, item_id, type, quantity, reference, note, created_at, inventory_items(name, unit)')
      .order('created_at', { ascending: false })
      .limit(200);
    if (movTypeFilter !== 'all') q = q.eq('type', movTypeFilter);
    if (movItemFilter !== 'all') q = q.eq('item_id', movItemFilter);
    if (movFrom) q = q.gte('created_at', movFrom + 'T00:00:00');
    if (movTo)   q = q.lte('created_at', movTo   + 'T23:59:59');
    const { data } = await q;
    setMovements(data || []);
    setMovLoading(false);
  };

  const fetchItemDetail = async (item) => {
    setDetailItem(item);
    setDetailLoading(true);
    const { data } = await supabase
      .from('inventory_movements')
      .select('id, type, quantity, reference, note, created_at')
      .eq('item_id', item.id)
      .order('created_at', { ascending: false })
      .limit(50);
    setDetailMovs(data || []);
    setDetailLoading(false);
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchItemsAndStock();
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (tab === 'movements') fetchMovements();
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Record movement ─────────────────────────────────────────────────────────
  const openMovModal = (preset = {}) => {
    setMovForm({ ...EMPTY_MOV, ...preset });
    setShowMovModal(true);
  };

  const recordMovement = async () => {
    const { item_id, type, quantity, reference, note } = movForm;
    if (!item_id) return showToast('Select an item', '', 'error');

    const qty = Number(quantity);
    if (quantity === '' || qty === 0) return showToast('Enter a valid quantity', '', 'error');
    if (type !== 'ADJUSTMENT' && qty <= 0) return showToast('Quantity must be positive for IN/OUT', '', 'error');

    if (type === 'OUT') {
      const current = stockMap[item_id] ?? 0;
      if (current - qty < 0) {
        const item = items.find(i => i.id === item_id);
        return showToast('Insufficient stock', `Only ${current} ${item?.unit || 'units'} available`, 'error');
      }
    }

    setSavingMov(true);
    const { error } = await supabase.from('inventory_movements').insert({
      item_id, type, quantity: qty,
      reference: reference.trim() || null,
      note: note.trim() || null,
      created_by: user?.id || null,
    });
    setSavingMov(false);

    if (error) return showToast('Error: ' + error.message, '', 'error');

    showToast('Movement recorded', '', 'success');
    setShowMovModal(false);
    setMovForm(EMPTY_MOV);
    await fetchItemsAndStock();
    if (detailItem?.id === item_id) await fetchItemDetail(detailItem);
    if (tab === 'movements') await fetchMovements();
  };

  // ─── Save item ───────────────────────────────────────────────────────────────
  const saveItem = async () => {
    if (!itemForm.name.trim()) return showToast('Item name is required', '', 'error');
    setSavingItem(true);
    const payload = {
      name: itemForm.name.trim(),
      unit: itemForm.unit,
      unit_cost: num(itemForm.unit_cost),
      low_stock_threshold: num(itemForm.low_stock_threshold) || 5,
      is_active: true,
    };
    const { error } = editingItemId
      ? await supabase.from('inventory_items').update(payload).eq('id', editingItemId)
      : await supabase.from('inventory_items').insert(payload);
    setSavingItem(false);
    if (error) return showToast('Error: ' + error.message, '', 'error');
    showToast(editingItemId ? 'Item updated' : 'Item added', '', 'success');
    setShowItemModal(false);
    setEditingItemId(null);
    setItemForm(EMPTY_ITEM);
    await fetchItemsAndStock();
  };

  const deleteItem = async (id) => {
    if (!confirm('Remove this item? Movement history will be preserved.')) return;
    setDeletingItem(id);
    await supabase.from('inventory_items').update({ is_active: false }).eq('id', id);
    await fetchItemsAndStock();
    setDeletingItem(null);
    showToast('Item removed', '', 'success');
  };

  // ─── Report ──────────────────────────────────────────────────────────────────
  const generateReport = async () => {
    setReportLoading(true);
    const fromTs = reportFrom + 'T00:00:00';
    const toTs   = reportTo   + 'T23:59:59';

    const [{ data: before }, { data: inRange }] = await Promise.all([
      supabase.from('inventory_movements').select('item_id, type, quantity').lt('created_at', fromTs),
      supabase.from('inventory_movements').select('item_id, type, quantity').gte('created_at', fromTs).lte('created_at', toTs),
    ]);

    const report = items.map(item => {
      const opening = (before || [])
        .filter(m => m.item_id === item.id)
        .reduce((s, m) => {
          if (m.type === 'IN')  return s + num(m.quantity);
          if (m.type === 'OUT') return s - num(m.quantity);
          return s + num(m.quantity);
        }, 0);

      let inflow = 0, outflow = 0, adjustment = 0;
      (inRange || []).filter(m => m.item_id === item.id).forEach(m => {
        if      (m.type === 'IN')  inflow     += num(m.quantity);
        else if (m.type === 'OUT') outflow    += num(m.quantity);
        else                       adjustment += num(m.quantity);
      });

      return {
        item,
        opening:    Math.max(0, opening),
        inflow,
        outflow,
        adjustment,
        closing:    Math.max(0, opening + inflow - outflow + adjustment),
      };
    });

    setReportData(report);
    setReportLoading(false);
  };

  // ─── KPIs ────────────────────────────────────────────────────────────────────
  const lowStock   = items.filter(i => { const s = stockMap[i.id] ?? 0; return s > 0 && s <= num(i.low_stock_threshold); });
  const outOfStock = items.filter(i => (stockMap[i.id] ?? 0) <= 0);
  const totalValue = items.reduce((s, i) => s + (stockMap[i.id] ?? 0) * num(i.unit_cost), 0);

  if (loading) return (
    <div className="dash-card" style={{ padding: 32 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', color: 'var(--text-muted)' }}>
        <Loader2 size={20} className="spin" /> Loading inventory…
      </div>
    </div>
  );

  return (
    <div>
      {/* ── Header ── */}
      <div className="dash-card-header" style={{ marginBottom: 20 }}>
        <div className="dash-card-title" style={{ fontFamily: "'Mona Sans','Mona-Sans','Helvetica Neue',sans-serif", fontSize: '1.4rem' }}>
          Consumables Inventory
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {tab === 'catalog' && (
            <button className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', fontSize: '0.85rem' }}
              onClick={() => { setItemForm(EMPTY_ITEM); setEditingItemId(null); setShowItemModal(true); }}>
              <Plus size={16} /> Add Item
            </button>
          )}
          {(tab === 'stock' || tab === 'movements') && (
            <button className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', fontSize: '0.85rem' }}
              onClick={() => openMovModal()}>
              <Plus size={16} /> Record Movement
            </button>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { id: 'stock',     label: 'Stock',     icon: <Package size={14} /> },
          { id: 'movements', label: 'Movements', icon: <ClipboardList size={14} /> },
          { id: 'report',    label: 'Report',    icon: <BarChart2 size={14} /> },
          { id: 'catalog',   label: 'Catalog',   icon: <Archive size={14} /> },
        ].map(t => (
          <button key={t.id} style={{ ...pill(tab === t.id), display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setTab(t.id)}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          TAB: STOCK
         ══════════════════════════════════════════════════════════════════════ */}
      {tab === 'stock' && (
        <>
          {/* KPI strip */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Items Tracked', value: items.length,       icon: <Package size={18} />,     color: 'var(--text)' },
              { label: 'Low Stock',     value: lowStock.length,    icon: <TrendingDown size={18} />, color: lowStock.length   > 0 ? '#f59e0b' : 'var(--text)' },
              { label: 'Out of Stock',  value: outOfStock.length,  icon: <AlertTriangle size={18} />, color: outOfStock.length > 0 ? '#ef4444' : 'var(--text)' },
              { label: 'Stock Value',   value: fmt(totalValue),    icon: <BarChart2 size={18} />,    color: 'var(--text)' },
            ].map(k => (
              <div key={k.label} className="dash-card" style={{ padding: '14px 18px', display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ color: k.color, opacity: 0.7 }}>{k.icon}</div>
                <div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: k.color }}>{k.value}</div>
                  <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: 1 }}>{k.label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Alert strip */}
          {(outOfStock.length > 0 || lowStock.length > 0) && (
            <div style={{ borderRadius: 10, padding: '12px 16px', marginBottom: 16, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', fontSize: '0.83rem', lineHeight: 1.7 }}>
              {outOfStock.length > 0 && (
                <div style={{ color: '#ef4444', fontWeight: 700, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                  <AlertTriangle size={14} style={{ marginTop: 3, flexShrink: 0 }} />
                  <span><strong>Out of stock:</strong> {outOfStock.map(i => i.name).join(', ')}</span>
                </div>
              )}
              {lowStock.length > 0 && (
                <div style={{ color: '#f59e0b', fontWeight: 600, display: 'flex', gap: 6, alignItems: 'flex-start', marginTop: outOfStock.length > 0 ? 4 : 0 }}>
                  <TrendingDown size={14} style={{ marginTop: 3, flexShrink: 0 }} />
                  <span><strong>Low stock:</strong> {lowStock.map(i => i.name).join(', ')}</span>
                </div>
              )}
            </div>
          )}

          {items.length === 0 ? (
            <div className="dash-card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
              <Archive size={36} style={{ marginBottom: 12, opacity: 0.4 }} />
              <div style={{ fontWeight: 700, marginBottom: 6 }}>No inventory items yet</div>
              <div style={{ fontSize: '0.85rem', marginBottom: 16 }}>Add consumables like Charcoal, Seasoning, or Groundnut Oil in the <strong>Catalog</strong> tab.</div>
              <button className="btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 18px', fontSize: '0.85rem' }} onClick={() => setTab('catalog')}>
                <Plus size={15} /> Add Items
              </button>
            </div>
          ) : (
            <div className="dash-card">
              <div style={{ overflowX: 'auto' }}>
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th style={{ textAlign: 'center' }}>Unit</th>
                      <th style={{ textAlign: 'right' }}>Current Stock</th>
                      <th style={{ textAlign: 'right' }}>Min. Threshold</th>
                      <th style={{ textAlign: 'right' }}>Unit Cost</th>
                      <th style={{ textAlign: 'right' }}>Stock Value</th>
                      <th style={{ width: 120 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(item => {
                      const stock = stockMap[item.id] ?? 0;
                      const color = stockColor(stock, item.low_stock_threshold);
                      return (
                        <tr key={item.id} style={{ cursor: 'pointer' }} onClick={() => fetchItemDetail(item)}>
                          <td style={{ fontWeight: 600 }}>{item.name}</td>
                          <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>{item.unit}</td>
                          <td style={{ textAlign: 'right', fontWeight: 800, color }}>
                            {stock <= 0
                              ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><AlertTriangle size={13} /> 0</span>
                              : stock.toLocaleString()
                            }
                          </td>
                          <td style={{ textAlign: 'right', color: 'var(--text-muted)', fontSize: '0.83rem' }}>≤ {item.low_stock_threshold}</td>
                          <td style={{ textAlign: 'right', color: 'var(--text-muted)', fontSize: '0.83rem' }}>{fmt(item.unit_cost)}</td>
                          <td style={{ textAlign: 'right', fontSize: '0.85rem' }}>{fmt(Math.max(0, stock) * num(item.unit_cost))}</td>
                          <td onClick={e => e.stopPropagation()}>
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                              <button title="Add Stock" onClick={() => openMovModal({ item_id: item.id, type: 'IN' })}
                                style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid rgba(34,197,94,0.4)', background: 'rgba(34,197,94,0.08)', color: '#16a34a', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
                                <ArrowUp size={12} /> IN
                              </button>
                              <button title="Record Usage" onClick={() => openMovModal({ item_id: item.id, type: 'OUT' })}
                                style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.08)', color: '#dc2626', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
                                <ArrowDown size={12} /> OUT
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 10 }}>Click any row to view movement history.</p>
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB: MOVEMENTS
         ══════════════════════════════════════════════════════════════════════ */}
      {tab === 'movements' && (
        <>
          {/* Filters */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {['all', 'IN', 'OUT', 'ADJUSTMENT'].map(t => (
                <button key={t} className={`dash-filter-btn${movTypeFilter === t ? ' active' : ''}`} onClick={() => setMovTypeFilter(t)}>
                  {t === 'all' ? 'All' : t === 'ADJUSTMENT' ? 'Adjust' : t}
                </button>
              ))}
            </div>
            <select value={movItemFilter} onChange={e => setMovItemFilter(e.target.value)}
              style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--black)', color: 'var(--text)', fontSize: '0.85rem', fontFamily: "'DM Sans',sans-serif" }}>
              <option value="all">All Items</option>
              {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
            <input type="date" value={movFrom} onChange={e => setMovFrom(e.target.value)}
              style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--black)', color: 'var(--text)', fontSize: '0.85rem', fontFamily: "'DM Sans',sans-serif" }} />
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>→</span>
            <input type="date" value={movTo} onChange={e => setMovTo(e.target.value)}
              style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--black)', color: 'var(--text)', fontSize: '0.85rem', fontFamily: "'DM Sans',sans-serif" }} />
            <button onClick={fetchMovements}
              style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--black2)', color: 'var(--text)', fontWeight: 700, fontSize: '0.83rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
              {movLoading ? <Loader2 size={13} className="spin" /> : <Filter size={13} />} Apply
            </button>
          </div>

          <div className="dash-card">
            {movLoading ? (
              <div style={{ padding: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--text-muted)' }}>
                <Loader2 size={18} className="spin" /> Loading movements…
              </div>
            ) : movements.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                <ClipboardList size={32} style={{ marginBottom: 12, opacity: 0.4 }} />
                <div style={{ fontWeight: 700 }}>No movements found</div>
                <div style={{ fontSize: '0.85rem', marginTop: 6 }}>Record your first movement using the button above.</div>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th>Date & Time</th>
                      <th>Item</th>
                      <th style={{ textAlign: 'center' }}>Type</th>
                      <th style={{ textAlign: 'right' }}>Quantity</th>
                      <th>Reference</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map(m => {
                      const badge = TYPE_BADGE[m.type] || TYPE_BADGE.IN;
                      return (
                        <tr key={m.id}>
                          <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmtDt(m.created_at)}</td>
                          <td style={{ fontWeight: 600 }}>{m.inventory_items?.name || '—'}</td>
                          <td style={{ textAlign: 'center' }}>
                            <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 800, background: badge.bg, color: badge.color }}>
                              {badge.label}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 700 }}>
                            <span style={{ color: m.type === 'OUT' ? '#ef4444' : m.type === 'IN' ? '#16a34a' : '#4f46e5' }}>
                              {m.type === 'OUT' ? '−' : '+'}{Math.abs(num(m.quantity)).toLocaleString()}
                            </span>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginLeft: 4 }}>{m.inventory_items?.unit}</span>
                          </td>
                          <td style={{ fontSize: '0.83rem', color: 'var(--text-muted)' }}>{m.reference || '—'}</td>
                          <td style={{ fontSize: '0.83rem', color: 'var(--text-muted)' }}>{m.note || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB: REPORT
         ══════════════════════════════════════════════════════════════════════ */}
      {tab === 'report' && (
        <>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
            <label style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-muted)' }}>From</label>
            <input type="date" value={reportFrom} onChange={e => setReportFrom(e.target.value)}
              style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--black)', color: 'var(--text)', fontSize: '0.9rem', fontFamily: "'DM Sans',sans-serif" }} />
            <label style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-muted)' }}>To</label>
            <input type="date" value={reportTo} onChange={e => setReportTo(e.target.value)}
              style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--black)', color: 'var(--text)', fontSize: '0.9rem', fontFamily: "'DM Sans',sans-serif" }} />
            <button className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', fontSize: '0.85rem' }} onClick={generateReport}>
              {reportLoading ? <Loader2 size={15} className="spin" /> : <BarChart2 size={15} />} Generate
            </button>
          </div>

          {reportData.length === 0 ? (
            <div className="dash-card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
              <BarChart2 size={32} style={{ marginBottom: 12, opacity: 0.4 }} />
              <div style={{ fontWeight: 700 }}>No report generated yet</div>
              <div style={{ fontSize: '0.85rem', marginTop: 6 }}>Select a date range and click Generate.</div>
            </div>
          ) : (
            <div className="dash-card">
              <div style={{ overflowX: 'auto' }}>
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th style={{ textAlign: 'center' }}>Unit</th>
                      <th style={{ textAlign: 'right' }}>Opening</th>
                      <th style={{ textAlign: 'right', color: '#16a34a' }}>+ Inflow</th>
                      <th style={{ textAlign: 'right', color: '#ef4444' }}>− Outflow</th>
                      <th style={{ textAlign: 'right', color: '#4f46e5' }}>± Adjust</th>
                      <th style={{ textAlign: 'right' }}>Closing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.map(({ item, opening, inflow, outflow, adjustment, closing }) => (
                      <tr key={item.id}>
                        <td style={{ fontWeight: 600 }}>{item.name}</td>
                        <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>{item.unit}</td>
                        <td style={{ textAlign: 'right' }}>{opening.toLocaleString()}</td>
                        <td style={{ textAlign: 'right', color: '#16a34a', fontWeight: 700 }}>+{inflow.toLocaleString()}</td>
                        <td style={{ textAlign: 'right', color: '#ef4444', fontWeight: 700 }}>−{outflow.toLocaleString()}</td>
                        <td style={{ textAlign: 'right', color: '#4f46e5', fontWeight: 700 }}>
                          {adjustment >= 0 ? '+' : ''}{adjustment.toLocaleString()}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 800, color: stockColor(closing, item.low_stock_threshold) }}>
                          {closing.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: '2px solid var(--border-subtle)' }}>
                      <td colSpan={2} style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-muted)', paddingTop: 10 }}>Totals</td>
                      {['opening', 'inflow', 'outflow', 'adjustment', 'closing'].map(k => (
                        <td key={k} style={{ textAlign: 'right', fontWeight: 800, paddingTop: 10 }}>
                          {reportData.reduce((s, r) => s + r[k], 0).toLocaleString()}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB: CATALOG
         ══════════════════════════════════════════════════════════════════════ */}
      {tab === 'catalog' && (
        <div className="dash-card">
          {items.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
              <Archive size={36} style={{ marginBottom: 12, opacity: 0.4 }} />
              <div style={{ fontWeight: 700, marginBottom: 6 }}>No items in catalog</div>
              <div style={{ fontSize: '0.85rem', marginBottom: 16 }}>Add consumables like Charcoal, Seasoning, Groundnut Oil…</div>
              <button className="btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 18px', fontSize: '0.85rem' }}
                onClick={() => { setItemForm(EMPTY_ITEM); setEditingItemId(null); setShowItemModal(true); }}>
                <Plus size={15} /> Add First Item
              </button>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Unit</th>
                    <th style={{ textAlign: 'right' }}>Unit Cost</th>
                    <th style={{ textAlign: 'right' }}>Low Stock Alert</th>
                    <th style={{ width: 80 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => (
                    <tr key={item.id}>
                      <td style={{ fontWeight: 600 }}>{item.name}</td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{item.unit}</td>
                      <td style={{ textAlign: 'right' }}>{fmt(item.unit_cost)}</td>
                      <td style={{ textAlign: 'right', color: 'var(--text-muted)', fontSize: '0.85rem' }}>≤ {item.low_stock_threshold} {item.unit}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button onClick={() => { setItemForm({ name: item.name, unit: item.unit, unit_cost: item.unit_cost, low_stock_threshold: item.low_stock_threshold }); setEditingItemId(item.id); setShowItemModal(true); }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
                            <Edit2 size={14} />
                          </button>
                          <button onClick={() => deleteItem(item.id)} disabled={deletingItem === item.id}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 4 }}>
                            {deletingItem === item.id ? <Loader2 size={14} className="spin" /> : <Trash2 size={14} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          MODAL: Item Detail
         ══════════════════════════════════════════════════════════════════════ */}
      {detailItem && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--black)', borderRadius: 16, padding: 28, width: '100%', maxWidth: 600, border: '1px solid var(--border-subtle)', boxShadow: '0 20px 60px rgba(0,0,0,0.4)', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: '1.1rem' }}>{detailItem.name}</div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 4 }}>
                  Current stock:{' '}
                  <strong style={{ color: stockColor(stockMap[detailItem.id] ?? 0, detailItem.low_stock_threshold), fontSize: '1rem' }}>
                    {(stockMap[detailItem.id] ?? 0).toLocaleString()} {detailItem.unit}
                  </strong>
                </div>
              </div>
              <button onClick={() => setDetailItem(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
            </div>

            {/* Quick actions */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              <button onClick={() => openMovModal({ item_id: detailItem.id, type: 'IN' })}
                style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid rgba(34,197,94,0.4)', background: 'rgba(34,197,94,0.08)', color: '#16a34a', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <ArrowUp size={15} /> Add Stock
              </button>
              <button onClick={() => openMovModal({ item_id: detailItem.id, type: 'OUT' })}
                style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.08)', color: '#dc2626', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <ArrowDown size={15} /> Record Usage
              </button>
              <button onClick={() => openMovModal({ item_id: detailItem.id, type: 'ADJUSTMENT' })}
                style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid rgba(99,102,241,0.4)', background: 'rgba(99,102,241,0.08)', color: '#4f46e5', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <RefreshCw size={15} /> Adjust
              </button>
            </div>

            <div style={{ fontWeight: 700, fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Movement History
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {detailLoading ? (
                <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <Loader2 size={16} className="spin" /> Loading…
                </div>
              ) : detailMovs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  No movements recorded yet.
                </div>
              ) : (
                <table className="dash-table" style={{ fontSize: '0.83rem' }}>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th style={{ textAlign: 'center' }}>Type</th>
                      <th style={{ textAlign: 'right' }}>Qty</th>
                      <th>Reference</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailMovs.map(m => {
                      const badge = TYPE_BADGE[m.type];
                      return (
                        <tr key={m.id}>
                          <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmtDt(m.created_at)}</td>
                          <td style={{ textAlign: 'center' }}>
                            <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 800, background: badge.bg, color: badge.color }}>
                              {badge.label}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: m.type === 'OUT' ? '#ef4444' : m.type === 'IN' ? '#16a34a' : '#4f46e5' }}>
                            {m.type === 'OUT' ? '−' : '+'}{Math.abs(num(m.quantity)).toLocaleString()}
                          </td>
                          <td style={{ color: 'var(--text-muted)' }}>{m.reference || '—'}</td>
                          <td style={{ color: 'var(--text-muted)' }}>{m.note || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          MODAL: Record Movement
         ══════════════════════════════════════════════════════════════════════ */}
      {showMovModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--black)', borderRadius: 16, padding: 28, width: '100%', maxWidth: 420, border: '1px solid var(--border-subtle)', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <span style={{ fontWeight: 800, fontSize: '1.05rem' }}>Record Movement</span>
              <button onClick={() => setShowMovModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
            </div>

            {/* Item */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>Item *</label>
              <select value={movForm.item_id} onChange={e => setMovForm(f => ({ ...f, item_id: e.target.value }))} style={SELECT_S}>
                <option value="">— Select item —</option>
                {items.map(i => (
                  <option key={i.id} value={i.id}>
                    {i.name} ({(stockMap[i.id] ?? 0).toLocaleString()} {i.unit})
                  </option>
                ))}
              </select>
            </div>

            {/* Type */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>Movement Type *</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {['IN', 'OUT', 'ADJUSTMENT'].map(t => {
                  const badge  = TYPE_BADGE[t];
                  const active = movForm.type === t;
                  return (
                    <button key={t} onClick={() => setMovForm(f => ({ ...f, type: t }))}
                      style={{ flex: 1, padding: '9px 6px', borderRadius: 8, fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', transition: 'all 0.15s', fontFamily: "'DM Sans',sans-serif",
                        border: `1.5px solid ${active ? badge.color : 'var(--border-subtle)'}`,
                        background: active ? badge.bg : 'transparent',
                        color: active ? badge.color : 'var(--text-muted)' }}>
                      {t === 'ADJUSTMENT' ? 'ADJUST' : t}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Quantity */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>
                Quantity *{movForm.type === 'ADJUSTMENT' && <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}> (negative to reduce)</span>}
              </label>
              <input type="number" step="0.01"
                value={movForm.quantity}
                onChange={e => setMovForm(f => ({ ...f, quantity: e.target.value }))}
                placeholder={movForm.type === 'ADJUSTMENT' ? 'e.g. −5 or +10' : 'e.g. 25'}
                style={INPUT_S} />
            </div>

            {/* Reference */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>Reference</label>
              <input type="text" value={movForm.reference}
                onChange={e => setMovForm(f => ({ ...f, reference: e.target.value }))}
                placeholder="e.g. Supplier receipt, batch number…"
                style={INPUT_S} />
            </div>

            {/* Note */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>Note</label>
              <textarea value={movForm.note}
                onChange={e => setMovForm(f => ({ ...f, note: e.target.value }))}
                placeholder="Optional note…" rows={2}
                style={{ ...INPUT_S, resize: 'vertical' }} />
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowMovModal(false)}
                style={{ flex: 1, padding: '11px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text)', fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
                Cancel
              </button>
              <button onClick={recordMovement} disabled={savingMov}
                style={{ flex: 2, padding: '11px', borderRadius: 8, border: 'none', background: 'var(--red)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                {savingMov ? <Loader2 size={16} className="spin" /> : <Check size={16} />}
                Record Movement
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          MODAL: Add / Edit Item
         ══════════════════════════════════════════════════════════════════════ */}
      {showItemModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--black)', borderRadius: 16, padding: 28, width: '100%', maxWidth: 420, border: '1px solid var(--border-subtle)', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <span style={{ fontWeight: 800, fontSize: '1.05rem' }}>{editingItemId ? 'Edit Item' : 'Add Inventory Item'}</span>
              <button onClick={() => setShowItemModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
            </div>

            {[
              { label: 'Item Name *',              field: 'name',                type: 'text',   placeholder: 'e.g. Charcoal, Seasoning, Groundnut Oil…' },
              { label: 'Unit Cost (₦)',             field: 'unit_cost',          type: 'number', placeholder: '0.00' },
              { label: 'Low Stock Alert Threshold', field: 'low_stock_threshold', type: 'number', placeholder: '5' },
            ].map(({ label, field, type, placeholder }) => (
              <div key={field} style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>{label}</label>
                <input type={type} value={itemForm[field]} placeholder={placeholder}
                  onChange={e => setItemForm(f => ({ ...f, [field]: e.target.value }))}
                  style={INPUT_S} />
              </div>
            ))}

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>Unit of Measure</label>
              <select value={itemForm.unit} onChange={e => setItemForm(f => ({ ...f, unit: e.target.value }))} style={SELECT_S}>
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowItemModal(false)}
                style={{ flex: 1, padding: '11px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text)', fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
                Cancel
              </button>
              <button onClick={saveItem} disabled={savingItem}
                style={{ flex: 2, padding: '11px', borderRadius: 8, border: 'none', background: 'var(--red)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                {savingItem ? <Loader2 size={16} className="spin" /> : <Check size={16} />}
                {editingItemId ? 'Save Changes' : 'Add Item'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
