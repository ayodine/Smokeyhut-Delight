import React, { useState, useEffect } from 'react';
import { Search, Loader2, FileText, Plus, Trash2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useOutletContext } from 'react-router-dom';

const fmt = (n) => '₦' + Number(n).toLocaleString();
const statuses = ['all', 'pending', 'processing', 'shipped', 'delivered', 'cancelled'];
const CHANNELS = ['WhatsApp', 'Instagram', 'Facebook', 'Offline', 'Walk-in', 'Phone', 'Website'];
const PAYMENT_METHODS = ['cash', 'bank_transfer', 'paystack', 'pos', 'other'];

const getChannel = (notes) => {
  if (!notes) return null;
  const match = notes.match(/^\[via (.+?)\]/);
  return match ? match[1] : null;
};

function generateInvoice(order) {
  const items = order.order_items || [];
  const deliveryFee = order.delivery_fee || 0;
  const subtotal = (order.total || 0) - deliveryFee;
  const dateStr = new Date(order.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' });
  const channel = getChannel(order.notes);
  const notes = order.notes ? order.notes.replace(/^\[via .+?\]\n?/, '') : '';

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Invoice ${order.id} — Smokeyhut Delight</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; color: #1A1610; max-width: 720px; margin: 0 auto; font-size: 14px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 36px; padding-bottom: 24px; border-bottom: 2px solid #eee; }
    .brand-name { font-size: 1.6rem; font-weight: 900; letter-spacing: -0.5px; }
    .brand-name span { color: #C0201F; }
    .brand-addr { font-size: 0.78rem; color: #5C5247; margin-top: 4px; }
    .inv-meta h2 { font-size: 2rem; font-weight: 900; color: #C0201F; line-height: 1; }
    .inv-meta p { font-size: 0.82rem; color: #5C5247; margin-top: 4px; }
    .inv-meta .ref { font-weight: 700; color: #1A1610; }
    .badge { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 0.72rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; background: #fee2e2; color: #991b1b; }
    .badge.delivered { background: #dcfce7; color: #166534; }
    .badge.processing { background: #fef9c3; color: #854d0e; }
    .badge.shipped { background: #dbeafe; color: #1e40af; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 28px; }
    .info-block h4 { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 1px; color: #5C5247; margin-bottom: 6px; }
    .info-block p { font-size: 0.88rem; line-height: 1.6; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 0; }
    thead th { background: #C0201F; color: #fff; padding: 10px 14px; text-align: left; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.5px; }
    tbody td { padding: 11px 14px; border-bottom: 1px solid #f0ece5; font-size: 0.88rem; }
    tbody tr:last-child td { border-bottom: none; }
    .totals-table { width: 100%; border-collapse: collapse; margin-top: 0; }
    .totals-table td { padding: 7px 14px; font-size: 0.88rem; }
    .totals-table .total-row td { font-size: 1.05rem; font-weight: 900; color: #C0201F; padding-top: 12px; border-top: 2px solid #C0201F; }
    .table-wrap { border: 1px solid #eee; border-radius: 8px; overflow: hidden; margin-bottom: 16px; }
    .footer { margin-top: 36px; text-align: center; color: #5C5247; font-size: 0.78rem; border-top: 1px solid #eee; padding-top: 20px; line-height: 1.8; }
    @media print { body { padding: 20px; } @page { margin: 16mm; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand-name">Smokeyhut <span>Delight</span></div>
      <div class="brand-addr">13 McNeil St, Yaba, Lagos · smokeyhutdelight.com</div>
    </div>
    <div class="inv-meta" style="text-align:right">
      <h2>INVOICE</h2>
      <p class="ref">${order.id}</p>
      <p>${dateStr}</p>
      <p style="margin-top:6px"><span class="badge ${order.status}">${order.status}</span></p>
    </div>
  </div>

  <div class="info-grid">
    <div class="info-block">
      <h4>Bill To</h4>
      <p><strong>${order.customer_name}</strong></p>
      <p>${order.customer_phone}</p>
      ${order.customer_email ? `<p>${order.customer_email}</p>` : ''}
    </div>
    <div class="info-block">
      <h4>Delivery Address</h4>
      <p>${order.delivery_address || '—'}</p>
      <h4 style="margin-top:12px">Payment Method</h4>
      <p>${(order.payment_method || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</p>
      ${channel ? `<h4 style="margin-top:12px">Order Channel</h4><p>${channel}</p>` : ''}
    </div>
  </div>

  <div class="table-wrap">
    <table>
      <thead><tr><th>Item</th><th style="text-align:center">Qty</th><th style="text-align:right">Unit Price</th><th style="text-align:right">Amount</th></tr></thead>
      <tbody>
        ${items.map(item => `
          <tr>
            <td>${item.name}</td>
            <td style="text-align:center">${item.qty}</td>
            <td style="text-align:right">₦${Number(item.price).toLocaleString()}</td>
            <td style="text-align:right">₦${(item.price * item.qty).toLocaleString()}</td>
          </tr>`).join('')}
      </tbody>
    </table>
  </div>

  <div style="display:flex;justify-content:flex-end">
    <table class="totals-table" style="max-width:280px">
      <tr><td style="color:#5C5247">Subtotal</td><td style="text-align:right">₦${subtotal.toLocaleString()}</td></tr>
      <tr><td style="color:#5C5247">Delivery Fee</td><td style="text-align:right">${deliveryFee > 0 ? '₦' + deliveryFee.toLocaleString() : 'Free'}</td></tr>
      ${notes ? `<tr><td colspan="2" style="color:#5C5247;font-size:0.8rem;padding-top:8px">Notes: ${notes}</td></tr>` : ''}
      <tr class="total-row"><td>Total</td><td style="text-align:right">₦${Number(order.total).toLocaleString()}</td></tr>
    </table>
  </div>

  <div class="footer">
    <p><strong>Thank you for choosing Smokeyhut Delight! 🔥</strong></p>
    <p>Smokeyhut04@gmail.com · 13 McNeil St, Yaba, Lagos</p>
    <p>This is a computer-generated invoice and does not require a signature.</p>
  </div>
  <script>window.onload = () => { window.print(); }</script>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank');
  if (w) { w.addEventListener('load', () => URL.revokeObjectURL(url)); }
}

const emptyNewOrder = {
  name: '', phone: '', email: '', address: '', store: '',
  channel: 'WhatsApp', payment: 'cash', notes: '',
  items: [{ product: '', name: '', qty: 1, price: '' }],
};

export default function Orders() {
  const { userRole } = useAuth();
  const { selectedStore } = useOutletContext() || {};
  const { showToast } = useToast();
  const isAdmin = userRole === 'Admin';
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [storeList, setStoreList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [newOrder, setNewOrder] = useState(emptyNewOrder);
  const [savingNew, setSavingNew] = useState(false);

  useEffect(() => { fetchData(); }, [selectedStore]);

  const fetchData = async () => {
    setLoading(true);
    let ordersQuery = supabase.from('orders').select('*, order_items(*)').order('created_at', { ascending: false });
    if (selectedStore && selectedStore !== 'all') {
      ordersQuery = ordersQuery.eq('store_id', selectedStore);
    }
    const [ordersRes, productsRes, storesRes] = await Promise.all([
      ordersQuery,
      supabase.from('products').select('id, name, price').order('name'),
      supabase.from('stores').select('id, name').eq('is_active', true).order('id'),
    ]);
    if (ordersRes.data) setOrders(ordersRes.data);
    if (productsRes.data) setProducts(productsRes.data);
    if (storesRes.data) {
      setStoreList(storesRes.data);
      if (storesRes.data.length > 0) setNewOrder(f => ({ ...f, store: String(storesRes.data[0].id) }));
    }
    setLoading(false);
  };

  const updateStatus = async (id, newStatus) => {
    await supabase.from('orders').update({ status: newStatus }).eq('id', id);
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status: newStatus } : o));
  };

  const deleteOrder = async (id) => {
    if (window.confirm('Delete this order?')) {
      await supabase.from('order_items').delete().eq('order_id', id);
      const { error } = await supabase.from('orders').delete().eq('id', id);
      if (!error) setOrders(prev => prev.filter(o => o.id !== id));
    }
  };

  // ── Manual order helpers ──────────────────────────────────
  const setField = (k) => (e) => setNewOrder(f => ({ ...f, [k]: e.target.value }));

  const addItemRow = () => setNewOrder(f => ({
    ...f, items: [...f.items, { product: '', name: '', qty: 1, price: '' }],
  }));

  const removeItemRow = (i) => setNewOrder(f => ({
    ...f, items: f.items.filter((_, idx) => idx !== i),
  }));

  const updateItemField = (i, field, value) => setNewOrder(f => {
    const items = [...f.items];
    items[i] = { ...items[i], [field]: value };
    return { ...f, items };
  });

  const pickProduct = (i, productId) => {
    const p = products.find(pr => pr.id === productId);
    setNewOrder(f => {
      const items = [...f.items];
      items[i] = { ...items[i], product: productId, name: p ? p.name : '', price: p ? String(p.price) : '' };
      return { ...f, items };
    });
  };

  const newOrderTotal = newOrder.items.reduce((s, i) => s + (Number(i.qty) * Number(i.price) || 0), 0);

  const handleSaveNewOrder = async () => {
    if (!newOrder.name.trim() || !newOrder.phone.trim()) return;
    const validItems = newOrder.items.filter(i => i.name.trim() && Number(i.price) > 0);
    if (validItems.length === 0) return;
    setSavingNew(true);
    try {
      const orderId = 'SHD-' + Date.now().toString(36).toUpperCase();
      const notesStr = `[via ${newOrder.channel}]${newOrder.notes ? '\n' + newOrder.notes : ''}`;
      const { error } = await supabase.from('orders').insert([{
        id: orderId,
        customer_name: newOrder.name.trim(),
        customer_email: newOrder.email || null,
        customer_phone: newOrder.phone.trim(),
        delivery_address: newOrder.address.trim() || 'Manual / Offline',
        payment_method: newOrder.payment,
        store_id: newOrder.store ? Number(newOrder.store) : null,
        total: newOrderTotal,
        delivery_fee: 0,
        status: 'pending',
        notes: notesStr,
      }]);
      if (error) throw error;
      await supabase.from('order_items').insert(
        validItems.map(i => ({
          order_id: orderId,
          product_id: i.product || null,
          name: i.name.trim(),
          price: Number(i.price),
          qty: Number(i.qty),
        }))
      );
      setShowNewOrder(false);
      setNewOrder(emptyNewOrder);
      await fetchData();
    } catch (err) {
      console.error('Manual order error:', err);
      showToast('Save failed', err.message || 'Could not save order', 'error');
    } finally {
      setSavingNew(false);
    }
  };

  // ── Filter ───────────────────────────────────────────────
  const filtered = orders.filter(o => {
    const matchStatus = filter === 'all' || o.status === filter;
    const matchSearch = String(o.customer_name || '').toLowerCase().includes(search.toLowerCase()) ||
                        String(o.id).toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><Loader2 className="spin" size={32} color="var(--red)" /></div>;

  return (
    <div>
      <div className="dash-card-header" style={{ marginBottom: 20 }}>
        <div className="dash-card-title" style={{ fontFamily: "'Mona Sans', 'Mona-Sans', 'Helvetica Neue', sans-serif", fontSize: '1.4rem' }}>Orders Management</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: 12, top: 12 }} />
            <input className="dash-search" placeholder="Search orders..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 40 }} />
          </div>
          <button
            className="btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', fontSize: '0.85rem', whiteSpace: 'nowrap' }}
            onClick={() => setShowNewOrder(true)}
          >
            <Plus size={16} /> New Order
          </button>
        </div>
      </div>

      <div className="dash-filters">
        {statuses.map(s => (
          <button key={s} className={`dash-filter-btn${filter === s ? ' active' : ''}`} onClick={() => setFilter(s)}>
            {s === 'all' ? `All (${orders.length})` : `${s.charAt(0).toUpperCase() + s.slice(1)} (${orders.filter(o => o.status === s).length})`}
          </button>
        ))}
      </div>

      <div className="dash-card">
        <div style={{ overflowX: 'auto' }}>
          <table className="dash-table">
            <thead><tr><th>ID</th><th>Customer</th><th>Items</th><th>Total</th><th>Channel / Payment</th><th>Status</th><th>Date</th></tr></thead>
            <tbody>
              {filtered.map(order => {
                const itemsCount = order.order_items?.length || 0;
                const channel = getChannel(order.notes);
                return (
                  <React.Fragment key={order.id}>
                    <tr style={{ cursor: 'pointer' }} onClick={() => setExpandedId(expandedId === order.id ? null : order.id)}>
                      <td style={{ fontWeight: 700, color: 'var(--red)' }}>{order.id}</td>
                      <td>
                        <div style={{ fontWeight: 700 }}>{order.customer_name}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{order.customer_phone}</div>
                      </td>
                      <td>{itemsCount} item{itemsCount !== 1 ? 's' : ''}</td>
                      <td style={{ fontWeight: 700 }}>{fmt(order.total || 0)}</td>
                      <td style={{ fontSize: '0.82rem' }}>
                        {channel && <div style={{ fontSize: '0.72rem', background: 'rgba(192,32,31,0.08)', color: 'var(--red)', padding: '2px 7px', borderRadius: 20, display: 'inline-block', fontWeight: 800, marginBottom: 2 }}>{channel}</div>}
                        <div style={{ color: 'var(--text-muted)' }}>{(order.payment_method || '').replace(/_/g, ' ')}</div>
                      </td>
                      <td><span className={`status-badge ${order.status}`}>{order.status}</span></td>
                      <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{new Date(order.created_at).toLocaleDateString()}</td>
                    </tr>
                    {expandedId === order.id && (
                      <tr><td colSpan="7" style={{ background: 'var(--black2)', padding: '16px 20px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, fontSize: '0.88rem' }}>
                          <div><strong>Address:</strong> {order.delivery_address}</div>
                          <div><strong>Email:</strong> {order.customer_email || 'N/A'}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <strong>Store:</strong>
                            {storeList.length > 1 ? (
                              <select
                                value={order.store_id || ''}
                                onChange={async (e) => {
                                  const storeId = e.target.value ? Number(e.target.value) : null;
                                  await supabase.from('orders').update({ store_id: storeId }).eq('id', order.id);
                                  setOrders(prev => prev.map(o => o.id === order.id ? { ...o, store_id: storeId } : o));
                                }}
                                style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border-subtle)', fontSize: '0.82rem' }}
                              >
                                <option value="">Unassigned</option>
                                {storeList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                              </select>
                            ) : (
                              <span>{storeList.find(s => s.id === order.store_id)?.name || order.store_id || 'Unassigned'}</span>
                            )}
                          </div>
                          {channel && <div><strong>Channel:</strong> {channel}</div>}
                          {order.notes?.replace(/^\[via .+?\]\n?/, '') && (
                            <div><strong>Notes:</strong> {order.notes.replace(/^\[via .+?\]\n?/, '')}</div>
                          )}
                          <div style={{ gridColumn: '1 / -1' }}>
                            <strong>Items:</strong>
                            <ul style={{ marginTop: 6, paddingLeft: 18 }}>
                              {(order.order_items || []).map((item, i) => (
                                <li key={i}>{item.name} × {item.qty} — {fmt(item.price * item.qty)}</li>
                              ))}
                              {!order.order_items?.length && <li style={{ color: 'var(--text-muted)' }}>No items found.</li>}
                            </ul>
                            {order.delivery_fee > 0 && (
                              <div style={{ marginTop: 6, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                                Delivery fee: {fmt(order.delivery_fee)}
                              </div>
                            )}
                            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(0,0,0,0.05)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                              <strong style={{ fontSize: '0.8rem' }}>Actions:</strong>
                              <select value={order.status} onChange={e => updateStatus(order.id, e.target.value)} style={{ padding: '6px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                                {statuses.filter(s => s !== 'all').map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                              <button
                                onClick={(e) => { e.stopPropagation(); generateInvoice(order); }}
                                style={{ background: 'var(--black2)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}
                              >
                                <FileText size={14} /> Invoice
                              </button>
                              {isAdmin && (
                                <button onClick={() => deleteOrder(order.id)} style={{ background: '#fee2e2', color: '#991b1b', border: 'none', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem' }}>
                                  Delete
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </td></tr>
                    )}
                  </React.Fragment>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No orders found matching your filter.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── New Manual Order Modal ── */}
      {showNewOrder && (
        <div className="product-form-modal" onClick={() => setShowNewOrder(false)}>
          <div className="product-form-card" onClick={e => e.stopPropagation()} style={{ position: 'relative', maxWidth: 580 }}>
            <button onClick={() => setShowNewOrder(false)} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
              <X size={22} />
            </button>
            <h3 style={{ marginTop: 0, marginBottom: 6, fontFamily: "'Mona Sans','Mona-Sans','Helvetica Neue',sans-serif" }}>New Manual Order</h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 20 }}>Record an order that came through a non-website channel.</p>

            {/* Channel, Payment & Store */}
            <div className="form-row">
              <div className="form-group">
                <label>Order Channel</label>
                <select value={newOrder.channel} onChange={setField('channel')}>
                  {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Payment Method</label>
                <select value={newOrder.payment} onChange={setField('payment')}>
                  {PAYMENT_METHODS.map(p => <option key={p} value={p}>{p.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
            </div>
            {storeList.length > 0 && (
              <div className="form-group">
                <label>Store (fulfilling this order)</label>
                <select value={newOrder.store} onChange={setField('store')}>
                  {storeList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}

            {/* Customer Info */}
            <div className="form-row">
              <div className="form-group"><label>Customer Name *</label><input value={newOrder.name} onChange={setField('name')} placeholder="Full name" /></div>
              <div className="form-group"><label>Phone *</label><input value={newOrder.phone} onChange={setField('phone')} placeholder="+234 000 000 0000" /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Email</label><input type="email" value={newOrder.email} onChange={setField('email')} placeholder="customer@email.com" /></div>
              <div className="form-group"><label>Delivery Address</label><input value={newOrder.address} onChange={setField('address')} placeholder="Street / Pickup / Offline" /></div>
            </div>

            {/* Items */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <label style={{ fontWeight: 700, fontSize: '0.85rem' }}>Order Items</label>
                <button type="button" onClick={addItemRow} style={{ background: 'var(--black2)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '4px 10px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Plus size={12} /> Add Row
                </button>
              </div>
              {newOrder.items.map((item, i) => {
                const isCustom = products.length > 0 && !item.product;
                return (
                  <div key={i} style={{ marginBottom: 8 }}>
                    {/* Row 1: product selector + (custom name if needed) */}
                    <div style={{ display: 'grid', gridTemplateColumns: products.length > 0 ? (isCustom ? '1fr 1fr' : '1fr') : '1fr', gap: 8, marginBottom: 6 }}>
                      {products.length > 0 ? (
                        <select
                          value={item.product}
                          onChange={e => e.target.value ? pickProduct(i, e.target.value) : updateItemField(i, 'product', '')}
                          style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border-subtle)', fontSize: '0.85rem' }}
                        >
                          <option value="">— Custom item —</option>
                          {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      ) : null}
                      {isCustom && (
                        <input value={item.name} onChange={e => updateItemField(i, 'name', e.target.value)} placeholder="Item name" style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border-subtle)', fontSize: '0.85rem' }} />
                      )}
                      {products.length === 0 && (
                        <input value={item.name} onChange={e => updateItemField(i, 'name', e.target.value)} placeholder="Item name" style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border-subtle)', fontSize: '0.85rem' }} />
                      )}
                    </div>
                    {/* Row 2: qty + price + delete */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, alignItems: 'center' }}>
                      <input type="number" min="1" value={item.qty} onChange={e => updateItemField(i, 'qty', e.target.value)} placeholder="Qty" style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border-subtle)', fontSize: '0.85rem' }} />
                      <input type="number" value={item.price} onChange={e => updateItemField(i, 'price', e.target.value)} placeholder="Price ₦" style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border-subtle)', fontSize: '0.85rem' }} />
                      {newOrder.items.length > 1 ? (
                        <button type="button" onClick={() => removeItemRow(i)} style={{ background: '#fee2e2', border: 'none', borderRadius: 6, padding: '8px', cursor: 'pointer', color: '#991b1b', display: 'flex', alignItems: 'center' }}>
                          <Trash2 size={14} />
                        </button>
                      ) : <div />}
                    </div>
                  </div>
                );
              })}
              <div style={{ textAlign: 'right', fontWeight: 800, fontSize: '0.95rem', color: 'var(--red)', marginTop: 6 }}>
                Total: {fmt(newOrderTotal)}
              </div>
            </div>

            <div className="form-group">
              <label>Notes (optional)</label>
              <textarea value={newOrder.notes} onChange={setField('notes')} placeholder="Any extra details..." style={{ minHeight: 60 }} />
            </div>

            <button
              className="btn-primary"
              onClick={handleSaveNewOrder}
              disabled={savingNew || !newOrder.name.trim() || !newOrder.phone.trim() || newOrderTotal === 0}
              style={{ width: '100%', justifyContent: 'center', padding: '13px' }}
            >
              {savingNew ? <Loader2 size={16} className="spin" /> : <><Plus size={16} /> Save Order ({fmt(newOrderTotal)})</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
