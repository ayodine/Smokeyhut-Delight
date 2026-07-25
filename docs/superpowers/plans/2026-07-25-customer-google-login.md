# Customer Google Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional Google sign-in so customers can prefill checkout and track their orders at `/account`, with orders linked via a server-stamped `user_id` — and harden the `orders`/`order_items` RLS so customer logins can't read other people's orders.

**Architecture:** Reuse Supabase Auth (Google provider). A customer is an `auth.users` row with no staff `profiles.role`. `orders.user_id` is stamped server-side by `create_storefront_order` from `auth.uid()`. RLS is tightened from "any authenticated user" to `is_staff()` for staff, plus per-customer read policies. Logged-in customers create orders through the auth-aware client; guests are unchanged.

**Tech Stack:** React 19 + Vite, Supabase (Postgres RLS + Auth + RPC), Vitest.

## Global Constraints

- Test runner: `npm test` (`vitest run`). Pure logic → `src/lib/*.js` + co-located `*.test.js`. **No React component tests exist**; `.jsx` wiring is verified by build + lint + manual smoke.
- Apply DB migrations with `supabase db query --linked -f <file>`. **NEVER** `supabase db push`.
- Dev server and scripts talk to the **production** database/auth. Test rows/users must be hidden and cleaned up.
- **Login is optional** — the guest checkout path must remain byte-for-byte unchanged in behaviour.
- `user_id` is stamped **server-side from `auth.uid()` only**, never from the client payload.
- Staff vs customer is decided by `is_staff()` (a `profiles.role` exists). Customers can read only their own orders/items.
- **Owner prerequisite (blocks live use, not the build):** Google OAuth must be configured in Google Cloud + Supabase before a real sign-in works. Until then, the automated gates are: build, lint, unit tests, and the RLS verifier (Task 1). Do **not** deploy to the live site until the owner has configured OAuth (a visible-but-broken Sign-in button otherwise). Setup checklist is in Task 3.

---

### Task 1: DB — `user_id`, `is_staff()`, RLS hardening, order stamping (+ verifier)

**Files:**
- Create: `supabase/migrations/20260725_customer_orders_auth.sql`
- Create: `scripts/verify_customer_orders_rls.mjs`

**Interfaces:**
- Consumes: existing `create_storefront_order(p jsonb)`, `orders`, `order_items`, `profiles`.
- Produces: `orders.user_id uuid`; `is_staff() -> bool`; RLS policies `Staff manage orders`, `Customer reads own orders`, `Staff manage order_items`, `Customer reads own order_items`; `create_storefront_order` now stamps `user_id = auth.uid()` and is executable by `anon, authenticated`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260725_customer_orders_auth.sql`:

```sql
-- Customer login groundwork: link orders to auth users, and harden RLS so a
-- signed-in customer can only ever see their own orders (the existing policies
-- gave every authenticated user full access, which was safe only while all
-- authenticated users were staff).

-- 1. Owner column (NULL = guest order).
alter table orders add column if not exists user_id uuid references auth.users(id);
create index if not exists idx_orders_user_id on orders(user_id);

-- 2. Staff detector: an auth user that has a profiles row with a non-null role.
create or replace function is_staff()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from profiles where id = auth.uid() and role is not null);
$$;
revoke all on function is_staff() from anon, public;
grant execute on function is_staff() to authenticated;

-- 3. orders: replace the over-broad "authenticated == staff" policy.
drop policy if exists "Auth manage orders" on orders;
create policy "Staff manage orders" on orders
  for all to authenticated using (is_staff()) with check (is_staff());
create policy "Customer reads own orders" on orders
  for select to authenticated using (user_id = auth.uid());

-- 4. order_items: same hardening (line items reveal what everyone ordered).
drop policy if exists "Auth manage order_items" on order_items;
create policy "Staff manage order_items" on order_items
  for all to authenticated using (is_staff()) with check (is_staff());
create policy "Customer reads own order_items" on order_items
  for select to authenticated using (exists (
    select 1 from orders o where o.id = order_items.order_id and o.user_id = auth.uid()
  ));

