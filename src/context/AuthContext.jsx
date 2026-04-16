import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

async function fetchProfile(authUser) {
  if (!authUser) return null;
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('role, permissions')
      .eq('id', authUser.id)
      .maybeSingle();
    if (error || !data?.role) return null;
    return data;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(() => sessionStorage.getItem('sd_role') || null);
  const [userPermissions, setUserPermissions] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('sd_perms') || '[]'); } catch { return []; }
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const applyProfile = (profile) => {
    const role = profile?.role || null;
    const perms = profile?.permissions || [];
    setUserRole(role);
    setUserPermissions(perms);
    if (role) { sessionStorage.setItem('sd_role', role); sessionStorage.setItem('sd_perms', JSON.stringify(perms)); }
    else { sessionStorage.removeItem('sd_role'); sessionStorage.removeItem('sd_perms'); }
  };

  useEffect(() => {
    // onAuthStateChange fires INITIAL_SESSION on mount — no need for separate getSession()
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      // Password recovery link clicked — redirect to reset page, do NOT establish a dashboard session
      if (event === 'PASSWORD_RECOVERY') {
        if (window.location.pathname !== '/admin/reset-password') {
          window.location.replace('/admin/reset-password');
        }
        setLoading(false);
        return;
      }

      const authUser = session?.user ?? null;
      setUser(authUser);

      if (authUser) {
        const cachedRole = sessionStorage.getItem('sd_role');

        // Apply cached role immediately so ProtectedRoute doesn't flash the spinner
        if (cachedRole) {
          try {
            applyProfile({ role: cachedRole, permissions: JSON.parse(sessionStorage.getItem('sd_perms') || '[]') });
          } catch { /* ignore */ }
        }

        // Fetch real profile from DB — no hard timeout that forces a sign-out
        const profile = await Promise.race([
          fetchProfile(authUser),
          new Promise(resolve => setTimeout(() => resolve('timeout'), 12000)),
        ]);

        if (profile === 'timeout') {
          // Network was slow — keep whatever cached role we have, don't sign out
          if (!cachedRole) {
            setUser(null);
            applyProfile(null);
          }
        } else if (!profile?.role) {
          // DB confirmed no role — this is a real invalid account, sign out
          await supabase.auth.signOut();
          setUser(null);
          applyProfile(null);
        } else {
          applyProfile(profile);
        }
      } else {
        applyProfile(null);
      }

      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email, password) => {
    setError(null);
    setLoading(true); // keep ProtectedRoute in spinner until onAuthStateChange completes
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setLoading(false);
        setError(error.message);
        return { error };
      }
      return { error: null };
      // loading is cleared by onAuthStateChange after role is confirmed
    } catch (err) {
      setLoading(false);
      const msg = err?.message || 'Unable to connect. Check your internet connection.';
      setError(msg);
      return { error: { message: msg } };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    applyProfile(null);
  };

  return (
    <AuthContext.Provider value={{ user, userRole, userPermissions, loading, error, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
