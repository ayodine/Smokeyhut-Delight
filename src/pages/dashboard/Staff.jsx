import React, { useState, useEffect } from 'react';
import { UserPlus, Shield, Mail, Phone, Edit, Trash2, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

export default function Staff() {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', role: 'Manager', phone: '' });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    if (data) setStaff(data);
    setLoading(false);
  };

  const handleSave = async () => {
    if (!form.name || !form.email) return;
    setSaving(true);
    
    await supabase.from('profiles').insert([{
      full_name: form.name,
      email: form.email,
      role: form.role,
      phone: form.phone
    }]);

    await fetchData();
    setShowModal(false);
    setForm({ name: '', email: '', role: 'Manager', phone: '' });
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Remove this staff member?')) {
      await supabase.from('profiles').delete().eq('id', id);
      setStaff(prev => prev.filter(s => s.id !== id));
    }
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><Loader2 className="spin" size={32} color="var(--red)" /></div>;

  return (
    <div>
      <div className="dash-card">
        <div className="dash-card-header">
          <div className="dash-card-title">Staff Management</div>
          <button className="btn-primary" style={{ padding: '8px 16px', fontSize: '0.88rem' }} onClick={() => setShowModal(true)}>
            <UserPlus size={16} style={{ marginRight: 6 }} /> Add Staff
          </button>
        </div>
        
        <div className="dash-table-wrapper">
          <table className="dash-table">
            <thead>
              <tr>
                <th><Shield size={14} style={{ verticalAlign: 'text-bottom' }} /> Name</th>
                <th><Mail size={14} style={{ verticalAlign: 'text-bottom' }} /> Email</th>
                <th><Phone size={14} style={{ verticalAlign: 'text-bottom' }} /> Phone</th>
                <th>Role</th>
                <th>Last Active</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {staff.map(s => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 600 }}>{s.full_name}</td>
                  <td>{s.email}</td>
                  <td>{s.phone || '—'}</td>
                  <td>
                    <span className={`status-badge ${s.role === 'Admin' ? 'success' : s.role === 'Manager' ? 'processing' : 'pending'}`}>
                      {s.role}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {s.last_active ? new Date(s.last_active).toLocaleDateString() : 'Never'}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)' }} onClick={() => handleDelete(s.id)}>
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {staff.length === 0 && (
                <tr>
                   <td colSpan="6" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No staff members found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="product-form-modal">
          <div className="product-form-card" style={{ maxWidth: 450 }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <UserPlus size={20} color="var(--red)" /> Add New Staff
            </h3>
            
            <div className="form-group">
              <label>Full Name</label>
              <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Jane Doe" />
            </div>
            
            <div className="form-group">
              <label>Email Address</label>
              <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="jane@smokeyhut.com" />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Phone Number</label>
                <input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="080..." />
              </div>
              <div className="form-group">
                <label>Role</label>
                <select value={form.role} onChange={e => setForm({...form, role: e.target.value})}>
                  <option value="Admin">Admin</option>
                  <option value="Manager">Manager</option>
                  <option value="Rider">Rider</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 32 }}>
              <button 
                onClick={() => setShowModal(false)}
                style={{ flex: 1, padding: '12px', background: 'var(--black2)', border: '1px solid var(--border-subtle)', borderRadius: '8px', cursor: 'pointer', fontWeight: 700 }}
              >
                Cancel
              </button>
              <button 
                onClick={handleSave}
                disabled={saving}
                className="btn-primary" 
                style={{ flex: 1, justifyContent: 'center' }}
              >
                {saving ? <Loader2 size={16} className="spin" /> : 'Save User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
