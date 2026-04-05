import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

async function fetchRole(authUser) {
  if (!authUser) return null;
  try {
    const { data } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', authUser.id)
      .maybeSingle();
    return data?.role || 'Admin';
  } catch {
    return 'Admin';
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // Seed from sessionStorage so role is available instantly on re-renders / token refreshes
  const [userRole, setUserRole] = useState(() => sessionStorage.getItem('sd_role') || null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const applyRole = (role) => {
    setUserRole(role);
    if (role) sessionStorage.setItem('sd_role', role);
    else sessionStorage.removeItem('sd_role');
  };

  useEffect(() => {
    // onAuthStateChange fires INITIAL_SESSION on mount — no need for separate getSession()
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const authUser = session?.user ?? null;
      setUser(authUser);

      if (authUser) {
        // Fetch role with a hard 4-second timeout so loading never hangs
        const role = await Promise.race([
          fetchRole(authUser),
          new Promise(resolve => setTimeout(() => resolve(sessionStorage.getItem('sd_role') || 'Admin'), 4000)),
        ]);
        applyRole(role);
      } else {
        applyRole(null);
      }

      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email, password) => {
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message);
        return { error };
      }
      return { error: null };
    } catch (err) {
      const msg = err?.message || 'Unable to connect. Check your internet connection.';
      setError(msg);
      return { error: { message: msg } };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    applyRole(null);
  };

  return (
    <AuthContext.Provider value={{ user, userRole, loading, error, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
