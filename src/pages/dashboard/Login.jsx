import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, Loader2, Eye, EyeOff, KeyRound, ArrowLeft, Mail } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

export default function Login() {
  const { signIn, error } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Forgot password state
  const [forgotMode, setForgotMode] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetError, setResetError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);
    if (!error) navigate('/admin');
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    if (!resetEmail.trim()) return;
    setResetLoading(true);
    setResetError('');
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
      redirectTo: `${window.location.origin}/admin/reset-password`,
    });
    setResetLoading(false);
    if (error) {
      setResetError(error.message);
    } else {
      setResetSent(true);
    }
  };

  if (forgotMode) {
    return (
      <div className="login-page">
        <div className="login-card">
          <img src="/logo.svg" alt="Smokeyhut Logo" style={{ display: 'block', margin: '0 auto 20px', width: 64, height: 64, objectFit: 'contain' }} />
          <h2>Smokeyhut <span style={{ color: 'var(--red)' }}>Admin</span></h2>

          {resetSent ? (
            <>
              <div style={{ background: 'rgba(40,167,69,0.12)', border: '1px solid rgba(40,167,69,0.3)', borderRadius: 10, padding: '16px', marginTop: 20, textAlign: 'center' }}>
                <Mail size={28} color="#28a745" style={{ marginBottom: 8 }} />
                <p style={{ margin: 0, color: '#28a745', fontWeight: 600, fontSize: '0.95rem' }}>Reset link sent!</p>
                <p style={{ margin: '8px 0 0', color: 'var(--text-muted)', fontSize: '0.82rem', lineHeight: 1.6 }}>
                  Check <strong>{resetEmail}</strong> for a password reset link.
                </p>
              </div>
              <button
                onClick={() => { setForgotMode(false); setResetSent(false); setResetEmail(''); }}
                style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '20px auto 0', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.85rem' }}
              >
                <ArrowLeft size={16} /> Back to sign in
              </button>
            </>
          ) : (
            <>
              <p className="subtitle">Enter your email and we'll send a reset link</p>
              {resetError && <div className="login-error">{resetError}</div>}
              <form onSubmit={handleForgotPassword}>
                <div className="form-group" style={{ textAlign: 'left' }}>
                  <label>Email</label>
                  <input
                    type="email"
                    value={resetEmail}
                    onChange={e => setResetEmail(e.target.value)}
                    placeholder="your@email.com"
                    required
                    autoFocus
                  />
                </div>
                <button
                  className="btn-primary"
                  type="submit"
                  disabled={resetLoading}
                  style={{ width: '100%', justifyContent: 'center', padding: '14px 28px', display: 'flex', alignItems: 'center', gap: 8 }}
                >
                  {resetLoading
                    ? <><Loader2 size={18} className="spin" /> Sending...</>
                    : <><KeyRound size={18} /> Send Reset Link</>
                  }
                </button>
              </form>
              <button
                onClick={() => { setForgotMode(false); setResetError(''); }}
                style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '16px auto 0', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.85rem' }}
              >
                <ArrowLeft size={16} /> Back to sign in
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

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
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                style={{ paddingRight: 44 }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: 0 }}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          <div style={{ textAlign: 'right', marginTop: -12, marginBottom: 16 }}>
            <button
              type="button"
              onClick={() => setForgotMode(true)}
              style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: '0.82rem', padding: 0 }}
            >
              Forgot password?
            </button>
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
