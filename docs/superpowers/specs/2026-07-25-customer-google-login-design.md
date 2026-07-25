# Customer Google Login (+ order linking + "My Orders") — Design

**Date:** 2026-07-25
**Status:** Approved (design)

## Problem / Goal

The storefront has **no customer login**. Shoppers check out as guests; nothing
ties an order to a person, so there is no order history/tracking and no reliable
way to reach a customer later (a prerequisite for the *next* feature, cart
abandonment). Add **optional Google sign-in**: guests keep checking out exactly as
today, but a signed-in customer gets their details prefilled and their orders
linked to a "My Orders" page they can track.

## Decisions (locked with the user)

- **Login is optional.** Guest checkout is unchanged. Signing in is a convenience
  (prefill) + linkage (tracking). No conversion friction.
- **History = signed-in orders only.** An order is linked only if placed while
  signed in (`user_id` stamped at creation). No email-matching of past guest
  orders.
- **"My Orders" is a status list**, not live delivery tracking — the existing
  order statuses (pending / paid / shipped / delivered / cancelled) as badges.
- **Google only** (no email/password for customers). **No customer profile table**
  — name/email/avatar come from `auth.users.user_metadata` (Google).
- Provider: reuse the existing Supabase Auth. A customer is an `auth.users` row
  with **no `profiles.role`**, so the dashboard gate is untouched and customers can
  never reach `/admin`.

## SECURITY — mandatory RLS hardening (do this FIRST)

`orders` has RLS enabled with these live policies:

| Policy | Cmd | Role | Predicate |
|---|---|---|---|
| `Auth manage orders` | ALL | public | `auth.role() = 'authenticated'` |
| `anon_insert_orders` | INSERT | anon | (insert) |
| `anon_update_orders` | UPDATE | anon | `true` |

The `Auth manage orders` policy assumes **authenticated == staff**. Introducing
customer login breaks that assumption: a signed-in customer would get **full
read/write on every order**. This MUST be fixed *in the same change* that enables
customer auth.

**Fix — distinguish staff from customers by their staff profile:**

```sql
-- Staff = an auth user that has a profiles row with a non-null role.
create or replace function is_staff()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role is not null
  );
$$;
revoke all on function is_staff() from anon, public;
grant execute on function is_staff() to authenticated;
```

```sql
-- Replace the over-broad staff policy: full access only for actual staff.
drop policy if exists "Auth manage orders" on orders;
create policy "Staff manage orders" on orders
  for all to authenticated
  using (is_staff()) with check (is_staff());

-- New: a customer may read ONLY their own linked orders.
create policy "Customer reads own orders" on orders
  for select to authenticated
  using (user_id = auth.uid());
```

`order_items` carries the **same** over-broad `Auth manage order_items [ALL]`
policy, so a signed-in customer could otherwise read every order's line items.
Apply the identical hardening (its anon/public INSERT policies stay, so guest AND
customer item inserts continue on the anon client):

```sql
drop policy if exists "Auth manage order_items" on order_items;
create policy "Staff manage order_items" on order_items
  for all to authenticated
  using (is_staff()) with check (is_staff());

-- A customer may read items belonging to their own orders.
create policy "Customer reads own order_items" on order_items
  for select to authenticated
  using (exists (
    select 1 from orders o
    where o.id = order_items.order_id and o.user_id = auth.uid()
  ));
```

- After this, staff (role set) keep full access on both tables; a signed-in
  customer can read only their own orders and those orders' items, and can write
  neither directly. Guest/anon INSERT policies are untouched.
- `is_staff()` is `security definer` so the policy check does not depend on the
  customer being able to read `profiles`.

**Out-of-scope note (flagged, not fixed here):** `anon_update_orders` lets the
anon key update *any* order (`qual = true`) — a pre-existing broad grant used by
storefront flows. It is unrelated to login; recommend tightening it separately
(e.g. scope to `status IN ('pending_payment','pending')` or move those writes into
a SECURITY DEFINER RPC). Left untouched by this feature to avoid scope creep.

## Data model

Add one nullable column to `orders`:

| Column | Type | Meaning |
|---|---|---|
| `user_id` | `uuid` REFERENCES `auth.users(id)`, nullable | The signed-in customer who placed the order. **NULL** = guest order. |

- Index `orders(user_id)` for the My Orders query.
- Stamped **server-side** by `create_storefront_order` from `auth.uid()` — never
  from the client payload (un-spoofable).

## `create_storefront_order` — stamp the owner

The RPC is `SECURITY DEFINER` and inserts the order from a JSON payload. Add
`user_id` to the insert, sourced from `auth.uid()`:

```sql
-- inside create_storefront_order(p jsonb), add to the column list + VALUES:
--   ..., channel, user_id
--   ..., 'storefront', auth.uid()
-- and (idempotent, so the auth client can definitely call it):
grant execute on function create_storefront_order(jsonb) to anon, authenticated;
```

- Guest call (via the anon `publicSupabase` client) → `auth.uid()` is NULL → guest
  order, exactly as today.
- Signed-in call (via the auth-aware `supabase` client, JWT attached) →
  `auth.uid()` is the customer → linked order.
