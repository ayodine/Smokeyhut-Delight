import React, { useState, useEffect } from 'react';
import { Users, DollarSign, Package, Edit2, Trash2, X, UserPlus, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const fmt = (n) => '₦' + n.toLocaleString();

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '' });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    // Fetch profiles where role='customer', and attach their orders to compute stats
    const { data } = await supabase.from('profiles')
      .select('*, orders(total, created_at)')
      .eq('role', 'customer')
      .order('created_at', { ascending: false });

    if (data) {
      const mapped = data.map(c => {
        const oList = c.orders || [];
        const totalSpent = oList.reduce((sum, o) => sum + Number(o.total), 0);
        
        let lastOrder = c.last_active;
        if (oList.length > 0) {
          // Sort to find the latest order date
          const dates = oList.map(x => new Date(x.created_at).getTime());
          const maxDate = new Date(Math.max(...dates));
          lastOrder = maxDate.toISOString();
        }

        return {
          id: c.id,
          name: c.full_name,
          email: c.email,
          phone: c.phone,
          orders: oList.length,
          totalSpent,
          lastOrder
        };
      });
      setCustomers(mapped);
    }
    setLoading(false);
  };

  const filtered = customers.filter(c => 
    String(c.name || '').toLowerCase().includes(search.toLowerCase()) || 
    String(c.email || '').toLowerCase().includes(search.toLowerCase())
  );

  const handleSave = async () => {
    if (!form.name || !form.email) return;
    setSaving(true);

    const payload = {
      full_name: form.name,
      email: form.email,
      phone: form.phone,
      role: 'customer'
    };

    if (editing) {
      await supabase.from('profiles').update(payload).eq('id', editing);
    } else {
      await supabase.from('profiles').insert([payload]);
    }

    await fetchData();
    setShowModal(false);
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Delete customer? NOTE: This may fail if they have linked orders.')) {
      await supabase.from('profiles').delete().eq('id', id);
      setCustomers(prev => prev.filter(c => c.id !== id));
    }
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><Loader2 className="spin" size={32} color="var(--red)" /></div>;

  return (
    <div>
      <div className="dash-card-header" style={{ marginBottom: 20 }}>
        <div className="dash-card-title" style={{ fontFamily: "'Mona Sans', 'Mona-Sans', 'Helvetica Neue', sans-serif", fontSize: '1.4rem' }}>Customer Directory</div>
        <div style={{ display: 'flex', gap: 12 }}>
          <input className="dash-search" placeholder="🔍 Search customers..." value={search} onChange={e => setSearch(e.target.value)} />
          <button className="btn-primary" style={{ padding: '8px 16px', fontSize: '0.88rem' }} onClick={() => { setEditing(null); setForm({ name: '', email: '', phone: '' }); setShowModal(true); }}>
            <UserPlus size={16} style={{ marginRight: 6 }} /> Add Customer
          </button>
        </div>
      </div>

      <div className="kpi-grid" style={{ marginBottom: 24 }}>
        <div className="kpi-card blue">
          <div className="kpi-icon"><Users size={24} /></div>
          <div className="kpi-value">{customers.length}</div>
          <div className="kpi-label">Total Customers</div>
        </div>
        <div className="kpi-card green">
          <div className="kpi-icon"><DollarSign size={24} /></div>
          <div className="kpi-value">{fmt(customers.reduce((s, c) => s + c.totalSpent, 0))}</div>
          <div className="kpi-label">Total Spend</div>
        </div>
        <div className="kpi-card yellow">
          <div className="kpi-icon"><Package size={24} /></div>
          <div className="kpi-value">{customers.reduce((s, c) => s + c.orders, 0)}</div>
          <div className="kpi-label">Total Orders</div>
        </div>
      </div>

      <div className="dash-card">
        <div style={{ overflowX: 'auto' }}>
          <table className="dash-table">
            <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Orders</th><th>Total Spent</th><th>Last Order</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 700 }}>{c.name}</td>
                  <td>{c.email}</td>
                  <td>{c.phone || '—'}</td>
                  <td style={{ fontWeight: 600 }}>{c.orders}</td>
                  <td style={{ fontWeight: 700, color: 'var(--green)' }}>{fmt(c.totalSpent)}</td>
                  <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{c.lastOrder ? new Date(c.lastOrder).toLocaleDateString() : 'Never'}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', marginRight: 12 }} onClick={() => { setEditing(c.id); setForm({ name: c.name, email: c.email, phone: c.phone || '' }); setShowModal(true); }}>
                      <Edit2 size={16} />
                    </button>
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)' }} onClick={() => handleDelete(c.id)}>
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan="7" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>No customers found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="product-form-modal">
          <div className="product-form-card" style={{ maxWidth: 450 }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 0, marginBottom: 24 }}>
              <UserPlus size={20} color="var(--red)" /> {editing ? 'Edit' : 'Add'} Customer
            </h3>
            
            <div className="form-group"><label>Full Name</label><input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Jane Doe" /></div>
            <div className="form-group"><label>Email Address</label><input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="jane@email.com" /></div>
            <div className="form-group"><label>Phone Number</label><input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="080..." /></div>

            <div style={{ display: 'flex', gap: 12, marginTop: 32 }}>
              <button onClick={() => setShowModal(false)} style={{ flex: 1, padding: '12px', background: 'var(--black2)', border: '1px solid var(--border-subtle)', borderRadius: '8px', cursor: 'pointer', fontWeight: 700 }}>
                Cancel
              </button>
              <button disabled={saving} onClick={handleSave} className="btn-primary" style={{ flex: 1, justifyContent: 'center' }}>
                {saving ? <Loader2 size={16} className="spin" /> : 'Save Customer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
