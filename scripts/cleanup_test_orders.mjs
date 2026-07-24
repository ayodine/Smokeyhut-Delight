// Soft-delete test orders created during local Paystack testing.
// Soft-delete (sets deleted_at) removes them from stats, the Orders page, and
// the partner poll everywhere. Needs the service-role key (writes bypass RLS).
//
// Usage:
//   node scripts/cleanup_test_orders.mjs --list                 # show recent test-looking orders
//   node scripts/cleanup_test_orders.mjs SHD-03999 SHD-04000    # soft-delete these order ids
//
// If it 401s, the service-role key in .env is stale — refresh it with:
//   supabase projects api-keys --project-ref itpnfalqjjicesqcjzix
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('=')).map(l => {
      const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);
const URL_ = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const KEY  = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) { console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env'); process.exit(1); }
const db = createClient(URL_, KEY);

const args = process.argv.slice(2);

if (args.includes('--list') || args.length === 0) {
  const { data, error } = await db
    .from('orders')
    .select('id, status, payment_method, paid_at, customer_name, total, created_at')
    .eq('payment_method', 'paystack')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(25);
  if (error) { console.error(error.message); process.exit(1); }
  if (!data.length) { console.log('No non-deleted paystack orders.'); process.exit(0); }
  console.table(data);
  console.log('\nTo soft-delete: node scripts/cleanup_test_orders.mjs <id> <id> ...');
  process.exit(0);
}

// Soft-delete the given ids.
const ids = args;
const { data, error } = await db
  .from('orders')
  .update({ deleted_at: new Date().toISOString() })
  .in('id', ids)
  .select('id, status');
if (error) { console.error(error.message); process.exit(1); }
console.log(`Soft-deleted ${data.length} order(s):`, data.map(o => `${o.id}(${o.status})`).join(', '));
if (data.length !== ids.length) {
  console.warn('Note: some ids were not found or already deleted.');
}
