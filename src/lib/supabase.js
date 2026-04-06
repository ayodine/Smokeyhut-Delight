import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Auth client — used by dashboard and AuthContext
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Public client — used by storefront pages (shop, home, checkout)
// No auth state = no lock contention with the auth client
export const publicSupabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
