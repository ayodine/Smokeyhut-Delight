import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Search, Loader2, FileText, Plus, Trash2, X, ChevronUp, ChevronDown, Clock, Truck, CheckCircle, XCircle, RefreshCw, RotateCcw, AlertTriangle, Layers } from 'lucide-react';
import { SkelTable, SkelLine, SkelKpiGrid } from '../../components/Skeleton';
import Pagination from '../../components/Pagination';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useOutletContext } from 'react-router-dom';
import { fetchFlatAreas } from '../../lib/deliveryMatcher';

const fmt = (n) => '₦' + Number(n).toLocaleString();
const statuses = ['all', 'pending', 'processing', 'shipped', 'delivered', 'cancelled'];

const PERIODS = [
  { label: 'Today',      value: 'today' },
  { label: 'This Week',  value: 'week' },
  { label: 'This Month', value: 'month' },
  { label: 'This Year',  value: 'year' },
  { label: 'All Time',   value: 'all' },
];

function getStartDate(period) {
  const now = new Date();
  switch (period) {
    case 'today': { const d = new Date(now); d.setHours(0,0,0,0); return d; }
    case 'week':  { const d = new Date(now); d.setDate(now.getDate() - ((now.getDay() + 6) % 7)); d.setHours(0,0,0,0); return d; }
    case 'month': { return new Date(now.getFullYear(), now.getMonth(), 1); }
    case 'year':  { return new Date(now.getFullYear(), 0, 1); }
    default: return null;
  }
}
const CHANNELS = ['WhatsApp', 'Instagram', 'Facebook', 'Offline', 'Walk-in', 'Phone', 'Website'];
const PAYMENT_METHODS = ['cash', 'bank_transfer', 'pos', 'other'];

const getChannel = (notes) => {
  if (!notes) return null;
  const match = notes.match(/^\[via (.+?)\]/);
  return match ? match[1] : null;
};

