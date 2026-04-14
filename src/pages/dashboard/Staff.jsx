import { useState, useEffect } from 'react';
import { UserPlus, Shield, Mail, Phone, Trash2, Loader2, Eye, EyeOff, Edit2, Check } from 'lucide-react';
import { SkelList } from '../../components/Skeleton';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../context/ToastContext';

const ROLE_COLORS = { Admin: 'delivered', Manager: 'processing', Rider: 'pending', Staff: 'info' };

const ROLE_INFO = {
  Admin:   { label: 'Full access to all dashboard features',      color: 'var(--green)' },
  Manager: { label: 'All features except Staff management',        color: 'var(--yellow)' },
  Rider:   { label: 'Shipping & Dispatch only',                    color: 'var(--red)' },
  Staff:   { label: 'Custom access — set permissions below',       color: '#60a5fa' },
};

const GRANTABLE_PAGES = [
  'Overview', 'Orders', 'Shipping', 'Payments',
  'Stores', 'Products', 'Customers', 'Zones', 'Coupons',
  'Sales Report', 'Expenses',
  'Settings',
];

const ACTIONS = ['view', 'manage', 'delete'];
const ACTION_LABELS = { view: 'View', manage: 'Manage', delete: 'Delete' };
const ACTION_COLORS = { view: '#3b82f6', manage: '#f59e0b', delete: '#ef4444' };

// Pages that support a 'create' sub-permission (controls whether the user can add new records)
const CREATABLE_PAGES = ['Orders'];
const CREATE_LABEL = 'Add New';

const EMPTY_FORM = { name: '', email: '', role: 'Staff', phone: '', password: '' };

// permissions stored as ['Orders:view', 'Orders:manage', 'Products:view', ...]
const hasPerm = (permissions, page, action) => permissions.includes(`${page}:${action}`);

const togglePerm = (permissions, page, action) => {
  const key = `${page}:${action}`;
  if (permissions.includes(key)) {
    // Unchecking view removes ALL actions for that page (manage, delete, create)
    if (action === 'view') {
      return permissions.filter(p => !p.startsWith(`${page}:`));
    }
    return permissions.filter(p => p !== key);
  } else {
    // Checking manage, delete, or create auto-adds view
    const toAdd = [key];
    if (action !== 'view' && !permissions.includes(`${page}:view`)) {
      toAdd.push(`${page}:view`);
    }
    return [...permissions, ...toAdd];
  }
};

// Summarise permissions for the table Access column
function permSummary(permissions) {
  if (!Array.isArray(permissions) || permissions.length === 0) return null;
  const map = {};
  permissions.forEach(p => {
    const [page, action] = p.split(':');
    if (!map[page]) map[page] = [];
    map[page].push(action.charAt(0).toUpperCase());
  });
  return Object.entries(map).map(([page, acts]) => `${page} (${acts.join(',')})`).join(' · ');
}

