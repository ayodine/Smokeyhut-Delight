import { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, Loader2, FolderOpen, Receipt, Edit2, Check, X, ChevronUp, ChevronDown, DollarSign, Hash, Tag, TrendingDown } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useToast } from '../../../context/ToastContext';
import { SkelDashHeader, SkelFilterPills, SkelKpiGrid, SkelTable } from '../../../components/Skeleton';
import Pagination from '../../../components/Pagination';
import CustomSelect from '../../../components/CustomSelect';
import ConfirmModal from '../../../components/ConfirmModal';

const fmt = v => `₦${Number(v || 0).toLocaleString('en-NG')}`;

const EMPTY_EXPENSE  = { category_id: '', amount: '', date: new Date().toISOString().split('T')[0], note: '' };
const EMPTY_CATEGORY = { name: '', description: '' };

const PERIODS = [
  { label: 'Today',      value: 'today' },
  { label: 'This Week',  value: 'week' },
  { label: 'This Month', value: 'month' },
  { label: 'This Year',  value: 'year' },
  { label: 'All Time',   value: 'all' },
];

function getStartDateStr(period) {
  const now = new Date();
  switch (period) {
    case 'today': return now.toISOString().split('T')[0];
    case 'week': { const d = new Date(now); d.setDate(now.getDate() - ((now.getDay() + 6) % 7)); return d.toISOString().split('T')[0]; }
    case 'month': return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    case 'year': return `${now.getFullYear()}-01-01`;
    default: return null;
  }
}

const SELECT_STYLE = {
  width: '100%', padding: '12px 36px 12px 16px', borderRadius: 8,
  border: '1px solid var(--border-subtle)', background: 'var(--black)',
  color: 'var(--text)', fontSize: '0.9rem', fontFamily: "'DM Sans',sans-serif",
  outline: 'none', WebkitAppearance: 'none', appearance: 'none', cursor: 'pointer',
  backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%235C5247' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E\")",
  backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center',
};

import { useAuth } from '../../../context/AuthContext';

