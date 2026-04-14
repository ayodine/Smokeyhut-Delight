import { useState, useEffect, useRef } from 'react';
import {
  Plus, Trash2, Loader2, Edit2, Check, X, AlertTriangle,
  Package, TrendingDown, RefreshCw, Archive, ChevronUp, ChevronDown,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useToast } from '../../../context/ToastContext';

const fmt   = v  => `₦${Number(v || 0).toLocaleString('en-NG')}`;
const num   = v  => Number(v) || 0;
const today = () => new Date().toISOString().split('T')[0];
const prev  = (d) => {
  const dt = new Date(d + 'T00:00:00');
  dt.setDate(dt.getDate() - 1);
  return dt.toISOString().split('T')[0];
};
const closing = (row) => Math.max(0, num(row.opening_stock) + num(row.restocked) - num(row.used));

const STATUS_STYLE = (c, threshold) => {
  if (c === 0)          return { color: '#ef4444', fontWeight: 800 };
  if (c <= threshold)   return { color: '#f59e0b', fontWeight: 700 };
  return                       { color: '#22c55e', fontWeight: 700 };
};

const INPUT_S = {
  width: '80px', padding: '5px 8px', borderRadius: 6,
  border: '1px solid var(--border-subtle)', background: 'var(--black)',
  color: 'var(--text)', fontSize: '0.85rem',
  fontFamily: "'DM Sans',sans-serif", outline: 'none', textAlign: 'right',
};

const UNITS = ['units', 'kg', 'g', 'litres', 'ml', 'bags', 'packs', 'pieces', 'bottles', 'rolls', 'crates', 'boxes'];

const EMPTY_ITEM = { name: '', unit: 'units', unit_cost: '', low_stock_threshold: '5' };

// ─── Inline editable cell ─────────────────────────────────────────────────────
function NumCell({ value, onChange, disabled }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal]         = useState(value);
  const ref = useRef();

  useEffect(() => { setVal(value); }, [value]);

  const commit = () => {
    setEditing(false);
    const parsed = Math.max(0, Number(val) || 0);
    setVal(parsed);
    if (parsed !== value) onChange(parsed);
  };

  if (disabled) return <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>—</span>;

  return editing ? (
    <input
      ref={ref}
      type="number"
      min="0"
      step="0.01"
      value={val}
      style={INPUT_S}
      onChange={e => setVal(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setVal(value); setEditing(false); } }}
      autoFocus
    />
  ) : (
    <span
      onClick={() => setEditing(true)}
      title="Click to edit"
      style={{
        display: 'inline-block', minWidth: 52, padding: '4px 8px',
        borderRadius: 6, cursor: 'text',
        border: '1px solid transparent',
        fontSize: '0.85rem', textAlign: 'right',
        transition: 'border-color 0.12s',
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-subtle)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'transparent'}
    >
      {num(val).toLocaleString()}
    </span>
  );
}

