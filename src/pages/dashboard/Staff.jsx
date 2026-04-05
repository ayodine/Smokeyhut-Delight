import { useState, useEffect } from 'react';
import { UserPlus, Shield, Mail, Phone, Trash2, Loader2, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../context/ToastContext';

const ROLE_COLORS = { Admin: 'delivered', Manager: 'processing', Rider: 'pending' };

const ROLE_INFO = {
  Admin:   { label: 'Full access to all dashboard features', color: 'var(--green)' },
  Manager: { label: 'All features except Staff management', color: 'var(--yellow)' },
  Rider:   { label: 'Shipping & Dispatch only',             color: 'var(--red)' },
};

export default function Staff() {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', role: 'Manager', phone: '', password: '' });
  const { showToast } = useToast();

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .in('role', ['Admin', 'Manager', 'Rider'])
      .order('created_at', { ascending: false });
    if (data) setStaff(data);
    setLoading(false);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) {
      showToast('Missing fields', 'Name, email and password are required', 'error');
      return;
    }
    if (form.password.length < 6) {
      showToast('Weak password', 'Password must be at least 6 characters', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-staff`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          action: 'create',
          email: form.email.trim(),
          password: form.password,
          name: form.name.trim(),
          role: form.role,
          phone: form.phone.trim() || null,
        }),
      });
      const data = await res.json();

      if (!res.ok || data?.error) {
        throw new Error(data?.error || data?.message || `HTTP ${res.status}: Failed to create staff account`);
      }

      await fetchData();
      setShowModal(false);
      setForm({ name: '', email: '', role: 'Manager', phone: '', password: '' });
      showToast('Staff account created', `${form.name} can now log in as ${form.role}`, 'success');
    } catch (err) {
      showToast('Failed to create account', err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (member) => {
    if (!window.confirm(`Remove ${member.full_name} from staff? Their login access will be revoked.`)) return;
    setDeleting(member.id);
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-staff`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ action: 'delete', userId: member.id }),
      });
      const data = await res.json();
      if (!res.ok || data?.error) throw new Error(data?.error || data?.message || `HTTP ${res.status}`);
      setStaff(prev => prev.filter(s => s.id !== member.id));
      showToast('Staff member removed');
    } catch (err) {
      showToast('Failed to remove', err.message, 'error');
    } finally {
      setDeleting(null);
    }
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><Loader2 className="spin" size={32} color="var(--red)" /></div>;

  return (
    <div>
      {/* Role permissions overview */}
      <div className="kpi-grid" style={{ marginBottom: 24 }}>
        {Object.entries(ROLE_INFO).map(([role, info]) => (
          <div key={role} className="kpi-card" style={{ background: 'var(--card-bg)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontWeight: 800, fontSize: '1rem', color: info.color, marginBottom: 6 }}>{role}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>{info.label}</div>
            <div style={{ marginTop: 8, fontWeight: 700, fontSize: '1.3rem' }}>
              {staff.filter(s => s.role === role).length}
            </div>
          </div>
        ))}
      </div>

      <div className="dash-card">
        <div className="dash-card-header">
          <div className="dash-card-title">Staff Members</div>
          <button className="btn-primary" style={{ padding: '8px 16px', fontSize: '0.88rem' }} onClick={() => setShowModal(true)}>
            <UserPlus size={16} style={{ marginRight: 6 }} /> Add Staff
          </button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="dash-table">
            <thead>
              <tr>
                <th><Shield size={14} style={{ verticalAlign: 'text-bottom' }} /> Name</th>
                <th><Mail size={14} style={{ verticalAlign: 'text-bottom' }} /> Email</th>
                <th><Phone size={14} style={{ verticalAlign: 'text-bottom' }} /> Phone</th>
                <th>Role</th>
                <th>Access</th>
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
                    <span className={`status-badge ${ROLE_COLORS[s.role] || 'pending'}`}>{s.role}</span>
                  </td>
                  <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    {ROLE_INFO[s.role]?.label || '—'}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {deleting === s.id
                      ? <Loader2 size={16} className="spin" color="var(--red)" />
                      : (
                        <button
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)' }}
                          onClick={() => handleDelete(s)}
                          title="Remove staff member"
                        >
                          <Trash2 size={16} />
                        </button>
                      )
                    }
                  </td>
                </tr>
              ))}
              {staff.length === 0 && (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    No staff members yet. Add your first team member above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="product-form-modal">
          <div className="product-form-card" style={{ maxWidth: 460 }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <UserPlus size={20} color="var(--red)" /> Add New Staff
            </h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 24 }}>
              Creates a login account — they sign in at <strong>/admin/login</strong>
            </p>

            <div className="form-group">
              <label>Full Name *</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Jane Doe" />
            </div>

            <div className="form-group">
              <label>Email Address *</label>
              <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="jane@smokeyhut.com" />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Phone</label>
                <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="080..." />
              </div>
              <div className="form-group">
                <label>Role *</label>
                <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                  <option value="Manager">Manager</option>
                  <option value="Rider">Rider</option>
                  <option value="Admin">Admin</option>
                </select>
              </div>
            </div>

            {/* Role description */}
            <div style={{ padding: '10px 14px', background: 'var(--black2)', borderRadius: 8, fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 16 }}>
              {ROLE_INFO[form.role]?.label}
            </div>

            <div className="form-group">
              <label>Temporary Password *</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  placeholder="Min. 6 characters"
                  style={{ paddingRight: 44 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
              <button
                onClick={() => { setShowModal(false); setForm({ name: '', email: '', role: 'Manager', phone: '', password: '' }); }}
                style={{ flex: 1, padding: '12px', background: 'var(--black2)', border: '1px solid var(--border-subtle)', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, color: 'var(--text)' }}
              >
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving} className="btn-primary" style={{ flex: 1, justifyContent: 'center' }}>
                {saving ? <><Loader2 size={16} className="spin" style={{ marginRight: 8 }} /> Creating...</> : 'Create Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