export default function Expenses() {
  const { userRole, userPermissions } = useAuth();
  const isAdmin = userRole === 'Admin';
  const canManage = isAdmin || userRole === 'Manager' || (userPermissions || []).includes('Expenses:manage');
  const canDelete = isAdmin || userRole === 'Manager' || (userPermissions || []).includes('Expenses:delete');
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
  const [period, setPeriod]       = useState('all');
  const [sortKey, setSortKey]     = useState('date');
  const [sortDir, setSortDir]     = useState('desc');
  const [page, setPage]           = useState(1);
  const PER_PAGE = 20;
  const [confirmAction, setConfirmAction] = useState(null);
  const { showToast } = useToast();

  useEffect(() => { fetchAll(); }, []);
  useEffect(() => { setPage(1); }, [period, sortKey, sortDir, tab]);

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

  const deleteExpense = (id) => {
    setConfirmAction({
      title: 'Delete Expense',
      message: 'Are you sure you want to delete this expense?',
      onConfirm: async () => {
        setConfirmAction(prev => ({ ...prev, isLoading: true }));
        await supabase.from('expenses').delete().eq('id', id);
        setExpenses(prev => prev.filter(e => e.id !== id));
        setConfirmAction(null);
      }
    });
  };

  const deleteCategory = (id) => {
    setConfirmAction({
      title: 'Delete Category',
      message: 'Delete this category? Expenses in it will become uncategorised.',
      onConfirm: async () => {
        setConfirmAction(prev => ({ ...prev, isLoading: true }));
        await supabase.from('expense_categories').delete().eq('id', id);
        setCategories(prev => prev.filter(c => c.id !== id));
        setConfirmAction(null);
      }
    });
  };

  const startEditCat = (cat) => { setEditingCatId(cat.id); setEditingCatVal(cat.name); };
  const saveEditCat  = async (id) => {
    if (!editingCatVal.trim()) return;
    await supabase.from('expense_categories').update({ name: editingCatVal.trim() }).eq('id', id);
    setCategories(prev => prev.map(c => c.id === id ? { ...c, name: editingCatVal.trim() } : c));
    setEditingCatId(null);
  };

  // Period filter + sort
  const startDateStr = getStartDateStr(period);
  const periodExpenses = startDateStr
    ? expenses.filter(e => e.date >= startDateStr)
    : expenses;

  const sortedExpenses = [...periodExpenses].sort((a, b) => {
    let av, bv;
    if (sortKey === 'amount') { av = Number(a.amount || 0); bv = Number(b.amount || 0); }
    else if (sortKey === 'category') { av = (a.expense_categories?.name || '').toLowerCase(); bv = (b.expense_categories?.name || '').toLowerCase(); }
    else if (sortKey === 'note') { av = (a.note || '').toLowerCase(); bv = (b.note || '').toLowerCase(); }
    else { av = a.date || ''; bv = b.date || ''; } // date
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

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

  const pagedExpenses = sortedExpenses.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  // KPIs
  const kpiTotal    = useMemo(() => periodExpenses.reduce((s, e) => s + Number(e.amount || 0), 0), [periodExpenses]);
  const kpiCount    = useMemo(() => periodExpenses.length, [periodExpenses]);
  const kpiAvg      = useMemo(() => kpiCount > 0 ? Math.round(kpiTotal / kpiCount) : 0, [kpiTotal, kpiCount]);
  const kpiTopCat   = useMemo(() => {
    const map = {};
    periodExpenses.forEach(e => {
      const name = e.expense_categories?.name || 'Uncategorised';
      map[name] = (map[name] || 0) + Number(e.amount || 0);
    });
    const top = Object.entries(map).sort((a, b) => b[1] - a[1])[0];
    return top ? top[0] : '—';
  }, [periodExpenses]);

  if (loading) return (
    <div>
      <SkelDashHeader hasButton />
      <SkelFilterPills count={5} />
      <SkelKpiGrid count={4} />
      <SkelTable rows={5} cols={4} />
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontFamily: "'Mona Sans','Mona-Sans','Helvetica Neue',sans-serif", fontSize: '1.4rem', fontWeight: 900, marginBottom: 4 }}>Expenses</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Track business costs and expense categories.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {canManage && (
            <>
              <button onClick={openCategoryModal} style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--white)', color: 'var(--text)', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <FolderOpen size={15} /> New Category
              </button>
              <button onClick={openExpenseModal} className="btn-primary" style={{ padding: '9px 16px', fontSize: '0.85rem' }}>
                <Plus size={15} style={{ marginRight: 6 }} /> Add Expense
              </button>
            </>
          )}
        </div>
      </div>

      {/* Period filter */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {PERIODS.map(p => (
          <button
            key={p.value}
            onClick={() => setPeriod(p.value)}
            style={{
              padding: '7px 16px', borderRadius: 20,
              border: `1px solid ${period === p.value ? 'var(--red)' : 'var(--border-subtle)'}`,
              background: period === p.value ? 'var(--red)' : 'var(--white)',
              color: period === p.value ? '#fff' : 'var(--text)',
              fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer',
              fontFamily: "'DM Sans',sans-serif", transition: 'all 0.15s',
            }}
          >{p.label}</button>
        ))}
      </div>

      {/* KPI Cards */}
      <div className="kpi-grid">
        <div className="kpi-card red">
          <div className="kpi-icon"><DollarSign size={24} /></div>
          <div className="kpi-value">{fmt(kpiTotal)}</div>
          <div className="kpi-label">Total Expenses</div>
          <div className="kpi-change down">{PERIODS.find(p => p.value === period)?.label}</div>
        </div>
        <div className="kpi-card blue">
          <div className="kpi-icon"><Hash size={24} /></div>
          <div className="kpi-value">{kpiCount}</div>
          <div className="kpi-label">Records</div>
          <div className="kpi-change up">{PERIODS.find(p => p.value === period)?.label}</div>
        </div>
        <div className="kpi-card yellow">
          <div className="kpi-icon"><TrendingDown size={24} /></div>
          <div className="kpi-value">{fmt(kpiAvg)}</div>
          <div className="kpi-label">Avg per Expense</div>
          <div className="kpi-change down">Per record</div>
        </div>
        <div className="kpi-card green">
          <div className="kpi-icon"><Tag size={24} /></div>
          <div className="kpi-value" style={{ fontSize: '1.2rem', wordBreak: 'break-word' }}>{kpiTopCat}</div>
          <div className="kpi-label">Top Category</div>
          <div className="kpi-change up">Highest spend</div>
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
                  <th style={thStyle('date')} onClick={() => handleSort('date')}>Date <SortIcon col="date" /></th>
                  <th style={thStyle('category')} onClick={() => handleSort('category')}>Category <SortIcon col="category" /></th>
                  <th style={thStyle('amount')} onClick={() => handleSort('amount')}>Amount <SortIcon col="amount" /></th>
                  <th style={thStyle('note')} onClick={() => handleSort('note')}>Note <SortIcon col="note" /></th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagedExpenses.map(e => (
                  <tr key={e.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{new Date(e.date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                    <td>
                      {e.expense_categories?.name
                        ? <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: '0.76rem', fontWeight: 700, background: '#eff6ff', color: '#1d4ed8' }}>{e.expense_categories.name}</span>
                        : <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Uncategorised</span>
                      }
                    </td>
                    <td style={{ fontWeight: 800, color: 'var(--red)' }}>{fmt(e.amount)}</td>
                    <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)', maxWidth: 240 }}>{e.note || '—'}</td>
                    <td style={{ textAlign: 'right' }}>
                      {canDelete && (
                        deleting === e.id
                          ? <Loader2 size={15} className="spin" color="var(--red)" />
                          : <button onClick={() => deleteExpense(e.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)' }}>
                              <Trash2 size={15} />
                            </button>
                      )}
                    </td>
                  </tr>
                ))}
                {sortedExpenses.length === 0 && (
                  <tr><td colSpan="5" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No expenses in this period.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={page} total={sortedExpenses.length} perPage={PER_PAGE} onChange={setPage} />
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
                        {canManage && <button onClick={() => startEditCat(cat)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><Edit2 size={14} /></button>}
                        {canDelete && (
                          deleting === cat.id
                            ? <Loader2 size={15} className="spin" color="var(--red)" />
                            : <button onClick={() => deleteCategory(cat.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)' }}><Trash2 size={15} /></button>
                        )}
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
        <div className="product-form-modal" onClick={closeModal}>
          <div className="product-form-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <h3 style={{ marginTop: 0, marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {modalType === 'expense' ? <Receipt size={20} color="var(--red)" /> : <FolderOpen size={20} color="var(--red)" />}
                {modalType === 'expense' ? 'Add Expense' : 'New Category'}
              </div>
              <button onClick={closeModal} className="dash-drawer-close">
                <X size={16} />
              </button>
            </h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 24 }}>
              {modalType === 'expense' ? 'Record a new business expense.' : 'Create an expense category to organise your costs.'}
            </p>

            {modalType === 'expense' ? (
              <>
                <div className="form-group">
                  <label>Category</label>
                  <CustomSelect
                    value={form.category_id}
                    onChange={e => setForm(p => ({ ...p, category_id: e.target.value }))}
                    options={[
                      { value: '', label: '— Uncategorised —' },
                      ...categories.map(c => ({ value: c.id, label: c.name }))
                    ]}
                  />
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
              <button onClick={closeModal} className="btn-secondary" style={{ flex: 1 }}>
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

      <ConfirmModal 
        isOpen={!!confirmAction} 
        onClose={() => setConfirmAction(null)} 
        {...confirmAction} 
      />
    </div>
  );
}