-- 5. Stamp user_id from auth.uid() (full function re-created, original body + user_id).
create or replace function create_storefront_order(p jsonb)
returns text
language plpgsql security definer
as $$
declare v_id text;
begin
  insert into orders (
    customer_name, customer_email, customer_phone,
    delivery_address, delivery_zone, store_id,
    payment_method, total, delivery_fee,
    coupon_code, coupon_discount, status, notes,
    paystack_ref, created_at, channel, user_id
  ) values (
    p->>'customer_name',
    nullif(p->>'customer_email', ''),
    p->>'customer_phone',
    p->>'delivery_address',
    nullif(p->>'delivery_zone', ''),
    case when (p->>'store_id') is not null then (p->>'store_id')::int else null end,
    p->>'payment_method',
    (p->>'total')::numeric,
    (p->>'delivery_fee')::numeric,
    nullif(p->>'coupon_code', ''),
    coalesce((p->>'coupon_discount')::numeric, 0),
    coalesce(nullif(p->>'status', ''), 'pending'),
    nullif(p->>'notes', ''),
    nullif(p->>'paystack_ref', ''),
    now(),
    'storefront',
    auth.uid()
  )
  returning id into v_id;
  return v_id;
end;
$$;
grant execute on function create_storefront_order(jsonb) to anon, authenticated;
```

- [ ] **Step 2: Write the RLS verifier**

Create `scripts/verify_customer_orders_rls.mjs`. It creates two throwaway (non-staff) auth users, inserts hidden test orders as service-role, then checks isolation, stamping, and anon-blocking with real JWTs, and cleans everything up.

```js
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

const A = await mkUser('a');
const B = await mkUser('b');
const orderA = await mkOrder(A.id, '__rls_test_A');
const orderB = await mkOrder(B.id, '__rls_test_B');
const created = [orderA, orderB];

try {
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
  await admin.from('orders').delete().in('id', created);
  await admin.auth.admin.deleteUser(A.id);
  await admin.auth.admin.deleteUser(B.id);
}
console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 3: Run the verifier to confirm it FAILS (migration not applied)**

Run: `node scripts/verify_customer_orders_rls.mjs`
Expected: FAIL — `insert order` throws because `orders.user_id` does not exist yet (non-zero exit).

- [ ] **Step 4: Apply the migration to prod**

Run: `supabase db query --linked -f supabase/migrations/20260725_customer_orders_auth.sql`
Expected: completes with no error.

- [ ] **Step 5: Run the verifier to confirm it PASSES**

Run: `node scripts/verify_customer_orders_rls.mjs`
Expected:
```
  ok   customer A sees only its own order
  ok   create_storefront_order stamped user_id from JWT
  ok   anon sees no orders
  ok   guest order via anon has NULL user_id

ALL PASS
```

- [ ] **Step 6: Confirm staff access is intact**

Open the live dashboard **Orders** page as a staff user and confirm it still lists all orders (the tightened `Staff manage orders` policy must not have broken staff access).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260725_customer_orders_auth.sql scripts/verify_customer_orders_rls.mjs
git commit -m "feat: orders.user_id + is_staff() RLS hardening + owner stamping"
```

---

### Task 2: `profileToPrefill` helper + unit tests

**Files:**
- Create: `src/lib/customerProfile.js`
- Create: `src/lib/customerProfile.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `profileToPrefill(user) -> { firstName, lastName, email }`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/customerProfile.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { profileToPrefill } from './customerProfile';

describe('profileToPrefill', () => {
  it('uses given_name / family_name / email when present', () => {
    const u = { email: 'a@b.com', user_metadata: { given_name: 'Ada', family_name: 'Obi', email: 'a@b.com' } };
    expect(profileToPrefill(u)).toEqual({ firstName: 'Ada', lastName: 'Obi', email: 'a@b.com' });
  });
  it('splits full_name when given/family are absent', () => {
    const u = { email: 'x@y.com', user_metadata: { full_name: 'Ada Grace Obi' } };
    expect(profileToPrefill(u)).toEqual({ firstName: 'Ada', lastName: 'Grace Obi', email: 'x@y.com' });
  });
  it('falls back to top-level email and empty names', () => {
    expect(profileToPrefill({ email: 'z@z.com', user_metadata: {} })).toEqual({ firstName: '', lastName: '', email: 'z@z.com' });
  });
  it('returns all-empty for null user', () => {
    expect(profileToPrefill(null)).toEqual({ firstName: '', lastName: '', email: '' });
  });
});
```

- [ ] **Step 2: Run to verify FAIL**

Run: `npm test -- src/lib/customerProfile.test.js`
Expected: FAIL — cannot resolve `./customerProfile`.

- [ ] **Step 3: Implement**

Create `src/lib/customerProfile.js`:

```js
// Map a Supabase auth user (Google identity) to checkout prefill fields.
export function profileToPrefill(user) {
  const m = user?.user_metadata || {};
  const email = m.email || user?.email || '';
  let firstName = m.given_name || '';
  let lastName = m.family_name || '';
  if (!firstName && !lastName && m.full_name) {
    const parts = String(m.full_name).trim().split(/\s+/);
    firstName = parts.shift() || '';
    lastName = parts.join(' ');
  }
  return { firstName, lastName, email };
}
```

- [ ] **Step 4: Run to verify PASS**

Run: `npm test -- src/lib/customerProfile.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/customerProfile.js src/lib/customerProfile.test.js
git commit -m "feat: profileToPrefill helper (google profile -> checkout fields)"
```

---

### Task 3: `AuthContext.signInWithGoogle`

**Files:**
- Modify: `src/context/AuthContext.jsx` (add method ~line 141; add to value object ~line 146)

**Interfaces:**
- Consumes: `supabase` (existing import).
- Produces: `signInWithGoogle()` on the context value (alongside existing `user`, `signOut`).

**Owner OAuth setup checklist (perform before live sign-in works):**
1. Google Cloud Console → APIs & Services → Credentials → Create OAuth client ID (Web). Configure the consent screen.
2. Authorized redirect URI: `https://itpnfalqjjicesqcjzix.supabase.co/auth/v1/callback`
3. Supabase → Authentication → Providers → Google: enable, paste Client ID + Secret.
4. Supabase → Authentication → URL Configuration: Site URL + Redirect URLs include `https://smokeyhutdelight.com`, `https://www.smokeyhutdelight.com`, `http://localhost:5173`.

