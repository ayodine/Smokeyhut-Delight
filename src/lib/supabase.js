import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Replace browser Web Locks API with a simple promise-chain lock.
// The Web Locks API causes "lock was stolen" crashes on page load/refresh.
const createMemoryLock = () => {
  let queue = Promise.resolve();
  return (_name, _timeout, fn) => {
    const next = queue.then(() => fn());
    queue = next.catch(() => {});
    return next;
  };
};

// Auth client — used by dashboard and AuthContext
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    lock: createMemoryLock(),
  },
});

// Public client — used by storefront pages (shop, home, checkout)
// No session persistence — purely for reading public data
export const publicSupabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    storageKey: 'sb-public-anon',
    lock: createMemoryLock(),
  },
});

// Customer client — storefront Google sign-in ONLY. Completely separate session
// from the staff `supabase` client (its own storageKey), so a customer login can
// never satisfy the /admin gate and a customer is never treated as staff.
// flowType 'pkce' → Google returns ?code= in the query, while staff recovery uses
// the #hash (implicit) — so the two clients never consume each other's URL tokens.
export const customerSupabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    storageKey: 'sb-customer',
    lock: createMemoryLock(),
  },
});
