import React, { useState, useEffect, useMemo } from 'react';
import {
  Package, Trash2, Edit2, Image as ImageIcon, X, FolderKanban,
  Loader2, TrendingUp, Layers, Eye, EyeOff, Search, Calendar, Truck, Megaphone, Clock
} from 'lucide-react';
import { SkelDashHeader, SkelKpiGrid, SkelTable } from '../../components/Skeleton';
import Pagination from '../../components/Pagination';
import { supabase } from '../../lib/supabase';
import { invalidateProducts } from '../../lib/productsCache';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import CustomSelect from '../../components/CustomSelect';
import DashDateTimePicker from '../../components/DashDateTimePicker';
import ConfirmModal from '../../components/ConfirmModal';
import BulkActionBar from '../../components/BulkActionBar';
import { getPreorderState, validateProductPreorderConfig, formatReleaseDate } from '../../lib/preorderUtils';
import { DEFAULT_DISPATCH_CAPACITY_MESSAGE } from '../../lib/dispatchPricing';

const fmt = (n) => '₦' + Number(n || 0).toLocaleString();

function toLocalDatetimeInputValue(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function Switch({ checked, onChange, disabled = false }) {
  const width = 44;
  const height = 24;
  const thumbSize = 18;
  const translate = checked ? (width - thumbSize - 3) : 3;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled && onChange) onChange(!checked);
      }}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        width,
        height,
        padding: 0,
        borderRadius: 999,
        background: checked ? 'var(--red)' : 'rgba(0,0,0,0.15)',
        border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background-color 0.2s ease',
        flexShrink: 0,
        outline: 'none',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span
        style={{
          display: 'block',
          width: thumbSize,
          height: thumbSize,
          borderRadius: '50%',
          background: '#ffffff',
          boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
          transform: `translateX(${translate}px)`,
          transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      />
    </button>
  );
}

const EMPTY_FORM = {
  name: '',
  desc: '',
  price: '',
  compare_price: '',
  category: '',
  image: '',
  badge: '',
  is_active: true,
  free_shipping: false,
  cutoff: '',
  // Pre-order configuration
  preorder_enabled: false,
  preorder_open_at: '',
  preorder_release_date: '',
  preorder_close_at: '',
  preorder_status: 'open',
  preorder_scheduling_mode: 'schedule_after_release',
  preorder_max_capacity: '',
  preorder_reserved_qty: 0,
  preorder_message: '',
  // Homepage promotion configuration
  homepage_promo_enabled: false,
  homepage_promo_headline: '',
  homepage_promo_description: '',
  homepage_promo_cta_label: 'Pre-order Now',
  homepage_promo_start_at: '',
  homepage_promo_end_at: '',
  homepage_promo_priority: '0',
  // Dispatch-capacity surcharge configuration
  dispatch_surcharge_enabled: false,
  dispatch_threshold_qty: '5',
  dispatch_threshold_unit: 'packs',
  dispatch_threshold_operator: 'gt',
  dispatch_fee_multiplier: '2',
  dispatch_fixed_surcharge: '',
  dispatch_aggregation_mode: 'per_item',
  dispatch_customer_message: DEFAULT_DISPATCH_CAPACITY_MESSAGE,
};