- [ ] **Step 1: Add `signInWithGoogle` next to `signOut`**

In `src/context/AuthContext.jsx`, immediately before `const signOut = async () => {` (line ~141):

```jsx
const signInWithGoogle = () =>
  supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + '/account' },
  });
```

- [ ] **Step 2: Expose it on the context value**

Change the provider value (line ~146):

```jsx
    <AuthContext.Provider value={{ user, userRole, userPermissions, loading, error, signIn, signInWithGoogle, signOut }}>
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build succeeds (no automated behaviour test — OAuth is a redirect; verified live once the owner setup is done).

- [ ] **Step 4: Commit**

```bash
git add src/context/AuthContext.jsx
git commit -m "feat: signInWithGoogle in AuthContext"
```

---

### Task 4: Order write path + prefill (Checkout + MenuPage)

**Files:**
- Modify: `src/pages/storefront/Checkout.jsx` (imports line 6; add `useAuth`, `supabase`, `profileToPrefill`; add `orderClient` + prefill effect; swap 2 RPC call sites lines 285, 354)
- Modify: `src/pages/storefront/MenuPage.jsx` (imports line 8; same additions; swap 2 RPC call sites lines 248, 327)

**Interfaces:**
- Consumes: `useAuth().user`, `supabase`, `publicSupabase`, `profileToPrefill` (Task 2).
- Produces: nothing consumed later.

- [ ] **Step 1: Checkout — imports**

In `src/pages/storefront/Checkout.jsx`, change line 6:

```js
import { publicSupabase } from '../../lib/supabase';
```
to:
```js
import { publicSupabase, supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { profileToPrefill } from '../../lib/customerProfile';
```

- [ ] **Step 2: Checkout — `user`, `orderClient`, prefill effect**

Just after the `form` state (line ~46), add:

```jsx
const { user } = useAuth();
const orderClient = user ? supabase : publicSupabase;
useEffect(() => {
  if (!user) return;
  const pre = profileToPrefill(user);
  setForm(f => ({
    ...f,
    firstName: f.firstName || pre.firstName,
    lastName: f.lastName || pre.lastName,
    email: f.email || pre.email,
  }));
}, [user]);
```

(`useEffect` is already imported in Checkout.)

- [ ] **Step 3: Checkout — swap both order-creation clients**

Line ~285 (bank transfer):
```js
      const { data, error } = await publicSupabase.rpc('create_storefront_order', { p: payload });
```
→
```js
      const { data, error } = await orderClient.rpc('create_storefront_order', { p: payload });
```

Line ~354 (paystack):
```js
      const { data: orderId, error } = await publicSupabase.rpc('create_storefront_order', { p: payload });
```
→
```js
      const { data: orderId, error } = await orderClient.rpc('create_storefront_order', { p: payload });
```

Leave the two `publicSupabase.from('order_items').insert(...)` calls unchanged.

- [ ] **Step 4: MenuPage — imports**

In `src/pages/storefront/MenuPage.jsx`, change line 8:
```js
import { publicSupabase } from '../../lib/supabase';
```
to:
```js
import { publicSupabase, supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { profileToPrefill } from '../../lib/customerProfile';
```

- [ ] **Step 5: MenuPage — `user`, `orderClient`, prefill effect**

Just after the `form` state (line ~68), add:

```jsx
const { user } = useAuth();
const orderClient = user ? supabase : publicSupabase;
useEffect(() => {
  if (!user) return;
  const pre = profileToPrefill(user);
  setForm(f => ({
    ...f,
    firstName: f.firstName || pre.firstName,
    lastName: f.lastName || pre.lastName,
    email: f.email || pre.email,
  }));
}, [user]);
```

(Confirm `useEffect` is imported in MenuPage; it is used elsewhere in the file — line 158.)

- [ ] **Step 6: MenuPage — swap both order-creation clients**

Line ~248 (bank transfer): `publicSupabase.rpc('create_storefront_order'` → `orderClient.rpc('create_storefront_order'` (the `const { data, error } = ...` line).
Line ~327 (paystack): `publicSupabase.rpc('create_storefront_order'` → `orderClient.rpc('create_storefront_order'` (the `const { data: orderId, error } = ...` line).
Leave both `publicSupabase.from('order_items').insert(...)` unchanged.

- [ ] **Step 7: Lint + build**

Run: `npx eslint src/pages/storefront/Checkout.jsx src/pages/storefront/MenuPage.jsx && npm run build`
Expected: no NEW errors (pre-existing warnings unchanged); build succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/pages/storefront/Checkout.jsx src/pages/storefront/MenuPage.jsx
git commit -m "feat: link orders to signed-in customer + prefill checkout from Google"
```

---

### Task 5: Navbar account menu

**Files:**
- Create: `src/components/AccountMenu.jsx`
- Modify: `src/components/Navbar.jsx` (import; render in `.nav-right` ~line 56)

**Interfaces:**
- Consumes: `useAuth().user`, `signInWithGoogle`, `signOut`.
- Produces: `<AccountMenu />`.

- [ ] **Step 1: Create the component**

Create `src/components/AccountMenu.jsx`:

```jsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { User, LogOut, Package } from 'lucide-react';

export default function AccountMenu() {
  const { user, signInWithGoogle, signOut } = useAuth();
  const [open, setOpen] = useState(false);

  if (!user) {
    return (
      <button onClick={signInWithGoogle} className="cart-btn" aria-label="Sign in with Google"
        style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <User size={16} /> Sign in
      </button>
    );
  }

  const meta = user.user_metadata || {};
  const label = meta.given_name || (meta.full_name || user.email || 'Account').split(' ')[0];

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} className="cart-btn" aria-label="Account menu"
        style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {meta.avatar_url
          ? <img src={meta.avatar_url} alt="" style={{ width: 20, height: 20, borderRadius: '50%' }} />
          : <User size={16} />}
        {label}
      </button>
      {open && (
        <div onMouseLeave={() => setOpen(false)}
          style={{ position: 'absolute', right: 0, top: '110%', background: 'var(--white)', border: '1px solid var(--border-subtle)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', minWidth: 170, zIndex: 50, overflow: 'hidden' }}>
          <Link to="/account" onClick={() => setOpen(false)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', fontSize: '0.85rem', color: 'var(--text)', textDecoration: 'none' }}>
            <Package size={15} /> My Orders
          </Link>
          <button onClick={async () => { setOpen(false); await signOut(); }}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', fontSize: '0.85rem', width: '100%', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text)', borderTop: '1px solid var(--border-subtle)' }}>
            <LogOut size={15} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Render it in the navbar**

In `src/components/Navbar.jsx`, add the import after line 5:
```js
import AccountMenu from './AccountMenu';
```
Then inside `<div className="nav-right">` (line 56), add `<AccountMenu />` immediately before the cart button:
```jsx
            <div className="nav-right">
              <AccountMenu />
              <button className="cart-btn desktop-cart" onClick={onCartOpen} aria-label="Open cart">
```

- [ ] **Step 3: Lint + build**

Run: `npx eslint src/components/AccountMenu.jsx src/components/Navbar.jsx && npm run build`
Expected: clean (no new errors); build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/AccountMenu.jsx src/components/Navbar.jsx
git commit -m "feat: navbar account menu (Google sign-in / My Orders / sign out)"
```

---

### Task 6: `/account` My Orders page + route

**Files:**
- Create: `src/pages/storefront/Account.jsx`
- Modify: `src/App.jsx` (import Account; add route beside the other storefront routes ~lines 86-96)

**Interfaces:**
- Consumes: `useAuth().user`, `signInWithGoogle`, `supabase`.
- Produces: `/account` route.

- [ ] **Step 1: Create the page**

Create `src/pages/storefront/Account.jsx`:

```jsx
import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

const STATUS_COLORS = {
  pending: '#f59e0b', pending_payment: '#f59e0b', paid: '#16a34a',
  shipped: '#2563eb', delivered: '#16a34a', cancelled: '#ef4444',
};
const fmt = (n) => '₦' + Number(n || 0).toLocaleString();

export default function Account() {
  const { user, signInWithGoogle } = useAuth();
  const [orders, setOrders] = useState([]);
  const [items, setItems] = useState({});   // { order_id: [{name, qty}] }
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    let alive = true;
    (async () => {
      setLoading(true);
      const { data: ords } = await supabase
        .from('orders')
        .select('id, created_at, total, status, payment_method')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (!alive) return;
      const list = ords || [];
      setOrders(list);
      if (list.length) {
        const { data: its } = await supabase
          .from('order_items').select('order_id, name, qty')
          .in('order_id', list.map(o => o.id));
        if (!alive) return;
        const grouped = {};
        (its || []).forEach(it => { (grouped[it.order_id] ||= []).push(it); });
        setItems(grouped);
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [user]);

  if (!user) {
    return (
      <div style={{ maxWidth: 480, margin: '60px auto', padding: '0 20px', textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.4rem', marginBottom: 12 }}>My Orders</h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: 20 }}>Sign in to see and track your orders.</p>
        <button onClick={signInWithGoogle} className="btn-primary" style={{ padding: '12px 20px' }}>Sign in with Google</button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 760, margin: '40px auto', padding: '0 20px' }}>
      <h1 style={{ fontSize: '1.4rem', marginBottom: 20 }}>My Orders</h1>
      {loading ? (
        <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
      ) : orders.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>You have no orders yet.</p>
      ) : orders.map(o => (
        <div key={o.id} style={{ border: '1px solid var(--border-subtle)', borderRadius: 12, padding: 16, marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div>
              <div style={{ fontWeight: 800 }}>{o.id}</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{new Date(o.created_at).toLocaleDateString()}</div>
            </div>
            <span style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', color: '#fff', background: STATUS_COLORS[o.status] || '#6b7280', padding: '4px 10px', borderRadius: 20 }}>
              {o.status === 'pending_payment' ? 'Awaiting Payment' : o.status}
            </span>
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 6 }}>
            {(items[o.id] || []).map(it => `${it.qty}× ${it.name}`).join(', ') || '—'}
          </div>
          <div style={{ fontWeight: 800 }}>{fmt(o.total)}</div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Add the route**

In `src/App.jsx`, add an import alongside the other storefront page imports:
```js
import Account from './pages/storefront/Account';
```
Then add the route beside the other storefront routes (after line 96, `<Route path="refund" element={<Refund />} />`):
```jsx
        <Route path="account" element={<Account />} />
```

- [ ] **Step 3: Lint + build**

Run: `npx eslint src/pages/storefront/Account.jsx src/App.jsx && npm run build`
Expected: clean; build succeeds.

- [ ] **Step 4: Full test suite**

Run: `npm test`
Expected: all suites pass (includes the new `customerProfile` tests).

- [ ] **Step 5: Commit**

```bash
git add src/pages/storefront/Account.jsx src/App.jsx
git commit -m "feat: /account My Orders page (own orders via RLS)"
```

---

## Self-Review

**Spec coverage:**
- Optional login, guest unchanged → Task 4 (only the RPC client switches; guest path identical). ✓
- `orders.user_id` + server stamping via `auth.uid()` → Task 1 (col + RPC). ✓
- RLS hardening `orders` + `order_items` to `is_staff()` + per-customer read → Task 1. ✓
- Order write via auth client when logged in → Task 4. ✓
- Prefill from Google profile → Task 2 (`profileToPrefill`) + Task 4 (effect). ✓
- Navbar sign-in / account menu → Task 5. ✓
- `/account` My Orders (own orders via RLS) → Task 6. ✓
- `signInWithGoogle` in reused AuthContext → Task 3. ✓
- Owner OAuth prerequisite documented → Task 3 checklist + Global Constraints. ✓
- Testing: RLS verifier (Task 1), unit tests (Task 2), build/lint/manual for wiring. ✓
- Out of scope (offers, live tracking, email-match, customer profile table, anon_update_orders) → not implemented. ✓

**Placeholder scan:** none — every code step has complete code; every run step has command + expected output.

**Type consistency:** `create_storefront_order(p jsonb)` called as `{ p: payload }` at all sites (Task 1 def, Task 4 calls). `profileToPrefill(user) -> {firstName,lastName,email}` produced in Task 2, consumed in Task 4 with the same keys. `is_staff()` boolean used in all four policies (Task 1). `signInWithGoogle` defined Task 3, consumed in Tasks 5 & 6. ✓
