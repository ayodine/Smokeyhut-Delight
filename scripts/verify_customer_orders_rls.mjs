// Verifies customer-orders RLS + user_id stamping against the linked (prod) DB.
// Creates two throwaway auth users + hidden test orders, exercises the policies
// with real JWTs, then deletes it all. Needs SUPABASE_SERVICE_ROLE_KEY + anon key.
//   node scripts/verify_customer_orders_rls.mjs
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const URL_ = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });

let failures = 0;
const ok = (m) => console.log(`  ok   ${m}`);
const bad = (m) => { console.error(`  FAIL ${m}`); failures++; };
const pw = 'Test-' + Math.random().toString(36).slice(2) + '!A9';

const mkUser = async (tag) => {
  const email = `__rls_test_${tag}_${Date.now()}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
  if (error) throw new Error('createUser: ' + error.message);
  return { id: data.user.id, email };
};
const mkOrder = async (uid, marker) => {
  const { data, error } = await admin.from('orders').insert({
    customer_name: marker, customer_phone: '0', payment_method: 'bank_transfer',
    total: 1, delivery_fee: 0, status: 'pending', channel: 'storefront', user_id: uid,
  }).select('id').single();
  if (error) throw new Error('insert order: ' + error.message);
  return data.id;
};

let A = null, B = null;
const created = [];

try {
  A = await mkUser('a');
  B = await mkUser('b');
  const orderA = await mkOrder(A.id, '__rls_test_A');
  const orderB = await mkOrder(B.id, '__rls_test_B');
  created.push(orderA, orderB);

  const aClient = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { error: sErr } = await aClient.auth.signInWithPassword({ email: A.email, password: pw });
  if (sErr) throw new Error('signin A: ' + sErr.message);

  // Isolation: A sees only its own order.
  const { data: aRows, error: aErr } = await aClient.from('orders').select('id').in('id', [orderA, orderB]);
  if (aErr) bad('A read errored: ' + aErr.message);
  else if (aRows.length === 1 && aRows[0].id === orderA) ok('customer A sees only its own order');
  else bad(`A saw [${aRows.map(r => r.id)}] (expected only ${orderA})`);

  // Stamping: create via A's JWT stamps user_id = A.
  const { data: newId, error: cErr } = await aClient.rpc('create_storefront_order', { p: {
    customer_name: '__rls_test_stamp', customer_phone: '0', payment_method: 'bank_transfer',
    total: 1, delivery_fee: 0, status: 'pending',
  } });
  if (cErr) bad('A create errored: ' + cErr.message);
  else {
    created.push(newId);
    const { data: chk } = await admin.from('orders').select('user_id').eq('id', newId).single();
    if (chk?.user_id === A.id) ok('create_storefront_order stamped user_id from JWT');
    else bad(`stamp: user_id=${chk?.user_id} (expected ${A.id})`);
  }

  // Anon: cannot read orders, and its orders get NULL user_id.
  const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { data: anonRows } = await anon.from('orders').select('id').in('id', [orderA, orderB]);
  if ((anonRows || []).length === 0) ok('anon sees no orders'); else bad(`anon saw ${anonRows.length} orders`);
  const { data: gId, error: gErr } = await anon.rpc('create_storefront_order', { p: {
    customer_name: '__rls_test_guest', customer_phone: '0', payment_method: 'bank_transfer',
    total: 1, delivery_fee: 0, status: 'pending',
  } });
  if (gErr) bad('anon create errored: ' + gErr.message);
  else {
    created.push(gId);
    const { data: chk } = await admin.from('orders').select('user_id').eq('id', gId).single();
    if (chk?.user_id === null) ok('guest order via anon has NULL user_id');
    else bad(`guest stamp: user_id=${chk?.user_id} (expected null)`);
  }
} finally {
  if (created.length) await admin.from('orders').delete().in('id', created);
  if (A) await admin.auth.admin.deleteUser(A.id);
  if (B) await admin.auth.admin.deleteUser(B.id);
}
console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