export default function Products() {
  const { userRole, userPermissions } = useAuth();
  const isAdmin = userRole === 'Admin';
  const canManage = isAdmin || userRole === 'Manager' || (userPermissions || []).includes('Products:manage');
  const canDelete = isAdmin || userRole === 'Manager' || (userPermissions || []).includes('Products:delete');
  const [productList, setProductList] = useState([]);
  const [catList, setCatList] = useState([]);
  const [orderItems, setOrderItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const PER_PAGE = 15;
  const { showToast } = useToast();
  const [confirmAction, setConfirmAction] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);

  const [showForm, setShowForm] = useState(false);
  const [showCatModal, setShowCatModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [editing, setEditing] = useState(null);
  const [pendingImageFile, setPendingImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [formError, setFormError] = useState('');

  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [pRes, cRes, oiRes] = await Promise.all([
        supabase.from('products').select('*').is('deleted_at', null).order('created_at', { ascending: false }),
        supabase.from('categories').select('*').order('created_at', { ascending: true }),
        supabase.from('order_items').select('product_id, name, qty, orders!inner(status)').neq('orders.status', 'cancelled'),
      ]);
      if (pRes.data) setProductList(pRes.data);
      if (cRes.data) {
        setCatList(cRes.data);
        if (cRes.data.length > 0 && !form.category) {
          setForm(prev => ({ ...prev, category: cRes.data[0].id }));
        }
      }
      if (oiRes.data) setOrderItems(oiRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const set = (k) => (e) => {
    setFormError('');
    setForm(prev => ({ ...prev, [k]: e.target.value }));
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setPendingImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const openAdd = () => {
    setForm({
      ...EMPTY_FORM,
      category: catList[0]?.id || '',
    });
    setFormError('');
    setPendingImageFile(null);
    setImagePreview('');
    setEditing(null);
    setShowForm(true);
  };

  const openEdit = (p) => {
    setForm({
      name: p.name || '',
      desc: p.description || '',
      price: p.price != null ? String(p.price) : '',
      compare_price: p.compare_price ? String(p.compare_price) : '',
      category: p.category_id || '',
      image: p.image || '',
      badge: p.badge || '',
      is_active: p.is_active !== false,
      free_shipping: Boolean(p.free_shipping),
      cutoff: p.same_day_cutoff ? p.same_day_cutoff.slice(0, 5) : '',
      // Pre-order fields
      preorder_enabled: Boolean(p.preorder_enabled),
      preorder_open_at: toLocalDatetimeInputValue(p.preorder_open_at),
      preorder_release_date: p.preorder_release_date ? String(p.preorder_release_date).slice(0, 10) : '',
      preorder_close_at: toLocalDatetimeInputValue(p.preorder_close_at),
      preorder_status: p.preorder_status || 'open',
      preorder_scheduling_mode: p.preorder_scheduling_mode || 'schedule_after_release',
      preorder_max_capacity: p.preorder_max_capacity != null ? String(p.preorder_max_capacity) : '',
      preorder_reserved_qty: Number(p.preorder_reserved_qty) || 0,
      preorder_message: p.preorder_message || '',
      // Homepage promotion fields
      homepage_promo_enabled: Boolean(p.homepage_promo_enabled),
      homepage_promo_headline: p.homepage_promo_headline || '',
      homepage_promo_description: p.homepage_promo_description || '',
      homepage_promo_cta_label: p.homepage_promo_cta_label || 'Pre-order Now',
      homepage_promo_start_at: toLocalDatetimeInputValue(p.homepage_promo_start_at),
      homepage_promo_end_at: toLocalDatetimeInputValue(p.homepage_promo_end_at),
      homepage_promo_priority: p.homepage_promo_priority != null ? String(p.homepage_promo_priority) : '0',
      // Dispatch-capacity fields
      dispatch_surcharge_enabled: Boolean(p.dispatch_surcharge_enabled),
      dispatch_threshold_qty: p.dispatch_threshold_qty != null ? String(p.dispatch_threshold_qty) : '5',
      dispatch_threshold_unit: p.dispatch_threshold_unit || 'packs',
      dispatch_threshold_operator: p.dispatch_threshold_operator || 'gt',
      dispatch_fee_multiplier: p.dispatch_fee_multiplier != null ? String(p.dispatch_fee_multiplier) : '2',
      dispatch_fixed_surcharge: p.dispatch_fixed_surcharge != null ? String(p.dispatch_fixed_surcharge) : '',
      dispatch_aggregation_mode: p.dispatch_aggregation_mode || 'per_item',
      dispatch_customer_message: p.dispatch_customer_message || DEFAULT_DISPATCH_CAPACITY_MESSAGE,
    });
    setFormError('');
    setPendingImageFile(null);
    setImagePreview('');
    setEditing(p.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    const validation = validateProductPreorderConfig(form);
    if (!validation.valid) {
      setFormError(validation.error);
      showToast('Invalid Configuration', validation.error, 'error');
      return;
    }

    setSaving(true);
    setFormError('');

    let imageUrl = form.image || null;
    if (pendingImageFile) {
      const ext = pendingImageFile.name.split('.').pop().toLowerCase();
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(filename, pendingImageFile, { contentType: pendingImageFile.type });
      if (uploadError) {
        showToast('Image upload failed', uploadError.message, 'error');
        setSaving(false);
        return;
      }
      const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(filename);
      imageUrl = publicUrl;
    }

    const comparePrice = form.compare_price ? Number(form.compare_price) : null;
    const prevProduct = editing ? productList.find(p => p.id === editing) : null;

    const data = {
      name: form.name,
      description: form.desc,
      short_desc: form.desc.slice(0, 50),
      price: Number(form.price),
      compare_price: comparePrice && comparePrice > Number(form.price) ? comparePrice : null,
      stock: 9999,
      category_id: form.category,
      badge: form.badge || null,
      image: imageUrl,
      is_active: form.is_active,
      free_shipping: form.free_shipping,
      same_day_cutoff: form.cutoff || null,
      // Pre-order fields
      preorder_enabled: Boolean(form.preorder_enabled),
      preorder_open_at: form.preorder_enabled && form.preorder_open_at ? new Date(form.preorder_open_at).toISOString() : null,
      preorder_release_date: form.preorder_enabled && form.preorder_release_date ? form.preorder_release_date : null,
      preorder_close_at: form.preorder_enabled && form.preorder_close_at ? new Date(form.preorder_close_at).toISOString() : null,
      preorder_status: form.preorder_enabled ? (form.preorder_status || 'open') : 'scheduled',
      preorder_scheduling_mode: form.preorder_enabled ? (form.preorder_scheduling_mode || 'schedule_after_release') : 'schedule_after_release',
      preorder_max_capacity: form.preorder_enabled && form.preorder_max_capacity !== '' ? Number(form.preorder_max_capacity) : null,
      preorder_message: form.preorder_enabled && form.preorder_message.trim() ? form.preorder_message.trim() : null,
      // Homepage promo fields
      homepage_promo_enabled: Boolean(form.preorder_enabled && form.homepage_promo_enabled),
      homepage_promo_headline: form.preorder_enabled && form.homepage_promo_enabled && form.homepage_promo_headline.trim()
        ? form.homepage_promo_headline.trim()
        : null,
      homepage_promo_description: form.preorder_enabled && form.homepage_promo_enabled && form.homepage_promo_description.trim()
        ? form.homepage_promo_description.trim()
        : null,
      homepage_promo_cta_label: form.preorder_enabled && form.homepage_promo_enabled && form.homepage_promo_cta_label.trim()
        ? form.homepage_promo_cta_label.trim()
        : 'Pre-order Now',
      homepage_promo_start_at: form.preorder_enabled && form.homepage_promo_enabled && form.homepage_promo_start_at
        ? new Date(form.homepage_promo_start_at).toISOString()
        : null,
      homepage_promo_end_at: form.preorder_enabled && form.homepage_promo_enabled && form.homepage_promo_end_at
        ? new Date(form.homepage_promo_end_at).toISOString()
        : null,
      homepage_promo_priority: form.preorder_enabled && form.homepage_promo_enabled
        ? (Number(form.homepage_promo_priority) || 0)
        : 0,
      // Dispatch-capacity fields
      dispatch_surcharge_enabled: Boolean(form.dispatch_surcharge_enabled),
      dispatch_threshold_qty: form.dispatch_surcharge_enabled ? (Number(form.dispatch_threshold_qty) || 5) : 5,
      dispatch_threshold_unit: form.dispatch_surcharge_enabled ? (form.dispatch_threshold_unit || 'packs') : 'packs',
      dispatch_threshold_operator: form.dispatch_surcharge_enabled ? (form.dispatch_threshold_operator || 'gt') : 'gt',
      dispatch_fee_multiplier: form.dispatch_surcharge_enabled ? (Number(form.dispatch_fee_multiplier) || 2) : 2,
      dispatch_fixed_surcharge: form.dispatch_surcharge_enabled && form.dispatch_fixed_surcharge !== ''
        ? Number(form.dispatch_fixed_surcharge)
        : null,
      dispatch_aggregation_mode: form.dispatch_surcharge_enabled ? (form.dispatch_aggregation_mode || 'per_item') : 'per_item',
      dispatch_customer_message: form.dispatch_surcharge_enabled && form.dispatch_customer_message.trim()
        ? form.dispatch_customer_message.trim()
        : DEFAULT_DISPATCH_CAPACITY_MESSAGE,
    };

    try {
      if (editing) {
        const { data: updated, error } = await supabase.from('products').update(data).eq('id', editing).select().single();
        if (error) throw error;
        setProductList(prev => prev.map(p => p.id === editing ? updated : p));

        // If release date moved later, flag any existing pre-orders whose customer-selected delivery date is earlier than the new release date (without silently overwriting customer selections)
        if (
          data.preorder_enabled &&
          data.preorder_release_date &&
          prevProduct?.preorder_release_date &&
          data.preorder_release_date > String(prevProduct.preorder_release_date).slice(0, 10)
        ) {
          const { data: affectedItems } = await supabase
            .from('order_items')
            .select('order_id')
            .eq('product_id', editing);
          const affectedOrderIds = [...new Set((affectedItems || []).map(i => i.order_id).filter(Boolean))];
          if (affectedOrderIds.length > 0) {
            const { data: flaggedOrders } = await supabase
              .from('orders')
              .update({ preorder_date_conflict_flagged: true })
              .in('id', affectedOrderIds)
              .lt('scheduled_delivery_date', data.preorder_release_date)
              .not('status', 'in', '("cancelled","delivered")')
              .select('id');
            if (flaggedOrders && flaggedOrders.length > 0) {
              showToast(
                'Release Date Updated',
                `${flaggedOrders.length} existing pre-order(s) have a selected delivery date earlier than ${formatReleaseDate(data.preorder_release_date)} and were flagged for review.`,
                'info'
              );
            } else {
              showToast('Product updated successfully');
            }
          } else {
            showToast('Product updated successfully');
          }
        } else {
          showToast('Product updated successfully');
        }
      } else {
        const { data: inserted, error } = await supabase.from('products').insert([data]).select().single();
        if (error) throw error;
        setProductList(prev => [inserted, ...prev]);
        showToast('Product added successfully');
      }
      invalidateProducts();
      setShowForm(false);
    } catch (err) {
      showToast('Failed to save product', err?.message || 'Please try again', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (p) => {
    const { error } = await supabase.from('products').update({ is_active: !p.is_active }).eq('id', p.id);
    if (error) { showToast('Error', error.message, 'error'); return; }
    setProductList(prev => prev.map(x => x.id === p.id ? { ...x, is_active: !p.is_active } : x));
    invalidateProducts();
    showToast(p.is_active ? 'Product hidden' : 'Product visible', p.is_active ? `${p.name} is now hidden from the storefront and marked as Out of Stock` : `${p.name} is now visible on the storefront`);
  };

  const handleDelete = (id) => {
    setConfirmAction({
      title: 'Delete Product',
      message: 'Delete this product? It will be removed from the storefront.',
      onConfirm: async () => {
        setConfirmAction(prev => ({ ...prev, isLoading: true }));
        try {
          const { error } = await supabase.from('products').update({ deleted_at: new Date().toISOString() }).eq('id', id);
          if (error) throw error;
          invalidateProducts();
          setProductList(prev => prev.filter(p => p.id !== id));
          showToast('Product deleted successfully');
        } catch (err) {
          showToast('Failed to delete product', err?.message || '', 'error');
        } finally {
          setConfirmAction(null);
        }
      }
    });
  };

  const handleBulkDelete = () => {
    setConfirmAction({
      title: 'Delete Selected Products',
      message: `Delete ${selectedIds.length} products? They will be removed from the storefront.`,
      onConfirm: async () => {
        setConfirmAction(prev => ({ ...prev, isLoading: true }));
        try {
          const { error } = await supabase.from('products').update({ deleted_at: new Date().toISOString() }).in('id', selectedIds);
          if (error) throw error;
          invalidateProducts();
          setProductList(prev => prev.filter(p => !selectedIds.includes(p.id)));
          setSelectedIds([]);
          showToast('Products deleted successfully');
        } catch (err) {
          showToast('Failed to delete products', err?.message || '', 'error');
        } finally {
          setConfirmAction(null);
        }
      }
    });
  };

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    try {
      const newId = newCatName.toLowerCase().replace(/[^a-z0-9]/g, '-');
      const { data, error } = await supabase.from('categories').insert([{ id: newId, label: newCatName }]).select();
      if (error) throw error;
      if (data) {
        setCatList([...catList, data[0]]);
        if (!form.category) setForm(prev => ({ ...prev, category: newId }));
        showToast('Category added successfully');
      }
    } catch (err) {
      showToast('Failed to add category', err?.message || '', 'error');
    } finally {
      setNewCatName('');
    }
  };

  const handleDeleteCategory = (id) => {
    setConfirmAction({
      title: 'Delete Category',
      message: 'Are you sure you want to delete this category?',
      onConfirm: async () => {
        setConfirmAction(prev => ({ ...prev, isLoading: true }));
        try {
          const { error } = await supabase.from('categories').delete().eq('id', id);
          if (error) throw error;
          setCatList(catList.filter(c => c.id !== id));
          showToast('Category deleted successfully');
        } catch (err) {
          showToast('Failed to delete category', err?.message || '', 'error');
        } finally {
          setConfirmAction(null);
        }
      }
    });
  };

  // ── KPI computations ─────────────────────────────────────
  const publishedCount = useMemo(() => productList.filter(p => p.is_active !== false).length, [productList]);
  const hiddenCount    = useMemo(() => productList.filter(p => p.is_active === false).length, [productList]);

  const topSeller = useMemo(() => {
    const salesMap = {};
    orderItems.forEach(item => {
      const key = item.product_id ? String(item.product_id) : item.name;
      if (!salesMap[key]) salesMap[key] = { qty: 0, name: item.name };
      salesMap[key].qty += Number(item.qty || 0);
    });
    const entries = Object.entries(salesMap).sort((a, b) => b[1].qty - a[1].qty);
    if (!entries.length) return null;
    const [topKey, topEntry] = entries[0];
    return {
      name: productList.find(p => String(p.id) === topKey)?.name || topEntry.name,
      qty: topEntry.qty,
    };
  }, [orderItems, productList]);

  useEffect(() => { setSelectedIds([]); }, [page]);

  const filtered = useMemo(() =>
    productList.filter(p => p.name.toLowerCase().includes(search.toLowerCase())),
    [productList, search]
  );
  const pagedProducts = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  if (loading) return (
    <div>
      <SkelDashHeader hasButton />
      <SkelKpiGrid count={4} />
      <SkelTable rows={6} cols={5} />
    </div>
  );

  return (
    <div>
      {/* ── Page Header ─────────────────────────────────── */}
      <div className="dash-card-header" style={{ marginBottom: 20 }}>
        <div className="dash-card-title" style={{ fontFamily: "'Mona Sans', 'Mona-Sans', 'Helvetica Neue', sans-serif", fontSize: '1.4rem', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Package size={24} color="var(--red)" /> Product Management
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-secondary" onClick={() => setShowCatModal(true)} style={{ padding: '10px 16px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6 }}>
            <FolderKanban size={16} /> Categories
          </button>
          {canManage && <button className="btn-primary" onClick={openAdd} style={{ padding: '10px 20px', fontSize: '0.85rem' }}>+ Add Product</button>}
        </div>
      </div>

      {/* ── KPI Cards (4) ───────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <div className="kpi-card blue">
          <div className="kpi-icon"><Layers size={22} /></div>
          <div className="kpi-value">{productList.length}</div>
          <div className="kpi-label">Total Products</div>
          <div className="kpi-change up">{catList.length} categor{catList.length !== 1 ? 'ies' : 'y'}</div>
        </div>

        <div className="kpi-card green">
          <div className="kpi-icon"><Eye size={22} /></div>
          <div className="kpi-value">{publishedCount}</div>
          <div className="kpi-label">Published</div>
          <div className="kpi-change up">Visible on storefront</div>
        </div>

        <div className="kpi-card yellow">
          <div className="kpi-icon"><EyeOff size={22} /></div>
          <div className="kpi-value">{hiddenCount}</div>
          <div className="kpi-label">Hidden</div>
          <div className={`kpi-change ${hiddenCount > 0 ? 'down' : 'up'}`}>{hiddenCount > 0 ? 'Out of stock on storefront' : 'All products visible'}</div>
        </div>

        <div className="kpi-card green">
          <div className="kpi-icon"><TrendingUp size={22} /></div>
          <div className="kpi-value" style={{ fontSize: topSeller ? '1rem' : undefined, fontWeight: 900 }}>
            {topSeller ? topSeller.name : '—'}
          </div>
          <div className="kpi-label">Top Seller</div>
          <div className="kpi-change up">{topSeller ? `${topSeller.qty} units sold` : 'No sales yet'}</div>
        </div>
      </div>

      {/* ── Product Table ────────────────────────────────── */}
      <div className="dash-card">
        {/* Search bar */}
        <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 12, borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ position: 'relative', width: 320 }}>
            <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              placeholder="Search products..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              style={{
                width: '100%', padding: '9px 12px 9px 36px', borderRadius: 8,
                border: '1px solid var(--border-subtle)', background: 'var(--white)',
                fontSize: '0.85rem', color: 'var(--text)', fontFamily: 'inherit'
              }}
            />
          </div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {filtered.length} product{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="dash-table-wrapper">
          <table className="dash-table">
            <thead><tr>
              {canDelete && (
                <th style={{ width: 44, textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={pagedProducts.length > 0 && pagedProducts.every(p => selectedIds.includes(p.id))}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedIds([...new Set([...selectedIds, ...pagedProducts.map(p => p.id)])]);
                      } else {
                        setSelectedIds(selectedIds.filter(id => !pagedProducts.find(p => p.id === id)));
                      }
                    }}
                    style={{ cursor: 'pointer', accentColor: 'var(--red)' }}
                  />
                </th>
              )}
              <th style={{ width: 60 }}>Image</th>
              <th>Product</th>
              <th>Category</th>
              <th>Price</th>
              <th>Visibility</th>
              <th>Badge / Rules</th>
              {(canManage || canDelete) && <th style={{ width: 120 }}>Actions</th>}
            </tr></thead>
            <tbody>
              {pagedProducts.map(p => {
                const imgSource = p.image;
                const isEmoji = imgSource && imgSource.length <= 4 && !imgSource.startsWith('data:');
                const catLabel = catList.find(c => c.id === p.category_id)?.label || p.category_id;
                const preorderState = getPreorderState(p);

                const isSelected = selectedIds.includes(p.id);
                const finalStyle = {};
                if (isSelected) {
                  finalStyle.background = 'rgba(192, 32, 31, 0.06)';
                  finalStyle.borderLeft = '3px solid var(--red)';
                }
                if (p.is_active === false) finalStyle.opacity = 0.55;

                return (
                  <tr key={p.id} style={finalStyle}>
                    {canDelete && (
                      <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedIds([...selectedIds, p.id]);
                            else setSelectedIds(selectedIds.filter(id => id !== p.id));
                          }}
                          style={{ cursor: 'pointer', accentColor: 'var(--red)' }}
                        />
                      </td>
                    )}
                    <td style={{ textAlign: 'center' }}>
                      {isEmoji ? (
                        <div style={{ fontSize: '1.8rem' }}>{imgSource}</div>
                      ) : imgSource ? (
                         <img src={imgSource} alt={p.name} style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', border: '1px solid var(--border-subtle)' }} />
                      ) : (
                         <div style={{ width: 44, height: 44, borderRadius: 8, background: 'var(--black2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                           <ImageIcon size={20} color="var(--text-muted)" />
                         </div>
                      )}
                    </td>
                    <td>
                      <div style={{ fontWeight: 700 }}>{p.name}</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', maxWidth: 220 }}>{p.description?.slice(0, 60)}{p.description?.length > 60 ? '…' : ''}</div>
                      {p.preorder_enabled && p.preorder_release_date && (
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#92400e', marginTop: 3 }}>
                          Release: {formatReleaseDate(p.preorder_release_date)}
                        </div>
                      )}
                    </td>
                    <td style={{ fontSize: '0.82rem' }}>{catLabel}</td>
                    <td>
                      <span style={{ fontWeight: 700 }}>{fmt(p.price)}</span>
                      {p.compare_price && Number(p.compare_price) > Number(p.price) && (
                        <div style={{ textDecoration: 'line-through', color: 'var(--text-muted)', fontSize: '0.75rem' }}>{fmt(p.compare_price)}</div>
                      )}
                    </td>
                    <td>
                      <button
                        onClick={() => toggleActive(p)}
                        style={{
                          background: p.is_active !== false ? '#dcfce7' : '#fee2e2',
                          color: p.is_active !== false ? '#15803d' : '#991b1b',
                          border: `1px solid ${p.is_active !== false ? '#bbf7d0' : '#fecaca'}`,
                          padding: '4px 10px', borderRadius: 20, fontWeight: 700, fontSize: '0.78rem',
                          cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6
                        }}
                      >
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: p.is_active !== false ? '#22c55e' : '#ef4444' }} />
                        {p.is_active !== false ? 'Published' : 'Hidden'}
                      </button>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                        {p.badge ? <span className={`status-badge ${p.badge}`}>{p.badge}</span> : null}
                        {p.preorder_enabled && (
                          <span className={`status-badge ${preorderState.isPreorderActive ? 'pending' : 'info'}`}>
                            Pre-Order ({preorderState.windowState})
                          </span>
                        )}
                        {p.homepage_promo_enabled && p.preorder_enabled && (
                          <span className="status-badge info">Homepage Promo</span>
                        )}
                        {p.dispatch_surcharge_enabled && (
                          <span className="status-badge pending">
                            {p.dispatch_fee_multiplier || 2}× Dispatch ({p.dispatch_threshold_operator === 'gte' ? '≥' : '>'}{p.dispatch_threshold_qty || 5} {p.dispatch_threshold_unit || 'packs'})
                          </span>
                        )}
                        {p.free_shipping && <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#166534', background: '#dcfce7', padding: '2px 7px', borderRadius: 20 }}>Free Ship</span>}
                        {!p.badge && !p.free_shipping && !p.preorder_enabled && !p.dispatch_surcharge_enabled && '—'}
                      </div>
                    </td>
                    {(canManage || canDelete) && (
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {canManage && (
                            <button onClick={() => toggleActive(p)} title={p.is_active !== false ? 'Hide product (Out of Stock)' : 'Publish product'}
                              style={{ background: 'none', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '6px 8px', cursor: 'pointer', color: p.is_active !== false ? '#15803d' : '#dc2626', display: 'flex', alignItems: 'center' }}>
                              {p.is_active !== false ? <Eye size={15} /> : <EyeOff size={15} />}
                            </button>
                          )}
                          {canManage && (
                            <button onClick={() => openEdit(p)} title="Edit product"
                              style={{ background: 'none', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '6px 8px', cursor: 'pointer', color: 'var(--text)', display: 'flex', alignItems: 'center' }}>
                              <Edit2 size={15} />
                            </button>
                          )}
                          {canDelete && (
                            <button onClick={() => handleDelete(p.id)} title="Delete product"
                              style={{ background: 'none', border: '1px solid #fecaca', borderRadius: 6, padding: '6px 8px', cursor: 'pointer', color: '#dc2626', display: 'flex', alignItems: 'center' }}>
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                   <td colSpan={canDelete ? (canManage || canDelete ? 8 : 7) : (canManage || canDelete ? 7 : 6)} style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                     {search ? `No products matching "${search}"` : 'No products found. Add your first item!'}
                   </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={page} total={filtered.length} perPage={PER_PAGE} onChange={setPage} />
      </div>

      {/* ── Add / Edit Product Modal ─────────────────────── */}
      {showForm && (
        <div className="product-form-modal" onClick={() => setShowForm(false)}>
          <div className="product-form-card" onClick={e => e.stopPropagation()} style={{ position: 'relative', maxWidth: 600 }}>
            <h3 style={{ marginTop: 0, marginBottom: 24 }}>
              {editing ? 'Edit' : 'Add'} Product
              <button onClick={() => setShowForm(false)} className="dash-drawer-close">
                <X size={16} />
              </button>
            </h3>
            
            <div style={{ display: 'flex', gap: 20, marginBottom: 16 }}>
               <div style={{ width: 100, height: 100, borderRadius: 12, border: '2px dashed var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: 'var(--black2)' }}>
                 {(imagePreview || form.image) ? (
                    <img src={imagePreview || form.image} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                 ) : (
                    <ImageIcon size={32} color="var(--text-muted)" />
                 )}
               </div>
               <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                 <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>Product Image</label>
                 <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                   <input type="file" accept="image/*" onChange={handleImageUpload} style={{ fontSize: '0.85rem', flex: 1 }} />
                 </div>
                 <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 8 }}>Upload image, max 2MB.</p>
               </div>
            </div>

            <div className="form-group"><label>Name</label><input value={form.name} onChange={set('name')} placeholder="Product name" /></div>
            <div className="form-group"><label>Description</label><textarea value={form.desc} onChange={set('desc')} placeholder="Product description" /></div>
            <div className="form-row">
              <div className="form-group">
                <label>Price (₦)</label>
                <input type="number" value={form.price} onChange={set('price')} placeholder="13500" />
              </div>
              <div className="form-group">
                <label>Was Price (₦) <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.73rem' }}>optional</span></label>
                <input type="number" value={form.compare_price} onChange={set('compare_price')} placeholder="e.g. 18000" />
              </div>
              <div className="form-group">
                <label>Visibility</label>
                <CustomSelect
                  value={form.is_active ? 'published' : 'hidden'}
                  onChange={(e) => setForm({ ...form, is_active: e.target.value === 'published' })}
                  options={[
                    { value: 'published', label: 'Published (Visible)' },
                    { value: 'hidden', label: 'Hidden (Out of Stock)' }
                  ]}
                />
              </div>
            </div>
            {form.compare_price && Number(form.compare_price) > Number(form.price) && (
              <div style={{ marginTop: -10, marginBottom: 14, padding: '8px 12px', borderRadius: 8, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', fontSize: '0.8rem', color: '#16a34a', fontWeight: 700 }}>
                ✓ {Math.round((1 - Number(form.price) / Number(form.compare_price)) * 100)}% off — ₦{Number(form.compare_price).toLocaleString()} slashed to ₦{Number(form.price).toLocaleString()}
              </div>
            )}
            <div className="form-row">
              <div className="form-group"><label>Category</label>
                <CustomSelect
                  value={form.category}
                  onChange={set('category')}
                  options={catList.length === 0
                    ? [{ value: '', label: 'No categories available' }]
                    : catList.map(c => ({ value: c.id, label: c.label }))
                  }
                />
              </div>
              <div className="form-group"><label>Badge (optional)</label><input value={form.badge} onChange={set('badge')} placeholder="bestseller, new, hot, value" /></div>
              <div className="form-group">
                <label>Same-day cutoff <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.73rem' }}>optional</span></label>
                <input type="time" value={form.cutoff} onChange={set('cutoff')} />
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '12px 0', marginBottom: 12, borderTop: '1px solid var(--border-subtle)' }}>
              <input
                type="checkbox"
                checked={form.free_shipping}
                onChange={e => setForm({ ...form, free_shipping: e.target.checked })}
                style={{ width: 18, height: 18, accentColor: 'var(--red)', cursor: 'pointer' }}
              />
              <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>Free Shipping</span>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>— Customer pays no delivery fee when cart contains only free-shipping items</span>
            </label>

            {/* ── SECTION: PRE-ORDER MANAGEMENT ───────────────────────── */}
            <div style={{ background: 'var(--black2)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '16px', marginBottom: 14 }}>
              <div
                onClick={() => setForm(prev => ({ ...prev, preorder_enabled: !prev.preorder_enabled }))}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, cursor: 'pointer', userSelect: 'none' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(192,32,31,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Calendar size={16} color="var(--red)" />
                  </div>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text)' }}>Enable Pre-order</div>
                    <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', lineHeight: 1.35 }}>Allow customers to pre-order this product in advance with a release date</div>
                  </div>
                </div>
                <Switch
                  checked={form.preorder_enabled}
                  onChange={(v) => setForm(prev => ({ ...prev, preorder_enabled: v }))}
                />
              </div>

              {form.preorder_enabled && (
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* 1. Core Status & Release Schedule */}
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>Pre-order Status</span>
                    </label>
                    <CustomSelect
                      value={form.preorder_status}
                      onChange={set('preorder_status')}
                      options={[
                        { value: 'open', label: 'Open (Accepting Pre-orders)' },
                        { value: 'scheduled', label: 'Scheduled (Follows Opening Date)' },
                        { value: 'closed', label: 'Closed (Paused)' },
                        { value: 'completed', label: 'Completed' },
                      ]}
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>Release Date <span style={{ color: 'var(--red)' }}>*</span></span>
                    </label>
                    <DashDateTimePicker
                      includeTime={false}
                      allowClear={false}
                      value={form.preorder_release_date}
                      onChange={set('preorder_release_date')}
                      placeholder="Select release date"
                    />
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'block', marginTop: 6, lineHeight: 1.4 }}>
                      Earliest date customer delivery can begin.
                    </span>
                  </div>

                  {/* 2. Pre-order Availability Window */}
                  <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>
                      Availability Window
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span>Pre-order Opening Date & Time</span>
                        <span style={{ fontWeight: 500, color: 'var(--text-muted)', fontSize: '0.72rem', textTransform: 'none' }}>Optional</span>
                      </label>
                      <DashDateTimePicker
                        includeTime={true}
                        allowClear={true}
                        value={form.preorder_open_at}
                        onChange={set('preorder_open_at')}
                        placeholder="Select opening date & time"
                      />
                      <span style={{ fontSize: '0.73rem', color: 'var(--text-muted)', display: 'block', marginTop: 5 }}>
                        Leave blank to accept pre-orders immediately while status is Open.
                      </span>
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span>Pre-order Closing Date & Time</span>
                        <span style={{ fontWeight: 500, color: 'var(--text-muted)', fontSize: '0.72rem', textTransform: 'none' }}>Optional</span>
                      </label>
                      <DashDateTimePicker
                        includeTime={true}
                        allowClear={true}
                        value={form.preorder_close_at}
                        onChange={set('preorder_close_at')}
                        placeholder="Select closing date & time"
                      />
                      <span style={{ fontSize: '0.73rem', color: 'var(--text-muted)', display: 'block', marginTop: 5 }}>
                        Automatically closes pre-order purchasing after this date and time.
                      </span>
                    </div>
                  </div>

                  {/* 3. Fulfilment, Scheduling & Capacity */}
                  <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>
                      Fulfilment & Capacity
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label>Customer Delivery Scheduling Mode</label>
                      <CustomSelect
                        value={form.preorder_scheduling_mode}
                        onChange={set('preorder_scheduling_mode')}
                        options={[
                          { value: 'schedule_after_release', label: 'Schedule after release date (Default)' },
                          { value: 'schedule_at_checkout', label: 'Schedule at checkout (on/after release date)' },
                        ]}
                      />
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span>Maximum Pre-order Capacity</span>
                        <span style={{ fontWeight: 500, color: 'var(--text-muted)', fontSize: '0.72rem', textTransform: 'none' }}>Optional</span>
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={form.preorder_max_capacity}
                        onChange={set('preorder_max_capacity')}
                        placeholder="Unlimited — no cap on pre-order units"
                      />
                      {editing && form.preorder_reserved_qty > 0 && (
                        <span style={{ fontSize: '0.73rem', color: 'var(--text-muted)', display: 'block', marginTop: 5 }}>
                          Currently reserved: <strong>{form.preorder_reserved_qty}</strong> unit(s)
                        </span>
                      )}
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span>Customer-Facing Pre-order Message</span>
                        <span style={{ fontWeight: 500, color: 'var(--text-muted)', fontSize: '0.72rem', textTransform: 'none' }}>Optional</span>
                      </label>
                      <input
                        value={form.preorder_message}
                        onChange={set('preorder_message')}
                        placeholder="e.g. Pre-order now for December festive batch — limited birds available!"
                      />
                    </div>
                  </div>

                  {/* 4. Nested Homepage Promotion Toggle (Single-Column Layered) */}
                  <div style={{ background: 'var(--white)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '14px' }}>
                    <div
                      onClick={() => setForm(prev => ({ ...prev, homepage_promo_enabled: !prev.homepage_promo_enabled }))}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, cursor: 'pointer', userSelect: 'none' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Megaphone size={16} color="var(--red)" style={{ flexShrink: 0 }} />
                        <div>
                          <div style={{ fontWeight: 800, fontSize: '0.86rem', color: 'var(--text)' }}>Homepage Promotion Banner</div>
                          <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Feature this pre-order prominently on the storefront homepage</div>
                        </div>
                      </div>
                      <Switch
                        checked={form.homepage_promo_enabled}
                        onChange={(v) => setForm(prev => ({ ...prev, homepage_promo_enabled: v }))}
                      />
                    </div>

                    {form.homepage_promo_enabled && (
                      <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span>Promotion Headline</span>
                            <span style={{ fontWeight: 500, color: 'var(--text-muted)', fontSize: '0.72rem', textTransform: 'none' }}>Optional</span>
                          </label>
                          <input
                            value={form.homepage_promo_headline}
                            onChange={set('homepage_promo_headline')}
                            placeholder={form.name || 'Pre-Order Special'}
                          />
                        </div>

                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span>Promotion Description</span>
                            <span style={{ fontWeight: 500, color: 'var(--text-muted)', fontSize: '0.72rem', textTransform: 'none' }}>Optional</span>
                          </label>
                          <input
                            value={form.homepage_promo_description}
                            onChange={set('homepage_promo_description')}
                            placeholder="Short promotional copy shown on the homepage banner"
                          />
                        </div>

                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label>CTA Button Label</label>
                          <input
                            value={form.homepage_promo_cta_label}
                            onChange={set('homepage_promo_cta_label')}
                            placeholder="Pre-order Now"
                          />
                        </div>

                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span>Promo Display Start Date & Time</span>
                            <span style={{ fontWeight: 500, color: 'var(--text-muted)', fontSize: '0.72rem', textTransform: 'none' }}>Optional</span>
                          </label>
                          <DashDateTimePicker
                            includeTime={true}
                            allowClear={true}
                            value={form.homepage_promo_start_at}
                            onChange={set('homepage_promo_start_at')}
                            placeholder="Select promo start date & time"
                          />
                        </div>

                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span>Promo Display End Date & Time</span>
                            <span style={{ fontWeight: 500, color: 'var(--text-muted)', fontSize: '0.72rem', textTransform: 'none' }}>Optional</span>
                          </label>
                          <DashDateTimePicker
                            includeTime={true}
                            allowClear={true}
                            value={form.homepage_promo_end_at}
                            onChange={set('homepage_promo_end_at')}
                            placeholder="Select promo end date & time"
                          />
                        </div>

                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label>Display Priority</label>
                          <input
                            type="number"
                            value={form.homepage_promo_priority}
                            onChange={set('homepage_promo_priority')}
                            placeholder="0 (Higher number appears first)"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* ── SECTION: DISPATCH-CAPACITY PRICING ──────────────────── */}
            <div style={{ background: 'var(--black2)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '16px', marginBottom: 18 }}>
              <div
                onClick={() => setForm(prev => ({ ...prev, dispatch_surcharge_enabled: !prev.dispatch_surcharge_enabled }))}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, cursor: 'pointer', userSelect: 'none' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(192,32,31,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Truck size={16} color="var(--red)" />
                  </div>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text)' }}>Dispatch-Capacity Delivery Surcharge</div>
                    <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', lineHeight: 1.35 }}>Double or adjust delivery fee when large pack quantities occupy a full rider dispatch box</div>
                  </div>
                </div>
                <Switch
                  checked={form.dispatch_surcharge_enabled}
                  onChange={(v) => setForm(prev => ({ ...prev, dispatch_surcharge_enabled: v }))}
                />
              </div>

              {form.dispatch_surcharge_enabled && (
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Threshold Condition</label>
                    <CustomSelect
                      value={form.dispatch_threshold_operator}
                      onChange={set('dispatch_threshold_operator')}
                      options={[
                        { value: 'gt', label: 'Greater than (>) — e.g. > 5 packs' },
                        { value: 'gte', label: 'Greater than or equal (≥) — e.g. ≥ 5 packs' },
                      ]}
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Threshold Quantity</label>
                    <input
                      type="number"
                      min="1"
                      value={form.dispatch_threshold_qty}
                      onChange={set('dispatch_threshold_qty')}
                      placeholder="5"
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Unit Type</label>
                    <CustomSelect
                      value={form.dispatch_threshold_unit}
                      onChange={set('dispatch_threshold_unit')}
                      options={[
                        { value: 'packs', label: 'Packs' },
                        { value: 'birds', label: 'Birds' },
                        { value: 'items', label: 'Items' },
                      ]}
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Delivery Fee Multiplier (e.g. 2 for 2×)</label>
                    <input
                      type="number"
                      step="0.5"
                      min="1"
                      value={form.dispatch_fee_multiplier}
                      onChange={set('dispatch_fee_multiplier')}
                      placeholder="2"
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>Extra Fixed Surcharge (₦)</span>
                      <span style={{ fontWeight: 500, color: 'var(--text-muted)', fontSize: '0.72rem', textTransform: 'none' }}>Optional</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={form.dispatch_fixed_surcharge}
                      onChange={set('dispatch_fixed_surcharge')}
                      placeholder="0"
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Cart Count Mode</label>
                    <CustomSelect
                      value={form.dispatch_aggregation_mode}
                      onChange={set('dispatch_aggregation_mode')}
                      options={[
                        { value: 'per_item', label: 'Per Product in Cart' },
                        { value: 'combined_compatible', label: 'Combined Across Compatible Items' },
                      ]}
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Customer Dispatch-Box Warning Message</label>
                    <textarea
                      value={form.dispatch_customer_message}
                      onChange={set('dispatch_customer_message')}
                      style={{ height: 78 }}
                      placeholder={DEFAULT_DISPATCH_CAPACITY_MESSAGE}
                    />
                  </div>
                </div>
              )}
            </div>

            {formError && (
              <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 8, background: '#fee2e2', color: '#991b1b', fontSize: '0.82rem', fontWeight: 700 }}>
                {formError}
              </div>
            )}

            <button className="btn-primary" onClick={handleSave} disabled={saving || !form.name || !form.category} style={{ width: '100%', justifyContent: 'center', padding: '14px' }}>
              {saving ? <Loader2 size={16} className="spin" /> : editing ? 'Save Changes' : 'Add Product'}
            </button>
          </div>
        </div>
      )}

      {/* ── Categories Modal ─────────────────────────────── */}
      {showCatModal && (
        <div className="product-form-modal" onClick={() => setShowCatModal(false)}>
          <div className="product-form-card" onClick={e => e.stopPropagation()} style={{ position: 'relative', maxWidth: 400 }}>
            <h3 style={{ marginTop: 0, marginBottom: 24 }}>
              Manage Categories
              <button onClick={() => setShowCatModal(false)} className="dash-drawer-close">
                <X size={16} />
              </button>
            </h3>
            <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
              <input value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="New category name..." style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }} />
              <button className="btn-primary" onClick={handleAddCategory} style={{ padding: '8px 16px' }}>Add</button>
            </div>
            <div style={{ background: 'var(--black2)', borderRadius: '12px', padding: '12px', maxHeight: '300px', overflowY: 'auto' }}>
              {catList.map(c => (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 8px', borderBottom: '1px solid var(--border-subtle)' }}>
                  <span style={{ fontWeight: 600 }}>{c.label}</span>
                  {isAdmin && (
                    <button onClick={() => handleDeleteCategory(c.id)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer' }}>
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
              {catList.length === 0 && <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>No categories created yet.</div>}
            </div>
          </div>
        </div>
      )}

      <BulkActionBar 
        selectedCount={selectedIds.length} 
        onDeselectAll={() => setSelectedIds([])}
        actions={[{ type: 'delete', onClick: handleBulkDelete }]}
      />

      <ConfirmModal 
        isOpen={!!confirmAction} 
        onClose={() => setConfirmAction(null)} 
        {...confirmAction} 
      />
    </div>
  );
}