function generateInvoice(order) {
  const items = order.order_items || [];
  const deliveryFee = order.delivery_fee || 0;
  const couponDiscount = order.coupon_discount || 0;
  const subtotal = items.reduce((s, i) => s + (i.price * i.qty), 0) || ((order.total || 0) + couponDiscount - deliveryFee);
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
    html, body { width: 100%; background: #fff; }
    body { display: flex; justify-content: center; align-items: flex-start; }
    .receipt {
      font-family: 'Courier New', Courier, monospace;
      width: 148mm;
      max-width: 148mm;
      padding: 10mm 12mm 14mm;
      font-size: 12px;
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
      html, body { width: 100%; margin: 0; padding: 0; display: flex; justify-content: center; }
      .receipt { padding: 10mm 12mm 14mm; }
      @page { size: A5 portrait; margin: 0; }
    }
  </style>
</head>
<body>
<div class="receipt">
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
  ${couponDiscount > 0 ? `<div class="row" style="color:#16a34a"><span>Discount (${order.coupon_code})</span><span>−₦${couponDiscount.toLocaleString()}</span></div>` : ''}
  ${notes ? `<div style="font-size:9px;color:#555;margin:2mm 0">Notes: ${notes}</div>` : ''}
  <div class="row total"><span>TOTAL</span><span>₦${Number(order.total).toLocaleString()}</span></div>

  <div class="footer">
    <hr class="divider" />
    <p><strong>Thank you for choosing Smokeyhut Delight!</strong></p>
    <p>Smokeyhut04@gmail.com</p>
    <p>This is a computer-generated receipt.</p>
  </div>

  <script>window.onload = () => { window.print(); }</script>
</div>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank');
  if (w) { w.addEventListener('load', () => URL.revokeObjectURL(url)); }
}

function todayDate() {
  return new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
}
function currentTime() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

const emptyNewOrder = {
  name: '', phone: '', email: '', address: '', store: '',
  channel: 'WhatsApp', payment: 'cash', notes: '',
  items: [{ product: '', name: '', qty: 1, price: '' }],
  zoneId: '', deliveryFee: 0,
  orderDate: todayDate(), orderTime: currentTime(),
};

export default function Orders() {
  const { userRole, userPermissions } = useAuth();
  const { selectedStore } = useOutletContext() || {};
  const { showToast } = useToast();
  const isAdmin = userRole === 'Admin';
  const canCreateOrder = isAdmin || userRole === 'Manager' || (userPermissions || []).includes('Orders:create');
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [storeList, setStoreList] = useState([]);
  const [areas, setAreas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [period, setPeriod] = useState('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [sortKey, setSortKey] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);
  const PER_PAGE = 15;
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [newOrder, setNewOrder] = useState(emptyNewOrder);
  const [savingNew, setSavingNew] = useState(false);

  const [showBulkOrder, setShowBulkOrder] = useState(false);
  const [bulkOrders, setBulkOrders] = useState([{ ...emptyNewOrder }]);
  const [savingBulk, setSavingBulk] = useState(false);
  const [trashView, setTrashView] = useState(false);
  const [deletedOrders, setDeletedOrders] = useState([]);
  const [dateFilter, setDateFilter] = useState(''); // YYYY-MM-DD
  const [sourceFilter, setSourceFilter] = useState('all'); // 'all' | 'storefront' | 'whatsapp'
  const [newOrderAlert, setNewOrderAlert] = useState(null); // { id, name, total }
  const [realtimeStatus, setRealtimeStatus] = useState('connecting'); // 'connecting' | 'ok' | 'error'
  const audioCtxRef = useRef(null);
  const mountedRef = useRef(true);

  // Create (or reuse) a single AudioContext and keep it alive
  const getAudioCtx = useCallback(() => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtxRef.current;
  }, []);

  // Play a two-tone chime using Web Audio API (no external file needed)
  const playChime = useCallback(async () => {
    try {
      const ctx = getAudioCtx();
      // Browsers suspend AudioContext until first user gesture — resume it
      if (ctx.state === 'suspended') await ctx.resume();
      const compressor = ctx.createDynamicsCompressor();
      compressor.connect(ctx.destination);
      // 5-second chime: ascending then descending melody [freq, startSec, durationSec]
      [
        [880,  0.0,  0.8],
        [1100, 0.9,  0.8],
        [1320, 1.8,  0.8],
        [1100, 2.7,  0.8],
        [880,  3.6,  1.4],
      ].forEach(([freq, start, dur]) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(compressor);
        osc.type = 'triangle';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, ctx.currentTime + start);
        gain.gain.linearRampToValueAtTime(1.0, ctx.currentTime + start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + dur + 0.05);
      });
    } catch { /* ignore — browser may block audio without prior interaction */ }
  }, [getAudioCtx]);

  // Realtime subscription — prepend new order and play sound
  useEffect(() => {
    mountedRef.current = true;
    setRealtimeStatus('connecting');
    const storeFilter = selectedStore && selectedStore !== 'all' ? selectedStore : null;

    const channel = supabase
      .channel(`orders-realtime-${Date.now()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, async (payload) => {
        const order = payload.new;
        if (!mountedRef.current) return;
        if (storeFilter && String(order.store_id) !== String(storeFilter)) return;

        // Fetch order_items for the new order
        const { data: items } = await supabase.from('order_items').select('*').eq('order_id', order.id);
        const fullOrder = { ...order, order_items: items || [] };

        setOrders(prev => [fullOrder, ...prev]);
        playChime();
        setNewOrderAlert({ id: order.id, name: order.customer_name, total: order.total });

        // Request browser notification permission and show notification
        if (Notification.permission === 'granted') {
          new Notification('New Order — Smokeyhut Delight', {
            body: `${order.customer_name} • ₦${Number(order.total).toLocaleString()}`,
            icon: '/logo.svg',
          });
        } else if (Notification.permission !== 'denied') {
          Notification.requestPermission().then(perm => {
            if (perm === 'granted') {
              new Notification('New Order — Smokeyhut Delight', {
                body: `${order.customer_name} • ₦${Number(order.total).toLocaleString()}`,
                icon: '/logo.svg',
              });
            }
          });
        }
      })
      .subscribe((status, err) => {
        if (!mountedRef.current) return;
        if (status === 'SUBSCRIBED') setRealtimeStatus('ok');
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('[Realtime] subscription failed:', status, err);
          setRealtimeStatus('error');
        }
      });

    return () => {
      mountedRef.current = false;
      supabase.removeChannel(channel);
    };
  }, [selectedStore, playChime]);

  useEffect(() => { fetchData(); }, [selectedStore]);
  useEffect(() => { setPage(1); }, [filter, period, debouncedSearch, dateFilter]);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const fetchData = async () => {
    setLoading(true);
    const storeFilter = selectedStore && selectedStore !== 'all' ? selectedStore : null;

    const buildBase = () => {
      let q = supabase.from('orders').select('*, order_items(*)');
      if (storeFilter) q = q.eq('store_id', storeFilter);
      return q;
    };

    // Deleted orders only need summary columns — skip order_items join to save egress
    const buildDeletedBase = () => {
      let q = supabase.from('orders').select('id, customer_name, customer_email, customer_phone, delivery_address, total, status, created_at, deleted_at, store_id, notes');
      if (storeFilter) q = q.eq('store_id', storeFilter);
      return q;
    };

    const [ordersRes, deletedRes, productsRes, storesRes, zonesRes] = await Promise.all([
      buildBase().is('deleted_at', null).order('created_at', { ascending: false }),
      buildDeletedBase().not('deleted_at', 'is', null).order('deleted_at', { ascending: false }),
      supabase.from('products').select('id, name, price').order('name'),
      supabase.from('stores').select('id, name').eq('is_active', true).order('id'),
      fetchFlatAreas(supabase),
    ]);
    if (ordersRes.data) setOrders(ordersRes.data);
    if (deletedRes.data) setDeletedOrders(deletedRes.data);
    if (productsRes.data) setProducts(productsRes.data);
    if (storesRes.data) {
      setStoreList(storesRes.data);
      if (storesRes.data.length > 0) setNewOrder(f => ({ ...f, store: String(storesRes.data[0].id) }));
    }
    setAreas(zonesRes);
    setLoading(false);
  };

  const updateStatus = async (id, newStatus) => {
    // Guard: only decrement stock once, when transitioning TO 'shipped'
    if (newStatus === 'shipped') {
      // Fetch current DB status to prevent double-decrement after page refresh
      const { data: current } = await supabase.from('orders').select('status').eq('id', id).single();
      if (current?.status !== 'shipped') {
        // Always fetch order_items fresh from DB — do NOT read from React state,
        // because the realtime handler can overwrite state with empty items before
        // order_items are inserted (race condition on manual orders).
        const { data: orderItems } = await supabase.from('order_items').select('product_id, qty').eq('order_id', id);
        const validItems = (orderItems || []).filter(i => i.product_id);
        if (validItems.length > 0) {
          const productIds = [...new Set(validItems.map(i => String(i.product_id)))];
          const { data: productStock } = await supabase.from('products').select('id, stock').in('id', productIds);
          if (productStock?.length) {
            const stockMap = Object.fromEntries(productStock.map(p => [String(p.id), p.stock ?? 0]));
            const qtyMap = {};
            validItems.forEach(i => {
              qtyMap[String(i.product_id)] = (qtyMap[String(i.product_id)] || 0) + (i.qty || 0);
            });
            await Promise.all(
              Object.entries(qtyMap).map(([pid, qty]) =>
                supabase.from('products').update({ stock: Math.max(0, (stockMap[pid] ?? 0) - qty) }).eq('id', pid)
              )
            );
          }
        }
      }
    }

    await supabase.from('orders').update({ status: newStatus }).eq('id', id);
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status: newStatus } : o));
  };

  const deleteOrder = async (id) => {
    if (!window.confirm('Move this order to trash? You can recover it later.')) return;
    const now = new Date().toISOString();
    const { error } = await supabase.from('orders').update({ deleted_at: now }).eq('id', id);
    if (!error) {
      const moved = orders.find(o => o.id === id);
      setOrders(prev => prev.filter(o => o.id !== id));
      if (moved) setDeletedOrders(prev => [{ ...moved, deleted_at: now }, ...prev]);
      showToast('Order moved to trash', 'You can recover it from Trash.', 'info');
    }
  };

  const restoreOrder = async (id) => {
    const { error } = await supabase.from('orders').update({ deleted_at: null }).eq('id', id);
    if (!error) {
      const moved = deletedOrders.find(o => o.id === id);
      setDeletedOrders(prev => prev.filter(o => o.id !== id));
      if (moved) setOrders(prev => [{ ...moved, deleted_at: null }, ...prev]);
      showToast('Order restored', '', 'success');
    }
  };

  const permanentDelete = async (id) => {
    if (!window.confirm('Permanently delete this order? This cannot be undone.')) return;
    await supabase.from('order_items').delete().eq('order_id', id);
    const { error } = await supabase.from('orders').delete().eq('id', id);
    if (!error) {
      setDeletedOrders(prev => prev.filter(o => o.id !== id));
      showToast('Order permanently deleted', '', 'info');
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

  const pickZone = (areaId) => {
    const area = areas.find(a => String(a.id) === String(areaId));
    setNewOrder(f => ({ ...f, zoneId: areaId, deliveryFee: area ? area.price : 0 }));
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
      const notesStr = `[via ${newOrder.channel}]${newOrder.notes ? '\n' + newOrder.notes : ''}`;
      const orderTimestamp = newOrder.orderDate
        ? new Date(`${newOrder.orderDate}T${newOrder.orderTime || '00:00'}:00`).toISOString()
        : new Date().toISOString();

      const { data: inserted, error } = await supabase.from('orders').insert([{
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
        created_at: orderTimestamp,
      }]).select('id').single();
      if (error) throw error;
      await supabase.from('order_items').insert(
        validItems.map(i => ({
          order_id: inserted.id,
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

  const updateBulkOrder = (index, field, value) => setBulkOrders(prev => { const c = [...prev]; c[index] = { ...c[index], [field]: value }; return c; });
  const updateBulkItemField = (oIdx, iIdx, field, value) => setBulkOrders(prev => {
    const c = [...prev]; const it = [...c[oIdx].items]; it[iIdx] = { ...it[iIdx], [field]: value };
    c[oIdx] = { ...c[oIdx], items: it }; return c;
  });
  const addBulkItemRow = (oIdx) => setBulkOrders(prev => { const c = [...prev]; c[oIdx].items = [...c[oIdx].items, { product: '', name: '', qty: 1, price: '' }]; return c; });
  const removeBulkItemRow = (oIdx, iIdx) => setBulkOrders(prev => { const c = [...prev]; c[oIdx].items = c[oIdx].items.filter((_, i) => i !== iIdx); return c; });
  const pickBulkProduct = (oIdx, iIdx, productId) => {
    const p = products.find(pr => String(pr.id) === String(productId));
    setBulkOrders(prev => {
      const c = [...prev]; const it = [...c[oIdx].items];
      it[iIdx] = { ...it[iIdx], product: productId, name: p ? p.name : '', price: p ? String(p.price) : '' };
      c[oIdx] = { ...c[oIdx], items: it }; return c;
    });
  };
  const pickBulkZone = (oIdx, areaId) => {
    const area = areas.find(a => String(a.id) === String(areaId));
    setBulkOrders(prev => { const c = [...prev]; c[oIdx] = { ...c[oIdx], zoneId: areaId, deliveryFee: area ? area.price : 0 }; return c; });
  };
  const addBulkOrder = () => setBulkOrders(prev => [...prev, { ...emptyNewOrder, orderDate: todayDate(), orderTime: currentTime() }]);
  const removeBulkOrder = (index) => setBulkOrders(prev => prev.filter((_, i) => i !== index));

  const handleSaveBulkOrders = async () => {
    const validOrders = bulkOrders.filter(o => o.name.trim() && o.phone.trim() && o.items.some(i => i.name.trim() && Number(i.price) > 0));
    if (validOrders.length === 0) return;
    
    setSavingBulk(true);
    try {
      for (const orderData of validOrders) {
        const notesStr = `[via ${orderData.channel}]${orderData.notes ? '\n' + orderData.notes : ''}`;
        const orderTimestamp = orderData.orderDate
          ? new Date(`${orderData.orderDate}T${orderData.orderTime || '00:00'}:00`).toISOString()
          : new Date().toISOString();

        const validItems = orderData.items.filter(i => i.name.trim() && Number(i.price) > 0);
        const itemsSubtotal = validItems.reduce((s, i) => s + (Number(i.qty) * Number(i.price) || 0), 0);
        const total = itemsSubtotal + Number(orderData.deliveryFee || 0);

        const { data: inserted, error: orderError } = await supabase.from('orders').insert({
          customer_name: orderData.name.trim(),
          customer_email: orderData.email || null,
          customer_phone: orderData.phone.trim(),
          delivery_address: orderData.address.trim() || 'Manual / Offline',
          payment_method: orderData.payment,
          store_id: orderData.store ? Number(orderData.store) : null,
          total,
          delivery_fee: Number(orderData.deliveryFee || 0),
          status: 'pending',
          notes: notesStr,
          created_at: orderTimestamp,
        }).select('id').single();
        if (orderError) throw orderError;

        if (validItems.length > 0) {
          const { error: itemsError } = await supabase.from('order_items').insert(
            validItems.map(i => ({
              order_id: inserted.id,
              product_id: i.product || null,
              name: i.name.trim(),
              price: Number(i.price),
              qty: Number(i.qty),
            }))
          );
          if (itemsError) throw itemsError;
        }
      }
      
      setShowBulkOrder(false);
      setBulkOrders([{ ...emptyNewOrder, orderDate: todayDate(), orderTime: currentTime() }]);
      await fetchData();
      showToast('Success', `${orderInsertData.length} manual order(s) added successfully`, 'success');
    } catch (err) {
      console.error('Bulk order error:', err);
      showToast('Save failed', err.message || 'Could not save bulk orders', 'error');
    } finally {
      setSavingBulk(false);
    }
  };

  // ── Filter + Sort ────────────────────────────────────────
  const startDate = useMemo(() => getStartDate(period), [period]);

  // Period + search only (used for status tab counts)
  const periodSearchFiltered = useMemo(() => {
    const q = debouncedSearch.toLowerCase();
    return orders.filter(o => {
      const matchSearch = !q ||
        String(o.customer_name || '').toLowerCase().includes(q) ||
        String(o.id).toLowerCase().includes(q) ||
        String(o.customer_phone || '').toLowerCase().includes(q);
      const matchPeriod = !startDate || new Date(o.created_at) >= startDate;
      const matchDate = !dateFilter || new Date(o.created_at).toLocaleDateString('en-CA') === dateFilter;
      return matchSearch && matchPeriod && matchDate;
    });
  }, [orders, debouncedSearch, startDate, dateFilter]);

  // Period + search + status + source (final set before sort)
  const baseFiltered = useMemo(() =>
    periodSearchFiltered.filter(o => {
      if (filter !== 'all' && o.status !== filter) return false;
      if (sourceFilter !== 'all' && (o.channel || 'storefront') !== sourceFilter) return false;
      return true;
    }),
    [periodSearchFiltered, filter, sourceFilter]
  );

  const filtered = useMemo(() => [...baseFiltered].sort((a, b) => {
    let av, bv;
    if (sortKey === 'total') { av = Number(a.total || 0); bv = Number(b.total || 0); }
    else if (sortKey === 'created_at') { av = a.created_at; bv = b.created_at; }
    else if (sortKey === 'items') { av = a.order_items?.length || 0; bv = b.order_items?.length || 0; }
    else { av = String(a[sortKey] || '').toLowerCase(); bv = String(b[sortKey] || '').toLowerCase(); }
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ? 1 : -1;
    return 0;
  }), [baseFiltered, sortKey, sortDir]);

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };
  const SortIcon = ({ col }) => {
    if (sortKey !== col) return <ChevronUp size={11} style={{ opacity: 0.25, verticalAlign: 'middle', marginLeft: 3 }} />;
    return sortDir === 'asc'
      ? <ChevronUp size={11} style={{ verticalAlign: 'middle', marginLeft: 3, color: 'var(--red)' }} />
      : <ChevronDown size={11} style={{ verticalAlign: 'middle', marginLeft: 3, color: 'var(--red)' }} />;
  };
  const thStyle = (col) => ({ cursor: 'pointer', userSelect: 'none', background: sortKey === col ? 'var(--black2)' : undefined });

  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  // KPIs — computed from period+search filtered orders (ignores status tab)
  const kpiPending   = useMemo(() => periodSearchFiltered.filter(o => o.status === 'pending').length, [periodSearchFiltered]);
  const kpiProcessing = useMemo(() => periodSearchFiltered.filter(o => o.status === 'processing').length, [periodSearchFiltered]);
  const kpiShipped   = useMemo(() => periodSearchFiltered.filter(o => o.status === 'shipped').length, [periodSearchFiltered]);
  const kpiDelivered = useMemo(() => periodSearchFiltered.filter(o => o.status === 'delivered').length, [periodSearchFiltered]);
  const kpiCancelled = useMemo(() => periodSearchFiltered.filter(o => o.status === 'cancelled').length, [periodSearchFiltered]);

  if (loading) return (
    <div>
      <SkelKpiGrid count={4} />
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
      {/* New order alert banner */}
      {newOrderAlert && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'linear-gradient(90deg, #1a4a1a, #1e5c1e)',
          border: '1px solid #2d7a2d', borderRadius: 12, padding: '12px 18px',
          marginBottom: 16, gap: 12, animation: 'slideDown 0.3s ease',
        }}>
          <style>{`@keyframes slideDown { from { opacity:0; transform:translateY(-10px) } to { opacity:1; transform:translateY(0) } }`}</style>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '1.3rem' }}>🛎️</span>
            <div>
              <div style={{ color: '#7fff7f', fontWeight: 700, fontSize: '0.9rem' }}>New order received!</div>
              <div style={{ color: '#aaffaa', fontSize: '0.8rem' }}>{newOrderAlert.name} — ₦{Number(newOrderAlert.total).toLocaleString()}</div>
            </div>
          </div>
          <button onClick={() => setNewOrderAlert(null)} style={{ background: 'none', border: 'none', color: '#7fff7f', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1 }}>×</button>
        </div>
      )}
      <div className="dash-card-header" style={{ marginBottom: 20, alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="dash-card-title" style={{ fontFamily: "'Mona Sans', 'Mona-Sans', 'Helvetica Neue', sans-serif", fontSize: '1.4rem' }}>
              {trashView ? 'Trash — Deleted Orders' : 'Orders Management'}
            </div>
            {/* Realtime status dot */}
            <span title={realtimeStatus === 'ok' ? 'Live updates active' : realtimeStatus === 'error' ? 'Live updates failed — refresh' : 'Connecting…'} style={{
              display: 'inline-block', width: 9, height: 9, borderRadius: '50%', flexShrink: 0,
              background: realtimeStatus === 'ok' ? '#22c55e' : realtimeStatus === 'error' ? '#ef4444' : '#f59e0b',
              boxShadow: realtimeStatus === 'ok' ? '0 0 0 3px rgba(34,197,94,0.2)' : 'none',
            }} />
          </div>
          {trashView && (
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 4 }}>
              Orders here are not visible to the storefront. Recover or delete permanently.
            </p>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
          {/* Period filter */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {PERIODS.map(p => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                style={{
                  padding: '6px 14px', borderRadius: 20,
                  border: `1px solid ${period === p.value ? 'var(--red)' : 'var(--border-subtle)'}`,
                  background: period === p.value ? 'var(--red)' : 'var(--white)',
                  color: period === p.value ? '#fff' : 'var(--text)',
                  fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer',
                  fontFamily: "'DM Sans',sans-serif", transition: 'all 0.15s',
                }}
              >{p.label}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative' }}>
              <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: 12, top: 12 }} />
              <input className="dash-search" placeholder="Search orders..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 40 }} />
            </div>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                type="date"
                value={dateFilter}
                onChange={e => { setDateFilter(e.target.value); if (e.target.value) setPeriod('all'); }}
                style={{
                  padding: '9px 12px', borderRadius: 8, fontSize: '0.85rem',
                  border: `1px solid ${dateFilter ? 'var(--red)' : 'var(--border-subtle)'}`,
                  background: 'var(--white)', color: 'var(--text)',
                  fontFamily: "'DM Sans',sans-serif", cursor: 'pointer',
                  outline: 'none',
                }}
              />
              {dateFilter && (
                <button
                  onClick={() => setDateFilter('')}
                  style={{ position: 'absolute', right: 8, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, padding: 0 }}
                  title="Clear date"
                >×</button>
              )}
            </div>
            {/* Test chime button — helps "unlock" AudioContext after first interaction */}
            <button
              onClick={() => playChime()}
              title="Test notification sound"
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px',
                fontSize: '0.85rem', whiteSpace: 'nowrap', borderRadius: 8, cursor: 'pointer',
                border: '1px solid var(--border-subtle)', background: 'var(--white)',
                color: 'var(--text-muted)', fontFamily: "'DM Sans',sans-serif",
              }}
            >🔔</button>
            <button
              onClick={() => setTrashView(v => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px',
                fontSize: '0.85rem', whiteSpace: 'nowrap', borderRadius: 8, cursor: 'pointer',
                border: `1px solid ${trashView ? 'var(--red)' : 'var(--border-subtle)'}`,
                background: trashView ? 'var(--red)' : 'var(--white)',
                color: trashView ? '#fff' : 'var(--text)', fontWeight: 700,
                fontFamily: "'DM Sans',sans-serif", position: 'relative',
              }}
            >
              <Trash2 size={15} /> Trash
              {deletedOrders.length > 0 && (
                <span style={{
                  position: 'absolute', top: -6, right: -6,
                  background: '#ef4444', color: '#fff', borderRadius: '50%',
                  width: 18, height: 18, fontSize: '0.65rem', fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>{deletedOrders.length}</span>
              )}
            </button>
            {canCreateOrder && !trashView && (
              <>
                <button
                  className="btn-secondary"
                  onClick={() => { if(bulkOrders.length === 1 && !bulkOrders[0].name) { setBulkOrders([{ ...emptyNewOrder, orderDate: todayDate(), orderTime: currentTime() }]); } setShowBulkOrder(true); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', fontSize: '0.85rem', whiteSpace: 'nowrap', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--white)', color: 'var(--text)', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", fontWeight: 700 }}
                >
                  <Layers size={16} /> Bulk Orders
                </button>
                <button
                  className="btn-primary"
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', fontSize: '0.85rem', whiteSpace: 'nowrap' }}
                  onClick={() => { setNewOrder({ ...emptyNewOrder, orderDate: todayDate(), orderTime: currentTime() }); setShowNewOrder(true); }}
                >
                  <Plus size={16} /> New Order
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {trashView ? (
        /* ── Trash View ── */
        <div className="dash-card">
          {deletedOrders.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-muted)' }}>
              <Trash2 size={40} style={{ opacity: 0.3, marginBottom: 12 }} />
              <div style={{ fontWeight: 700 }}>Trash is empty</div>
              <div style={{ fontSize: '0.82rem', marginTop: 4 }}>Deleted orders will appear here.</div>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, padding: '10px 14px', background: 'rgba(239,68,68,0.07)', borderRadius: 10, border: '1px solid rgba(239,68,68,0.2)' }}>
                <AlertTriangle size={16} color="#ef4444" />
                <span style={{ fontSize: '0.83rem', color: '#ef4444', fontWeight: 600 }}>
                  {deletedOrders.length} deleted order{deletedOrders.length !== 1 ? 's' : ''}. Recover to restore them or delete permanently.
                </span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th>Order ID</th>
                      <th>Customer</th>
                      <th>Total</th>
                      <th>Status</th>
                      <th>Original Date</th>
                      <th>Deleted</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deletedOrders.map(order => (
                      <tr key={order.id} style={{ opacity: 0.8 }}>
                        <td style={{ fontWeight: 700, color: 'var(--text-muted)' }}>{order.id}</td>
                        <td>
                          <div style={{ fontWeight: 700 }}>{order.customer_name}</div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{order.customer_phone}</div>
                        </td>
                        <td style={{ fontWeight: 700 }}>{fmt(order.total || 0)}</td>
                        <td><span className={`status-badge ${order.status}`}>{order.status}</span></td>
                        <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                          {new Date(order.created_at).toLocaleDateString()}
                        </td>
                        <td style={{ fontSize: '0.82rem', color: '#ef4444' }}>
                          {new Date(order.deleted_at).toLocaleDateString()}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <button
                              onClick={() => restoreOrder(order.id)}
                              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 7, border: '1px solid #22c55e', background: 'rgba(34,197,94,0.1)', color: '#16a34a', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}
                            >
                              <RotateCcw size={13} /> Recover
                            </button>
                            <button
                              onClick={() => permanentDelete(order.id)}
                              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 7, border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.08)', color: '#ef4444', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}
                            >
                              <Trash2 size={13} /> Delete Forever
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      ) : (
      <>
      {/* KPI Cards */}
      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <div className="kpi-card yellow">
          <div className="kpi-icon"><Clock size={24} /></div>
          <div className="kpi-value">{kpiPending}</div>
          <div className="kpi-label">Pending</div>
          <div className="kpi-change down">Awaiting action</div>
        </div>
        <div className="kpi-card blue">
          <div className="kpi-icon"><RefreshCw size={24} /></div>
          <div className="kpi-value">{kpiProcessing}</div>
          <div className="kpi-label">Processing</div>
          <div className="kpi-change up">Being prepared</div>
        </div>
        <div className="kpi-card purple">
          <div className="kpi-icon"><Truck size={24} /></div>
          <div className="kpi-value">{kpiShipped}</div>
          <div className="kpi-label">Shipped</div>
          <div className="kpi-change up">On the way</div>
        </div>
        <div className="kpi-card green">
          <div className="kpi-icon"><CheckCircle size={24} /></div>
          <div className="kpi-value">{kpiDelivered}</div>
          <div className="kpi-label">Delivered</div>
          <div className="kpi-change up">Completed</div>
        </div>
        <div className="kpi-card red">
          <div className="kpi-icon"><XCircle size={24} /></div>
          <div className="kpi-value">{kpiCancelled}</div>
          <div className="kpi-label">Cancelled</div>
          <div className="kpi-change down">{kpiCancelled > 0 ? 'Review needed' : 'None this period'}</div>
        </div>
      </div>

      <div className="dash-filters">
        {statuses.map(s => (
          <button key={s} className={`dash-filter-btn${filter === s ? ' active' : ''}`} onClick={() => setFilter(s)}>
            {s === 'all' ? `All (${periodSearchFiltered.length})` : `${s.charAt(0).toUpperCase() + s.slice(1)} (${periodSearchFiltered.filter(o => o.status === s).length})`}
          </button>
        ))}
      </div>
      <div className="dash-filters" style={{ marginTop: 8 }}>
        {[['all', 'All Sources'], ['storefront', 'Website'], ['whatsapp', 'WhatsApp']].map(([val, label]) => (
          <button key={val} className={`dash-filter-btn${sourceFilter === val ? ' active' : ''}`} onClick={() => setSourceFilter(val)}>
            {label}{val !== 'all' ? ` (${periodSearchFiltered.filter(o => (o.channel || 'storefront') === val).length})` : ''}
          </button>
        ))}
      </div>

      <div className="dash-card">
        <div style={{ overflowX: 'auto' }}>
          <table className="dash-table">
            <thead><tr>
              <th style={thStyle('id')} onClick={() => handleSort('id')}>ID <SortIcon col="id" /></th>
              <th style={thStyle('customer_name')} onClick={() => handleSort('customer_name')}>Customer <SortIcon col="customer_name" /></th>
              <th style={thStyle('items')} onClick={() => handleSort('items')}>Items <SortIcon col="items" /></th>
              <th style={thStyle('total')} onClick={() => handleSort('total')}>Total <SortIcon col="total" /></th>
              <th>Channel / Payment</th>
              <th style={thStyle('status')} onClick={() => handleSort('status')}>Status <SortIcon col="status" /></th>
              <th style={thStyle('created_at')} onClick={() => handleSort('created_at')}>Date &amp; Time <SortIcon col="created_at" /></th>
            </tr></thead>
            <tbody>
              {paged.map(order => {
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
                      <td style={{ fontWeight: 700 }}>
                        {fmt(order.total || 0)}
                        {order.coupon_code && (
                          <div style={{ fontSize: '0.7rem', background: 'rgba(34,197,94,0.12)', color: '#16a34a', padding: '1px 7px', borderRadius: 20, display: 'inline-block', fontWeight: 800, marginLeft: 6 }}>
                            {order.coupon_code}
                          </div>
                        )}
                      </td>
                      <td style={{ fontSize: '0.82rem' }}>
                        {channel && <div style={{ fontSize: '0.72rem', background: 'rgba(192,32,31,0.08)', color: 'var(--red)', padding: '2px 7px', borderRadius: 20, display: 'inline-block', fontWeight: 800, marginBottom: 2 }}>{channel}</div>}
                        <div style={{ color: 'var(--text-muted)' }}>{(order.payment_method || '').replace(/_/g, ' ')}</div>
                      </td>
                      <td><span className={`status-badge ${order.status}`}>{order.status}</span></td>
                      <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                        <div>{new Date(order.created_at).toLocaleDateString()}</div>
                        <div style={{ fontSize: '0.75rem', marginTop: 2 }}>{new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}</div>
                      </td>
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
                                style={{ padding: '6px 28px 6px 10px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--black2)', color: 'var(--text)', fontSize: '0.82rem', fontFamily: "'DM Sans', sans-serif", outline: 'none', WebkitAppearance: 'none', appearance: 'none', cursor: 'pointer', backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='13' height='13' viewBox='0 0 24 24' fill='none' stroke='%235C5247' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}
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
                            {order.coupon_code && (
                              <div style={{ marginTop: 6, fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ background: 'rgba(34,197,94,0.12)', color: '#16a34a', padding: '2px 10px', borderRadius: 20, fontWeight: 800, fontSize: '0.75rem' }}>
                                  COUPON: {order.coupon_code}
                                </span>
                                <span style={{ color: '#16a34a', fontWeight: 700 }}>−{fmt(order.coupon_discount || 0)}</span>
                              </div>
                            )}
                            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(0,0,0,0.05)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                              <strong style={{ fontSize: '0.8rem' }}>Actions:</strong>
                              <select value={order.status} onChange={e => updateStatus(order.id, e.target.value)} style={{ padding: '6px 28px 6px 10px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--black2)', color: 'var(--text)', fontSize: '0.82rem', fontFamily: "'DM Sans', sans-serif", outline: 'none', WebkitAppearance: 'none', appearance: 'none', cursor: 'pointer', backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='13' height='13' viewBox='0 0 24 24' fill='none' stroke='%235C5247' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}>
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
        <Pagination page={page} total={filtered.length} perPage={PER_PAGE} onChange={setPage} />
      </div>
      </>
      )}

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
                <select value={newOrder.channel} onChange={setField('channel')} style={{ width: '100%', padding: '12px 36px 12px 16px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--black)', color: 'var(--text)', fontSize: '0.9rem', fontFamily: "'DM Sans', sans-serif", outline: 'none', WebkitAppearance: 'none', appearance: 'none', cursor: 'pointer', backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%235C5247' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}>
                  {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Payment Method</label>
                <select value={newOrder.payment} onChange={setField('payment')} style={{ width: '100%', padding: '12px 36px 12px 16px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--black)', color: 'var(--text)', fontSize: '0.9rem', fontFamily: "'DM Sans', sans-serif", outline: 'none', WebkitAppearance: 'none', appearance: 'none', cursor: 'pointer', backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%235C5247' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}>
                  {PAYMENT_METHODS.map(p => <option key={p} value={p}>{p.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
            </div>
            {storeList.length > 0 && (
              <div className="form-group">
                <label>Store (fulfilling this order)</label>
                <select value={newOrder.store} onChange={setField('store')} style={{ width: '100%', padding: '12px 36px 12px 16px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--black)', color: 'var(--text)', fontSize: '0.9rem', fontFamily: "'DM Sans', sans-serif", outline: 'none', WebkitAppearance: 'none', appearance: 'none', cursor: 'pointer', backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%235C5247' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}>
                  {storeList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}

            {/* Order Date & Time */}
            <div className="form-row">
              <div className="form-group">
                <label>Order Date</label>
                <input type="date" value={newOrder.orderDate} onChange={setField('orderDate')} max={todayDate()} />
              </div>
              <div className="form-group">
                <label>Order Time</label>
                <input type="time" value={newOrder.orderTime} onChange={setField('orderTime')} />
              </div>
            </div>

            {/* Customer Info */}
            <div className="form-row">
              <div className="form-group"><label>Customer Name *</label><input value={newOrder.name} onChange={setField('name')} placeholder="Full name" /></div>
              <div className="form-group"><label>Phone *</label><input value={newOrder.phone} onChange={setField('phone')} placeholder="+234 000 000 0000" /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Email</label><input type="email" value={newOrder.email} onChange={setField('email')} placeholder="customer@email.com" /></div>
              <div className="form-group"><label>Delivery Address</label><input value={newOrder.address} onChange={setField('address')} placeholder="Street / Pickup / Offline" /></div>
            </div>
            {areas.length > 0 && (
              <div className="form-row">
                <div className="form-group">
                  <label>Delivery Location</label>
                  <select
                    value={newOrder.zoneId}
                    onChange={e => pickZone(e.target.value)}
                    style={{ width: '100%', padding: '12px 36px 12px 16px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--black)', color: 'var(--text)', fontSize: '0.9rem', fontFamily: "'DM Sans', sans-serif", outline: 'none', WebkitAppearance: 'none', appearance: 'none', cursor: 'pointer', backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%235C5247' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}
                  >
                    <option value="">— No delivery fee (pickup / free) —</option>
                    {areas.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.name} — {fmt(a.price)}
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
                          style={{ padding: '8px 28px 8px 10px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--black2)', color: 'var(--text)', fontSize: '0.85rem', fontFamily: "'DM Sans', sans-serif", outline: 'none', WebkitAppearance: 'none', appearance: 'none', cursor: 'pointer', backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='13' height='13' viewBox='0 0 24 24' fill='none' stroke='%235C5247' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}
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

      {/* ── New Bulk Orders Modal ── */}
      {showBulkOrder && (
        <div className="product-form-modal" style={{ padding: '0 20px', alignItems: 'flex-start' }} onClick={() => setShowBulkOrder(false)}>
          <div className="product-form-card" onClick={e => e.stopPropagation()} style={{ position: 'relative', maxWidth: 900, width: '100%', marginTop: '5vh', maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            <button onClick={() => setShowBulkOrder(false)} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
              <X size={22} />
            </button>
            <h3 style={{ marginTop: 0, marginBottom: 6, fontFamily: "'Mona Sans','Mona-Sans','Helvetica Neue',sans-serif" }}>Bulk Add Orders</h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 20 }}>Speedily record multiple different offline orders. Only valid orders with items will be saved.</p>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 20 }}>
              {bulkOrders.map((bo, oIdx) => {
                const subtotal = bo.items.reduce((s, i) => s + (Number(i.qty) * Number(i.price) || 0), 0);
                const total = subtotal + Number(bo.deliveryFee || 0);
                return (
                  <div key={oIdx} style={{ background: 'var(--black2)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: 20, position: 'relative' }}>
                    {bulkOrders.length > 1 && (
                      <button onClick={() => removeBulkOrder(oIdx)} style={{ position: 'absolute', top: 12, right: 12, background: '#fee2e2', border: 'none', color: '#991b1b', width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                        <Trash2 size={14} />
                      </button>
                    )}
                    <h4 style={{ margin: '0 0 16px 0', fontSize: '0.95rem' }}>Order #{oIdx + 1}</h4>
                    
                    <div className="form-row">
                      <div className="form-group"><input value={bo.name} onChange={e => updateBulkOrder(oIdx, 'name', e.target.value)} placeholder="Customer Name *" style={{ padding: '10px 14px' }} /></div>
                      <div className="form-group"><input value={bo.phone} onChange={e => updateBulkOrder(oIdx, 'phone', e.target.value)} placeholder="Phone *" style={{ padding: '10px 14px' }} /></div>
                      <div className="form-group">
                        <select value={bo.channel} onChange={e => updateBulkOrder(oIdx, 'channel', e.target.value)} style={{ width: '100%', padding: '10px 36px 10px 14px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--black)', color: 'var(--text)', fontSize: '0.85rem' }}>
                          {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div className="form-group">
                        <select value={bo.payment} onChange={e => updateBulkOrder(oIdx, 'payment', e.target.value)} style={{ width: '100%', padding: '10px 36px 10px 14px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--black)', color: 'var(--text)', fontSize: '0.85rem' }}>
                          {PAYMENT_METHODS.map(p => <option key={p} value={p}>{p.replace(/_/g, ' ')}</option>)}
                        </select>
                      </div>
                    </div>

                    <div className="form-row">
                      <div className="form-group"><input value={bo.address} onChange={e => updateBulkOrder(oIdx, 'address', e.target.value)} placeholder="Delivery Address / Pickup" style={{ padding: '10px 14px' }} /></div>
                      {areas.length > 0 && (
                        <div className="form-group">
                          <select value={bo.zoneId} onChange={e => pickBulkZone(oIdx, e.target.value)} style={{ width: '100%', padding: '10px 36px 10px 14px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--black)', color: 'var(--text)', fontSize: '0.85rem' }}>
                            <option value="">— No fee —</option>
                            {areas.map(a => <option key={a.id} value={a.id}>{a.name} — {fmt(a.price)}</option>)}
                          </select>
                        </div>
                      )}
                      <div className="form-group"><input type="email" value={bo.email} onChange={e => updateBulkOrder(oIdx, 'email', e.target.value)} placeholder="Email (optional)" style={{ padding: '10px 14px' }} /></div>
                    </div>

                    <div style={{ background: 'var(--black)', padding: '12px 16px', borderRadius: 8, border: '1px solid var(--border-subtle)', marginBottom: 12 }}>
                      <label style={{ display: 'block', fontWeight: 700, fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 8 }}>Items</label>
                      {bo.items.map((item, iIdx) => (
                        <div key={iIdx} style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 1.5fr) 1fr 60px 80px auto', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                          {products.length > 0 ? (
                            <select value={item.product} onChange={e => e.target.value ? pickBulkProduct(oIdx, iIdx, e.target.value) : updateBulkItemField(oIdx, iIdx, 'product', '')} style={{ padding: '8px 10px', fontSize: '0.8rem', borderRadius: 6 }}>
                              <option value="">— Custom —</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                          ) : <div />}
                          <input value={item.name} onChange={e => updateBulkItemField(oIdx, iIdx, 'name', e.target.value)} placeholder="Name" style={{ padding: '8px 10px', fontSize: '0.8rem', borderRadius: 6 }} />
                          <input type="number" min="1" value={item.qty} onChange={e => updateBulkItemField(oIdx, iIdx, 'qty', e.target.value)} placeholder="Qty" style={{ padding: '8px 10px', fontSize: '0.8rem', borderRadius: 6 }} />
                          <input type="number" value={item.price} onChange={e => updateBulkItemField(oIdx, iIdx, 'price', e.target.value)} placeholder="Price" style={{ padding: '8px 10px', fontSize: '0.8rem', borderRadius: 6 }} />
                          <button type="button" onClick={() => removeBulkItemRow(oIdx, iIdx)} style={{ background: 'none', border: 'none', color: '#991b1b', cursor: 'pointer', padding: 4 }}><Trash2 size={14}/></button>
                        </div>
                      ))}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                        <button type="button" onClick={() => addBulkItemRow(oIdx)} style={{ background: 'var(--black2)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '4px 10px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>+ Add Item Row</button>
                        <div style={{ fontWeight: 800, color: 'var(--red)', fontSize: '0.9rem' }}>Total: {fmt(total)}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', gap: 12, borderTop: '1px solid var(--border-subtle)', paddingTop: 20, position: 'sticky', bottom: 0, background: 'var(--card-bg)' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={addBulkOrder}
                style={{ flex: 1, padding: '13px', display: 'flex', justifyContent: 'center', gap: 6, alignItems: 'center' }}
              >
                <Plus size={16} /> Add Another Order
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleSaveBulkOrders}
                disabled={savingBulk || !bulkOrders.some(bo => bo.name.trim() && bo.phone.trim() && bo.items.some(i => i.name.trim() && Number(i.price) > 0))}
                style={{ flex: 1, padding: '13px', display: 'flex', justifyContent: 'center', gap: 6, alignItems: 'center' }}
              >
                {savingBulk ? <Loader2 size={16} className="spin" /> : <><CheckCircle size={16} /> Save All Orders ({bulkOrders.filter(bo => bo.name.trim() && bo.phone.trim() && bo.items.some(i => i.name.trim() && Number(i.price) > 0)).length} valid)</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
