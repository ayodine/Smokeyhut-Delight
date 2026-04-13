import { useState, useEffect } from 'react';
import { Plus, Trash2, Loader2, FolderOpen, Receipt, Edit2, Check, X } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useToast } from '../../../context/ToastContext';
import { SkelList } from '../../../components/Skeleton';

const fmt = v => `₦${Number(v || 0).toLocaleString('en-NG')}`;

const EMPTY_EXPENSE  = { category_id: '', amount: '', date: new Date().toISOString().split('T')[0], note: '' };
const EMPTY_CATEGORY = { name: '', description: '' };

const SELECT_STYLE = {
  width: '100%', padding: '12px 36px 12px 16px', borderRadius: 8,
  border: '1px solid var(--border-subtle)', background: 'var(--black)',
  color: 'var(--text)', fontSize: '0.9rem', fontFamily: "'DM Sans',sans-serif",
  outline: 'none', WebkitAppearance: 'none', appearance: 'none', cursor: 'pointer',
  backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%235C5247' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E\")",
  backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center',
};

export default function Expenses() {
  const [tab, setTab]             = useState('expenses'); // 'expenses' | 'categories'
  const [expenses, setExpenses]   = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('expense'); // 'expense' | 'category'
  const [form, setForm]           = useState(EMPTY_EXPENSE);
  const [catForm, setCatForm]     = useState(EMPTY_CATEGORY);
  const [saving, setSaving]       = useState(false);
  const [deleting, setDeleting]   = useState(null);
  const [editingCatId, setEditingCatId] = useState(null);
  const [editingCatVal, setEditingCatVal] = useState('');
  const { showToast } = useToast();

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    const [{ data: exp }, { data: cats }] = await Promise.all([
      supabase.from('expenses').select('*, expense_categories(name)').order('date', { ascending: false }),
      supabase.from('expense_categories').select('*').order('name'),
    ]);
    if (exp)  setExpenses(exp);
    if (cats) setCategories(cats);
    setLoading(false);
  };

  const openExpenseModal  = () => { setForm(EMPTY_EXPENSE);  setModalType('expense');  setShowModal(true); };
  const openCategoryModal = () => { setCatForm(EMPTY_CATEGORY); setModalType('category'); setShowModal(true); };
  const closeModal        = () => { setShowModal(false); };

  const saveExpense = async () => {
    if (!form.amount || !form.date) {
      showToast('Missing fields', 'Amount and date are required', 'error'); return;
    }
    setSaving(true);
    const { error } = await supabase.from('expenses').insert({
      category_id: form.category_id || null,
      amount: Number(form.amount),
      date:   form.date,
      note:   form.note.trim() || null,
    });
    setSaving(false);
    if (error) { showToast('Failed', error.message, 'error'); return; }
    showToast('Expense added', '', 'success');
    closeModal();
    fetchAll();
  };

  const saveCategory = async () => {
    if (!catForm.name.trim()) {
      showToast('Name required', 'Enter a category name', 'error'); return;
    }
    setSaving(true);
    const { error } = await supabase.from('expense_categories').insert({
      name:        catForm.name.trim(),
      description: catForm.description.trim() || null,
    });
    setSaving(false);
    if (error) { showToast('Failed', error.message, 'error'); return; }
    showToast('Category created', '', 'success');
    closeModal();
    fetchAll();
  };

  const deleteExpense = async (id) => {
    if (!window.confirm('Delete this expense?')) return;
    setDeleting(id);
    await supabase.from('expenses').delete().eq('id', id);
    setExpenses(prev => prev.filter(e => e.id !== id));
    setDeleting(null);
  };

  const deleteCategory = async (id) => {
    if (!window.confirm('Delete this category? Expenses in it will become uncategorised.')) return;
    setDeleting(id);
    await supabase.from('expense_categories').delete().eq('id', id);
    setCategories(prev => prev.filter(c => c.id !== id));
    setDeleting(null);
  };

  const startEditCat = (cat) => { setEditingCatId(cat.id); setEditingCatVal(cat.name); };
  const saveEditCat  = async (id) => {
    if (!editingCatVal.trim()) return;
    await supabase.from('expense_categories').update({ name: editingCatVal.trim() }).eq('id', id);
    setCategories(prev => prev.map(c => c.id === id ? { ...c, name: editingCatVal.trim() } : c));
    setEditingCatId(null);
  };

  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);

  if (loading) return <SkelList rows={5} height={72} />;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontFamily: "'Mona Sans','Mona-Sans','Helvetica Neue',sans-serif", fontSize: '1.4rem', fontWeight: 900, marginBottom: 4 }}>Expenses</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Track business costs and expense categories.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={openCategoryModal} style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--white)', color: 'var(--text)', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <FolderOpen size={15} /> New Category
          </button>
          <button onClick={openExpenseModal} className="btn-primary" style={{ padding: '9px 16px', fontSize: '0.85rem' }}>
            <Plus size={15} style={{ marginRight: 6 }} /> Add Expense
          </button>
        </div>
      </div>

      {/* Summary strip */}
      <div style={{ background: 'var(--white)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '16px 24px', marginBottom: 24, display: 'flex', gap: 32, flexWrap: 'wrap', boxShadow: 'var(--shadow)' }}>
        <div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Expenses</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--red)' }}>{fmt(totalExpenses)}</div>
        </div>
        <div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Records</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 900 }}>{expenses.length}</div>
        </div>
        <div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Categories</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 900 }}>{categories.length}</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'var(--black2)', borderRadius: 10, padding: 4, width: 'fit-content' }}>
        {[{ key: 'expenses', label: 'Expenses' }, { key: 'categories', label: 'Categories' }].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer',
              fontWeight: 700, fontSize: '0.85rem', fontFamily: "'DM Sans',sans-serif",
              background: tab === t.key ? 'var(--white)' : 'transparent',
              color: tab === t.key ? 'var(--text)' : 'var(--text-muted)',
              boxShadow: tab === t.key ? 'var(--shadow)' : 'none',
              transition: 'all 0.15s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── EXPENSES TAB ── */}
      {tab === 'expenses' && (
        <div className="dash-card">
          <div style={{ overflowX: 'auto' }}>
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Category</th>
                  <th>Amount</th>
                  <th>Note</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map(e => (
                  <tr key={e.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{new Date(e.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                    <td>
                      {e.expense_categories?.name
                        ? <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: '0.76rem', fontWeight: 700, background: '#eff6ff', color: '#1d4ed8' }}>{e.expense_categories.name}</span>
                        : <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Uncategorised</span>
                      }
                    </td>
                    <td style={{ fontWeight: 800, color: 'var(--red)' }}>{fmt(e.amount)}</td>
                    <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)', maxWidth: 240 }}>{e.note || '—'}</td>
                    <td style={{ textAlign: 'right' }}>
                      {deleting === e.id
                        ? <Loader2 size={15} className="spin" color="var(--red)" />
                        : <button onClick={() => deleteExpense(e.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)' }}>
                            <Trash2 size={15} />
                          </button>
                      }
                    </td>
                  </tr>
                ))}
                {expenses.length === 0 && (
                  <tr><td colSpan="5" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No expenses recorded yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── CATEGORIES TAB ── */}
      {tab === 'categories' && (
        <div className="dash-card">
          <div style={{ overflowX: 'auto' }}>
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Category Name</th>
                  <th>Description</th>
                  <th>Expenses</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {categories.map(cat => (
                  <tr key={cat.id}>
                    <td style={{ fontWeight: 700 }}>
                      {editingCatId === cat.id ? (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <input
                            value={editingCatVal}
                            onChange={e => setEditingCatVal(e.target.value)}
                            style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border-subtle)', fontSize: '0.88rem', fontFamily: "'DM Sans',sans-serif", outline: 'none', background: 'var(--black)' }}
                            autoFocus
                          />
                          <button onClick={() => saveEditCat(cat.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#16a34a' }}><Check size={15} /></button>
                          <button onClick={() => setEditingCatId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={15} /></button>
                        </div>
                      ) : cat.name}
                    </td>
                    <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{cat.description || '—'}</td>
                    <td style={{ fontWeight: 700 }}>{expenses.filter(e => e.category_id === cat.id).length}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button onClick={() => startEditCat(cat)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><Edit2 size={14} /></button>
                        {deleting === cat.id
                          ? <Loader2 size={15} className="spin" color="var(--red)" />
                          : <button onClick={() => deleteCategory(cat.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)' }}><Trash2 size={15} /></button>
                        }
                      </div>
                    </td>
                  </tr>
                ))}
                {categories.length === 0 && (
                  <tr><td colSpan="4" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No categories yet. Create one above.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── MODAL ── */}
      {showModal && (
        <div className="product-form-modal">
          <div className="product-form-card" style={{ maxWidth: 460 }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              {modalType === 'expense' ? <Receipt size={20} color="var(--red)" /> : <FolderOpen size={20} color="var(--red)" />}
              {modalType === 'expense' ? 'Add Expense' : 'New Category'}
            </h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 24 }}>
              {modalType === 'expense' ? 'Record a new business expense.' : 'Create an expense category to organise your costs.'}
            </p>

            {modalType === 'expense' ? (
              <>
                <div className="form-group">
                  <label>Category</label>
                  <select value={form.category_id} onChange={e => setForm(p => ({ ...p, category_id: e.target.value }))} style={SELECT_STYLE}>
                    <option value="">— Uncategorised —</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Amount (₦) *</label>
                    <input
                      type="number" min="0" value={form.amount}
                      onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
                      placeholder="5000"
                    />
                  </div>
                  <div className="form-group">
                    <label>Date *</label>
                    <input
                      type="date" value={form.date}
                      onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Additional Note <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span></label>
                  <textarea
                    value={form.note}
                    onChange={e => setForm(p => ({ ...p, note: e.target.value }))}
                    placeholder="e.g. Gas refill for kitchen, staff transport..."
                    style={{ height: 80 }}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="form-group">
                  <label>Category Name *</label>
                  <input value={catForm.name} onChange={e => setCatForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Ingredients, Utilities, Transport" />
                </div>
                <div className="form-group">
                  <label>Description <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span></label>
                  <textarea
                    value={catForm.description}
                    onChange={e => setCatForm(p => ({ ...p, description: e.target.value }))}
                    placeholder="Brief description of what this category covers..."
                    style={{ height: 80 }}
                  />
                </div>
              </>
            )}

            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
              <button onClick={closeModal} style={{ flex: 1, padding: 12, background: 'var(--black2)', border: '1px solid var(--border-subtle)', borderRadius: 8, cursor: 'pointer', fontWeight: 700, color: 'var(--text)' }}>
                Cancel
              </button>
              <button
                onClick={modalType === 'expense' ? saveExpense : saveCategory}
                disabled={saving}
                className="btn-primary"
                style={{ flex: 1, justifyContent: 'center' }}
              >
                {saving ? <><Loader2 size={15} className="spin" style={{ marginRight: 8 }} />Saving...</> : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