- `auth.uid()` resolves from the request JWT even inside `SECURITY DEFINER`.

## Order write path (client)

Today checkout writes the order + items through the anon `publicSupabase`
(no session → `auth.uid()` null). New rule, in both `Checkout.jsx` and
`MenuPage.jsx`:

```js
// Logged-in customers create the ORDER through the auth client so the JWT reaches
// the RPC and their user_id is stamped; guests keep the anon client. The
// order_items insert stays on publicSupabase for everyone (its INSERT policy is
// TO public, so no auth-client insert is needed and no new policy either).
const orderClient = user ? supabase : publicSupabase;
// ...orderClient.rpc('create_storefront_order', { p: payload })
// ...publicSupabase.from('order_items').insert(...)   // unchanged
```

- `user` comes from `useAuth()`.
- The **only** behavioural change to the existing order flow is which client makes
  the `create_storefront_order` call; the payload, order_items insert, Paystack
  flow, notify/clear-cart logic, and the entire guest path are unchanged.

## Auth layer

Extend the existing `AuthContext` (it already wraps the storefront —
`SettingsProvider > AuthProvider > CartProvider > ToastProvider`, and the
storefront routes live under it):

- Add `signInWithGoogle()`:
  ```js
  const signInWithGoogle = () =>
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/account' },
    });
  ```
- Reuse the existing session/`user` state and sign-out. The existing
  `onAuthStateChange` listener already sets `user` and calls `fetchProfile`
  (returns null role for a customer — no dashboard access, no change to staff).
- Expose `user` and `signInWithGoogle` (and existing sign-out) via the context
  value for storefront components.
- `PASSWORD_RECOVERY` → `/admin/reset-password` redirect only fires for the staff
  email/password flow, never for OAuth — no interaction with customer login.

## UI

- **Navbar** (`src/components/Navbar.jsx`): when logged out, a "Sign in with
  Google" control; when logged in, an account menu showing the Google
  name/avatar → **My Orders** and **Sign out**.
- **Checkout (`Checkout.jsx`) and `/menu` (`MenuPage.jsx`):**
  - Logged in: prefill `firstName` / `lastName` / `email` from
    `user.user_metadata` (`given_name`/`family_name`/`full_name`/`email`), still
    editable; a subtle line: "Signed in as {email} — this order will be saved to
    your account."
  - Guest: a small optional nudge — "Sign in to save your details and track your
    order" — that triggers `signInWithGoogle()`. Never blocks guest checkout.
- **My Orders (`/account`)** — new page `src/pages/storefront/Account.jsx` + route
  in `App.jsx`:
  - If not logged in → a sign-in prompt.
  - If logged in → the customer's orders (auth client:
    `supabase.from('orders').select(...).eq('user_id', user.id).order('created_at', desc)`),
    each row showing id, date, total, item summary, and a **status badge**
    (pending / paid / shipped / delivered / cancelled). Read is enforced by the
    "Customer reads own orders" RLS policy.

## Pure logic (testable)

Extract the profile→prefill mapping into `src/lib/customerProfile.js`:

- `profileToPrefill(user) -> { firstName, lastName, email }` — derives first/last
  from `user_metadata.given_name`/`family_name`, falling back to splitting
  `full_name`; email from `user_metadata.email`. Returns empty strings when a
  field is absent. Unit-tested (the codebase's `src/lib/*.test.js` pattern).

## Infra prerequisite (owner-only, one-time)

The frontend is fully built regardless, but a live Google round-trip needs:

1. **Google Cloud Console** → create an OAuth 2.0 Client (Web application);
   configure the OAuth consent screen.
2. Authorized redirect URI: the Supabase callback
   `https://itpnfalqjjicesqcjzix.supabase.co/auth/v1/callback`.
3. **Supabase → Authentication → Providers → Google:** enable, paste the Google
   Client ID + Secret.
4. **Supabase → Authentication → URL Configuration:** add the storefront origins
   (`https://smokeyhutdelight.com`, `https://www.smokeyhutdelight.com`,
   `http://localhost:5173`) to Site URL / Redirect allowlist.

These steps ship with the plan as a checklist; they are the owner's to perform.

## Testing

- **DB verifier** (node script, like the restock one): calling
  `create_storefront_order` with a JWT stamps `user_id`; anon call leaves it NULL.
- **RLS checks:** a customer JWT can read only its own orders **and those orders'
  items**, and none of another customer's / guest's; a staff JWT (role set) still
  reads all; the anon key cannot read orders/order_items. (Verified with scoped
  clients in the verifier script; any rows it creates are hidden test rows,
  hard-deleted afterward.)
- **Unit tests:** `profileToPrefill` across full_name-only, given/family, and
  missing-field cases.
- **Manual smoke:** guest checkout unchanged; sign in → checkout prefilled and
  order appears under `/account`; sign out hides it; a second Google account sees
  only its own orders.

## Out of scope

- Offers / marketing / notifications to customers.
- Real-time delivery tracking (statuses only).
- Matching past guest orders by email.
- A customer profile table.
- Tightening `anon_update_orders` (flagged above; separate change).
- Cart abandonment itself — the next feature, which this unlocks.
