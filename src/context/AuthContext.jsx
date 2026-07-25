import { createContext, useContext, useEffect, useRef, useState } from 'react';
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

  // Resolver set by signIn() so the main auth listener can unblock it once role is confirmed
  const signInResolveRef = useRef(null);

  const applyProfile = (profile) => {
    const role = profile?.role || null;
    const perms = profile?.permissions || [];
    setUserRole(role);
    setUserPermissions(perms);
    if (role) { sessionStorage.setItem('sd_role', role); sessionStorage.setItem('sd_perms', JSON.stringify(perms)); }
    else { sessionStorage.removeItem('sd_role'); sessionStorage.removeItem('sd_perms'); }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
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

        if (cachedRole) {
          try {
            applyProfile({ role: cachedRole, permissions: JSON.parse(sessionStorage.getItem('sd_perms') || '[]') });
          } catch { /* ignore */ }
        }

        const profile = await Promise.race([
          fetchProfile(authUser),
          new Promise(resolve => setTimeout(() => resolve('timeout'), 12000)),
        ]);

        if (profile === 'timeout') {
          if (!cachedRole) {
            setUser(null);
            applyProfile(null);
          }
          // Unblock signIn — treat as valid if we have a cached role
          signInResolveRef.current?.({ error: cachedRole ? null : { message: 'Unable to verify account. Check your connection.' } });
          signInResolveRef.current = null;
        } else if (!profile?.role) {
          // No profile in DB — sign out and surface a clear error to the login form
          await supabase.auth.signOut();
          setUser(null);
          applyProfile(null);
          signInResolveRef.current?.({ error: { message: 'Account not authorised. Contact your administrator.' } });
          signInResolveRef.current = null;
        } else {
          applyProfile(profile);
          signInResolveRef.current?.({ error: null });
          signInResolveRef.current = null;
        }
      } else {
        applyProfile(null);
        // If signIn is waiting and we got a SIGNED_OUT, something went wrong
        signInResolveRef.current?.({ error: { message: 'Sign in failed. Please try again.' } });
        signInResolveRef.current = null;
      }

      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email, password) => {
    setError(null);
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setLoading(false);
        setError(error.message);
        return { error };
      }

      // Block until onAuthStateChange confirms the role, so Login only navigates
      // to the dashboard once we know the account is authorised.
      const result = await new Promise((resolve) => {
        signInResolveRef.current = resolve;
        // Safety timeout — unblock after 15s regardless
        setTimeout(() => {
          if (signInResolveRef.current === resolve) {
            signInResolveRef.current = null;
            resolve({ error: null });
          }
        }, 15000);
      });

      if (result.error) {
        setLoading(false);
        setError(result.error.message);
      }
      return result;
    } catch (err) {
      setLoading(false);
      const msg = err?.message || 'Unable to connect. Check your internet connection.';
      setError(msg);
      return { error: { message: msg } };
    }
  };

  const signInWithGoogle = () =>
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/account' },
    });

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    applyProfile(null);
  };

  return (
    <AuthContext.Provider value={{ user, userRole, userPermissions, loading, error, signIn, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
