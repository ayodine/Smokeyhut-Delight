import { createContext, useContext, useEffect, useState } from 'react';
import { customerSupabase } from '../lib/supabase';

// Storefront customer identity — entirely separate from the staff AuthContext.
// It has NO role logic and NEVER signs anyone out: any Google user is a valid
// customer. Because it uses its own Supabase client/session, a customer login
// gives the staff client nothing, so it can never unlock /admin.
const CustomerAuthContext = createContext(null);

export function CustomerAuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    customerSupabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    const { data: { subscription } } = customerSupabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  const signInWithGoogle = () =>
    customerSupabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/account' },
    });

  const signOut = () => customerSupabase.auth.signOut();

  return (
    <CustomerAuthContext.Provider value={{ user, loading, signInWithGoogle, signOut }}>
      {children}
    </CustomerAuthContext.Provider>
  );
}

export const useCustomerAuth = () => useContext(CustomerAuthContext);
