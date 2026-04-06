import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

async function fetchRole(authUser) {
  if (!authUser) return null;
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', authUser.id)
      .maybeSingle();
    if (error || !data?.role) return null; // no profile = not authorized staff
    return data.role;
  } catch {
    return null; // fail secure
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
        // Fetch role with a timeout — if we can't confirm a role, deny access (fail secure)
        const role = await Promise.race([
          fetchRole(authUser),
          new Promise(resolve => setTimeout(() => resolve(sessionStorage.getItem('sd_role') || null), 6000)),
        ]);

        if (!role) {
          // Authenticated user has no staff profile — sign them out immediately
          await supabase.auth.signOut();
          setUser(null);
          applyRole(null);
        } else {
          applyRole(role);
        }
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