export default function Inventory() {
  const [tab, setTab]             = useState('log');   // 'log' | 'items'
  const [date, setDate]           = useState(today());
  const [items, setItems]         = useState([]);      // inventory_items catalog
  const [logs, setLogs]           = useState([]);      // inventory_logs for selected date
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState({});      // { [item_id]: bool }
  const [seeding, setSeeding]     = useState(false);
  const [showItemModal, setShowItemModal] = useState(false);
  const [itemForm, setItemForm]   = useState(EMPTY_ITEM);
  const [savingItem, setSavingItem] = useState(false);
  const [deletingItem, setDeletingItem] = useState(null);
  const [editingItemId, setEditingItemId] = useState(null);
  const { showToast } = useToast();

  // Merge items + logs into a single display rows array
  const rows = items.map(item => {
    const log = logs.find(l => l.item_id === item.id);
    return {
      item,
      log,
      // editable fields (local state overrides DB until saved)
      opening_stock: log ? num(log.opening_stock) : 0,
      restocked:     log ? num(log.restocked)     : 0,
      used:          log ? num(log.used)           : 0,
      notes:         log ? (log.notes || '')       : '',
    };
  });

  // Local overrides for in-progress edits before saving
  const [overrides, setOverrides] = useState({});

  const getRow = (item_id) => {
    const base = rows.find(r => r.item.id === item_id);
    return base ? { ...base, ...(overrides[item_id] || {}) } : null;
  };

  const setField = (item_id, field, value) => {
    setOverrides(prev => ({
      ...prev,
      [item_id]: { ...(prev[item_id] || {}), [field]: value },
    }));
  };

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchItems = async () => {
    const { data } = await supabase
      .from('inventory_items')
      .select('*')
      .eq('is_active', true)
      .order('name');
    if (data) setItems(data);
  };

  const fetchLogs = async (d) => {
    const { data } = await supabase
      .from('inventory_logs')
      .select('*')
      .eq('date', d);
    if (data) setLogs(data);
    setOverrides({});
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchItems();
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    fetchLogs(date);
  }, [date]);

  // ── Seed today's log from yesterday's closing stock ────────────────────────
  const seedLog = async () => {
    if (items.length === 0) {
      showToast('Add inventory items first before starting a log.', 'info');
      return;
    }
    setSeeding(true);
    const prevDate = prev(date);
    const { data: prevLogs } = await supabase
      .from('inventory_logs')
      .select('*')
      .eq('date', prevDate);

    const prevMap = {};
    (prevLogs || []).forEach(l => { prevMap[l.item_id] = l; });

    const toInsert = items.map(item => {
      const p = prevMap[item.id];
      const openingStock = p ? num(p.closing_stock) : 0;
      return {
        item_id: item.id,
        date,
        opening_stock: openingStock,
        restocked: 0,
        used: 0,
        closing_stock: openingStock,
        unit_cost: item.unit_cost || 0,
        notes: '',
      };
    });

    const { error } = await supabase
      .from('inventory_logs')
      .upsert(toInsert, { onConflict: 'item_id,date', ignoreDuplicates: true });

    if (error) { showToast('Failed to start log: ' + error.message, 'error'); }
    else        { showToast(`Log started for ${date} — opening stock copied from ${prevDate}.`, 'success'); }

    await fetchLogs(date);
    setSeeding(false);
  };

  // ── Save a single row ──────────────────────────────────────────────────────
  const saveRow = async (item_id) => {
    const r = getRow(item_id);
    if (!r) return;
    const cl = closing(r);
    setSaving(s => ({ ...s, [item_id]: true }));

    const payload = {
      item_id,
      date,
      opening_stock: num(r.opening_stock),
      restocked:     num(r.restocked),
      used:          num(r.used),
      closing_stock: cl,
      unit_cost:     r.item.unit_cost || 0,
      notes:         r.notes || '',
    };

    const { error } = await supabase
      .from('inventory_logs')
      .upsert(payload, { onConflict: 'item_id,date' });

    if (error) showToast('Save failed: ' + error.message, 'error');
    else {
      await fetchLogs(date);
      showToast('Saved.', 'success');
    }
    setSaving(s => ({ ...s, [item_id]: false }));
  };

  // ── Save item catalog entry ────────────────────────────────────────────────
  const saveItem = async () => {
    if (!itemForm.name.trim()) return showToast('Item name is required.', 'error');
    setSavingItem(true);

    const payload = {
      name: itemForm.name.trim(),
      unit: itemForm.unit,
      unit_cost: Number(itemForm.unit_cost) || 0,
      low_stock_threshold: Number(itemForm.low_stock_threshold) || 5,
      is_active: true,
    };

    let error;
    if (editingItemId) {
      ({ error } = await supabase.from('inventory_items').update(payload).eq('id', editingItemId));
    } else {
      ({ error } = await supabase.from('inventory_items').insert(payload));
    }

    if (error) showToast('Failed: ' + error.message, 'error');
    else {
      showToast(editingItemId ? 'Item updated.' : 'Item added.', 'success');
      setShowItemModal(false);
      setEditingItemId(null);
      setItemForm(EMPTY_ITEM);
      await fetchItems();
    }
    setSavingItem(false);
  };

  const deleteItem = async (id) => {
    if (!confirm('Delete this inventory item? Its log history will also be removed.')) return;
    setDeletingItem(id);
    await supabase.from('inventory_items').update({ is_active: false }).eq('id', id);
    await fetchItems();
    setDeletingItem(null);
    showToast('Item removed.', 'success');
  };

  const openEditItem = (item) => {
    setItemForm({
      name: item.name,
      unit: item.unit,
      unit_cost: item.unit_cost,
      low_stock_threshold: item.low_stock_threshold,
    });
    setEditingItemId(item.id);
    setShowItemModal(true);
  };

  // ── KPI calculations ───────────────────────────────────────────────────────
  const loggedRows = rows.filter(r => {
    const r2 = getRow(r.item.id);
    return r2 && r2.log;
  });
  const outOfStock  = loggedRows.filter(r => {
    const r2 = getRow(r.item.id);
    return closing(r2) === 0;
  });
  const lowStock = loggedRows.filter(r => {
    const r2 = getRow(r.item.id);
    const cl = closing(r2);
    return cl > 0 && cl <= num(r.item.low_stock_threshold);
  });
  const restockCost = loggedRows.reduce((sum, r) => {
    const r2 = getRow(r.item.id);
    return sum + num(r2?.restocked) * num(r.item.unit_cost);
  }, 0);
  const totalUsageCost = loggedRows.reduce((sum, r) => {
    const r2 = getRow(r.item.id);
    return sum + num(r2?.used) * num(r.item.unit_cost);
  }, 0);

  const logExists = logs.length > 0;

  // ── Pill style ─────────────────────────────────────────────────────────────
  const pill = (active) => ({
    padding: '8px 20px', borderRadius: 20, fontWeight: 700, fontSize: '0.85rem',
    cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", transition: 'all 0.15s',
    border: `1px solid ${active ? 'var(--red)' : 'var(--border-subtle)'}`,
    background: active ? 'var(--red)' : 'transparent',
    color: active ? '#fff' : 'var(--text)',
  });

  // ── Sort for items tab ─────────────────────────────────────────────────────
  const [sortKey, setSortKey] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const handleSort = (k) => { setSortKey(k); setSortDir(s => k === sortKey ? (s === 'asc' ? 'desc' : 'asc') : 'asc'); };
  const SortIcon = ({ col }) => {
    if (col !== sortKey) return <ChevronUp size={12} style={{ opacity: 0.3, marginLeft: 4 }} />;
    return sortDir === 'asc'
      ? <ChevronUp   size={12} style={{ color: 'var(--red)', marginLeft: 4 }} />
      : <ChevronDown size={12} style={{ color: 'var(--red)', marginLeft: 4 }} />;
  };

  const thS = (col) => ({
    cursor: 'pointer', userSelect: 'none',
    background: col === sortKey ? 'var(--black2)' : undefined,
  });

  const sortedItems = [...items].sort((a, b) => {
    let av = a[sortKey], bv = b[sortKey];
    if (typeof av === 'string') av = av.toLowerCase();
    if (typeof bv === 'string') bv = bv.toLowerCase();
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ? 1  : -1;
    return 0;
  });

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
          Inventory Tracker
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {tab === 'items' && (
            <button className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', fontSize: '0.85rem' }}
              onClick={() => { setItemForm(EMPTY_ITEM); setEditingItemId(null); setShowItemModal(true); }}>
              <Plus size={16} /> Add Item
            </button>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        <button style={pill(tab === 'log')}   onClick={() => setTab('log')}>Daily Log</button>
        <button style={pill(tab === 'items')} onClick={() => setTab('items')}>Items Catalog</button>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          TAB: Daily Log
         ══════════════════════════════════════════════════════════════════════ */}
      {tab === 'log' && (
        <>
          {/* Date bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <label style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-muted)' }}>Date</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              style={{
                padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border-subtle)',
                background: 'var(--black)', color: 'var(--text)', fontSize: '0.9rem',
                fontFamily: "'DM Sans',sans-serif", outline: 'none', cursor: 'pointer',
              }}
            />
            {!logExists && items.length > 0 && (
              <button
                onClick={seedLog}
                disabled={seeding}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
                  borderRadius: 8, border: '1px solid var(--red)', background: 'var(--red)',
                  color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer',
                  fontFamily: "'DM Sans',sans-serif",
                }}
              >
                {seeding ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}
                {date === today() ? 'Start Today\'s Log' : 'Start Log for This Date'}
              </button>
            )}
            {logExists && (
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Check size={14} color="#22c55e" /> Log active — click any value to edit, then Save
              </span>
            )}
          </div>

          {/* KPI strip */}
          {logExists && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
              {[
                { label: 'Items Tracked',    value: loggedRows.length,   icon: <Package size={18} />,    color: 'var(--text)' },
                { label: 'Out of Stock',     value: outOfStock.length,   icon: <AlertTriangle size={18} />, color: outOfStock.length > 0 ? '#ef4444' : 'var(--text)' },
                { label: 'Low Stock',        value: lowStock.length,     icon: <TrendingDown size={18} />,  color: lowStock.length > 0   ? '#f59e0b' : 'var(--text)' },
                { label: 'Restock Cost',     value: fmt(restockCost),    icon: <RefreshCw size={18} />,  color: 'var(--text)' },
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
          )}

          {/* Alert strip */}
          {logExists && (outOfStock.length > 0 || lowStock.length > 0) && (
            <div style={{
              borderRadius: 10, padding: '12px 16px', marginBottom: 16,
              background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
              fontSize: '0.83rem', lineHeight: 1.7,
            }}>
              {outOfStock.length > 0 && (
                <div style={{ color: '#ef4444', fontWeight: 700, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                  <AlertTriangle size={14} style={{ marginTop: 3, flexShrink: 0 }} />
                  <span><strong>Out of stock:</strong> {outOfStock.map(r => r.item.name).join(', ')}</span>
                </div>
              )}
              {lowStock.length > 0 && (
                <div style={{ color: '#f59e0b', fontWeight: 600, display: 'flex', gap: 6, alignItems: 'flex-start', marginTop: outOfStock.length > 0 ? 4 : 0 }}>
                  <TrendingDown size={14} style={{ marginTop: 3, flexShrink: 0 }} />
                  <span><strong>Low stock:</strong> {lowStock.map(r => r.item.name).join(', ')}</span>
                </div>
              )}
            </div>
          )}

          {/* No items state */}
          {items.length === 0 && (
            <div className="dash-card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
              <Archive size={36} style={{ marginBottom: 12, opacity: 0.4 }} />
              <div style={{ fontWeight: 700, marginBottom: 6 }}>No inventory items yet</div>
              <div style={{ fontSize: '0.85rem', marginBottom: 16 }}>Go to <strong>Items Catalog</strong> to add the materials and stock you track daily.</div>
              <button className="btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 18px', fontSize: '0.85rem' }}
                onClick={() => setTab('items')}>
                <Plus size={15} /> Add Items
              </button>
            </div>
          )}

          {/* No log for this date */}
          {items.length > 0 && !logExists && (
            <div className="dash-card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
              <Package size={36} style={{ marginBottom: 12, opacity: 0.4 }} />
              <div style={{ fontWeight: 700, marginBottom: 6 }}>No log for {date}</div>
              <div style={{ fontSize: '0.85rem', marginBottom: 16 }}>
                Click <strong>"{date === today() ? "Start Today's Log" : "Start Log for This Date"}"</strong> above to copy yesterday's closing stock as today's opening stock, then fill in what was used and restocked.
              </div>
            </div>
          )}

          {/* Log table */}
          {logExists && (
            <div className="dash-card">
              <div style={{ overflowX: 'auto' }}>
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th style={{ minWidth: 140 }}>Item</th>
                      <th style={{ textAlign: 'center' }}>Unit</th>
                      <th style={{ textAlign: 'right' }}>Opening</th>
                      <th style={{ textAlign: 'right', color: '#22c55e' }}>+ Restocked</th>
                      <th style={{ textAlign: 'right', color: '#f59e0b' }}>− Used</th>
                      <th style={{ textAlign: 'right' }}>Closing</th>
                      <th style={{ textAlign: 'right' }}>Unit Cost</th>
                      <th style={{ textAlign: 'right' }}>Usage Cost</th>
                      <th style={{ width: 60 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ item, log }) => {
                      const r      = getRow(item.id);
                      const cl     = closing(r);
                      const hasLog = !!log;
                      const isSaving = saving[item.id];
                      const rowBg  = cl === 0 && hasLog
                        ? 'rgba(239,68,68,0.05)'
                        : cl <= num(item.low_stock_threshold) && cl > 0 && hasLog
                          ? 'rgba(251,191,36,0.05)'
                          : undefined;

                      return (
                        <tr key={item.id} style={{ background: rowBg }}>
                          <td style={{ fontWeight: 600 }}>{item.name}</td>
                          <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>{item.unit}</td>
                          <td style={{ textAlign: 'right' }}>
                            <NumCell
                              value={r?.opening_stock ?? 0}
                              onChange={v => setField(item.id, 'opening_stock', v)}
                              disabled={!hasLog}
                            />
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <NumCell
                              value={r?.restocked ?? 0}
                              onChange={v => setField(item.id, 'restocked', v)}
                              disabled={!hasLog}
                            />
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <NumCell
                              value={r?.used ?? 0}
                              onChange={v => setField(item.id, 'used', v)}
                              disabled={!hasLog}
                            />
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <span style={STATUS_STYLE(cl, item.low_stock_threshold)}>
                              {hasLog ? cl.toLocaleString() : '—'}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right', color: 'var(--text-muted)', fontSize: '0.83rem' }}>
                            {fmt(item.unit_cost)}
                          </td>
                          <td style={{ textAlign: 'right', fontSize: '0.83rem', color: 'var(--text-muted)' }}>
                            {hasLog ? fmt(num(r?.used) * num(item.unit_cost)) : '—'}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {hasLog && (
                              <button
                                onClick={() => saveRow(item.id)}
                                disabled={isSaving}
                                style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 4,
                                  padding: '5px 10px', borderRadius: 6,
                                  border: '1px solid var(--border-subtle)',
                                  background: 'var(--black)', color: 'var(--text)',
                                  fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer',
                                  fontFamily: "'DM Sans',sans-serif",
                                }}
                              >
                                {isSaving ? <Loader2 size={12} className="spin" /> : <Check size={12} />}
                                Save
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {/* Footer totals */}
                  <tfoot>
                    <tr style={{ borderTop: '2px solid var(--border-subtle)' }}>
                      <td colSpan={7} style={{ textAlign: 'right', fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-muted)', paddingTop: 10 }}>
                        Total Usage Cost
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--text)', paddingTop: 10 }}>
                        {fmt(totalUsageCost)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB: Items Catalog
         ══════════════════════════════════════════════════════════════════════ */}
      {tab === 'items' && (
        <div className="dash-card">
          {items.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
              <Archive size={36} style={{ marginBottom: 12, opacity: 0.4 }} />
              <div style={{ fontWeight: 700, marginBottom: 6 }}>No items in catalog</div>
              <div style={{ fontSize: '0.85rem', marginBottom: 16 }}>Add the stock items or materials you track daily.</div>
              <button className="btn-primary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 18px', fontSize: '0.85rem' }}
                onClick={() => { setItemForm(EMPTY_ITEM); setEditingItemId(null); setShowItemModal(true); }}>
                <Plus size={15} /> Add First Item
              </button>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="dash-table">
                <thead>
                  <tr>
                    <th style={thS('name')}                 onClick={() => handleSort('name')}>Name <SortIcon col="name" /></th>
                    <th style={thS('unit')}                 onClick={() => handleSort('unit')}>Unit <SortIcon col="unit" /></th>
                    <th style={{ textAlign: 'right', ...thS('unit_cost') }} onClick={() => handleSort('unit_cost')}>Unit Cost <SortIcon col="unit_cost" /></th>
                    <th style={{ textAlign: 'right', ...thS('low_stock_threshold') }} onClick={() => handleSort('low_stock_threshold')}>Low Stock Alert <SortIcon col="low_stock_threshold" /></th>
                    <th style={{ width: 90 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedItems.map(item => (
                    <tr key={item.id}>
                      <td style={{ fontWeight: 600 }}>{item.name}</td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{item.unit}</td>
                      <td style={{ textAlign: 'right' }}>{fmt(item.unit_cost)}</td>
                      <td style={{ textAlign: 'right', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        ≤ {item.low_stock_threshold} {item.unit}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button onClick={() => openEditItem(item)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => deleteItem(item.id)}
                            disabled={deletingItem === item.id}
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
          Modal: Add / Edit Item
         ══════════════════════════════════════════════════════════════════════ */}
      {showItemModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
          zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div style={{
            background: 'var(--black)', borderRadius: 16, padding: 28, width: '100%', maxWidth: 420,
            border: '1px solid var(--border-subtle)', boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <span style={{ fontWeight: 800, fontSize: '1.05rem' }}>{editingItemId ? 'Edit Item' : 'Add Inventory Item'}</span>
              <button onClick={() => setShowItemModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
            </div>

            {[
              { label: 'Item Name *', field: 'name', type: 'text', placeholder: 'e.g. Smoked Chicken, Charcoal, Packaging Bags…' },
              { label: 'Unit Cost (₦)', field: 'unit_cost', type: 'number', placeholder: '0.00' },
              { label: 'Low Stock Alert Threshold', field: 'low_stock_threshold', type: 'number', placeholder: '5' },
            ].map(({ label, field, type, placeholder }) => (
              <div key={field} style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>{label}</label>
                <input
                  type={type}
                  value={itemForm[field]}
                  placeholder={placeholder}
                  onChange={e => setItemForm(f => ({ ...f, [field]: e.target.value }))}
                  style={{
                    width: '100%', padding: '11px 14px', borderRadius: 8,
                    border: '1px solid var(--border-subtle)', background: 'var(--black)',
                    color: 'var(--text)', fontSize: '0.9rem', fontFamily: "'DM Sans',sans-serif", outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            ))}

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>Unit of Measure</label>
              <select
                value={itemForm.unit}
                onChange={e => setItemForm(f => ({ ...f, unit: e.target.value }))}
                style={{
                  width: '100%', padding: '11px 36px 11px 14px', borderRadius: 8,
                  border: '1px solid var(--border-subtle)', background: 'var(--black)',
                  color: 'var(--text)', fontSize: '0.9rem', fontFamily: "'DM Sans',sans-serif", outline: 'none',
                  WebkitAppearance: 'none', appearance: 'none', cursor: 'pointer',
                  backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%235C5247' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E\")",
                  backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center',
                }}
              >
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
