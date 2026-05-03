import { useState, useEffect } from 'react';
import { Users, DollarSign, Package, Trash2, Download, Mail, Send, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { SkelTable } from '../../components/Skeleton';
import Pagination from '../../components/Pagination';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

const fmt = (n) => '₦' + n.toLocaleString();

const AUDIENCE_OPTIONS = [
  { value: 'all',           label: 'All customers with email' },
  { value: 'repeat',        label: 'Repeat buyers (2+ orders)' },
  { value: 'recent',        label: 'Ordered in last 30 days' },
  { value: 'high_spenders', label: 'High spenders (₦10,000+)' },
];

const SVG_ARROW = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`;

export default function Customers() {
  const { userRole } = useAuth();
  const isAdmin = userRole === 'Admin';

  const [tab, setTab] = useState('directory');
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const PER_PAGE = 20;

  // Campaign state
  const [campaigns, setCampaigns] = useState([]);
  const [campsLoading, setCampsLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({ name: '', subject: '', body: '', audience: 'all' });
  const [sendResult, setSendResult] = useState(null);

  useEffect(() => { fetchData(); }, []);
  useEffect(() => { if (tab === 'campaigns') fetchCampaigns(); }, [tab]);
  useEffect(() => { setPage(1); }, [search]);

  const fetchData = async () => {
    setLoading(true);
    const { data: ordersData } = await supabase
      .from('orders')
      .select('customer_name, customer_email, customer_phone, total, created_at, status')
      .order('created_at', { ascending: false });

    if (ordersData) {
      const map = {};
      ordersData.forEach(o => {
        const key = o.customer_phone || o.customer_email || o.customer_name;
        if (!key) return;
        if (!map[key]) {
          map[key] = { id: key, name: o.customer_name, email: o.customer_email, phone: o.customer_phone, orders: 0, totalSpent: 0, lastOrder: null };
        }
        if (o.status !== 'cancelled') map[key].totalSpent += Number(o.total || 0);
        map[key].orders += 1;
        const d = new Date(o.created_at).getTime();
        if (!map[key].lastOrder || d > new Date(map[key].lastOrder).getTime()) map[key].lastOrder = o.created_at;
      });
      setCustomers(Object.values(map));
    }
    setLoading(false);
  };

  const fetchCampaigns = async () => {
    setCampsLoading(true);
    const { data } = await supabase.from('email_campaigns').select('*').order('created_at', { ascending: false });
    if (data) setCampaigns(data);
    setCampsLoading(false);
  };

  const filtered = customers.filter(c =>
    String(c.name || '').toLowerCase().includes(search.toLowerCase()) ||
    String(c.email || '').toLowerCase().includes(search.toLowerCase()) ||
    String(c.phone || '').toLowerCase().includes(search.toLowerCase())
  );
  const pagedCustomers = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const getAudience = (filter) => {
    let list = customers.filter(c => c.email);
    if (filter === 'repeat') list = list.filter(c => c.orders >= 2);
    if (filter === 'recent') {
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
      list = list.filter(c => c.lastOrder && new Date(c.lastOrder) >= cutoff);
    }
    if (filter === 'high_spenders') list = list.filter(c => c.totalSpent >= 10000);
    return list;
  };

  const audienceList = getAudience(form.audience);
  const noEmailCount = customers.filter(c => !c.email).length;

  // ── Export ──────────────────────────────────────────────────────────────
  const exportCSV = () => {
    const rows = [
      ['Name', 'Email', 'Phone', 'Orders', 'Total Spent (₦)', 'Last Order'],
      ...customers.map(c => [
        c.name, c.email, c.phone,
        c.orders, c.totalSpent,
        c.lastOrder ? new Date(c.lastOrder).toLocaleDateString() : '',
      ]),
    ];
    const csv = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `smokeyhut-customers-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Name', 'Email', 'Phone', 'Orders', 'Total Spent (₦)', 'Last Order'],
      ...customers.map(c => [
        c.name, c.email, c.phone,
        c.orders, c.totalSpent,
        c.lastOrder ? new Date(c.lastOrder).toLocaleDateString() : '',
      ]),
    ]), 'Customers');
    XLSX.writeFile(wb, `smokeyhut-customers-${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleDelete = async (phone) => {
    if (window.confirm('Remove this customer from the directory? Their orders will remain.')) {
      await supabase.from('orders').update({ customer_name: 'Deleted Customer', customer_email: null }).eq('customer_phone', phone);
      setCustomers(prev => prev.filter(c => c.id !== phone));
    }
  };

  // ── Send campaign ────────────────────────────────────────────────────────
  const sendCampaign = async () => {
    if (!form.name.trim() || !form.subject.trim() || !form.body.trim()) {
      return alert('Please fill in campaign name, subject, and message body.');
    }
    if (audienceList.length === 0) {
      return alert('No recipients with email addresses match the selected audience filter.');
    }
    if (!window.confirm(`Send "${form.subject}" to ${audienceList.length} recipient${audienceList.length !== 1 ? 's' : ''}?`)) return;

    setSending(true);
    setSendResult(null);

    try {
      const recipients = audienceList.map(c => ({ email: c.email, name: c.name || '' }));
      const { data: result, error } = await supabase.functions.invoke('send-campaign', {
        body: { subject: form.subject, body: form.body, recipients },
      });

      if (error) throw new Error(error.message || 'Send failed');

      // Save campaign record
      await supabase.from('email_campaigns').insert({
        name: form.name,
        subject: form.subject,
        body: form.body,
        audience: form.audience,
        recipient_count: recipients.length,
        sent_count: result?.sent ?? recipients.length,
        status: result?.failed > 0 ? 'partial' : 'sent',
      });

      setSendResult({ sent: result?.sent ?? recipients.length, failed: result?.failed ?? 0 });
      setForm({ name: '', subject: '', body: '', audience: 'all' });
      fetchCampaigns();
    } catch (err) {
      alert('Error sending campaign: ' + err.message);
    } finally {
      setSending(false);
    }
  };

  if (loading) return <SkelTable rows={8} cols={5} />;

  // ── Styles ───────────────────────────────────────────────────────────────
  const tabBtn = (active) => ({
    display: 'flex', alignItems: 'center', gap: 7,
    padding: '9px 20px', borderRadius: 8, border: '1px solid var(--border-subtle)',
    background: active ? 'var(--red)' : 'var(--white)',
    color: active ? '#fff' : 'var(--text)',
    fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer',
    fontFamily: "'DM Sans',sans-serif",
  });

  const dlBtn = (bg) => ({
    display: 'flex', alignItems: 'center', gap: 7,
    padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border-subtle)',
    background: bg, color: '#fff', fontWeight: 700, fontSize: '0.82rem',
    cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
  });

  const selectStyle = {
    appearance: 'none', WebkitAppearance: 'none',
    paddingRight: 36, backgroundImage: SVG_ARROW,
    backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center',
  };

  return (
    <div>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontFamily: "'Mona Sans','Mona-Sans','Helvetica Neue',sans-serif", fontSize: '1.4rem', fontWeight: 900, marginBottom: 4 }}>Customers</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{customers.length} unique customers from order history.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => setTab('directory')} style={tabBtn(tab === 'directory')}>Directory</button>
          <button onClick={() => setTab('campaigns')} style={tabBtn(tab === 'campaigns')}>
            <Mail size={14} /> Email Campaigns
          </button>
        </div>
      </div>

      {/* ── DIRECTORY TAB ── */}
      {tab === 'directory' && (
        <>
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

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
            <input
              className="dash-search"
              placeholder="🔍 Search customers..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ margin: 0 }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={exportCSV} style={dlBtn('#0284c7')}><Download size={14} /> CSV</button>
              <button onClick={exportExcel} style={dlBtn('#16a34a')}><Download size={14} /> Excel</button>
            </div>
          </div>

          <div className="dash-card">
            <div style={{ overflowX: 'auto' }}>
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>Name</th><th>Email</th><th>Phone</th>
                    <th>Orders</th><th>Total Spent</th><th>Last Order</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedCustomers.map(c => (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 700 }}>{c.name}</td>
                      <td>{c.email || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                      <td>{c.phone || '—'}</td>
                      <td style={{ fontWeight: 600 }}>{c.orders}</td>
                      <td style={{ fontWeight: 700, color: 'var(--green)' }}>{fmt(c.totalSpent)}</td>
                      <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                        {c.lastOrder ? new Date(c.lastOrder).toLocaleDateString() : 'Never'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {isAdmin && (
                          <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)' }} onClick={() => handleDelete(c.phone)}>
                            <Trash2 size={16} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan="7" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>No customers found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <Pagination page={page} total={filtered.length} perPage={PER_PAGE} onChange={setPage} />
          </div>
        </>
      )}

      {/* ── EMAIL CAMPAIGNS TAB ── */}
      {tab === 'campaigns' && (
        <>
          {/* Success banner */}
          {sendResult && (
            <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: 10, padding: '12px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
              <Send size={16} color="#16a34a" />
              <span style={{ fontWeight: 700, color: '#166534' }}>
                Campaign sent — {sendResult.sent} delivered{sendResult.failed > 0 ? `, ${sendResult.failed} failed` : ''}.
              </span>
              <button onClick={() => setSendResult(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#166534', fontSize: '1.1rem' }}>×</button>
            </div>
          )}

          {/* Compose form */}
          <div className="dash-card" style={{ marginBottom: 24 }}>
            <div className="dash-card-header" style={{ marginBottom: 20 }}>
              <div className="dash-card-title">Compose Campaign</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 16 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Campaign Name</label>
                <input
                  placeholder="e.g. Easter Weekend Promo"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Target Audience</label>
                <select
                  value={form.audience}
                  onChange={e => setForm(f => ({ ...f, audience: e.target.value }))}
                  style={selectStyle}
                >
                  {AUDIENCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 16 }}>
              <label>Subject Line</label>
              <input
                placeholder="e.g. 🔥 20% Off All Orders This Weekend Only!"
                value={form.subject}
                onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
              />
            </div>

            <div className="form-group" style={{ marginBottom: 20 }}>
              <label>
                Message Body
                <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.78rem', marginLeft: 8 }}>
                  — use <code style={{ background: 'var(--black2)', padding: '1px 5px', borderRadius: 4 }}>{'{customer_name}'}</code> for personalisation
                </span>
              </label>
              <textarea
                rows={8}
                placeholder={`Hi {customer_name},\n\nWe have an exciting offer just for you! This weekend only, enjoy 20% off all orders.\n\nUse code SAVE20 at checkout.\n\nShop now at smokeyhut.com\n\n— The Smokeyhut Team`}
                value={form.body}
                onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                style={{ resize: 'vertical' }}
              />
            </div>

            {/* Audience preview + send button */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', background: 'var(--black2)', borderRadius: 10, flexWrap: 'wrap', gap: 12 }}>
              <div style={{ fontSize: '0.85rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Recipients: </span>
                <span style={{ fontWeight: 800, color: audienceList.length > 0 ? '#16a34a' : '#dc2626' }}>{audienceList.length}</span>
                <span style={{ color: 'var(--text-muted)', marginLeft: 12 }}>·</span>
                <span style={{ color: 'var(--text-muted)', marginLeft: 12 }}>{noEmailCount} customers have no email on file</span>
              </div>
              <button
                onClick={sendCampaign}
                disabled={sending || audienceList.length === 0}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 24px', borderRadius: 8, border: 'none',
                  background: sending || audienceList.length === 0 ? '#9ca3af' : 'var(--red)',
                  color: '#fff', fontWeight: 700, fontSize: '0.88rem',
                  cursor: sending || audienceList.length === 0 ? 'not-allowed' : 'pointer',
                  fontFamily: "'DM Sans',sans-serif",
                }}
              >
                {sending
                  ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Sending...</>
                  : <><Send size={15} /> Send to {audienceList.length} recipient{audienceList.length !== 1 ? 's' : ''}</>
                }
              </button>
            </div>
          </div>

          {/* Campaign history */}
          <div className="dash-card">
            <div className="dash-card-header" style={{ marginBottom: 16 }}>
              <div className="dash-card-title">Campaign History</div>
            </div>
            {campsLoading ? (
              <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
            ) : campaigns.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <Mail size={32} style={{ opacity: 0.3, marginBottom: 10 }} />
                <div>No campaigns sent yet. Compose your first one above.</div>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th>Campaign</th><th>Subject</th><th>Audience</th>
                      <th>Recipients</th><th>Status</th><th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map(c => {
                      const statusColor = {
                        sent:    { bg: '#dcfce7', color: '#166534' },
                        partial: { bg: '#fef9c3', color: '#92400e' },
                        failed:  { bg: '#fee2e2', color: '#991b1b' },
                      }[c.status] || { bg: '#e5e7eb', color: '#374151' };
                      return (
                        <tr key={c.id}>
                          <td style={{ fontWeight: 700 }}>{c.name}</td>
                          <td style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.subject}</td>
                          <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            {AUDIENCE_OPTIONS.find(o => o.value === c.audience)?.label || c.audience}
                          </td>
                          <td style={{ fontWeight: 600 }}>{c.recipient_count}</td>
                          <td>
                            <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 700, ...statusColor }}>
                              {c.status}
                            </span>
                          </td>
                          <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                            {new Date(c.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
