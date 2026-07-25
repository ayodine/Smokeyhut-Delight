// Verifies the restock_product RPC end-to-end against the linked (prod) DB.
// Creates a HIDDEN throwaway product (is_active=false, never on the storefront),
// exercises the atomic increment + guards, then hard-deletes it. Touches no real
// inventory. Needs SUPABASE_SERVICE_ROLE_KEY in .env.
//   node scripts/verify_restock_rpc.mjs
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const db = createClient(env.SUPABASE_URL || env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

let failures = 0;
const ok  = (m) => console.log(`  ok   ${m}`);
const bad = (m) => { console.error(`  FAIL ${m}`); failures++; };

// Copy a valid category_id so the throwaway insert passes constraints.
const { data: sample, error: sErr } = await db.from('products').select('category_id').limit(1).single();
if (sErr) { console.error('setup (sample) failed:', sErr.message); process.exit(1); }

const { data: created, error: cErr } = await db.from('products').insert({
  name: `__restock_rpc_test__ ${Date.now()}`,
  description: 'temp', short_desc: 'temp',
  price: 1, stock: 0, is_active: false,
  category_id: sample?.category_id ?? null,
}).select('id').single();
if (cErr) { console.error('setup (insert) failed:', cErr.message); process.exit(1); }
const id = created.id;

try {
  let r = await db.rpc('restock_product', { p_id: id, p_add: 3 });
  if (r.error) bad(`+3 errored: ${r.error.message}`); else if (r.data === 3) ok('+3 -> 3'); else bad(`+3 -> ${r.data} (expected 3)`);

  r = await db.rpc('restock_product', { p_id: id, p_add: 2 });
  if (r.error) bad(`+2 errored: ${r.error.message}`); else if (r.data === 5) ok('+2 -> 5 (atomic sum)'); else bad(`+2 -> ${r.data} (expected 5)`);

  r = await db.rpc('restock_product', { p_id: id, p_add: 0 });
  if (r.error) ok('p_add=0 rejected'); else bad('p_add=0 was NOT rejected');

  r = await db.rpc('restock_product', { p_id: 999999999, p_add: 1 });
  if (r.error) ok('unknown id rejected'); else bad('unknown id was NOT rejected');
} finally {
  await db.from('products').delete().eq('id', id);  // throwaway has no orders
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
