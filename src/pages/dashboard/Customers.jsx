import { useState, useEffect } from 'react';
import { Users, DollarSign, Package, Trash2, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

const fmt = (n) => '₦' + n.toLocaleString();

export default function Customers() {
  const { userRole } = useAuth();
  const isAdmin = userRole === 'Admin';
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    // Orders are created anonymously — derive customers from unique phones in orders table
    const { data: ordersData } = await supabase
      .from('orders')
      .select('customer_name, customer_email, customer_phone, total, created_at, status')
      .order('created_at', { ascending: false });

    if (ordersData) {
      // Group by phone number to deduplicate customers
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

  const filtered = customers.filter(c => 
    String(c.name || '').toLowerCase().includes(search.toLowerCase()) || 
    String(c.email || '').toLowerCase().includes(search.toLowerCase())
  );

  const handleDelete = async (phone) => {
    if (window.confirm('Remove this customer from the directory? Their orders will remain.')) {
      // Customers are derived from orders — anonymize by clearing name/email on their orders
      await supabase.from('orders').update({ customer_name: 'Deleted Customer', customer_email: null }).eq('customer_phone', phone);
      setCustomers(prev => prev.filter(c => c.id !== phone));
    }
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><Loader2 className="spin" size={32} color="var(--red)" /></div>;

  return (
    <div>
      <div className="dash-card-header" style={{ marginBottom: 20 }}>
        <div className="dash-card-title" style={{ fontFamily: "'Mona Sans', 'Mona-Sans', 'Helvetica Neue', sans-serif", fontSize: '1.4rem' }}>Customer Directory</div>
        <input className="dash-search" placeholder="🔍 Search customers..." value={search} onChange={e => setSearch(e.target.value)} />
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
                    {isAdmin && (
                      <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)' }} onClick={() => handleDelete(c.phone)}>
                        <Trash2 size={16} />
                      </button>
                    )}
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

    </div>
  );
}
