import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { User, LogOut, Package } from 'lucide-react';

export default function AccountMenu() {
  const { user, signInWithGoogle, signOut } = useAuth();
  const [open, setOpen] = useState(false);

  if (!user) {
    return (
      <button onClick={signInWithGoogle} className="cart-btn" aria-label="Sign in with Google"
        style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <User size={16} /> Sign in
      </button>
    );
  }

  const meta = user.user_metadata || {};
  const label = meta.given_name || (meta.full_name || user.email || 'Account').split(' ')[0];

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} className="cart-btn" aria-label="Account menu"
        style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {meta.avatar_url
          ? <img src={meta.avatar_url} alt="" style={{ width: 20, height: 20, borderRadius: '50%' }} />
          : <User size={16} />}
        {label}
      </button>
      {open && (
        <div onMouseLeave={() => setOpen(false)}
          style={{ position: 'absolute', right: 0, top: '110%', background: 'var(--white)', border: '1px solid var(--border-subtle)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', minWidth: 170, zIndex: 50, overflow: 'hidden' }}>
          <Link to="/account" onClick={() => setOpen(false)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', fontSize: '0.85rem', color: 'var(--text)', textDecoration: 'none' }}>
            <Package size={15} /> My Orders
          </Link>
          <button onClick={async () => { setOpen(false); await signOut(); }}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', fontSize: '0.85rem', width: '100%', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text)', borderTop: '1px solid var(--border-subtle)' }}>
            <LogOut size={15} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
