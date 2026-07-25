import { useEffect, useState } from 'react';
import { useCustomerAuth } from '../../context/CustomerAuthContext';
import { customerSupabase } from '../../lib/supabase';

const STATUS_COLORS = {
  pending: '#f59e0b', pending_payment: '#f59e0b', paid: '#16a34a',
  shipped: '#2563eb', delivered: '#16a34a', cancelled: '#ef4444',
};
const fmt = (n) => '₦' + Number(n || 0).toLocaleString();

export default function Account() {
  const { user, signInWithGoogle } = useCustomerAuth();
  const [orders, setOrders] = useState([]);
  const [items, setItems] = useState({});   // { order_id: [{name, qty}] }
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    let alive = true;
    (async () => {
      setLoading(true);
      const { data: ords } = await customerSupabase
        .from('orders')
        .select('id, created_at, total, status, payment_method')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (!alive) return;
      const list = ords || [];
      setOrders(list);
      if (list.length) {
        const { data: its } = await customerSupabase
          .from('order_items').select('order_id, name, qty')
          .in('order_id', list.map(o => o.id));
        if (!alive) return;
        const grouped = {};
        (its || []).forEach(it => { (grouped[it.order_id] ||= []).push(it); });
        setItems(grouped);
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [user]);

  if (!user) {
    return (
      <div style={{ maxWidth: 480, margin: '60px auto', padding: '0 20px', textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.4rem', marginBottom: 12 }}>My Orders</h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: 20 }}>Sign in to see and track your orders.</p>
        <button onClick={signInWithGoogle} className="btn-primary" style={{ padding: '12px 20px' }}>Sign in with Google</button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 760, margin: '40px auto', padding: '0 20px' }}>
      <h1 style={{ fontSize: '1.4rem', marginBottom: 20 }}>My Orders</h1>
      {loading ? (
        <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
      ) : orders.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>You have no orders yet.</p>
      ) : orders.map(o => (
        <div key={o.id} style={{ border: '1px solid var(--border-subtle)', borderRadius: 12, padding: 16, marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div>
              <div style={{ fontWeight: 800 }}>{o.id}</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{new Date(o.created_at).toLocaleDateString()}</div>
            </div>
            <span style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', color: '#fff', background: STATUS_COLORS[o.status] || '#6b7280', padding: '4px 10px', borderRadius: 20 }}>
              {o.status === 'pending_payment' ? 'Awaiting Payment' : o.status}
            </span>
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 6 }}>
            {(items[o.id] || []).map(it => `${it.qty}× ${it.name}`).join(', ') || '—'}
          </div>
          <div style={{ fontWeight: 800 }}>{fmt(o.total)}</div>
        </div>
      ))}
    </div>
  );
}
