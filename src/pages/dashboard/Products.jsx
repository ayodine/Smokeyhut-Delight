import React, { useState, useEffect } from 'react';
import { Package, Trash2, Edit2, Image as ImageIcon, X, FolderKanban, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../context/ToastContext';

const fmt = (n) => '₦' + n.toLocaleString();

export default function Products() {
  const [productList, setProductList] = useState([]);
  const [catList, setCatList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  const [showForm, setShowForm] = useState(false);
  const [showCatModal, setShowCatModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [editing, setEditing] = useState(null);
  
  // Frontend forms continue using standard naming
  const [form, setForm] = useState({ name: '', desc: '', price: '', category: '', image: '', badge: '', stock: '' });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [pRes, cRes] = await Promise.all([
        supabase.from('products').select('*').order('created_at', { ascending: false }),
        supabase.from('categories').select('*').order('created_at', { ascending: true })
      ]);
      if (pRes.data) setProductList(pRes.data);
      if (cRes.data) {
        setCatList(cRes.data);
        if (cRes.data.length > 0 && !form.category) {
          setForm(prev => ({ ...prev, category: cRes.data[0].id }));
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setForm({ ...form, image: reader.result });
      };
      reader.readAsDataURL(file);
    }
  };

  const stockLevel = (s) => s <= 5 ? 'low' : s <= 15 ? 'medium' : 'high';

  const openAdd = () => { setForm({ name: '', desc: '', price: '', category: catList[0]?.id || '', image: '', badge: '', stock: '' }); setEditing(null); setShowForm(true); };
  
  const openEdit = (p) => { 
    setForm({ 
      name: p.name, 
      desc: p.description || '', 
      price: String(p.price), 
      category: p.category_id || '', 
      image: p.image || '', 
      badge: p.badge || '', 
      stock: String(p.stock) 
    }); 
    setEditing(p.id); 
    setShowForm(true); 
  };

  const handleSave = async () => {
    setSaving(true);
    const data = { 
      name: form.name,
      description: form.desc,
      short_desc: form.desc.slice(0, 50),
      price: Number(form.price), 
      stock: Number(form.stock), 
      category_id: form.category,
      badge: form.badge || null,
      image: form.image || null,
      is_active: true
    };

    try {
      if (editing) {
        const { error } = await supabase.from('products').update(data).eq('id', editing);
        if (error) throw error;
        showToast('Product updated successfully');
      } else {
        const { error } = await supabase.from('products').insert([data]);
        if (error) throw error;
        showToast('Product added successfully');
      }
      await fetchData();
      setShowForm(false);
    } catch (err) {
      showToast('Failed to save product', err?.message || 'Please try again', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => { 
    if(window.confirm('Delete this product permanently?')) {
      try {
        const { error } = await supabase.from('products').delete().eq('id', id);
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

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><Loader2 className="spin" size={32} color="var(--red)" /></div>;

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

      <div className="dash-card">
        <div className="dash-table-wrapper">
          <table className="dash-table">
            <thead><tr><th>Image</th><th>Name</th><th>Category</th><th>Price</th><th>Stock</th><th>Badge</th><th>Actions</th></tr></thead>
            <tbody>
              {productList.map(p => {
                const imgSource = p.image;
                const isEmoji = imgSource && imgSource.length <= 4 && !imgSource.startsWith('data:');
                const catLabel = catList.find(c => c.id === p.category_id)?.label || p.category_id;
                
                return (
                  <tr key={p.id}>
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
                    <td style={{ fontWeight: 700 }}>{fmt(p.price)}</td>
                    <td><div className={`stock-indicator ${stockLevel(p.stock)}`}><span className="stock-dot" />{p.stock} units</div></td>
                    <td>{p.badge ? <span className={`status-badge ${p.badge}`}>{p.badge}</span> : '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => openEdit(p)} style={{ background: 'var(--black2)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Edit2 size={12} /> Edit
                        </button>
                        <button onClick={() => handleDelete(p.id)} style={{ background: '#fee2e2', border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700, color: '#991b1b', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Trash2 size={12} /> Delete
                        </button>
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
                 {form.image && !form.image.startsWith('data:') && form.image.length <= 4 ? (
                    <div style={{ fontSize: '3rem' }}>{form.image}</div>
                 ) : form.image ? (
                    <img src={form.image} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                 ) : (
                    <ImageIcon size={32} color="var(--text-muted)" />
                 )}
               </div>
               <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                 <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>Product Image/Emoji</label>
                 <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                   <input type="file" accept="image/*" onChange={handleImageUpload} style={{ fontSize: '0.85rem', flex: 1 }} />
                   <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>OR</span>
                   <input placeholder="Emoji" value={form.image} onChange={set('image')} style={{ width: 70, padding: '6px' }} />
                 </div>
                 <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 8 }}>Upload 2MB max, or paste an emoji.</p>
               </div>
            </div>

            <div className="form-group"><label>Name</label><input value={form.name} onChange={set('name')} placeholder="Product name" /></div>
            <div className="form-group"><label>Description</label><textarea value={form.desc} onChange={set('desc')} placeholder="Product description" /></div>
            <div className="form-row">
              <div className="form-group"><label>Price (₦)</label><input type="number" value={form.price} onChange={set('price')} placeholder="13500" /></div>
              <div className="form-group"><label>Stock</label><input type="number" value={form.stock} onChange={set('stock')} placeholder="20" /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Category</label>
                <select value={form.category} onChange={set('category')}>
                  {catList.length === 0 && <option value="">No categories available</option>}
                  {catList.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
              <div className="form-group"><label>Badge (optional)</label><input value={form.badge} onChange={set('badge')} placeholder="bestseller, new, hot, value" /></div>
            </div>
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
                  <button onClick={() => handleDeleteCategory(c.id)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer' }}>
                    <Trash2 size={16} />
                  </button>
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
