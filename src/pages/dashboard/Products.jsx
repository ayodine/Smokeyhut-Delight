import React, { useState, useEffect, useMemo } from 'react';
import { Package, Trash2, Edit2, Image as ImageIcon, X, FolderKanban, Loader2, AlertTriangle, TrendingUp, DollarSign, BarChart2, Layers } from 'lucide-react';
import { SkelList, SkelKpiGrid } from '../../components/Skeleton';
import Pagination from '../../components/Pagination';
import { supabase } from '../../lib/supabase';
import { invalidateProducts } from '../../lib/productsCache';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';

const fmt = (n) => '₦' + n.toLocaleString();

export default function Products() {
  const { userRole } = useAuth();
  const isAdmin = userRole === 'Admin';
  const [productList, setProductList] = useState([]);
  const [catList, setCatList] = useState([]);
  const [orderItems, setOrderItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const PER_PAGE = 15;
  const { showToast } = useToast();

  const [showForm, setShowForm] = useState(false);
  const [showCatModal, setShowCatModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [editing, setEditing] = useState(null);
  const [pendingImageFile, setPendingImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');

  // Frontend forms continue using standard naming
  const [form, setForm] = useState({ name: '', desc: '', price: '', compare_price: '', category: '', image: '', badge: '', stock: '', free_shipping: false });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [pRes, cRes, oiRes] = await Promise.all([
        supabase.from('products').select('id,name,description,short_desc,price,compare_price,stock,category_id,badge,image,is_active,free_shipping,created_at').is('deleted_at', null).order('created_at', { ascending: false }),
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

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setPendingImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const stockLevel = (s) => s <= 5 ? 'low' : s <= 15 ? 'medium' : 'high';

  const openAdd = () => {
    setForm({ name: '', desc: '', price: '', compare_price: '', category: catList[0]?.id || '', image: '', badge: '', stock: '', free_shipping: false });
    setPendingImageFile(null);
    setImagePreview('');
    setEditing(null);
    setShowForm(true);
  };

  const openEdit = (p) => {
    setForm({
      name: p.name,
      desc: p.description || '',
      price: String(p.price),
      compare_price: p.compare_price ? String(p.compare_price) : '',
      category: p.category_id || '',
      image: p.image || '',
      badge: p.badge || '',
      stock: String(p.stock),
      free_shipping: p.free_shipping || false,
    });
    setPendingImageFile(null);
    setImagePreview('');
    setEditing(p.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    setSaving(true);

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
    const data = {
      name: form.name,
      description: form.desc,
      short_desc: form.desc.slice(0, 50),
      price: Number(form.price),
      compare_price: comparePrice && comparePrice > Number(form.price) ? comparePrice : null,
      stock: Number(form.stock),
      category_id: form.category,
      badge: form.badge || null,
      image: imageUrl,
      is_active: true,
      free_shipping: form.free_shipping,
    };

    try {
      if (editing) {
        const { data: updated, error } = await supabase.from('products').update(data).eq('id', editing).select().single();
        if (error) throw error;
        setProductList(prev => prev.map(p => p.id === editing ? updated : p));
        showToast('Product updated successfully');
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

  const handleDelete = async (id) => {
    if(window.confirm('Delete this product? It will be hidden from the storefront.')) {
      try {
        const { error } = await supabase.from('products').update({ deleted_at: new Date().toISOString() }).eq('id', id);
        if (error) throw error;
        setProductList(prev => prev.filter(p => p.id !== id));
        showToast('Product deleted successfully');
      } catch (err) {
        showToast('Failed to delete product', err?.message || '', 'error');
      }
    }
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

  const handleDeleteCategory = async (id) => {
    if(window.confirm('Delete category?')) {
      try {
        const { error } = await supabase.from('categories').delete().eq('id', id);
        if (error) throw error;
        setCatList(catList.filter(c => c.id !== id));
        showToast('Category deleted successfully');
      } catch (err) {
        showToast('Failed to delete category', err?.message || '', 'error');
      }
    }
  };

  // ── KPI computations ─────────────────────────────────────
  const outOfStock   = useMemo(() => productList.filter(p => Number(p.stock) === 0), [productList]);
  const lowStock     = useMemo(() => productList.filter(p => Number(p.stock) > 0 && Number(p.stock) <= 5), [productList]);
  const inventoryVal = useMemo(() => productList.reduce((s, p) => s + Number(p.price || 0) * Number(p.stock || 0), 0), [productList]);
  const priciest     = useMemo(() => productList.reduce((top, p) => (!top || Number(p.price) > Number(top.price) ? p : top), null), [productList]);

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

  const pagedProducts = productList.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  if (loading) return (
    <div>
      <SkelKpiGrid count={6} />
      <SkelList rows={6} height={80} />
    </div>
  );

  return (
    <div>
      <div className="dash-card-header" style={{ marginBottom: 20 }}>
        <div className="dash-card-title" style={{ fontFamily: "'Mona Sans', 'Mona-Sans', 'Helvetica Neue', sans-serif", fontSize: '1.4rem', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Package size={24} color="var(--red)" /> Product Management
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button className="btn-secondary" onClick={() => setShowCatModal(true)} style={{ padding: '10px 16px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6 }}>
            <FolderKanban size={16} /> Categories
          </button>
          <button className="btn-primary" onClick={openAdd} style={{ padding: '10px 20px', fontSize: '0.85rem' }}>+ Add Product</button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <div className="kpi-card blue">
          <div className="kpi-icon"><Layers size={22} /></div>
          <div className="kpi-value">{productList.length}</div>
          <div className="kpi-label">Total Products</div>
          <div className="kpi-change up">{catList.length} categor{catList.length !== 1 ? 'ies' : 'y'}</div>
        </div>

        <div className="kpi-card red">
          <div className="kpi-icon"><AlertTriangle size={22} /></div>
          <div className="kpi-value">{outOfStock.length}</div>
          <div className="kpi-label">Out of Stock</div>
          <div className="kpi-change down">{outOfStock.length > 0 ? 'Needs restocking' : 'All stocked'}</div>
        </div>

        <div className="kpi-card yellow">
          <div className="kpi-icon"><Package size={22} /></div>
          <div className="kpi-value">{lowStock.length}</div>
          <div className="kpi-label">Low Stock</div>
          <div className="kpi-change down">≤ 5 units remaining</div>
        </div>

        <div className="kpi-card green">
          <div className="kpi-icon"><TrendingUp size={22} /></div>
          <div className="kpi-value" style={{ fontSize: topSeller ? '1rem' : undefined, fontWeight: 900 }}>
            {topSeller ? topSeller.name : '—'}
          </div>
          <div className="kpi-label">Top Seller</div>
          <div className="kpi-change up">{topSeller ? `${topSeller.qty} units sold` : 'No sales yet'}</div>
        </div>

        <div className="kpi-card red">
          <div className="kpi-icon"><DollarSign size={22} /></div>
          <div className="kpi-value" style={{ fontSize: '1rem' }}>
            {priciest ? priciest.name : '—'}
          </div>
          <div className="kpi-label">Highest Priced</div>
          <div className="kpi-change up">{priciest ? fmt(priciest.price) : '—'}</div>
        </div>

        <div className="kpi-card green">
          <div className="kpi-icon"><BarChart2 size={22} /></div>
          <div className="kpi-value" style={{ fontSize: '1.1rem' }}>{fmt(inventoryVal)}</div>
          <div className="kpi-label">Inventory Value</div>
          <div className="kpi-change up">price × stock</div>
        </div>
      </div>

      {/* Low stock / out-of-stock alert strip */}
      {(outOfStock.length > 0 || lowStock.length > 0) && (
        <div style={{ background: '#fef9c3', border: '1px solid #fcd34d', borderRadius: 10, padding: '12px 18px', marginBottom: 20, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <AlertTriangle size={18} color="#92400e" style={{ marginTop: 1, flexShrink: 0 }} />
          <div style={{ fontSize: '0.84rem', color: '#78350f', lineHeight: 1.6 }}>
            <strong>Stock alert:</strong>{' '}
            {outOfStock.length > 0 && <span><strong>{outOfStock.map(p => p.name).join(', ')}</strong> {outOfStock.length === 1 ? 'is' : 'are'} out of stock. </span>}
            {lowStock.length > 0 && <span><strong>{lowStock.map(p => p.name).join(', ')}</strong> {lowStock.length === 1 ? 'is' : 'are'} running low (≤ 5 units).</span>}
          </div>
        </div>
      )}

      <div className="dash-card">
        <div className="dash-table-wrapper">
          <table className="dash-table">
            <thead><tr><th>Image</th><th>Name</th><th>Category</th><th>Price</th><th>Stock</th><th>Badge</th><th>Actions</th></tr></thead>
            <tbody>
              {pagedProducts.map(p => {
                const imgSource = p.image;
                const isEmoji = imgSource && imgSource.length <= 4 && !imgSource.startsWith('data:');
                const catLabel = catList.find(c => c.id === p.category_id)?.label || p.category_id;
                const stockNum = Number(p.stock);
                const rowStyle = stockNum === 0
                  ? { background: 'rgba(239,68,68,0.05)' }
                  : stockNum <= 5
                  ? { background: 'rgba(251,191,36,0.06)' }
                  : {};

                return (
                  <tr key={p.id} style={rowStyle}>
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
                    <td><div style={{ fontWeight: 700 }}>{p.name}</div><div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', maxWidth: 200 }}>{p.description?.slice(0, 60)}...</div></td>
                    <td style={{ fontSize: '0.82rem' }}>{catLabel}</td>
                    <td>
                      <span style={{ fontWeight: 700 }}>{fmt(p.price)}</span>
                      {p.compare_price && Number(p.compare_price) > Number(p.price) && (
                        <div style={{ textDecoration: 'line-through', color: 'var(--text-muted)', fontSize: '0.75rem' }}>{fmt(p.compare_price)}</div>
                      )}
                    </td>
                    <td><div className={`stock-indicator ${stockLevel(p.stock)}`}><span className="stock-dot" />{p.stock} units</div></td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {p.badge ? <span className={`status-badge ${p.badge}`}>{p.badge}</span> : null}
                        {p.free_shipping && <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#166534', background: '#dcfce7', padding: '2px 7px', borderRadius: 20 }}>Free Ship</span>}
                        {!p.badge && !p.free_shipping && '—'}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => openEdit(p)} style={{ background: 'var(--black2)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Edit2 size={12} /> Edit
                        </button>
                        {isAdmin && (
                          <button onClick={() => handleDelete(p.id)} style={{ background: '#fee2e2', border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700, color: '#991b1b', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Trash2 size={12} /> Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {productList.length === 0 && (
                <tr>
                   <td colSpan="7" style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>No products found. Add your first item!</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={page} total={productList.length} perPage={PER_PAGE} onChange={setPage} />
      </div>

      {showForm && (
        <div className="product-form-modal" onClick={() => setShowForm(false)}>
          <div className="product-form-card" onClick={e => e.stopPropagation()} style={{ position: 'relative' }}>
            <button 
              onClick={() => setShowForm(false)}
              style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
            >
              <X size={24} />
            </button>
            
            <h3 style={{ marginTop: 0, marginBottom: 24, fontSize: '1.2rem', fontFamily: "'Mona Sans', 'Mona-Sans', 'Helvetica Neue', sans-serif" }}>
              {editing ? 'Edit' : 'Add'} Product
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
                <label>Stock</label>
                <input type="number" value={form.stock} onChange={set('stock')} placeholder="20" />
              </div>
            </div>
            {form.compare_price && Number(form.compare_price) > Number(form.price) && (
              <div style={{ marginTop: -10, marginBottom: 14, padding: '8px 12px', borderRadius: 8, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', fontSize: '0.8rem', color: '#16a34a', fontWeight: 700 }}>
                ✓ {Math.round((1 - Number(form.price) / Number(form.compare_price)) * 100)}% off — ₦{Number(form.compare_price).toLocaleString()} slashed to ₦{Number(form.price).toLocaleString()}
              </div>
            )}
            <div className="form-row">
              <div className="form-group"><label>Category</label>
                <select value={form.category} onChange={set('category')} style={{ width: '100%', padding: '12px 36px 12px 16px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--black)', color: 'var(--text)', fontSize: '0.9rem', fontFamily: "'DM Sans', sans-serif", outline: 'none', WebkitAppearance: 'none', appearance: 'none', cursor: 'pointer', backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%235C5247' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}>
                  {catList.length === 0 && <option value="">No categories available</option>}
                  {catList.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
              <div className="form-group"><label>Badge (optional)</label><input value={form.badge} onChange={set('badge')} placeholder="bestseller, new, hot, value" /></div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '12px 0', marginBottom: 16, borderTop: '1px solid var(--border-subtle)' }}>
              <input
                type="checkbox"
                checked={form.free_shipping}
                onChange={e => setForm({ ...form, free_shipping: e.target.checked })}
                style={{ width: 18, height: 18, accentColor: 'var(--red)', cursor: 'pointer' }}
              />
              <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>Free Shipping</span>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>— Customer pays no delivery fee when cart contains only free-shipping items</span>
            </label>
            <button className="btn-primary" onClick={handleSave} disabled={saving || !form.name || !form.category} style={{ width: '100%', justifyContent: 'center', padding: '14px' }}>
              {saving ? <Loader2 size={16} className="spin" /> : editing ? 'Save Changes' : 'Add Product'}
            </button>
          </div>
        </div>
      )}

      {showCatModal && (
        <div className="product-form-modal" onClick={() => setShowCatModal(false)}>
          <div className="product-form-card" onClick={e => e.stopPropagation()} style={{ position: 'relative', maxWidth: 400 }}>
            <button onClick={() => setShowCatModal(false)} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
              <X size={24} />
            </button>
            <h3 style={{ marginTop: 0, marginBottom: 24, fontSize: '1.2rem', fontFamily: "'Mona Sans', 'Mona-Sans', 'Helvetica Neue', sans-serif" }}>
              Manage Categories
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
    </div>
  );
}
