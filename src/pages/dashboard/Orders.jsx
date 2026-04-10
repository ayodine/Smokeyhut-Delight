import React, { useState, useEffect } from 'react';
import { Search, Loader2, FileText, Plus, Trash2, X } from 'lucide-react';
import { SkelTable, SkelLine } from '../../components/Skeleton';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useOutletContext } from 'react-router-dom';
import { fetchDeliveryZones } from '../../lib/deliveryMatcher';

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

  const logoUrl = window.location.origin + '/logo.svg';

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Receipt ${order.id} — Smokeyhut Delight</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Courier New', Courier, monospace;
      width: 80mm;
      max-width: 80mm;
      margin: 0 auto;
      padding: 4mm 4mm 8mm;
      font-size: 11px;
      color: #000;
      background: #fff;
    }
    .center { text-align: center; }
    .logo { width: 36mm; height: auto; display: block; margin: 0 auto 3mm; }
    .brand { font-size: 14px; font-weight: 900; letter-spacing: 0.5px; }
    .brand span { color: #C0201F; }
    .sub { font-size: 9px; color: #555; margin-top: 1mm; }
    .divider { border: none; border-top: 1px dashed #aaa; margin: 3mm 0; }
    .divider-solid { border: none; border-top: 1px solid #000; margin: 3mm 0; }
    .label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; color: #555; }
    .value { font-size: 11px; font-weight: 700; }
    .row { display: flex; justify-content: space-between; margin-bottom: 1.5mm; font-size: 11px; }
    .row.bold { font-weight: 700; }
    .row.total { font-size: 13px; font-weight: 900; border-top: 1px solid #000; padding-top: 2mm; margin-top: 1mm; }
    .item-name { flex: 1; padding-right: 2mm; }
    .item-qty { width: 8mm; text-align: center; }
    .item-price { width: 20mm; text-align: right; }
    .badge { display: inline-block; border: 1px solid #000; padding: 1px 6px; font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; border-radius: 3px; }
    .footer { font-size: 9px; color: #555; text-align: center; line-height: 1.8; margin-top: 4mm; }
    @media print {
      body { margin: 0; padding: 4mm; }
      @page { size: 80mm auto; margin: 0; }
    }
  </style>
</head>
<body>
  <div class="center">
    <img src="${logoUrl}" class="logo" alt="Smokeyhut Delight" onerror="this.style.display='none'" />
    <div class="brand">Smokeyhut <span>Delight</span></div>
    <div class="sub">13 McNeil St, Yaba, Lagos</div>
    <div class="sub">smokeyhutdelight.com</div>
  </div>

  <hr class="divider" />

  <div class="center" style="margin-bottom:2mm">
    <div class="label">Receipt</div>
    <div class="value">${order.id}</div>
    <div class="sub">${dateStr}</div>
  </div>

  <hr class="divider" />

  <div style="margin-bottom:2mm">
    <div class="label">Customer</div>
    <div class="value">${order.customer_name}</div>
    <div class="sub">${order.customer_phone}</div>
    ${order.customer_email ? `<div class="sub">${order.customer_email}</div>` : ''}
  </div>

  <div style="margin-bottom:2mm">
    <div class="label">Delivery Address</div>
    <div style="font-size:10px">${order.delivery_address || '—'}</div>
  </div>

  <div style="margin-bottom:2mm">
    <div class="label">Payment</div>
    <div style="font-size:10px">${(order.payment_method || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</div>
  </div>

  ${channel ? `<div style="margin-bottom:2mm"><div class="label">Channel</div><div style="font-size:10px">${channel}</div></div>` : ''}

  <hr class="divider-solid" />

  <div class="row bold" style="font-size:9px; text-transform:uppercase; letter-spacing:0.5px; color:#555; margin-bottom:2mm;">
    <span class="item-name">Item</span>
    <span class="item-qty">Qty</span>
    <span class="item-price">Amount</span>
  </div>

  ${items.map(item => `
  <div class="row">
    <span class="item-name">${item.name}</span>
    <span class="item-qty">${item.qty}</span>
    <span class="item-price">₦${(item.price * item.qty).toLocaleString()}</span>
  </div>`).join('')}

  <hr class="divider" />

  <div class="row"><span>Subtotal</span><span>₦${subtotal.toLocaleString()}</span></div>
  <div class="row"><span>Delivery</span><span>${deliveryFee > 0 ? '₦' + deliveryFee.toLocaleString() : 'Free'}</span></div>
  ${notes ? `<div style="font-size:9px;color:#555;margin:2mm 0">Notes: ${notes}</div>` : ''}
  <div class="row total"><span>TOTAL</span><span>₦${Number(order.total).toLocaleString()}</span></div>

  <div class="footer">
    <hr class="divider" />
    <p><strong>Thank you for choosing Smokeyhut Delight!</strong></p>
    <p>Smokeyhut04@gmail.com</p>
    <p>This is a computer-generated receipt.</p>
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
  zoneId: '', deliveryFee: 0,
};

export default function Orders() {
  const { userRole } = useAuth();
  const { selectedStore } = useOutletContext() || {};
  const { showToast } = useToast();
  const isAdmin = userRole === 'Admin';
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [storeList, setStoreList] = useState([]);
  const [zones, setZones] = useState([]);
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
    const [ordersRes, productsRes, storesRes, zonesRes] = await Promise.all([
      ordersQuery,
      supabase.from('products').select('id, name, price').order('name'),
      supabase.from('stores').select('id, name').eq('is_active', true).order('id'),
      fetchDeliveryZones(supabase),
    ]);
    if (ordersRes.data) setOrders(ordersRes.data);
    if (productsRes.data) setProducts(productsRes.data);
    if (storesRes.data) {
      setStoreList(storesRes.data);
      if (storesRes.data.length > 0) setNewOrder(f => ({ ...f, store: String(storesRes.data[0].id) }));
    }
    setZones(zonesRes);
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

  const pickZone = (zoneId) => {
    const zone = zones.find(z => String(z.id) === String(zoneId));
    setNewOrder(f => ({ ...f, zoneId, deliveryFee: zone ? zone.price : 0 }));
  };

  const pickProduct = (i, productId) => {
    const p = products.find(pr => String(pr.id) === String(productId));
    setNewOrder(f => {
      const items = [...f.items];
      items[i] = { ...items[i], product: productId, name: p ? p.name : '', price: p ? String(p.price) : '' };
      return { ...f, items };
    });
  };

  const itemsSubtotal = newOrder.items.reduce((s, i) => s + (Number(i.qty) * Number(i.price) || 0), 0);
  const newOrderTotal = itemsSubtotal + Number(newOrder.deliveryFee || 0);

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
        delivery_fee: Number(newOrder.deliveryFee || 0),
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

  if (loading) return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <SkelLine style={{ width: 220, height: 36, borderRadius: 10 }} />
        <SkelLine style={{ width: 120, height: 36, borderRadius: 10 }} />
        <SkelLine style={{ width: 120, height: 36, borderRadius: 10 }} />
      </div>
      <SkelTable rows={8} cols={5} />
    </div>
  );

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
            {zones.length > 0 && (
              <div className="form-row">
                <div className="form-group">
                  <label>Delivery Zone</label>
                  <select
                    value={newOrder.zoneId}
                    onChange={e => pickZone(e.target.value)}
                  >
                    <option value="">— No delivery fee (pickup / free) —</option>
                    {zones.map(z => (
                      <option key={z.id} value={z.id}>
                        {z.name} — {fmt(z.price)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Delivery Fee</label>
                  <input
                    type="number"
                    min="0"
                    value={newOrder.deliveryFee}
                    onChange={e => setNewOrder(f => ({ ...f, deliveryFee: e.target.value, zoneId: '' }))}
                    placeholder="₦ 0"
                  />
                </div>
              </div>
            )}

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
              <div style={{ textAlign: 'right', marginTop: 6 }}>
                {Number(newOrder.deliveryFee) > 0 && (
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 2 }}>
                    Items: {fmt(itemsSubtotal)} + Delivery: {fmt(newOrder.deliveryFee)}
                  </div>
                )}
                <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--red)' }}>
                  Total: {fmt(newOrderTotal)}
                </div>
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
