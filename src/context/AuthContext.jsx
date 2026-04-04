import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Mock session checking
    const savedUser = localStorage.getItem('smokeyhut_mock_user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
    setLoading(false);
  }, []);

  const signIn = async (email, password) => {
    setError(null);
    // Mock login logic
    if (email === 'admin@smokeyhut.com' && password === 'admin') {
      const mockUser = { id: 'mock-user-1', email };
      setUser(mockUser);
      localStorage.setItem('smokeyhut_mock_user', JSON.stringify(mockUser));
      return { error: null };
    }
    
    const msg = 'Invalid credentials. Use admin@smokeyhut.com / admin';
    setError(msg);
    return { error: new Error(msg) };
  };

  const signOut = async () => {
    // Mock signout
    setUser(null);
    localStorage.removeItem('smokeyhut_mock_user');
  };

  return (
    <AuthContext.Provider value={{ user, loading, error, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
