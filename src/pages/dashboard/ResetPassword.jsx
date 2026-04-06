import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, Loader2, Eye, EyeOff, CheckCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Supabase picks up the recovery token from the URL hash and fires PASSWORD_RECOVERY
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (err) { setError(err.message); return; }
    setDone(true);
    setTimeout(() => navigate('/admin/login'), 3000);
  };

  if (done) {
    return (
      <div className="login-page">
        <div className="login-card" style={{ textAlign: 'center' }}>
          <CheckCircle size={56} color="var(--red)" style={{ margin: '0 auto 20px' }} />
          <h2>Password Updated</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Your password has been changed. Redirecting to sign in...</p>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="login-page">
        <div className="login-card" style={{ textAlign: 'center' }}>
          <img src="/logo.svg" alt="Smokeyhut Logo" style={{ display: 'block', margin: '0 auto 20px', width: 64, height: 64, objectFit: 'contain' }} />
          <Loader2 size={28} className="spin" style={{ margin: '20px auto', display: 'block', color: 'var(--red)' }} />
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>Verifying reset link...</p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 8 }}>
            If nothing happens, your link may have expired.{' '}
            <button onClick={() => navigate('/admin/login')} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: '0.8rem', padding: 0 }}>
              Go back
            </button>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <img src="/logo.svg" alt="Smokeyhut Logo" style={{ display: 'block', margin: '0 auto 20px', width: 64, height: 64, objectFit: 'contain' }} />
        <h2>Smokeyhut <span style={{ color: 'var(--red)' }}>Admin</span></h2>
        <p className="subtitle">Set a new password for your account</p>
        {error && <div className="login-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ textAlign: 'left' }}>
            <label>New Password</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Min. 8 characters"
                required
                style={{ paddingRight: 44 }}
                autoFocus
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
          <div className="form-group" style={{ textAlign: 'left' }}>
            <label>Confirm Password</label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="Repeat your new password"
              required
            />
          </div>
          <button
            className="btn-primary"
            type="submit"
            disabled={loading}
            style={{ width: '100%', justifyContent: 'center', padding: '14px 28px', display: 'flex', alignItems: 'center', gap: 8 }}
          >
            {loading ? <><Loader2 size={18} className="spin" /> Updating...</> : <><KeyRound size={18} /> Update Password</>}
          </button>
        </form>
      </div>
    </div>
  );
}
