import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Search, Loader2, FileText, Plus, Trash2, X, ChevronUp, ChevronDown, Clock, Truck, CheckCircle, XCircle, RefreshCw, RotateCcw, AlertTriangle, Layers, BellRing, Sparkles } from 'lucide-react';
import { SkelTable, SkelKpiGrid } from '../../components/Skeleton';
import Pagination from '../../components/Pagination';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useOutletContext } from 'react-router-dom';
import { fetchFlatAreas } from '../../lib/deliveryMatcher';
import CustomSelect from '../../components/CustomSelect';
import BulkActionBar from '../../components/BulkActionBar';
import DashCalendar from '../../components/DashCalendar';
import ConfirmModal from '../../components/ConfirmModal';

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
  let subtotal = items.reduce((s, i) => s + (i.price * i.qty), 0);
  if (!subtotal) subtotal = (order.total || 0) + couponDiscount;
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
  <div class="row" style="color: #c0201f; font-weight: 700;"><span>Delivery (Pay on Delivery)</span><span>${deliveryFee > 0 ? '₦' + deliveryFee.toLocaleString() : 'Free'}</span></div>
  ${couponDiscount > 0 ? `<div class="row" style="color:#16a34a"><span>Discount (${order.coupon_code})</span><span>−₦${couponDiscount.toLocaleString()}</span></div>` : ''}
  ${notes ? `<div style="font-size:9px;color:#555;margin:2mm 0">Notes: ${notes}</div>` : ''}
  <div class="row total"><span>AMOUNT PAID UPFRONT</span><span>₦${Number(order.total).toLocaleString()}</span></div>

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
  channel: 'WhatsApp', payment: 'bank_transfer', notes: '',
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
  const canCancelOrder = isAdmin || (userPermissions || []).includes('Orders:cancel');
  const canDeleteOrder = isAdmin || (userPermissions || []).includes('Orders:delete');
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
  const [confirmAction, setConfirmAction] = useState(null);
  const [sourceFilter, setSourceFilter] = useState('all'); // 'all' | 'storefront' | 'whatsapp'
  const [newOrderAlert, setNewOrderAlert] = useState(null); // { id, name, total }
  
  // Auto-clear new order alert after 10 seconds
  useEffect(() => {
    if (!newOrderAlert) return;
    const t = setTimeout(() => setNewOrderAlert(null), 10000);
    return () => clearTimeout(t);
  }, [newOrderAlert]);

  // Bulk action selections state
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectedTrashIds, setSelectedTrashIds] = useState([]);

  // Auto-reset selections when view or filters change
  useEffect(() => {
    setSelectedIds([]);
  }, [filter, sourceFilter, page, trashView]);

  useEffect(() => {
    setSelectedTrashIds([]);
  }, [trashView]);

  useEffect(() => {
    if (trashView && !canDeleteOrder) {
      setTrashView(false);
    }
  }, [trashView, canDeleteOrder]);

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
        
        // Safe check for storeFilter matching
        if (storeFilter && order.store_id !== null && order.store_id !== undefined && String(order.store_id) !== String(storeFilter)) {
          return;
        }

        // Short delay to allow order_items to be inserted by the sequential API/edge-function calls
        await new Promise(resolve => setTimeout(resolve, 1000));

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
      if (storeFilter) q = q.or(`store_id.eq.${storeFilter},store_id.is.null`);
      return q;
    };

    // Deleted orders only need summary columns — skip order_items join to save egress
    const buildDeletedBase = () => {
      let q = supabase.from('orders').select('id, customer_name, customer_email, customer_phone, delivery_address, total, status, created_at, deleted_at, store_id, notes');
      if (storeFilter) q = q.or(`store_id.eq.${storeFilter},store_id.is.null`);
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
    await supabase.from('orders').update({ status: newStatus }).eq('id', id);
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status: newStatus } : o));
  };

  const deleteOrder = (id) => {
    if (!canDeleteOrder) return showToast('Permission Denied', 'You do not have permission to delete orders.', 'error');
    setConfirmAction({
      title: 'Move to Trash?',
      message: 'You can recover this order later from the Trash.',
      onConfirm: async () => {
        setConfirmAction(prev => ({ ...prev, isLoading: true }));
        const now = new Date().toISOString();
        const { error } = await supabase.from('orders').update({ deleted_at: now }).eq('id', id);
        if (!error) {
          const moved = orders.find(o => o.id === id);
          setOrders(prev => prev.filter(o => o.id !== id));
          if (moved) setDeletedOrders(prev => [{ ...moved, deleted_at: now }, ...prev]);
          showToast('Order moved to trash', 'You can recover it from Trash.', 'info');
        }
        setConfirmAction(null);
      }
    });
  };

  const restoreOrder = async (id) => {
    if (!canDeleteOrder) return showToast('Permission Denied', 'You do not have permission to restore orders.', 'error');
    const { error } = await supabase.from('orders').update({ deleted_at: null }).eq('id', id);
    if (!error) {
      const moved = deletedOrders.find(o => o.id === id);
      setDeletedOrders(prev => prev.filter(o => o.id !== id));
      if (moved) setOrders(prev => [{ ...moved, deleted_at: null }, ...prev]);
      showToast('Order restored', '', 'success');
    }
  };

  const permanentDelete = (id) => {
    if (!canDeleteOrder) return showToast('Permission Denied', 'You do not have permission to delete orders.', 'error');
    setConfirmAction({
      title: 'Permanently Delete?',
      message: 'This action cannot be undone.',
      isDestructive: true,
      onConfirm: async () => {
        setConfirmAction(prev => ({ ...prev, isLoading: true }));
        await supabase.from('order_items').delete().eq('order_id', id);
        const { error } = await supabase.from('orders').delete().eq('id', id);
        if (!error) {
          setDeletedOrders(prev => prev.filter(o => o.id !== id));
          showToast('Order permanently deleted', '', 'info');
        }
        setConfirmAction(null);
      }
    });
  };

  // ── Bulk Actions Helpers ──────────────────────────────────
  const handleBulkStatusUpdate = async (newStatus) => {
    if (selectedIds.length === 0) return;
    try {
      setLoading(true);
      const { error } = await supabase.from('orders').update({ status: newStatus }).in('id', selectedIds);
      if (!error) {
        setOrders(prev => prev.map(o => selectedIds.includes(o.id) ? { ...o, status: newStatus } : o));
        setSelectedIds([]);
        showToast('Bulk Status Updated', `Successfully updated ${selectedIds.length} orders to ${newStatus}`, 'success');
      } else {
        showToast('Update failed', error.message, 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Update failed', 'An unexpected error occurred', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleBulkMoveToTrash = () => {
    if (!canDeleteOrder) return showToast('Permission Denied', 'You do not have permission to delete orders.', 'error');
    if (selectedIds.length === 0) return;
    setConfirmAction({
      title: 'Move Selected to Trash?',
      message: `Are you sure you want to move ${selectedIds.length} selected orders to the trash?`,
      onConfirm: async () => {
        setConfirmAction(prev => ({ ...prev, isLoading: true }));
        const now = new Date().toISOString();
        const { error } = await supabase.from('orders').update({ deleted_at: now }).in('id', selectedIds);
        if (!error) {
          const moved = orders.filter(o => selectedIds.includes(o.id)).map(o => ({ ...o, deleted_at: now }));
          setOrders(prev => prev.filter(o => !selectedIds.includes(o.id)));
          setDeletedOrders(prev => [...moved, ...prev]);
          setSelectedIds([]);
          showToast('Orders moved to trash', `${moved.length} orders moved to trash`, 'info');
        } else {
          showToast('Failed to delete', error.message, 'error');
        }
        setConfirmAction(null);
      }
    });
  };

  const handleBulkRecover = async () => {
    if (!canDeleteOrder) return showToast('Permission Denied', 'You do not have permission to restore orders.', 'error');
    if (selectedTrashIds.length === 0) return;
    try {
      setLoading(true);
      const { error } = await supabase.from('orders').update({ deleted_at: null }).in('id', selectedTrashIds);
      if (!error) {
        const moved = deletedOrders.filter(o => selectedTrashIds.includes(o.id)).map(o => ({ ...o, deleted_at: null }));
        setDeletedOrders(prev => prev.filter(o => !selectedTrashIds.includes(o.id)));
        setOrders(prev => [...moved, ...prev]);
        setSelectedTrashIds([]);
        showToast('Orders restored', `${moved.length} orders successfully restored`, 'success');
      } else {
        showToast('Failed to restore', error.message, 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Error', 'An unexpected error occurred', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleBulkPermanentDelete = () => {
    if (!canDeleteOrder) return showToast('Permission Denied', 'You do not have permission to delete orders.', 'error');
    if (selectedTrashIds.length === 0) return;
    setConfirmAction({
      title: 'Delete Selected Forever?',
      message: `Are you sure you want to permanently delete the ${selectedTrashIds.length} selected orders? This action cannot be undone.`,
      isDestructive: true,
      onConfirm: async () => {
        setConfirmAction(prev => ({ ...prev, isLoading: true }));
        // Delete child items first to satisfy foreign keys
        await supabase.from('order_items').delete().in('order_id', selectedTrashIds);
        const { error } = await supabase.from('orders').delete().in('id', selectedTrashIds);
        if (!error) {
          setDeletedOrders(prev => prev.filter(o => !selectedTrashIds.includes(o.id)));
          setSelectedTrashIds([]);
          showToast('Permanently deleted', 'Selected orders deleted forever', 'info');
        } else {
          showToast('Failed to delete', error.message, 'error');
        }
        setConfirmAction(null);
      }
    });
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
      const linkedItems = validItems.filter(i => i.product);
      if (linkedItems.length > 0) {
        const { data: stockData } = await supabase.from('products').select('id,name,stock').in('id', linkedItems.map(i => i.product));
        if (stockData) {
          const stockMap = Object.fromEntries(stockData.map(p => [String(p.id), p]));
          const failures = linkedItems.filter(i => { const p = stockMap[String(i.product)]; return p && p.stock < Number(i.qty); });
          if (failures.length) {
            const msg = failures.map(i => { const p = stockMap[String(i.product)]; return p.stock === 0 ? `${i.name} is out of stock` : `Only ${p.stock} left of ${i.name}`; }).join(' · ');
            showToast('Stock check failed', msg, 'error');
            setSavingNew(false);
            return;
          }
        }
      }
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
  const addBulkItemRow = (oIdx) => setBulkOrders(prev => { const c = [...prev]; c[oIdx] = { ...c[oIdx], items: [...c[oIdx].items, { product: '', name: '', qty: 1, price: '' }] }; return c; });
  const removeBulkItemRow = (oIdx, iIdx) => setBulkOrders(prev => { const c = [...prev]; c[oIdx] = { ...c[oIdx], items: c[oIdx].items.filter((_, i) => i !== iIdx) }; return c; });
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
      // Aggregate qty needed per product across all bulk orders before inserting anything
      const qtyNeeded = {};
      validOrders.forEach(o => o.items.filter(i => i.product && i.name.trim() && Number(i.price) > 0).forEach(i => {
        qtyNeeded[String(i.product)] = (qtyNeeded[String(i.product)] || 0) + Number(i.qty);
      }));
      const productIds = Object.keys(qtyNeeded);
      if (productIds.length > 0) {
        const { data: stockData } = await supabase.from('products').select('id,name,stock').in('id', productIds);
        if (stockData) {
          const stockMap = Object.fromEntries(stockData.map(p => [String(p.id), p]));
          const failures = Object.entries(qtyNeeded).filter(([id, qty]) => { const p = stockMap[id]; return p && p.stock < qty; });
          if (failures.length) {
            const msg = failures.map(([id]) => { const p = stockMap[id]; return p.stock === 0 ? `${p.name} is out of stock` : `Insufficient stock for ${p.name} (need ${qtyNeeded[id]}, have ${p.stock})`; }).join(' · ');
            showToast('Stock check failed', msg, 'error');
            setSavingBulk(false);
            return;
          }
        }
      }

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
      showToast('Success', `${validOrders.length} manual order(s) added successfully`, 'success');
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
      <SkelKpiGrid count={5} />
      <SkelTable rows={8} cols={8} />
    </div>
  );

  return (
    <div>
      {/* New order alert banner */}
      {newOrderAlert && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 9999,
          width: 340,
          background: 'var(--white)',
          border: '1px solid var(--border-subtle)',
          borderLeft: '4px solid var(--red)',
          borderRadius: '16px',
          boxShadow: '0 16px 48px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
          overflow: 'hidden',
          animation: 'toastSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        }}>
          <style>{`
            @keyframes toastSlideIn {
              from { opacity: 0; transform: translateX(60px) scale(0.97); }
              to   { opacity: 1; transform: translateX(0)   scale(1);    }
            }
            @keyframes bellPulse {
              0%   { box-shadow: 0 0 0 0   rgba(192,32,31,0.35); }
              70%  { box-shadow: 0 0 0 8px rgba(192,32,31,0);    }
              100% { box-shadow: 0 0 0 0   rgba(192,32,31,0);    }
            }
            @keyframes shrinkBar {
              from { width: 100%; }
              to   { width: 0%;   }
            }
          `}</style>

          {/* Body */}
          <div style={{ padding: '16px 16px 12px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12, flexShrink: 0,
              background: 'rgba(192,32,31,0.08)', border: '1px solid rgba(192,32,31,0.15)',
              color: 'var(--red)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              animation: 'bellPulse 2s infinite',
            }}>
              <BellRing size={18} />
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                <span style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--text)', fontFamily: "'Mona Sans', sans-serif" }}>
                  New Order
                </span>
                <Sparkles size={13} style={{ color: '#f59e0b', flexShrink: 0 }} />
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.4, marginBottom: 8 }}>
                <strong style={{ color: 'var(--text)', fontWeight: 700 }}>{newOrderAlert.name}</strong> just placed an order
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="status-badge pending">Pending</span>
                <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text)', fontFamily: "'Mona Sans', sans-serif" }}>
                  ₦{Number(newOrderAlert.total).toLocaleString()}
                </span>
              </div>
            </div>

            <button
              onClick={() => setNewOrderAlert(null)}
              style={{
                background: 'none', border: 'none', color: 'var(--text-muted)',
                cursor: 'pointer', padding: 4, borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <X size={15} />
            </button>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, padding: '0 16px 14px' }}>
            <button
              onClick={() => { setSearch(newOrderAlert.id); setNewOrderAlert(null); }}
              style={{
                flex: 1, background: 'var(--red)', color: '#fff', border: 'none',
                borderRadius: 8, padding: '8px 12px', fontSize: '0.82rem', fontWeight: 700,
                cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
              }}
            >
              View Order
            </button>
            <button
              onClick={() => setNewOrderAlert(null)}
              style={{
                background: 'var(--black2)', color: 'var(--text-muted)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 8, padding: '8px 14px', fontSize: '0.82rem', fontWeight: 700,
                cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
              }}
            >
              Dismiss
            </button>
          </div>

          {/* Timer bar */}
          <div style={{
            height: 3, background: 'var(--red)', opacity: 0.6,
            animation: 'shrinkBar 10s linear forwards',
          }} />
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
            <DashCalendar
              value={dateFilter}
              onChange={v => { setDateFilter(v); if (v) setPeriod('all'); }}
            />
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
            {canDeleteOrder && (
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
            )}
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
                      <th style={{ width: 44, textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={deletedOrders.length > 0 && deletedOrders.every(o => selectedTrashIds.includes(o.id))}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedTrashIds(deletedOrders.map(o => o.id));
                            } else {
                              setSelectedTrashIds([]);
                            }
                          }}
                          style={{ cursor: 'pointer', width: 16, height: 16, accentColor: 'var(--red)' }}
                        />
                      </th>
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
                    {deletedOrders.map(order => {
                      const isSelected = selectedTrashIds.includes(order.id);
                      return (
                        <tr 
                          key={order.id} 
                          style={{ 
                            opacity: 0.8,
                            background: isSelected ? 'rgba(0, 0, 0, 0.04)' : undefined,
                            borderLeft: isSelected ? '3px solid var(--text-muted)' : undefined,
                          }}
                        >
                          <td style={{ width: 44, textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedTrashIds([...selectedTrashIds, order.id]);
                                } else {
                                  setSelectedTrashIds(selectedTrashIds.filter(id => id !== order.id));
                                }
                              }}
                              style={{ cursor: 'pointer', width: 16, height: 16, accentColor: 'var(--red)' }}
                            />
                          </td>
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
                    ); })}
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
              <th style={{ width: 44, textAlign: 'center' }}>
                <input
                  type="checkbox"
                  checked={paged.length > 0 && paged.every(o => selectedIds.includes(o.id))}
                  onChange={(e) => {
                    if (e.target.checked) {
                      const newSel = [...new Set([...selectedIds, ...paged.map(o => o.id)])];
                      setSelectedIds(newSel);
                    } else {
                      const pageIds = paged.map(o => o.id);
                      setSelectedIds(selectedIds.filter(id => !pageIds.includes(id)));
                    }
                  }}
                  style={{ cursor: 'pointer', width: 16, height: 16, accentColor: 'var(--red)' }}
                />
              </th>
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
                const isSelected = selectedIds.includes(order.id);
                return (
                  <React.Fragment key={order.id}>
                    <tr 
                      style={{ 
                        cursor: 'pointer',
                        background: isSelected ? 'rgba(192, 32, 31, 0.06)' : undefined,
                        borderLeft: isSelected ? '3px solid var(--red)' : undefined,
                      }} 
                      onClick={() => setExpandedId(expandedId === order.id ? null : order.id)}
                    >
                      <td style={{ width: 44, textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedIds([...selectedIds, order.id]);
                            } else {
                              setSelectedIds(selectedIds.filter(id => id !== order.id));
                            }
                          }}
                          style={{ cursor: 'pointer', width: 16, height: 16, accentColor: 'var(--red)' }}
                        />
                      </td>
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
                        {order.delivery_fee > 0 && (
                          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--red)', marginTop: 4 }}>
                            To Collect: {fmt(order.delivery_fee)}
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
                  </React.Fragment>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No orders found matching your filter.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={page} total={filtered.length} perPage={PER_PAGE} onChange={setPage} />
      </div>
      </>
      )}

      {/* ── Slide-Out Drawer ── */}
      <div className={`dash-drawer-overlay ${expandedId ? 'open' : ''}`} onClick={() => setExpandedId(null)}></div>
      <div className={`dash-drawer ${expandedId ? 'open' : ''}`}>
        {(() => {
          const sel = periodSearchFiltered.find(o => o.id === expandedId);
          if (!sel) return null;
          const selChannel = getChannel(sel.notes);
          return (
            <>
              <div className="dash-drawer-header">
                <div>
                  <h3 style={{ margin: 0, fontFamily: "'Mona Sans', sans-serif", fontSize: '1.2rem', color: 'var(--red)' }}>#{sel.id}</h3>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    {new Date(sel.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <span className={`status-badge ${sel.status}`}>{sel.status}</span>
                  <button className="dash-drawer-close" onClick={() => setExpandedId(null)}><X size={16} /></button>
                </div>
              </div>
              <div className="dash-drawer-content">
                <div style={{ background: 'var(--card-bg2)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: 20, marginBottom: 20 }}>
                  <h4 style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-muted)', marginBottom: 12 }}>Customer Details</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12, fontSize: '0.9rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span><strong>Name:</strong> {sel.customer_name}</span>
                      {(() => {
                        const count = orders.filter(o => o.customer_phone && o.customer_phone === sel.customer_phone).length;
                        const isNew = count <= 1;
                        return (
                          <span style={{
                            fontSize: '0.68rem', fontWeight: 800, padding: '2px 8px', borderRadius: 20, flexShrink: 0,
                            ...(isNew ? { background: '#dbeafe', color: '#1d4ed8' } : { background: '#dcfce7', color: '#15803d' })
                          }}>
                            {isNew ? 'New' : 'Returning'}
                          </span>
                        );
                      })()}
                    </div>
                    <div><strong>Phone:</strong> {sel.customer_phone}</div>
                    <div><strong>Email:</strong> {sel.customer_email || '—'}</div>
                    <div><strong>Address:</strong> {sel.delivery_address}</div>
                  </div>
                </div>

                <div style={{ background: 'var(--white)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: 20, marginBottom: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                  <h4 style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-muted)', marginBottom: 12 }}>Order Items</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {(sel.order_items || []).map((item, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 8, borderBottom: '1px dashed var(--border-subtle)', fontSize: '0.9rem' }}>
                        <div>
                          <span style={{ fontWeight: 700 }}>{item.qty}x</span> {item.name}
                        </div>
                        <div style={{ fontWeight: 600 }}>{fmt(item.price * item.qty)}</div>
                      </div>
                    ))}
                    {!sel.order_items?.length && <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No items found.</div>}
                  </div>
                </div>

                <div style={{ background: 'rgba(192,32,31,0.03)', border: '1px solid rgba(192,32,31,0.1)', borderRadius: 12, padding: 20, marginBottom: 20 }}>
                  <h4 style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--red)', marginBottom: 12 }}>Payment & Fulfillment</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12, fontSize: '0.9rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Amount Paid:</span>
                      <strong style={{ fontSize: '1.1rem' }}>{fmt(sel.total || 0)}</strong>
                    </div>
                    {sel.delivery_fee > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--red)' }}>
                        <span>To Collect on Delivery:</span>
                        <strong>{fmt(sel.delivery_fee)}</strong>
                      </div>
                    )}
                    {sel.coupon_code && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#16a34a' }}>
                        <span>Discount ({sel.coupon_code}):</span>
                        <strong>−{fmt(sel.coupon_discount || 0)}</strong>
                      </div>
                    )}
                    <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }}></div>
                    <div><strong>Channel:</strong> {selChannel || 'Storefront'}</div>
                    <div><strong>Method:</strong> {(sel.payment_method || '').replace(/_/g, ' ')}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <strong>Store:</strong>
                      {storeList.length > 1 ? (
                        <select
                          value={sel.store_id || ''}
                          onChange={async (e) => {
                            const storeId = e.target.value ? Number(e.target.value) : null;
                            await supabase.from('orders').update({ store_id: storeId }).eq('id', sel.id);
                            setOrders(prev => prev.map(o => o.id === sel.id ? { ...o, store_id: storeId } : o));
                          }}
                          style={{ padding: '4px 24px 4px 8px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--white)', fontSize: '0.82rem', fontFamily: "'DM Sans', sans-serif", outline: 'none' }}
                        >
                          <option value="">Unassigned</option>
                          {storeList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      ) : (
                        <span>{storeList.find(s => s.id === sel.store_id)?.name || sel.store_id || 'Unassigned'}</span>
                      )}
                    </div>
                    {sel.notes?.replace(/^\[via .+?\]\n?/, '') && (
                      <div style={{ marginTop: 8, padding: 12, background: '#fff', borderRadius: 8, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        <strong>Note:</strong> {sel.notes.replace(/^\[via .+?\]\n?/, '')}
                      </div>
                    )}
                  </div>
                </div>

              </div>
              <div className="dash-drawer-footer">
                <div style={{ width: 150, flexShrink: 0 }}>
                  <CustomSelect
                    value={sel.status}
                    onChange={e => updateStatus(sel.id, e.target.value)}
                    options={statuses.filter(s => s !== 'all' && (canCancelOrder || s !== 'cancelled')).map(s => ({ value: s, label: s }))}
                  />
                </div>
                <button onClick={() => generateInvoice(sel)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--white)', border: '1px solid var(--border-subtle)', padding: '8px 16px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}>
                  <FileText size={15} /> Invoice
                </button>
                {canDeleteOrder && (
                  <button onClick={() => { setExpandedId(null); deleteOrder(sel.id); }} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fee2e2', color: '#991b1b', border: 'none', padding: '8px 16px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', marginLeft: 'auto', fontSize: '0.85rem' }}>
                    <Trash2 size={15} /> Delete
                  </button>
                )}
              </div>
            </>
          );
        })()}
      </div>

      {/* ── New Manual Order Drawer ── */}
      <div
        className="dash-drawer checkout-drawer-premium"
        style={{
          transform: showNewOrder ? 'translateX(0)' : 'translateX(100%)',
          position: 'fixed', top: 0, right: 0, bottom: 0, width: '100%', maxWidth: 480,
          background: 'var(--card-bg)', zIndex: 10000,
          display: 'flex', flexDirection: 'column',
          transition: 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
          boxShadow: showNewOrder ? '-12px 0 48px rgba(0,0,0,0.1)' : 'none'
        }}
      >
        <div className="dash-drawer-header" style={{ padding: '24px 28px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--white)' }}>
          <h2 style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Plus size={20} /> New Manual Order
          </h2>
          <button onClick={() => setShowNewOrder(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={24} /></button>
        </div>

        <div className="dash-drawer-content" style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>

          {/* Customer */}
          <h3 style={{ margin: '0 0 12px 0', fontSize: '0.95rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Customer</h3>
          <div className="form-row" style={{ marginBottom: 0 }}>
            <div className="form-group"><label>Name *</label><input value={newOrder.name} onChange={setField('name')} placeholder="Full name" style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-subtle)', fontSize: '0.9rem', width: '100%', boxSizing: 'border-box' }} /></div>
            <div className="form-group"><label>Phone *</label><input value={newOrder.phone} onChange={setField('phone')} placeholder="+234 000 000 0000" style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-subtle)', fontSize: '0.9rem', width: '100%', boxSizing: 'border-box' }} /></div>
          </div>
          <div className="form-row" style={{ marginBottom: 0 }}>
            <div className="form-group"><label>Email</label><input type="email" value={newOrder.email} onChange={setField('email')} placeholder="customer@email.com" style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-subtle)', fontSize: '0.9rem', width: '100%', boxSizing: 'border-box' }} /></div>
            <div className="form-group"><label>Delivery Address</label><input value={newOrder.address} onChange={setField('address')} placeholder="Street / Pickup" style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-subtle)', fontSize: '0.9rem', width: '100%', boxSizing: 'border-box' }} /></div>
          </div>

          {/* Order Details */}
          <h3 style={{ margin: '20px 0 12px 0', fontSize: '0.95rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, paddingTop: 20, borderTop: '1px solid var(--border-subtle)' }}>Order Details</h3>
          <div className="form-row" style={{ marginBottom: 0 }}>
            <div className="form-group">
              <label>Channel</label>
              <CustomSelect value={newOrder.channel} onChange={setField('channel')} options={CHANNELS.map(c => ({ value: c, label: c }))} />
            </div>
            <div className="form-group">
              <label>Payment Method</label>
              <CustomSelect value={newOrder.payment} onChange={setField('payment')} options={PAYMENT_METHODS.map(p => ({ value: p, label: p.replace(/_/g, ' ') }))} />
            </div>
          </div>
          <div className="form-row" style={{ marginBottom: 0 }}>
            <div className="form-group">
              <label>Order Date</label>
              <DashCalendar value={newOrder.orderDate} onChange={setField('orderDate')} placeholder="Select date" wrapperStyle={{ width: '100%' }} />
            </div>
            <div className="form-group">
              <label>Order Time</label>
              <input type="time" value={newOrder.orderTime} onChange={setField('orderTime')} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-subtle)', fontSize: '0.9rem', width: '100%', boxSizing: 'border-box' }} />
            </div>
          </div>
          {areas.length > 0 && (
            <div className="form-row" style={{ marginBottom: 0 }}>
              <div className="form-group">
                <label>Delivery Zone</label>
                <CustomSelect value={newOrder.zoneId} onChange={e => pickZone(e.target.value)} options={[{ value: '', label: '— Pickup / Free —' }, ...areas.map(a => ({ value: a.id, label: `${a.name} — ${fmt(a.price)}` }))]} />
              </div>
              <div className="form-group">
                <label>Delivery Fee</label>
                <input type="number" min="0" value={newOrder.deliveryFee} onChange={e => setNewOrder(f => ({ ...f, deliveryFee: e.target.value, zoneId: '' }))} placeholder="₦ 0" style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-subtle)', fontSize: '0.9rem', width: '100%', boxSizing: 'border-box' }} />
              </div>
            </div>
          )}
          {storeList.length > 0 && (
            <div className="form-group">
              <label>Store</label>
              <CustomSelect value={newOrder.store} onChange={setField('store')} options={storeList.map(s => ({ value: s.id, label: s.name }))} />
            </div>
          )}

          {/* Items */}
          <h3 style={{ margin: '20px 0 12px 0', fontSize: '0.95rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, paddingTop: 20, borderTop: '1px solid var(--border-subtle)' }}>Items</h3>
          <div style={{ background: 'var(--black2)', padding: '12px 16px', borderRadius: 10, border: '1px solid var(--border-subtle)', marginBottom: 4 }}>
            {newOrder.items.map((item, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16, paddingBottom: 16, borderBottom: i < newOrder.items.length - 1 ? '1px dashed var(--border-subtle)' : 'none' }}>
                
                {/* Product Select */}
                {products.length > 0 && (
                  <div style={{ width: '100%' }}>
                    <CustomSelect
                      value={item.product}
                      onChange={e => e.target.value ? pickProduct(i, e.target.value) : updateItemField(i, 'product', '')}
                      options={[{ value: '', label: '— Custom Product —' }, ...products.map(p => ({ value: p.id, label: p.name }))]}
                    />
                  </div>
                )}
                
                {/* Item Name */}
                <div style={{ width: '100%' }}>
                  <input value={item.name} onChange={e => updateItemField(i, 'name', e.target.value)} placeholder="Item Name" style={{ width: '100%', boxSizing: 'border-box', padding: '10px 14px', fontSize: '0.9rem', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--white)', color: 'var(--text)' }} />
                </div>

                {/* Qty, Price, Delete */}
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid var(--border-subtle)', borderRadius: 8, overflow: 'hidden', background: 'var(--white)', padding: '2px 4px', height: 42 }}>
                    <button type="button" onClick={() => updateItemField(i, 'qty', Math.max(1, Number(item.qty) - 1))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 12px', fontSize: '1.2rem', fontWeight: 700, color: 'var(--text)', height: '100%' }}>−</button>
                    <span style={{ fontWeight: 800, fontSize: '0.9rem', minWidth: 24, textAlign: 'center' }}>{item.qty}</span>
                    <button type="button" onClick={() => updateItemField(i, 'qty', Number(item.qty) + 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 12px', fontSize: '1.2rem', fontWeight: 700, color: 'var(--text)', height: '100%' }}>+</button>
                  </div>
                  <input type="number" value={item.price} onChange={e => updateItemField(i, 'price', e.target.value)} placeholder="Price" style={{ flex: 1, height: 42, boxSizing: 'border-box', padding: '0 14px', fontSize: '0.9rem', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--white)', color: 'var(--text)' }} />
                  <button type="button" onClick={() => removeItemRow(i)} style={{ height: 42, width: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--white)', border: '1px solid var(--border-subtle)', borderRadius: 8, color: newOrder.items.length > 1 ? '#991b1b' : 'var(--border-subtle)', cursor: newOrder.items.length > 1 ? 'pointer' : 'default', flexShrink: 0 }} disabled={newOrder.items.length === 1}><Trash2 size={16} /></button>
                </div>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
              <button type="button" onClick={addItemRow} style={{ background: 'var(--card-bg)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '5px 12px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}><Plus size={13} /> Add Item</button>
              <span style={{ fontWeight: 800, color: 'var(--red)', fontSize: '0.9rem' }}>Subtotal: {fmt(itemsSubtotal)}</span>
            </div>
          </div>

          {/* Notes */}
          <div className="form-group" style={{ marginTop: 16 }}>
            <label>Notes (optional)</label>
            <textarea value={newOrder.notes} onChange={setField('notes')} placeholder="Any extra details..." style={{ minHeight: 72, padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-subtle)', fontSize: '0.9rem', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' }} />
          </div>

        </div>

        <div className="dash-drawer-footer" style={{ padding: '20px 28px', borderTop: '1px solid var(--border-subtle)', background: 'var(--white)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Subtotal</span>
            <span style={{ fontWeight: 600 }}>{fmt(itemsSubtotal)}</span>
          </div>
          {Number(newOrder.deliveryFee) > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Delivery</span>
              <span style={{ fontWeight: 600 }}>{fmt(newOrder.deliveryFee)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, paddingTop: 10, borderTop: '1px dashed var(--border-subtle)' }}>
            <span style={{ fontWeight: 800, fontSize: '1.1rem' }}>Total</span>
            <span style={{ fontWeight: 900, fontSize: '1.3rem', color: 'var(--red)' }}>{fmt(newOrderTotal)}</span>
          </div>
          <button
            className="btn-primary"
            onClick={handleSaveNewOrder}
            disabled={savingNew || !newOrder.name.trim() || !newOrder.phone.trim() || newOrderTotal === 0}
            style={{ width: '100%', padding: '14px', fontSize: '1rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }}
          >
            {savingNew ? <Loader2 size={18} className="spin" /> : <><CheckCircle size={18} /> Save Order</>}
          </button>
        </div>
      </div>
      {showNewOrder && <div className="dash-drawer-overlay open" onClick={() => setShowNewOrder(false)}></div>}

      {/* ── Bulk Orders Drawer ── */}
      <div
        className="dash-drawer checkout-drawer-premium"
        style={{
          transform: showBulkOrder ? 'translateX(0)' : 'translateX(100%)',
          position: 'fixed', top: 0, right: 0, bottom: 0, width: '100%', maxWidth: 720,
          background: 'var(--card-bg)', zIndex: 10000,
          display: 'flex', flexDirection: 'column',
          transition: 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
          boxShadow: showBulkOrder ? '-12px 0 48px rgba(0,0,0,0.1)' : 'none'
        }}
      >
        <div className="dash-drawer-header" style={{ padding: '24px 28px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--white)' }}>
          <div>
            <h2 style={{ margin: '0 0 4px 0', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Plus size={20} /> Bulk Add Orders
            </h2>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>Speedily record multiple different offline orders.</p>
          </div>
          <button onClick={() => setShowBulkOrder(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={24} /></button>
        </div>

        <div className="dash-drawer-content" style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
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
                  
                  <div className="form-row" style={{ marginBottom: 12 }}>
                    <div className="form-group"><input value={bo.name} onChange={e => updateBulkOrder(oIdx, 'name', e.target.value)} placeholder="Customer Name *" style={{ padding: '10px 14px' }} /></div>
                    <div className="form-group"><input value={bo.phone} onChange={e => updateBulkOrder(oIdx, 'phone', e.target.value)} placeholder="Phone *" style={{ padding: '10px 14px' }} /></div>
                    <div className="form-group">
                      <CustomSelect
                        value={bo.channel}
                        onChange={e => updateBulkOrder(oIdx, 'channel', e.target.value)}
                        options={CHANNELS.map(c => ({ value: c, label: c }))}
                      />
                    </div>
                  </div>

                  <div className="form-row" style={{ marginBottom: 12 }}>
                    <div className="form-group">
                      <CustomSelect
                        value={bo.payment}
                        onChange={e => updateBulkOrder(oIdx, 'payment', e.target.value)}
                        options={PAYMENT_METHODS.map(p => ({ value: p, label: p.replace(/_/g, ' ') }))}
                      />
                    </div>
                    <div className="form-group"><input value={bo.address} onChange={e => updateBulkOrder(oIdx, 'address', e.target.value)} placeholder="Delivery Address / Pickup" style={{ padding: '10px 14px' }} /></div>
                    {areas.length > 0 && (
                      <div className="form-group">
                        <CustomSelect
                          value={bo.zoneId}
                          onChange={e => pickBulkZone(oIdx, e.target.value)}
                          options={[
                            { value: '', label: '— No delivery fee —' },
                            ...areas.map(a => ({ value: a.id, label: `${a.name} — ${fmt(a.price)}` }))
                          ]}
                        />
                      </div>
                    )}
                  </div>

                  <div style={{ background: 'var(--black)', padding: '12px 16px', borderRadius: 8, border: '1px solid var(--border-subtle)' }}>
                    <label style={{ display: 'block', fontWeight: 700, fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Items</label>
                    {bo.items.map((item, iIdx) => (
                      <div key={iIdx} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 12, paddingBottom: 12, borderBottom: iIdx < bo.items.length - 1 ? '1px dashed var(--border-subtle)' : 'none' }}>
                        <div style={{ flex: '1 1 100%', display: 'flex', gap: 8 }}>
                          {products.length > 0 ? (
                            <div style={{ flex: 1 }}>
                              <CustomSelect
                                value={item.product}
                                onChange={e => e.target.value ? pickBulkProduct(oIdx, iIdx, e.target.value) : updateBulkItemField(oIdx, iIdx, 'product', '')}
                                options={[
                                  { value: '', label: '— Custom Product —' },
                                  ...products.map(p => ({ value: p.id, label: p.name }))
                                ]}
                              />
                            </div>
                          ) : <div />}
                          <input value={item.name} onChange={e => updateBulkItemField(oIdx, iIdx, 'name', e.target.value)} placeholder="Item Name" style={{ flex: 1, padding: '8px 10px', fontSize: '0.85rem', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--white)' }} />
                        </div>
                        <div style={{ flex: '1 1 100%', display: 'flex', gap: 8, alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid var(--border-subtle)', borderRadius: 6, overflow: 'hidden', background: 'var(--white)', padding: '2px 4px', height: 38 }}>
                            <button type="button" onClick={() => updateBulkItemField(oIdx, iIdx, 'qty', Math.max(1, Number(item.qty) - 1))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 10px', fontSize: '1rem', fontWeight: 700, color: 'var(--text)' }}>−</button>
                            <span style={{ minWidth: 20, textAlign: 'center', fontWeight: 800, fontSize: '0.85rem' }}>{item.qty}</span>
                            <button type="button" onClick={() => updateBulkItemField(oIdx, iIdx, 'qty', Number(item.qty) + 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 10px', fontSize: '1rem', fontWeight: 700, color: 'var(--text)' }}>+</button>
                          </div>
                          <input type="number" value={item.price} onChange={e => updateBulkItemField(oIdx, iIdx, 'price', e.target.value)} placeholder="Price" style={{ flex: 1, padding: '8px 10px', height: 38, fontSize: '0.85rem', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--white)' }} />
                          <button type="button" onClick={() => removeBulkItemRow(oIdx, iIdx)} style={{ background: 'none', border: 'none', color: '#991b1b', cursor: 'pointer', padding: 4 }}><Trash2 size={16}/></button>
                        </div>
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                      <button type="button" onClick={() => addBulkItemRow(oIdx)} style={{ background: 'var(--white)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '6px 12px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}><Plus size={14} /> Add Item</button>
                      <div style={{ fontWeight: 800, color: 'var(--red)', fontSize: '0.95rem' }}>Total: {fmt(total)}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="dash-drawer-footer" style={{ padding: '20px 28px', borderTop: '1px solid var(--border-subtle)', background: 'var(--white)', display: 'flex', gap: 12 }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={addBulkOrder}
            style={{ flex: 1, padding: '13px', display: 'flex', justifyContent: 'center', gap: 6, alignItems: 'center', fontWeight: 700 }}
          >
            <Plus size={16} /> New Empty Order
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleSaveBulkOrders}
            disabled={savingBulk || !bulkOrders.some(bo => bo.name.trim() && bo.phone.trim() && bo.items.some(i => i.name.trim() && Number(i.price) > 0))}
            style={{ flex: 1.5, padding: '13px', display: 'flex', justifyContent: 'center', gap: 6, alignItems: 'center', fontWeight: 700 }}
          >
            {savingBulk ? <Loader2 size={16} className="spin" /> : <><CheckCircle size={16} /> Save Valid Orders ({bulkOrders.filter(bo => bo.name.trim() && bo.phone.trim() && bo.items.some(i => i.name.trim() && Number(i.price) > 0)).length})</>}
          </button>
        </div>
      </div>
      {showBulkOrder && <div className="dash-drawer-overlay open" onClick={() => setShowBulkOrder(false)}></div>}

      {/* Floating Bulk Actions Bar (Active Orders) */}
      <BulkActionBar 
        selectedCount={selectedIds.length} 
        onDeselectAll={() => setSelectedIds([])}
        actions={[
          ...['pending', 'processing', 'shipped', 'delivered', ...(canCancelOrder ? ['cancelled'] : [])].map(st => ({
            type: 'status',
            label: st,
            onClick: () => handleBulkStatusUpdate(st)
          })),
          ...(canDeleteOrder ? [{ type: 'delete', label: 'Trash', onClick: handleBulkMoveToTrash }] : [])
        ]}
      />

      {/* Floating Bulk Actions Bar (Trash View) */}
      {canDeleteOrder && (
        <BulkActionBar 
          selectedCount={selectedTrashIds.length} 
          onDeselectAll={() => setSelectedTrashIds([])}
          isTrashView={true}
          actions={[
            { type: 'recover', label: 'Recover', onClick: handleBulkRecover },
            { type: 'delete', label: 'Delete Forever', onClick: handleBulkPermanentDelete }
          ]}
        />
      )}

      <ConfirmModal 
        isOpen={!!confirmAction} 
        onClose={() => setConfirmAction(null)} 
        {...confirmAction} 
      />
    </div>
  );
}
