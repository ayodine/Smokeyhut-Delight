import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function Login() {
  const { signIn, error } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);
    if (!error) navigate('/admin');
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <img src="/logo.svg" alt="Smokeyhut Logo" style={{ display: 'block', margin: '0 auto 20px', width: 64, height: 64, objectFit: 'contain' }} />
        <h2>Smokeyhut <span style={{ color: 'var(--red)' }}>Admin</span></h2>
        <p className="subtitle">Sign in to manage your stores</p>
        {error && <div className="login-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ textAlign: 'left' }}>
            <label>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@smokeyhut.com" required />
          </div>
          <div className="form-group" style={{ textAlign: 'left' }}>
            <label>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
          </div>
          <button className="btn-primary" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center', padding: '14px 28px', display: 'flex', alignItems: 'center', gap: 8 }}>
            {loading ? <><Loader2 size={18} className="spin" /> Signing in...</> : <><LogIn size={18} /> Sign In</>}
          </button>
        </form>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 20, lineHeight: 1.6 }}>
          Authorized personnel only. Contact your administrator if you need access.
        </p>
      </div>
    </div>
  );
}