export default function Staff() {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [permissions, setPermissions] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const { showToast } = useToast();

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('profiles')
      .select('id,full_name,email,role,phone,permissions,created_at')
      .in('role', ['Admin', 'Manager', 'Rider', 'Staff'])
      .order('created_at', { ascending: false });
    if (data) setStaff(data);
    setLoading(false);
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setPermissions([]);
    setShowPassword(false);
    setShowModal(true);
  };

  const openEdit = (member) => {
    setEditingId(member.id);
    setForm({ name: member.full_name || '', email: member.email || '', role: member.role, phone: member.phone || '', password: '' });
    setPermissions(Array.isArray(member.permissions) ? member.permissions : []);
    setShowPassword(false);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setPermissions([]);
  };

  // Grant all actions on every page
  const grantAll = () => {
    const all = [];
    GRANTABLE_PAGES.forEach(page => ACTIONS.forEach(action => all.push(`${page}:${action}`)));
    setPermissions(all);
  };

  // Grant one action across all pages
  const grantAllAction = (action) => {
    setPermissions(prev => {
      let updated = [...prev];
      GRANTABLE_PAGES.forEach(page => {
        const key = `${page}:${action}`;
        if (!updated.includes(key)) {
          updated.push(key);
          // auto-add view if granting manage/delete
          if (action !== 'view') {
            const viewKey = `${page}:view`;
            if (!updated.includes(viewKey)) updated.push(viewKey);
          }
        }
      });
      return updated;
    });
  };

  const clearAll = () => setPermissions([]);

  const handleSave = async () => {
    if (editingId) {
      setSaving(true);
      try {
        const update = { role: form.role, permissions: form.role !== 'Admin' ? permissions : [] };
        const { error } = await supabase.from('profiles').update(update).eq('id', editingId);
        if (error) throw new Error(error.message);
        await fetchData();
        closeModal();
        showToast('Updated', 'Staff access updated', 'success');
      } catch (err) {
        showToast('Failed', err.message, 'error');
      } finally {
        setSaving(false);
      }
      return;
    }

    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) {
      showToast('Missing fields', 'Name, email and password are required', 'error');
      return;
    }
    if (form.password.length < 6) {
      showToast('Weak password', 'Password must be at least 6 characters', 'error');
      return;
    }
    if (form.role !== 'Admin' && permissions.length === 0) {
      showToast('No access granted', 'Select at least one permission for this role', 'error');
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
      if (!res.ok || data?.error) throw new Error(data?.error || data?.message || `HTTP ${res.status}`);

      if (form.role !== 'Admin' && data.userId) {
        await supabase.from('profiles').update({ permissions }).eq('id', data.userId);
      }

      await fetchData();
      closeModal();
      showToast('Account created', `${form.name} can now log in as ${form.role}`, 'success');
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
      showToast('Staff member removed', '', 'success');
    } catch (err) {
      showToast('Failed to remove', err.message, 'error');
    } finally {
      setDeleting(null);
    }
  };

  if (loading) return <SkelList rows={4} height={90} />;

  return (
    <div>
      {/* Role overview cards */}
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
          <button className="btn-primary" style={{ padding: '8px 16px', fontSize: '0.88rem' }} onClick={openCreate}>
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
                  <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)', maxWidth: 260 }}>
                    {s.role === 'Admin'
                      ? ROLE_INFO[s.role]?.label || '—'
                      : (Array.isArray(s.permissions) && s.permissions.length > 0
                          ? permSummary(s.permissions)
                          : <span style={{ color: 'var(--red)' }}>No access granted</span>)
                    }
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                        onClick={() => openEdit(s)}
                        title="Edit access"
                      >
                        <Edit2 size={15} />
                      </button>
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
                    </div>
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
          <div className="product-form-card" style={{ maxWidth: 580 }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <UserPlus size={20} color="var(--red)" />
              {editingId ? 'Edit Staff Access' : 'Add New Staff'}
            </h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 24 }}>
              {editingId
                ? 'Update this staff member\'s role and page access.'
                : <>Creates a login account — they sign in at <strong>/admin/login</strong></>
              }
            </p>

            {!editingId && (
              <>
                <div className="form-group">
                  <label>Full Name *</label>
                  <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Jane Doe" />
                </div>
                <div className="form-group">
                  <label>Email Address *</label>
                  <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="jane@smokeyhut.com" />
                </div>
                <div className="form-group">
                  <label>Phone</label>
                  <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="080..." />
                </div>
              </>
            )}

            <div className="form-row">
              <div className="form-group">
                <label>Role *</label>
                <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} style={{ width: '100%', padding: '12px 36px 12px 16px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--black)', color: 'var(--text)', fontSize: '0.9rem', fontFamily: "'DM Sans', sans-serif", outline: 'none', WebkitAppearance: 'none', appearance: 'none', cursor: 'pointer', backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%235C5247' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}>
                  <option value="Staff">Staff</option>
                  <option value="Manager">Manager</option>
                  <option value="Rider">Rider</option>
                  <option value="Admin">Admin</option>
                </select>
              </div>
            </div>

            {/* Role description */}
            <div style={{ padding: '10px 14px', background: 'var(--black2)', borderRadius: 8, fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: form.role === 'Staff' ? 12 : 16 }}>
              {ROLE_INFO[form.role]?.label}
            </div>

            {/* Permissions grid — all roles except Admin */}
            {form.role !== 'Admin' && (
              <div style={{ background: 'var(--black2)', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
                {/* Header row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontWeight: 700, fontSize: '0.82rem' }}>Page Permissions</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" onClick={grantAll} style={{ fontSize: '0.7rem', background: 'none', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '2px 8px', cursor: 'pointer', color: 'var(--text-muted)' }}>
                      Grant All
                    </button>
                    <button type="button" onClick={clearAll} style={{ fontSize: '0.7rem', background: 'none', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '2px 8px', cursor: 'pointer', color: 'var(--text-muted)' }}>
                      Clear All
                    </button>
                  </div>
                </div>

                {/* Table */}
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 600, borderBottom: '1px solid var(--border-subtle)', width: '35%' }}>Page</th>
                        {ACTIONS.map(action => (
                          <th key={action} style={{ textAlign: 'center', padding: '6px 4px', borderBottom: '1px solid var(--border-subtle)', width: '16%' }}>
                            <div style={{ color: ACTION_COLORS[action], fontWeight: 700, fontSize: '0.75rem', marginBottom: 4 }}>{ACTION_LABELS[action]}</div>
                            <button
                              type="button"
                              onClick={() => grantAllAction(action)}
                              style={{ fontSize: '0.65rem', background: 'none', border: `1px solid ${ACTION_COLORS[action]}40`, borderRadius: 4, padding: '1px 6px', cursor: 'pointer', color: ACTION_COLORS[action] }}
                            >
                              All
                            </button>
                          </th>
                        ))}
                        <th style={{ textAlign: 'center', padding: '6px 4px', borderBottom: '1px solid var(--border-subtle)', width: '17%' }}>
                          <div style={{ color: '#8b5cf6', fontWeight: 700, fontSize: '0.75rem', marginBottom: 4 }}>{CREATE_LABEL}</div>
                          <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>per page</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {GRANTABLE_PAGES.map((page, i) => {
                        const rowHasAny = ACTIONS.some(a => hasPerm(permissions, page, a)) || hasPerm(permissions, page, 'create');
                        const isCreatable = CREATABLE_PAGES.includes(page);
                        const borderStyle = i < GRANTABLE_PAGES.length - 1 ? '1px solid var(--border-subtle)' : 'none';
                        return (
                          <tr key={page} style={{ background: rowHasAny ? 'rgba(192,32,31,0.05)' : 'transparent' }}>
                            <td style={{ padding: '7px 8px', fontWeight: rowHasAny ? 600 : 400, color: rowHasAny ? 'var(--text)' : 'var(--text-muted)', borderBottom: borderStyle }}>
                              {page}
                            </td>
                            {ACTIONS.map(action => {
                              const checked = hasPerm(permissions, page, action);
                              return (
                                <td key={action} style={{ textAlign: 'center', borderBottom: borderStyle }}>
                                  <div
                                    onClick={() => setPermissions(prev => togglePerm(prev, page, action))}
                                    style={{
                                      width: 18, height: 18, borderRadius: 4, margin: '0 auto', cursor: 'pointer',
                                      border: `2px solid ${checked ? ACTION_COLORS[action] : 'var(--border-subtle)'}`,
                                      background: checked ? ACTION_COLORS[action] : 'transparent',
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      transition: 'all 0.15s',
                                    }}
                                  >
                                    {checked && <Check size={11} color="#fff" strokeWidth={3} />}
                                  </div>
                                </td>
                              );
                            })}
                            {/* Add New column — only active for CREATABLE_PAGES */}
                            <td style={{ textAlign: 'center', borderBottom: borderStyle }}>
                              {isCreatable ? (
                                <div
                                  onClick={() => setPermissions(prev => togglePerm(prev, page, 'create'))}
                                  style={{
                                    width: 18, height: 18, borderRadius: 4, margin: '0 auto', cursor: 'pointer',
                                    border: `2px solid ${hasPerm(permissions, page, 'create') ? '#8b5cf6' : 'var(--border-subtle)'}`,
                                    background: hasPerm(permissions, page, 'create') ? '#8b5cf6' : 'transparent',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    transition: 'all 0.15s',
                                  }}
                                >
                                  {hasPerm(permissions, page, 'create') && <Check size={11} color="#fff" strokeWidth={3} />}
                                </div>
                              ) : (
                                <span style={{ color: 'var(--border-subtle)', fontSize: '0.7rem' }}>—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {permissions.length === 0 && (
                  <div style={{ marginTop: 10, fontSize: '0.78rem', color: 'var(--red)', fontWeight: 600 }}>
                    No permissions selected — this staff member won't see anything after login.
                  </div>
                )}
              </div>
            )}

            {!editingId && (
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
            )}

            <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
              <button
                onClick={closeModal}
                style={{ flex: 1, padding: '12px', background: 'var(--black2)', border: '1px solid var(--border-subtle)', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, color: 'var(--text)' }}
              >
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving} className="btn-primary" style={{ flex: 1, justifyContent: 'center' }}>
                {saving
                  ? <><Loader2 size={16} className="spin" style={{ marginRight: 8 }} />{editingId ? 'Saving...' : 'Creating...'}</>
                  : editingId ? 'Save Changes' : 'Create Account'
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
