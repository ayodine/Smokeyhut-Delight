# Paystack Re-integration (Webhook-First) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-add Paystack as a second payment method on both storefront checkouts, with the webhook as the sole source of payment truth, hidden-until-paid orders, and a reconciliation sweeper.

**Architecture:** Orders are created as `pending_payment` (invisible to staff/stats/partner), the customer pays on Paystack's hosted page, and the signature-verified webhook promotes the order to `pending` + `paid_at` and sends the confirmation email. A read-only success page polls a minimal RPC. A pg_cron sweeper re-verifies stragglers and expires unpaid orders after 2h. Shared promotion logic lives in one Deno module used by webhook, verify-payment, and the sweeper.

**Tech Stack:** Vite + React 19, Supabase (Postgres + Edge Functions/Deno), pg_cron + pg_net + Vault, vitest, Paystack REST API.

**Spec:** `docs/superpowers/specs/2026-07-19-paystack-reintegration-design.md`

## Global Constraints

- **NEVER `supabase db push`.** Apply migrations with `supabase db query --linked -f <file>` (project `itpnfalqjjicesqcjzix`). If `db query` fails after a `supabase link` attempt, STOP — human applies via dashboard SQL editor.
- Edge functions deploy with `supabase functions deploy <name> --no-verify-jwt --project-ref itpnfalqjjicesqcjzix` (repo convention; webhook MUST be `--no-verify-jwt`).
- **`initialize-payment` must charge the order's DB total, never a client-supplied amount.** Client sends only `order_id` + `origin`.
- Paystack amounts are **kobo**: `Math.round(total * 100)`.
- Callback origin allowlist: `https://smokeyhutdelight.com`, `https://www.smokeyhutdelight.com`, `https://smokeyhut-delight.web.app`, and `http://localhost:<port>`; default fallback `https://smokeyhutdelight.com`. The web.app domain must never be the default.
- **Unified partner-guard rule:** rows with `payment_method = 'paystack' AND paid_at IS NULL` are invisible to BOTH partner sync paths. In SQL trigger form use the IF-skip shape (NULL-safe); in PostgREST use `.or('payment_method.is.null,payment_method.neq.paystack,paid_at.not.is.null')` (the `is.null` branch keeps legacy null-method orders visible).
- Stats guard is status-based: `status NOT IN ('cancelled','pending_payment')`.
- For Paystack orders: NO `notify()` call and NO cart clear at order creation; email fires from the webhook, cart clears on the success page after confirmation.
- Statuses: `pending_payment → pending → shipped → delivered`, or `→ cancelled` (expired). Old `processing`/`paid` stay dead.
- Frontend anon calls use the pattern in `Checkout.jsx:15-27` (Bearer + apikey = `VITE_SUPABASE_ANON_KEY`).
- Anon key for read-only prod SQL checks (public in `scripts/inspect_campaigns.js`):
  `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0cG5mYWxxamppY2VzcWNqeml4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzMDczMTEsImV4cCI6MjA5MDg4MzMxMX0.M6AiZDTLqiGeOk9WrpBCwN381jq6OV2GbgWaDAjgM3E`
- `create_storefront_order` ALREADY accepts `status` and `paystack_ref` keys in its jsonb payload (verified in prod) — do not modify that RPC.
- Live-prod caution: never place real orders against live Paystack keys during development; all E2E happens in Paystack test mode at rollout (final task).

---

### Task 1: Shared Paystack module + pure-logic tests

**Files:**
- Create: `supabase/functions/_shared/paystack.ts`
- Test: `supabase/functions/_shared/paystack.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces (used by Tasks 3–5):
  - `resolveCallbackOrigin(origin: string | null | undefined): string` — allowlisted origin or the default
  - `decidePromotion(order: {status: string, paid_at: string | null, total: number}, amountKobo: number): 'promote' | 'noop' | 'amount_mismatch'`
  - `verifyTransaction(secretKey: string, reference: string): Promise<any | null>` — Paystack GET verify; returns `data` object when `status==='success'`, else null
  - `promoteOrder(db, orderId: string, tx: {reference: string, channel: string}): Promise<void>` — idempotent promotion UPDATE
  - `sendOrderConfirmedEmail(order): Promise<void>` — fire-and-forget POST to the `notify` function

- [ ] **Step 1: Write the failing test**

Create `supabase/functions/_shared/paystack.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { resolveCallbackOrigin, decidePromotion } from './paystack.ts';

describe('resolveCallbackOrigin', () => {
  it('accepts allowlisted production origins', () => {
    expect(resolveCallbackOrigin('https://smokeyhutdelight.com')).toBe('https://smokeyhutdelight.com');
    expect(resolveCallbackOrigin('https://www.smokeyhutdelight.com')).toBe('https://www.smokeyhutdelight.com');
    expect(resolveCallbackOrigin('https://smokeyhut-delight.web.app')).toBe('https://smokeyhut-delight.web.app');
  });
  it('accepts localhost with any port (dev)', () => {
    expect(resolveCallbackOrigin('http://localhost:5173')).toBe('http://localhost:5173');
    expect(resolveCallbackOrigin('http://localhost:4000')).toBe('http://localhost:4000');
  });
  it('falls back to the primary domain for anything else', () => {
    expect(resolveCallbackOrigin('https://evil.example.com')).toBe('https://smokeyhutdelight.com');
    expect(resolveCallbackOrigin('http://smokeyhutdelight.com')).toBe('https://smokeyhutdelight.com'); // http on prod → not allowlisted
    expect(resolveCallbackOrigin(null)).toBe('https://smokeyhutdelight.com');
    expect(resolveCallbackOrigin(undefined)).toBe('https://smokeyhutdelight.com');
    expect(resolveCallbackOrigin('')).toBe('https://smokeyhutdelight.com');
  });
});

describe('decidePromotion', () => {
  const order = (status, paid_at = null, total = 5000) => ({ status, paid_at, total });
  it('rejects amount mismatches before anything else', () => {
    expect(decidePromotion(order('pending_payment'), 499900)).toBe('amount_mismatch');
    expect(decidePromotion(order('pending_payment'), 0)).toBe('amount_mismatch');
  });
  it('promotes an awaiting-payment order on exact amount', () => {
    expect(decidePromotion(order('pending_payment'), 500000)).toBe('promote');
  });
  it('rescues a sweeper-cancelled unpaid order (late webhook)', () => {
    expect(decidePromotion(order('cancelled', null), 500000)).toBe('promote');
  });
  it('never touches a cancelled order that was already paid (refund case)', () => {
    expect(decidePromotion(order('cancelled', '2026-07-23T10:00:00Z'), 500000)).toBe('noop');
  });
  it('is a no-op for every already-progressed status', () => {
    for (const s of ['pending', 'shipped', 'delivered']) {
      expect(decidePromotion(order(s, '2026-07-23T10:00:00Z'), 500000)).toBe('noop');
    }
  });
  it('handles decimal totals without float drift', () => {
    expect(decidePromotion(order('pending_payment', null, 5200.5), 520050)).toBe('promote');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run supabase/functions/_shared/paystack.test.js`
Expected: FAIL — cannot resolve `./paystack.ts`.

- [ ] **Step 3: Write the implementation**

Create `supabase/functions/_shared/paystack.ts`:

```ts
// Shared Paystack logic for initialize-payment, paystack-webhook,
// verify-payment, and reconcile-payments. The promotion path lives HERE and
// only here — webhook, verify, and sweeper are three entry points to one
// idempotent transition (pending_payment → pending + paid_at).

const ALLOWED_ORIGINS = [
  'https://smokeyhutdelight.com',
  'https://www.smokeyhutdelight.com',
  'https://smokeyhut-delight.web.app',
];
const DEFAULT_ORIGIN = 'https://smokeyhutdelight.com';
const LOCALHOST_RE = /^http:\/\/localhost:\d+$/;

export function resolveCallbackOrigin(origin?: string | null): string {
  if (!origin) return DEFAULT_ORIGIN;
  if (ALLOWED_ORIGINS.includes(origin) || LOCALHOST_RE.test(origin)) return origin;
  return DEFAULT_ORIGIN;
}

// Decide what a payment event means for an order. Amount check first:
// a mismatch must never promote, whatever the status.
export function decidePromotion(
  order: { status: string; paid_at: string | null; total: number },
  amountKobo: number,
): 'promote' | 'noop' | 'amount_mismatch' {
  if (amountKobo !== Math.round(Number(order.total) * 100)) return 'amount_mismatch';
  if (order.status === 'pending_payment') return 'promote';
  if (order.status === 'cancelled' && !order.paid_at) return 'promote'; // late-webhook rescue of a swept order
  return 'noop';
}

// GET /transaction/verify/:reference — returns the transaction data object
// when Paystack says success, null otherwise (including network errors).
export async function verifyTransaction(secretKey: string, reference: string): Promise<any | null> {
  try {
    const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    const body = await res.json();
    if (body?.status && body?.data?.status === 'success') return body.data;
    return null;
  } catch {
    return null;
  }
}

// The single promotion write. Guarded so a concurrent/duplicate call can't
// double-promote: only rows still matching the promotable states update.
// Returns true ONLY if THIS call performed the transition — callers gate the
// confirmation email on it so a webhook/verify/sweeper race can't double-send.
export async function promoteOrder(
  db: any,
  orderId: string,
  tx: { reference: string; channel?: string },
): Promise<boolean> {
  const { data, error } = await db
    .from('orders')
    .update({
      status: 'pending',
      paid_at: new Date().toISOString(),
      payment_channel: tx.channel ?? null,
      paystack_ref: tx.reference,
      cancel_reason: null,
    })
    .eq('id', orderId)
    .in('status', ['pending_payment', 'cancelled'])
    .is('paid_at', null)
    .select('id');
  if (error) throw new Error(`promoteOrder(${orderId}): ${error.message}`);
  return (data?.length ?? 0) > 0;
}

// Fire-and-forget confirmation email via the existing notify function.
// Never throws — the payment write is the critical section, not this.
export async function sendOrderConfirmedEmail(order: {
  id: string; customer_name: string | null; customer_email: string | null;
  customer_phone: string | null; delivery_address: string | null; total: number;
}): Promise<void> {
  const url = (Deno.env.get('SUPABASE_URL') ?? '').trim();
  const anon = (Deno.env.get('SUPABASE_ANON_KEY') ?? '').trim();
  if (!url || !anon) return;
  try {
    await fetch(`${url}/functions/v1/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${anon}`, apikey: anon },
      body: JSON.stringify({ type: 'order_confirmed', order }),
    });
  } catch { /* silent */ }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run supabase/functions/_shared/paystack.test.js`
Expected: PASS (all tests). Note: `verifyTransaction`/`promoteOrder`/`sendOrderConfirmedEmail` reference `fetch`/`Deno` at call time only — importing the module in vitest is safe (the `Deno` reference is inside a function body).

- [ ] **Step 5: Full suite, then commit**

```bash
npx vitest run
git add supabase/functions/_shared/paystack.ts supabase/functions/_shared/paystack.test.js
git commit -m "feat: shared Paystack promotion/origin logic with tests"
```

---

### Task 2: Migration A — DB groundwork

**Files:**
- Create: `supabase/migrations/20260723_paystack_groundwork.sql`

**Interfaces:**
- Consumes: current prod definitions of the five stats RPCs (they already carry `p_status` from `supabase/migrations/20260718_stats_status_filter.sql` — this migration REPLACES those bodies changing ONLY the base status predicate) and `notify_partner_order()` (from `supabase/migrations/20260707_partner_order_push.sql`).
- Produces:
  - `get_payment_status(p_ref text) → json {order_id, status, paid}` (anon-executable; used by Task 6's success page)
  - `notify_partner_order()` with the paystack-unpaid skip
  - Five stats RPCs excluding `pending_payment`
  - `app_settings` row `paystack = {"enabled": false}`

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/20260723_paystack_groundwork.sql`:

```sql
-- Paystack re-integration groundwork.
-- 1) get_payment_status: minimal read for the success page (RLS on orders stays closed).
-- 2) notify_partner_order: partner must never see unpaid Paystack orders.
-- 3) Five stats RPCs: base predicate now also excludes pending_payment.
-- 4) Seed app_settings.paystack (kill switch, default OFF).
-- APPLY with: supabase db query --linked -f supabase/migrations/20260723_paystack_groundwork.sql

begin;

-- 1) Success-page poll: expose ONLY {order_id, status, paid} by Paystack reference.
create or replace function public.get_payment_status(p_ref text)
returns json
language sql stable security definer
as $function$
  select json_build_object(
    'order_id', o.id,
    'status',   o.status,
    'paid',     (o.paid_at is not null)
  )
  from orders o
  where o.paystack_ref = p_ref and o.deleted_at is null
  limit 1;
$function$;

grant execute on function public.get_payment_status(text) to anon;

-- 2) Partner push guard. Body identical to 20260707 except the paystack-unpaid
--    skip inserted before the items check. IF-form is NULL-safe: a NULL
--    payment_method fails the equality test and the push proceeds normally.
create or replace function public.notify_partner_order()
returns trigger
language plpgsql
security definer
set search_path = public, net, vault
as $$
declare
  fn_url      text := 'https://itpnfalqjjicesqcjzix.functions.supabase.co/push-order';
  hook_secret text;
begin
  -- Unpaid Paystack orders are invisible to the partner (spec unified rule).
  -- The promotion UPDATE (sets paid_at) delivers the order when it becomes real.
  if NEW.payment_method = 'paystack' and NEW.paid_at is null then
    return NEW;
  end if;

  if not exists (select 1 from public.order_items oi where oi.order_id = NEW.id) then
    return NEW;
  end if;

  begin
    select decrypted_secret into hook_secret
      from vault.decrypted_secrets
      where name = 'PARTNER_PUSH_HOOK_SECRET'
      limit 1;
  exception when others then
    hook_secret := null;
  end;

  perform net.http_post(
    url     := fn_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-hook-secret', coalesce(hook_secret, '')
    ),
    body    := jsonb_build_object('id', NEW.id)
  );

  return NEW;
end;
$$;

-- 3) Stats RPCs: swap base predicate `status <> 'cancelled'` for
--    `status not in ('cancelled','pending_payment')`. Bodies otherwise
--    byte-identical to 20260718_stats_status_filter.sql. Signatures unchanged
--    (CREATE OR REPLACE is safe — no DROP needed).

create or replace function public.get_stats_all_products(
  p_store_id integer     default null,
  p_start    timestamptz default null,
  p_end      timestamptz default null,
  p_status   text        default null
)
returns table(name text, revenue numeric, units bigint)
language sql stable security definer
as $function$
  select
    case
      when oi.name ~* '\s*\(?\s*CHOPPED\s*\)?\s*$' then
        regexp_replace(oi.name, '\s*\(?\s*CHOPPED\s*\)?\s*$', '', 'i') || ' (CHOPPED)'
      else oi.name
    end as name,
    sum(oi.qty * oi.price)::numeric as revenue,
    sum(oi.qty)::bigint             as units
  from order_items oi
  join orders o on o.id = oi.order_id
  where o.deleted_at is null
    and o.status not in ('cancelled','pending_payment')
    and (p_status   is null or o.status = p_status)
    and (p_store_id is null or o.store_id = p_store_id)
    and (p_start    is null or o.created_at >= p_start)
    and (p_end      is null or o.created_at <= p_end)
  group by 1
  order by revenue desc;
$function$;

create or replace function public.get_product_stats_kpis(
  p_store_id integer     default null,
  p_start    timestamptz default null,
  p_end      timestamptz default null,
  p_status   text        default null
)
returns json
language sql stable security definer
as $function$
  with base_orders as (
    select id, total, customer_phone
    from orders
    where deleted_at is null
      and status not in ('cancelled','pending_payment')
      and (p_status   is null or status = p_status)
      and (p_store_id is null or store_id = p_store_id)
      and (p_start    is null or created_at >= p_start)
      and (p_end      is null or created_at <= p_end)
  )
  select json_build_object(
    'revenue',          coalesce((select sum(total) from base_orders), 0),
    'units_sold',       coalesce((select sum(oi.qty)
                                  from order_items oi
                                  join base_orders b on b.id = oi.order_id), 0),
    'order_count',      (select count(*)                       from base_orders),
    'unique_customers', (select count(distinct customer_phone) from base_orders)
  );
$function$;

create or replace function public.get_product_stats_lists(
  p_store_id integer     default null,
  p_start    timestamptz default null,
  p_end      timestamptz default null,
  p_status   text        default null
)
returns json
language sql stable security definer
as $function$
  with confirmed_orders as (
    select id, customer_name, customer_phone, delivery_address, delivery_zone
    from orders
    where deleted_at is null
      and status not in ('cancelled','pending_payment')
      and (p_status   is null or status = p_status)
      and (p_store_id is null or store_id = p_store_id)
      and (p_start    is null or created_at >= p_start)
      and (p_end      is null or created_at <= p_end)
  ),
  items as (
    select
      oi.product_id,
      case
        when oi.name ~* '\s*\(?\s*CHOPPED\s*\)?\s*$' then
          regexp_replace(oi.name, '\s*\(?\s*CHOPPED\s*\)?\s*$', '', 'i') || ' (CHOPPED)'
        else oi.name
      end as item_name,
      oi.qty,
      oi.price
    from order_items oi
    join confirmed_orders co on co.id = oi.order_id
  ),
  by_revenue as (
    select item_name as name, sum(qty * price) as value
    from items group by item_name order by value desc limit 5
  ),
  by_units as (
    select item_name as name, sum(qty) as value
    from items group by item_name order by value desc limit 5
  ),
  by_location as (
    select
      coalesce(
        case
          when delivery_zone is null or trim(delivery_zone) = ''
               or delivery_zone ~* '^location\s*\d'
          then null
          else nullif(trim(delivery_zone), '')
        end,
        nullif(trim(split_part(delivery_address, ',', -1)), '')
      ) as name,
      count(*)::numeric as value
    from confirmed_orders
    where coalesce(
        case
          when delivery_zone is null or trim(delivery_zone) = ''
               or delivery_zone ~* '^location\s*\d'
          then null
          else nullif(trim(delivery_zone), '')
        end,
        nullif(trim(split_part(delivery_address, ',', -1)), '')
      ) is not null
      and delivery_address not ilike 'store pickup%'
    group by 1 order by value desc limit 5
  ),
  by_qty_per_order as (
    select item_name as name, avg(qty) as value
    from items group by item_name order by value desc limit 5
  ),
  by_customer as (
    select
      mode() within group (order by customer_name) as name,
      customer_phone                               as phone,
      count(*)::numeric                            as value
    from confirmed_orders
    group by customer_phone
    order by value desc limit 5
  ),
  by_category as (
    select
      coalesce(c.label, 'Uncategorised') as name,
      sum(oi.qty * oi.price)             as value
    from order_items oi
    join confirmed_orders co on co.id = oi.order_id
    join products p          on p.id  = oi.product_id
    left join categories c   on c.id  = p.category_id
    group by coalesce(c.label, 'Uncategorised')
    order by value desc limit 5
  )
  select json_build_object(
    'top_by_revenue',    (select json_agg(row_to_json(r)) from by_revenue       r),
    'top_by_units',      (select json_agg(row_to_json(r)) from by_units         r),
    'top_locations',     (select json_agg(row_to_json(r)) from by_location      r),
    'top_qty_per_order', (select json_agg(row_to_json(r)) from by_qty_per_order r),
    'top_customers',     (select json_agg(row_to_json(r)) from by_customer      r),
    'top_categories',    (select json_agg(row_to_json(r)) from by_category      r)
  );
$function$;

create or replace function public.get_guineafowl_breakdown(
  p_store_id integer     default null,
  p_start    timestamptz default null,
  p_end      timestamptz default null,
  p_status   text        default null
)
returns json
language sql stable security definer
as $function$
  with gf as (
    select oi.qty,
      case
        when lower(oi.name) like '%hangout%'                                      then 3
        when lower(oi.name) like '%stock up%' or lower(oi.name) like '%stock-up%' then 5
        when lower(oi.name) like '%party pack%'                                   then 10
        else 0
      end as pack_birds,
      case
        when (lower(oi.name) like '%guineafowl%' or lower(oi.name) like '%guinea fowl%')
             and lower(oi.name) not like '%rice%' and lower(oi.name) not like '%pack%' then 1
        else 0
      end as direct_bird
    from order_items oi join orders o on o.id = oi.order_id
    where o.deleted_at is null
      and o.status not in ('cancelled','pending_payment')
      and (p_status   is null or o.status = p_status)
      and (p_store_id is null or o.store_id = p_store_id)
      and (p_start    is null or o.created_at >= p_start)
      and (p_end      is null or o.created_at <= p_end)
  )
  select json_build_object(
    'direct',   coalesce(sum(qty * direct_bird), 0),
    'in_packs', coalesce(sum(qty * pack_birds), 0),
    'total',    coalesce(sum(qty * direct_bird) + sum(qty * pack_birds), 0)
  ) from gf;
$function$;

create or replace function public.get_product_order_breakdown(
  p_name     text,
  p_store_id integer     default null,
  p_start    timestamptz default null,
  p_end      timestamptz default null,
  p_status   text        default null
)
returns table(order_id text, created_at timestamptz, customer_name text, status text, qty bigint, price numeric, line_total numeric)
language sql stable security definer
as $function$
  select
    o.id              as order_id,
    o.created_at,
    o.customer_name,
    o.status,
    oi.qty::bigint    as qty,
    oi.price,
    (oi.qty * oi.price)::numeric as line_total
  from order_items oi
  join orders o on o.id = oi.order_id
  where o.deleted_at is null
    and o.status not in ('cancelled','pending_payment')
    and (p_status   is null or o.status = p_status)
    and (p_store_id is null or o.store_id = p_store_id)
    and (p_start    is null or o.created_at >= p_start)
    and (p_end      is null or o.created_at <= p_end)
    and (
      case
        when oi.name ~* '\s*\(?\s*CHOPPED\s*\)?\s*$' then
          regexp_replace(oi.name, '\s*\(?\s*CHOPPED\s*\)?\s*$', '', 'i') || ' (CHOPPED)'
        else oi.name
      end
    ) = p_name
  order by o.created_at desc;
$function$;

-- 4) Kill switch, default OFF.
insert into app_settings (key, value)
values ('paystack', '{"enabled": false}'::jsonb)
on conflict (key) do nothing;

commit;
```

- [ ] **Step 2: Apply**

```bash
supabase db query --linked -f supabase/migrations/20260723_paystack_groundwork.sql
```

Expected: success, empty rows.

- [ ] **Step 3: Verify against prod**

```bash
node --input-type=module -e "
import { createClient } from '@supabase/supabase-js';
const s = createClient('https://itpnfalqjjicesqcjzix.supabase.co', '<ANON KEY from Global Constraints>');
const q = async (sql) => { const { data, error } = await s.rpc('exec_read_only_sql', { q: sql }); if (error) throw error; return data; };
// get_payment_status exists + anon-executable + returns null-ish for unknown ref
const { data: gps, error: gpsErr } = await s.rpc('get_payment_status', { p_ref: 'no-such-ref-xyz' });
console.log('get_payment_status(no-such-ref):', gps, gpsErr?.message ?? 'no error');
// stats predicate updated in all five bodies
const defs = await q(\`select proname, (pg_get_functiondef(p.oid) like '%pending_payment%') as guarded
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='public' and proname in ('get_stats_all_products','get_product_stats_kpis','get_product_stats_lists','get_guineafowl_breakdown','get_product_order_breakdown','notify_partner_order','get_payment_status')
  order by proname\`);
console.table(defs);
// app_settings seeded
console.log(await q(\"select key, value from app_settings where key='paystack'\"));
"
```

Expected: `get_payment_status` callable with anon (returns null/empty for unknown ref, NOT a permissions error); all 7 functions listed with `guarded: true`; the settings row `{"enabled": false}`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260723_paystack_groundwork.sql
git commit -m "feat: Paystack DB groundwork — payment-status RPC, partner guard, stats exclusion, kill switch"
```

---

### Task 3: `initialize-payment` rebuild

**Files:**
- Modify (full rewrite): `supabase/functions/initialize-payment/index.ts`

**Interfaces:**
- Consumes: `resolveCallbackOrigin` from `../_shared/paystack.ts` (Task 1).
- Produces: `POST {order_id, origin}` → `200 {authorization_url, reference}` | `4xx/5xx {error}`. `GET ?health=1` → `{ok, paystack_key: bool, service_key: bool}`. Charges the order's **DB** total; stores the Paystack `reference` on the order before returning.

- [ ] **Step 1: Rewrite the function**

Replace the entire content of `supabase/functions/initialize-payment/index.ts` with:

```ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveCallbackOrigin } from "../_shared/paystack.ts";

// Starts a Paystack hosted-page payment for an existing pending_payment order.
// The client sends ONLY {order_id, origin} — the charged amount always comes
// from the order row in the DB (tamper-proof), and the callback origin is
// allowlisted (the old hardcoded ISP-blocked web.app callback is the bug that
// sank the last integration).

const PAYSTACK_SECRET_KEY = (Deno.env.get('PAYSTACK_SECRET_KEY') ?? '').trim();
const SUPABASE_URL        = (Deno.env.get('SUPABASE_URL') ?? '').trim();
const SERVICE_KEY         = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // Deploy-time sanity probe (the April silent-killer check).
  if (req.method === 'GET' && new URL(req.url).searchParams.has('health')) {
    return json(200, { ok: true, paystack_key: !!PAYSTACK_SECRET_KEY, service_key: !!SERVICE_KEY });
  }
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });
  if (!PAYSTACK_SECRET_KEY || !SUPABASE_URL || !SERVICE_KEY) {
    console.error('initialize-payment: configuration_error (missing key)');
    return json(500, { error: 'configuration_error' });
  }

  let body: any;
  try { body = await req.json(); } catch { return json(400, { error: 'Bad JSON' }); }
  const orderId = body?.order_id;
  if (!orderId || typeof orderId !== 'string') return json(400, { error: 'Missing order_id' });

  const db = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: order, error } = await db
    .from('orders')
    .select('id, total, customer_email, status')
    .eq('id', orderId).is('deleted_at', null).maybeSingle();
  if (error) return json(500, { error: error.message });
  if (!order) return json(404, { error: 'Order not found' });
  if (order.status !== 'pending_payment') return json(409, { error: `Order is ${order.status}, not payable` });
  if (!order.customer_email) return json(400, { error: 'Order has no email' });

  const origin = resolveCallbackOrigin(body?.origin);
  const res = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: order.customer_email,
      amount: Math.round(Number(order.total) * 100),
      callback_url: `${origin}/payment/success`,
      metadata: { order_id: order.id },
    }),
  });
  const data = await res.json();
  if (!data?.status || !data?.data?.authorization_url) {
    console.error(`initialize-payment: Paystack init failed for ${orderId}: ${data?.message}`);
    return json(502, { error: data?.message || 'Paystack initialization failed' });
  }

  // Store the reference NOW so webhook / sweeper / success page can all find
  // the order by reference even if this response never reaches the client.
  const { error: refErr } = await db
    .from('orders').update({ paystack_ref: data.data.reference }).eq('id', order.id);
  if (refErr) {
    console.error(`initialize-payment: failed to store ref for ${orderId}: ${refErr.message}`);
    return json(500, { error: 'Could not record payment reference' });
  }

  return json(200, { authorization_url: data.data.authorization_url, reference: data.data.reference });
});
```

- [ ] **Step 2: Deploy + smoke**

```bash
supabase functions deploy initialize-payment --no-verify-jwt --project-ref itpnfalqjjicesqcjzix
curl -s "https://itpnfalqjjicesqcjzix.functions.supabase.co/initialize-payment?health=1"
```

Expected deploy success; health returns `{"ok":true,"paystack_key":true,"service_key":true}` — if `paystack_key` is `false`, STOP: record it for the rollout task (secret not yet set) and continue; the function is safely inert.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/initialize-payment/index.ts
git commit -m "feat: rebuild initialize-payment — DB-total charge, origin allowlist, ref stored at init"
```

---

### Task 4: `paystack-webhook` + `verify-payment` rebuilds

**Files:**
- Modify (full rewrite): `supabase/functions/paystack-webhook/index.ts`
- Modify (full rewrite): `supabase/functions/verify-payment/index.ts`

**Interfaces:**
- Consumes: `decidePromotion`, `promoteOrder`, `verifyTransaction`, `sendOrderConfirmedEmail` from `../_shared/paystack.ts` (Task 1).
- Produces: webhook — Paystack calls it; always 200 on handled events, 401 on bad signature. verify-payment — `POST {reference}` → `{success, order_id, status}`; used by Task 6's success page as backup.

- [ ] **Step 1: Rewrite `paystack-webhook/index.ts`**

```ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decidePromotion, promoteOrder, sendOrderConfirmedEmail } from "../_shared/paystack.ts";

// THE source of payment truth. Paystack calls this server-to-server on every
// charge event; nothing about marking an order paid depends on the customer's
// browser. verify-payment and reconcile-payments are backup entry points to
// the same shared promotion path.

const PAYSTACK_SECRET = (Deno.env.get('PAYSTACK_SECRET_KEY') ?? '').trim();
const SUPABASE_URL    = (Deno.env.get('SUPABASE_URL') ?? '').trim();
const SERVICE_KEY     = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();

async function verifySignature(body: string, signature: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(PAYSTACK_SECRET),
    { name: 'HMAC', hash: 'SHA-512' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  return hex === signature;
}

serve(async (req) => {
  if (req.method === 'GET' && new URL(req.url).searchParams.has('health')) {
    return new Response(JSON.stringify({ ok: true, paystack_key: !!PAYSTACK_SECRET, service_key: !!SERVICE_KEY }), {
      headers: { 'Content-Type': 'application/json' }, status: 200,
    });
  }
  if (req.method !== 'POST') return new Response('ok', { status: 200 });
  if (!PAYSTACK_SECRET || !SUPABASE_URL || !SERVICE_KEY) {
    console.error('paystack-webhook: configuration_error');
    return new Response('misconfigured', { status: 500 });
  }

  const body = await req.text();
  const signature = req.headers.get('x-paystack-signature') ?? '';
  if (!(await verifySignature(body, signature))) {
    return new Response('Unauthorized', { status: 401 });
  }

  const event = JSON.parse(body);
  if (event.event !== 'charge.success') {
    return new Response(JSON.stringify({ ok: true, ignored: event.event }), { status: 200 });
  }

  const reference = event.data?.reference;
  const orderId = event.data?.metadata?.order_id ?? null;
  const db = createClient(SUPABASE_URL, SERVICE_KEY);

  // metadata.order_id first, stored reference as fallback.
  let q = db.from('orders')
    .select('id, status, paid_at, total, customer_name, customer_email, customer_phone, delivery_address')
    .is('deleted_at', null).limit(1);
  q = orderId ? q.eq('id', orderId) : q.eq('paystack_ref', reference ?? '');
  const { data: rows, error } = await q;
  if (error) { console.error('paystack-webhook: db error', error.message); return new Response('db error', { status: 500 }); }
  const order = rows?.[0];
  if (!order) {
    console.warn(`paystack-webhook: no order for ref=${reference} order_id=${orderId}`);
    return new Response(JSON.stringify({ ok: true, skipped: 'order_not_found' }), { status: 200 });
  }

  const decision = decidePromotion(order, Number(event.data?.amount ?? -1));
  if (decision === 'amount_mismatch') {
    console.error(`paystack-webhook: AMOUNT MISMATCH order=${order.id} expected=${Math.round(order.total * 100)} got=${event.data?.amount}`);
    await db.from('orders')
      .update({ notes: `[PAYMENT AMOUNT MISMATCH ref=${reference}]` })
      .eq('id', order.id).eq('status', 'pending_payment');
    return new Response(JSON.stringify({ ok: true, flagged: 'amount_mismatch' }), { status: 200 });
  }
  if (decision === 'noop') {
    return new Response(JSON.stringify({ ok: true, skipped: 'already_processed' }), { status: 200 });
  }

  // Gate the email on the actual transition — verify-payment / sweeper may race us.
  const didPromote = await promoteOrder(db, order.id, { reference, channel: event.data?.channel });
  if (didPromote) await sendOrderConfirmedEmail(order);
  console.log(`paystack-webhook: ${didPromote ? 'promoted' : 'already-promoted'} ${order.id} (ref ${reference})`);
  return new Response(JSON.stringify({ ok: true, promoted: order.id }), { status: 200 });
});
```

Note on the mismatch write: the `.eq('status','pending_payment')` guard means the note can only be stamped on an order still awaiting payment — it can never clobber notes on a live/fulfilled order.

- [ ] **Step 2: Rewrite `verify-payment/index.ts`**

```ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decidePromotion, promoteOrder, verifyTransaction, sendOrderConfirmedEmail } from "../_shared/paystack.ts";

// Backup entry point to the same promotion path the webhook uses. Called once
// by the success page when webhook delivery is slow. Server-side verification
// against Paystack — never trusts the client beyond the reference string.

const PAYSTACK_SECRET = (Deno.env.get('PAYSTACK_SECRET_KEY') ?? '').trim();
const SUPABASE_URL    = (Deno.env.get('SUPABASE_URL') ?? '').trim();
const SERVICE_KEY     = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });
  if (!PAYSTACK_SECRET || !SUPABASE_URL || !SERVICE_KEY) return json(500, { error: 'configuration_error' });

  let body: any;
  try { body = await req.json(); } catch { return json(400, { error: 'Bad JSON' }); }
  const reference = body?.reference;
  if (!reference || typeof reference !== 'string') return json(400, { error: 'Missing reference' });

  const tx = await verifyTransaction(PAYSTACK_SECRET, reference);
  if (!tx) return json(400, { success: false, error: 'Payment not verified by Paystack' });

  const db = createClient(SUPABASE_URL, SERVICE_KEY);
  const orderId = tx.metadata?.order_id ?? null;
  let q = db.from('orders')
    .select('id, status, paid_at, total, customer_name, customer_email, customer_phone, delivery_address')
    .is('deleted_at', null).limit(1);
  q = orderId ? q.eq('id', orderId) : q.eq('paystack_ref', reference);
  const { data: rows, error } = await q;
  if (error) return json(500, { error: error.message });
  const order = rows?.[0];
  if (!order) return json(404, { success: false, error: 'Order not found' });

  const decision = decidePromotion(order, Number(tx.amount ?? -1));
  if (decision === 'amount_mismatch') {
    console.error(`verify-payment: AMOUNT MISMATCH order=${order.id}`);
    return json(409, { success: false, error: 'amount_mismatch' });
  }
  if (decision === 'promote') {
    // Gate the email on the actual transition — the webhook may be racing us.
    const didPromote = await promoteOrder(db, order.id, { reference, channel: tx.channel });
    if (didPromote) await sendOrderConfirmedEmail(order);
    console.log(`verify-payment: ${didPromote ? 'promoted' : 'already-promoted'} ${order.id}`);
  }
  return json(200, { success: true, order_id: order.id, status: decision === 'promote' ? 'pending' : order.status });
});
```

- [ ] **Step 3: Deploy + smoke both**

```bash
supabase functions deploy paystack-webhook --no-verify-jwt --project-ref itpnfalqjjicesqcjzix
supabase functions deploy verify-payment  --no-verify-jwt --project-ref itpnfalqjjicesqcjzix
# bad signature must 401:
curl -s -o /dev/null -w "%{http_code}\n" -X POST "https://itpnfalqjjicesqcjzix.functions.supabase.co/paystack-webhook" -H 'Content-Type: application/json' -d '{"event":"charge.success"}'
# garbage reference must 400:
curl -s -X POST "https://itpnfalqjjicesqcjzix.functions.supabase.co/verify-payment" -H 'Content-Type: application/json' -d '{"reference":"nonsense-ref"}'
```

Expected: `401` from the webhook; `{"success":false,"error":"Payment not verified by Paystack"}` (HTTP 400) from verify-payment. (If PAYSTACK_SECRET_KEY is unset, both return configuration errors — record for rollout, safe to continue.)

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/paystack-webhook/index.ts supabase/functions/verify-payment/index.ts
git commit -m "feat: rebuild paystack-webhook + verify-payment on shared promotion path"
```

---

### Task 5: `reconcile-payments` sweeper + Migration B (pg_cron)

**Files:**
- Create: `supabase/functions/reconcile-payments/index.ts`
- Create: `supabase/migrations/20260723_paystack_sweeper.sql`

**Interfaces:**
- Consumes: shared module (Task 1); `RECONCILE_HOOK_SECRET` (function secret + Vault, set at rollout).
- Produces: `POST` with `x-hook-secret` → sweeps `pending_payment` orders (30min–48h old): verified-paid → promote; unpaid > 2h → cancel with `cancel_reason`. pg_cron job `reconcile-payments` every 15 min.

- [ ] **Step 1: Write the function**

Create `supabase/functions/reconcile-payments/index.ts`:

```ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decidePromotion, promoteOrder, verifyTransaction, sendOrderConfirmedEmail } from "../_shared/paystack.ts";

// Reconciliation sweeper — invoked by pg_cron every 15 minutes. For every
// order stuck in pending_payment: if Paystack says paid, promote it (missed
// webhook); if unpaid past the 2h cutoff, cancel it. INVARIANT: an order with
// a reference is NEVER cancelled without a same-run Paystack re-verification.

const PAYSTACK_SECRET = (Deno.env.get('PAYSTACK_SECRET_KEY') ?? '').trim();
const SUPABASE_URL    = (Deno.env.get('SUPABASE_URL') ?? '').trim();
const SERVICE_KEY     = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();
const HOOK_SECRET     = (Deno.env.get('RECONCILE_HOOK_SECRET') ?? '').trim();

const GRACE_MINUTES = 30;   // leave fresh checkouts alone
const EXPIRE_HOURS  = 2;    // unpaid past this → cancelled
const LOOKBACK_HOURS = 48;  // don't chase ancient rows forever
const BATCH = 50;

const safeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

serve(async (req) => {
  if (req.method === 'GET' && new URL(req.url).searchParams.has('health')) {
    return new Response(JSON.stringify({ ok: true, paystack_key: !!PAYSTACK_SECRET, service_key: !!SERVICE_KEY, hook_secret: !!HOOK_SECRET }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  if (req.method !== 'POST') return new Response('ok', { status: 200 });
  const provided = (req.headers.get('x-hook-secret') ?? '').trim();
  if (!HOOK_SECRET || !safeEqual(provided, HOOK_SECRET)) {
    return new Response('Unauthorized', { status: 401 });
  }
  if (!PAYSTACK_SECRET || !SUPABASE_URL || !SERVICE_KEY) {
    return new Response('misconfigured', { status: 500 });
  }

  const db = createClient(SUPABASE_URL, SERVICE_KEY);
  const now = Date.now();
  const newest = new Date(now - GRACE_MINUTES * 60_000).toISOString();
  const oldest = new Date(now - LOOKBACK_HOURS * 3_600_000).toISOString();

  const { data: rows, error } = await db
    .from('orders')
    .select('id, status, paid_at, total, paystack_ref, created_at, customer_name, customer_email, customer_phone, delivery_address')
    .eq('status', 'pending_payment')
    .is('deleted_at', null)
    .lt('created_at', newest)
    .gt('created_at', oldest)
    .order('created_at', { ascending: true })
    .limit(BATCH);
  if (error) return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 });

  let promoted = 0, cancelled = 0, left = 0;
  for (const order of rows ?? []) {
    const ageMs = now - Date.parse(order.created_at);
    const expired = ageMs > EXPIRE_HOURS * 3_600_000;

    if (order.paystack_ref) {
      // Three-way classify: a failed verify (Paystack outage) reads as 'unknown'
      // and must NEVER cancel — only a definitive 'unpaid' verdict may.
      const { outcome, data } = await classifyTransaction(PAYSTACK_SECRET, order.paystack_ref);
      if (outcome === 'paid') {
        if (decidePromotion(order, Number(data?.amount ?? -1)) === 'promote') {
          const didPromote = await promoteOrder(db, order.id, { reference: order.paystack_ref, channel: data?.channel });
          if (didPromote) { await sendOrderConfirmedEmail(order); promoted++; }
        }
        continue; // paid → never cancel
      }
      if (outcome === 'unknown') { left++; continue; } // couldn't verify → retry next run
      // outcome === 'unpaid' → fall through to expiry cancel
    }
    if (expired) {
      // Re-verified unpaid, or never got a reference (never charged). Safe to expire.
      const { error: cancelErr } = await db.from('orders')
        .update({ status: 'cancelled', cancel_reason: 'Payment expired (Paystack)' })
        .eq('id', order.id).eq('status', 'pending_payment');
      if (cancelErr) { console.error(`reconcile-payments: cancel failed for ${order.id}: ${cancelErr.message}`); left++; }
      else cancelled++;
      continue;
    }
    left++;
  }

  const summary = { ok: true, scanned: rows?.length ?? 0, promoted, cancelled, awaiting: left };
  console.log('reconcile-payments:', JSON.stringify(summary));
  return new Response(JSON.stringify(summary), { status: 200, headers: { 'Content-Type': 'application/json' } });
});
```

- [ ] **Step 2: Write Migration B**

Create `supabase/migrations/20260723_paystack_sweeper.sql`:

```sql
-- Schedules the reconcile-payments sweeper via pg_cron + pg_net.
-- Prereq (rollout step, NOT in this file): the shared secret must exist in BOTH places:
--   select vault.create_secret('<value>', 'RECONCILE_HOOK_SECRET');
--   supabase secrets set RECONCILE_HOOK_SECRET=<value>
-- APPLY with: supabase db query --linked -f supabase/migrations/20260723_paystack_sweeper.sql

create extension if not exists pg_cron;

create or replace function public.invoke_reconcile_payments()
returns void
language plpgsql
security definer
set search_path = public, net, vault
as $$
declare
  hook_secret text;
begin
  begin
    select decrypted_secret into hook_secret
      from vault.decrypted_secrets
      where name = 'RECONCILE_HOOK_SECRET'
      limit 1;
  exception when others then
    hook_secret := null;
  end;

  perform net.http_post(
    url     := 'https://itpnfalqjjicesqcjzix.functions.supabase.co/reconcile-payments',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-hook-secret', coalesce(hook_secret, '')
    ),
    body    := '{}'::jsonb
  );
end;
$$;

-- cron.schedule upserts by job name, so re-applying is safe.
select cron.schedule('reconcile-payments', '*/15 * * * *', 'select public.invoke_reconcile_payments()');
```

- [ ] **Step 3: Deploy + apply + verify**

```bash
supabase functions deploy reconcile-payments --no-verify-jwt --project-ref itpnfalqjjicesqcjzix
supabase db query --linked -f supabase/migrations/20260723_paystack_sweeper.sql
# job registered?
supabase db query --linked "select jobname, schedule, active from cron.job where jobname = 'reconcile-payments'"
# wrong secret must 401:
curl -s -o /dev/null -w "%{http_code}\n" -X POST "https://itpnfalqjjicesqcjzix.functions.supabase.co/reconcile-payments" -H 'x-hook-secret: wrong'
```

Expected: cron row `reconcile-payments | */15 * * * * | t`; curl `401` (or `500 misconfigured` if secrets aren't set yet — record for rollout). Within 15 min, `select status_code, content from net._http_response order by id desc limit 5` should show the sweep responses (401 until the Vault+function secrets are set at rollout — that is fine and inert).

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/reconcile-payments/index.ts supabase/migrations/20260723_paystack_sweeper.sql
git commit -m "feat: reconcile-payments sweeper + pg_cron schedule"
```

---

### Task 6: `export-orders` partner-poll guard

**Files:**
- Modify: `supabase/functions/export-orders/index.ts:66-72`

**Interfaces:**
- Consumes: nothing new. Produces: poll output that never contains unpaid Paystack orders.

- [ ] **Step 1: Add the unified-rule filter**

In `supabase/functions/export-orders/index.ts`, change:

```ts
    let q = db
      .from('orders')
      .select(ORDER_COLUMNS)
      .is('deleted_at', null)
      .order('updated_at', { ascending: true })
      .limit(limit);
```

to:

```ts
    let q = db
      .from('orders')
      .select(ORDER_COLUMNS)
      .is('deleted_at', null)
      // Unpaid Paystack orders don't exist as far as the partner is concerned
      // (spec unified rule). The is.null branch keeps legacy null-method rows.
      .or('payment_method.is.null,payment_method.neq.paystack,paid_at.not.is.null')
      .order('updated_at', { ascending: true })
      .limit(limit);
```

- [ ] **Step 2: Deploy + verify**

```bash
supabase functions deploy export-orders --no-verify-jwt --project-ref itpnfalqjjicesqcjzix
curl -s "https://itpnfalqjjicesqcjzix.functions.supabase.co/export-orders?limit=3" -H "x-api-key: $(grep PARTNER_ORDER_API_KEY .env | cut -d= -f2)" | head -c 400
```

Expected: `{"ok":true,"orders":[...` — normal orders still flow (the filter only bites once unpaid Paystack rows exist). If the key env var isn't in `.env`, use the key documented in `HANDOFF.md` Credentials.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/export-orders/index.ts
git commit -m "feat: exclude unpaid Paystack orders from partner poll (unified rule)"
```

---

### Task 7: Frontend plumbing — SettingsContext key, success page, route

**Files:**
- Modify: `src/context/SettingsContext.jsx` (two edits)
- Create: `src/pages/storefront/PaymentSuccess.jsx`
- Modify: `src/App.jsx` (import + route)

**Interfaces:**
- Consumes: `get_payment_status` RPC (Task 2), `verify-payment` (Task 4).
- Produces: `settings.paystack?.enabled` available via `useSettings()` (Tasks 8–9 read it); route `/payment/success`.

- [ ] **Step 1: SettingsContext — add the `paystack` key**

In `src/context/SettingsContext.jsx`, in `applyRow` (after the `delivery_promo` line, currently line 42):

```js
  if (key === 'paystack')         return value ? { paystack: value } : {};
```

And in the initial-fetch `Promise.all` block (after the `delivery_promo` fetch, currently line 74):

```js
        publicSupabase.from('app_settings').select('key,value').eq('key', 'paystack').single(),
```

(Any realtime/refresh handler in this file flows through `applyRow`, so no further change; verify by confirming no other key-name switch exists in the file.)

- [ ] **Step 2: Create `src/pages/storefront/PaymentSuccess.jsx`**

```jsx
import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle, Loader2, Clock } from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { publicSupabase } from '../../lib/supabase';

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Landing page after Paystack's hosted payment page. READ-ONLY UX: the
// webhook is the source of payment truth — this page just polls until the
// order leaves pending_payment. One backup verify-payment call covers a slow
// webhook. It never claims failure: the webhook/sweeper may still land it.
const POLL_MS = 2000;
const FIRST_PHASE_MS = 30000;   // then fire the one-shot verify backup
const SECOND_PHASE_MS = 10000;  // keep polling a little after the backup

export default function PaymentSuccess() {
  const [params] = useSearchParams();
  const reference = params.get('reference') || params.get('trxref') || '';
  const { clearCart } = useCart();
  const [state, setState] = useState('checking'); // 'checking' | 'paid' | 'processing' | 'noref'
  const [orderId, setOrderId] = useState(null);
  const clearedRef = useRef(false);

  useEffect(() => {
    if (!reference) { setState('noref'); return; }
    let stopped = false;
    let verifyFired = false;
    const startedAt = Date.now();

    const confirmPaid = (id) => {
      if (stopped) return;
      setOrderId(id);
      setState('paid');
      if (!clearedRef.current) {
        clearedRef.current = true;
        clearCart();
        if (typeof window !== 'undefined' && window.fbq) {
          window.fbq('track', 'Purchase', { content_type: 'product', currency: 'NGN' });
        }
      }
    };

    const tick = async () => {
      if (stopped) return;
      const { data } = await publicSupabase.rpc('get_payment_status', { p_ref: reference });
      if (stopped) return;
      if (data?.paid) { confirmPaid(data.order_id); return; }
      const elapsed = Date.now() - startedAt;
      if (elapsed > FIRST_PHASE_MS && !verifyFired) {
        verifyFired = true;
        try {
          await fetch(`${SUPABASE_URL}/functions/v1/verify-payment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPABASE_ANON_KEY}`, apikey: SUPABASE_ANON_KEY },
            body: JSON.stringify({ reference }),
          });
        } catch { /* silent — polling continues */ }
      }
      if (elapsed > FIRST_PHASE_MS + SECOND_PHASE_MS) { setState('processing'); return; }
      setTimeout(tick, POLL_MS);
    };
    tick();
    return () => { stopped = true; };
  }, [reference]); // clearCart intentionally omitted — guarded by clearedRef

  const box = { minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 20 };

  if (state === 'noref') {
    return (
      <div style={box}><div>
        <h2 style={{ fontWeight: 900 }}>Missing payment reference</h2>
        <p style={{ color: '#888', margin: '10px 0 20px' }}>If you completed a payment, you'll receive a confirmation email shortly.</p>
        <Link to="/shop" className="btn-primary">Back to Menu</Link>
      </div></div>
    );
  }
  if (state === 'paid') {
    return (
      <div style={box}><div>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}><CheckCircle size={64} color="#16a34a" /></div>
        <h2 style={{ fontWeight: 900 }}>Payment confirmed! 🎉</h2>
        <p style={{ color: '#555', margin: '10px 0 4px' }}>Your order <strong style={{ color: '#c0201f' }}>{orderId}</strong> is being prepared.</p>
        <p style={{ color: '#888', fontSize: '0.85rem', marginBottom: 20 }}>A confirmation email is on its way. Pay the delivery fee to the rider in cash on arrival.</p>
        <Link to="/shop" className="btn-primary">Back to Menu</Link>
      </div></div>
    );
  }
  if (state === 'processing') {
    return (
      <div style={box}><div>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}><Clock size={64} color="#f59e0b" /></div>
        <h2 style={{ fontWeight: 900 }}>Payment is processing…</h2>
        <p style={{ color: '#555', margin: '10px 0 20px', maxWidth: 420 }}>
          We're confirming your payment with the bank. You'll get a confirmation email as soon as it lands —
          no need to pay again. Keep your payment reference: <strong>{reference}</strong>
        </p>
        <Link to="/shop" className="btn-primary">Back to Menu</Link>
      </div></div>
    );
  }
  return (
    <div style={box}><div>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}><Loader2 size={48} className="spin" color="#c0201f" /></div>
      <h2 style={{ fontWeight: 900 }}>Confirming your payment…</h2>
      <p style={{ color: '#888', marginTop: 8 }}>This usually takes a few seconds.</p>
    </div></div>
  );
}
```

- [ ] **Step 3: Register the route**

In `src/App.jsx`: add the import next to the other storefront page imports (find `import Checkout` and mirror it):

```js
import PaymentSuccess from './pages/storefront/PaymentSuccess';
```

and after the `checkout` route (line 88 `<Route path="checkout" element={<Checkout />} />`):

```jsx
        <Route path="payment/success" element={<PaymentSuccess />} />
```

(If storefront pages in this file are lazy-imported instead, mirror the lazy pattern exactly as `Checkout` does — match whichever form line 88's component uses.)

- [ ] **Step 4: Lint, test, build**

```bash
npx eslint src/context/SettingsContext.jsx src/pages/storefront/PaymentSuccess.jsx src/App.jsx
npx vitest run
npm run build
```

Expected: no new lint errors, tests pass, build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/context/SettingsContext.jsx src/pages/storefront/PaymentSuccess.jsx src/App.jsx
git commit -m "feat: payment success page, /payment/success route, paystack settings key"
```

---

### Task 8: Checkout.jsx — payment-method selector + Paystack path

**Files:**
- Modify: `src/pages/storefront/Checkout.jsx`

**Interfaces:**
- Consumes: `settings.paystack?.enabled` (Task 7), `initialize-payment` (Task 3). Existing in-file: `buildOrderPayload`, `validateForm`, `checkStock`, `incrementCouponUse`, `notify`, `anyItemPastCutoff`, cutoff-modal state, `amountToPayNow`.
- Produces: nothing consumed later; MenuPage (Task 9) mirrors this code.

- [ ] **Step 1: Add method state**

After `const [transferConfirmed, setTransferConfirmed] = useState(false);` (line 52), add:

```js
  const paystackEnabled = !!settings?.paystack?.enabled;
  const [payMethod, setPayMethod] = useState('paystack'); // 'paystack' | 'transfer'
  const activeMethod = paystackEnabled ? payMethod : 'transfer';
```

(`settings` is already destructured from `useSettings()` at line 32.)

- [ ] **Step 2: Add the Paystack handler**

Immediately after the closing `};` of `handleBankTransfer` (line 318), add:

```js
  const handlePaystack = async (skipCutoffGate = false) => {
    if (skipCutoffGate !== true && anyItemPastCutoff(items) && !cutoffAck) {
      setShowCutoffModal(true);
      return;
    }
    if (!validateForm()) return;

    const itemsSnapshot = [...items];
    setProcessing(true);

    const stockFailures = await checkStock(itemsSnapshot);
    if (stockFailures?.length) {
      const msg = stockFailures
        .map(i => i.available === 0 ? `${i.name} is out of stock` : `Only ${i.available} left of ${i.name}`)
        .join(' · ');
      showToast('Cannot place order', msg, 'error');
      setProcessing(false);
      return;
    }

    try {
      // Hidden until paid: the webhook flips pending_payment -> pending.
      // No notify() and no clearCart() here — email fires on payment,
      // cart clears on the success page.
      const payload = buildOrderPayload('paystack');
      payload.status = 'pending_payment';
      const { data: orderId, error } = await publicSupabase.rpc('create_storefront_order', { p: payload });
      if (error) throw error;
      await publicSupabase.from('order_items').insert(
        itemsSnapshot.map(i => ({ order_id: orderId, product_id: i.id || null, name: i.name, price: i.price, qty: i.qty }))
      );

      const res = await fetch(`${SUPABASE_URL}/functions/v1/initialize-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'apikey': SUPABASE_ANON_KEY },
        body: JSON.stringify({ order_id: orderId, origin: window.location.origin }),
      });
      const data = await res.json();
      if (!res.ok || !data.authorization_url) throw new Error(data.error || 'Could not start payment');

      await incrementCouponUse();
      window.location.assign(data.authorization_url);
    } catch (err) {
      showToast('Could not start card payment', `${err.message} — you can pay by bank transfer instead.`, 'error');
      setProcessing(false);
    }
  };
```

- [ ] **Step 3: Route the cutoff modal to the active method**

Find the cutoff modal's confirm/"I understand" button (it currently calls `handleBankTransfer(true)`; search `showCutoffModal` in the JSX). Change that call to:

```js
{ setShowCutoffModal(false); setCutoffAck(true); (activeMethod === 'paystack' ? handlePaystack : handleBankTransfer)(true); }
```

preserving whatever `setShowCutoffModal(false)` / `setCutoffAck(true)` calls the button already makes (do not duplicate them if present — only swap the handler expression).

- [ ] **Step 4: Method selector UI**

In the payment section JSX, directly ABOVE the "Pay now (transfer)" card (the `<span ...>Pay now (transfer)</span>` block around line 557), insert — only when Paystack is enabled:

```jsx
          {paystackEnabled && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              {[
                ['paystack', 'Pay with Card / USSD', 'Instant confirmation via Paystack'],
                ['transfer', 'Manual Bank Transfer', 'Transfer to our Moniepoint account'],
              ].map(([key, title, sub]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPayMethod(key)}
                  style={{
                    textAlign: 'left', padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
                    border: `2px solid ${activeMethod === key ? '#c0201f' : '#e5e5e5'}`,
                    background: activeMethod === key ? '#fef2f2' : '#fff',
                  }}
                >
                  <div style={{ fontWeight: 800, fontSize: '0.85rem', color: '#111' }}>{title}</div>
                  <div style={{ fontSize: '0.72rem', color: '#888', marginTop: 2 }}>{sub}</div>
                </button>
              ))}
            </div>
          )}
```

Then wrap the EXISTING transfer-specific UI (the "Pay now (transfer)" card, bank details, `transferName` input, and `transferConfirmed` checkbox — NOT the price summary) in `{activeMethod === 'transfer' && ( ... )}`.

Finally, make the submit button method-aware. The existing button (line ~620) is disabled on `processing || !transferConfirmed || !transferName.trim()` and calls `handleBankTransfer`. Change it to:

```jsx
          onClick={() => (activeMethod === 'paystack' ? handlePaystack() : handleBankTransfer())}
          disabled={processing || (activeMethod === 'transfer' && (!transferConfirmed || !transferName.trim()))}
```

and the label to:

```jsx
          {processing ? <><Loader2 size={18} className="spin" /> Processing…</> : (
            activeMethod === 'paystack'
              ? <><Send size={18} /> Pay {fmt(amountToPayNow)} Securely →</>
              : <><Send size={18} /> Complete Order · Pay {fmt(amountToPayNow)}</>
          )}
```

(Keep the button's disabled-styling expression in sync with the new `disabled` condition.)

- [ ] **Step 5: Lint, test, build**

```bash
npx eslint src/pages/storefront/Checkout.jsx
npx vitest run
npm run build
```

Expected: clean on the file, tests pass, build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/pages/storefront/Checkout.jsx
git commit -m "feat: Paystack payment option on main checkout (hidden-until-paid flow)"
```

---

### Task 9: MenuPage.jsx — same selector + path

**Files:**
- Modify: `src/pages/storefront/MenuPage.jsx`

**Interfaces:**
- Consumes: identical pieces as Task 8. MenuPage is the duplicated checkout twin: `notify` at line 23, `amountToPayNow` at 180, `buildOrderPayload`/order creation at ~190-245, `handleBankTransfer` at 230, transfer UI at ~824-900.

- [ ] **Step 1: Apply the Task 8 changes to MenuPage.jsx**

Repeat Task 8's Steps 1–4 in `src/pages/storefront/MenuPage.jsx`, adapted to its local structure:
- Same three state lines (Step 1) after its `transferConfirmed` state (line 82). MenuPage already imports `useSettings` — if not, mirror Checkout.jsx's import.
- Same `handlePaystack` (Step 2) after its `handleBankTransfer`, using MenuPage's own `buildOrderPayload`, `validateForm`, `checkStock`, `SUPABASE_URL`/`SUPABASE_ANON_KEY` constants (they exist — the `notify` helper at line 23 uses them). If MenuPage's `handleBankTransfer` has no `skipCutoffGate` param/cutoff gate, drop that guard from `handlePaystack` here to match the page's existing behavior — do not import cutoff machinery it doesn't have.
- Same selector UI (Step 4) above its transfer card (line ~824), same `{activeMethod === 'transfer' && (...)}` wrap of its transfer-only UI (lines ~824-895), same method-aware submit button (its button is at ~896-897).
- IMPORTANT: MenuPage renders inside the `/menu` single-page flow — after `window.location.assign(authorization_url)` the page navigates away; no drawer state needs handling.

- [ ] **Step 2: Lint, test, build**

```bash
npx eslint src/pages/storefront/MenuPage.jsx
npx vitest run
npm run build
```

Expected: clean on the file, tests pass, build succeeds. (Headless-driving `/menu` crashes the browser per `.claude/skills/verify/SKILL.md` — code review + build are the gate here; live check happens at rollout.)

- [ ] **Step 3: Commit**

```bash
git add src/pages/storefront/MenuPage.jsx
git commit -m "feat: Paystack payment option on /menu checkout"
```

---

### Task 10: Admin — Settings toggle card + Orders "Awaiting Payment" filter

**Files:**
- Modify: `src/pages/dashboard/Settings.jsx`
- Modify: `src/pages/dashboard/Orders.jsx` (lines 16, 413-area, 441, 1042-1044, 1293)

**Interfaces:**
- Consumes: `app_settings.paystack` row (Task 2). Produces: staff-facing controls; no downstream consumers.

- [ ] **Step 1: Settings card**

In `src/pages/dashboard/Settings.jsx`, add a "Paystack Payments" card following the exact save/load pattern of the existing "Delivery Promo" card (read it first — it upserts `app_settings` by key and refreshes context). Place the new card directly after the Delivery Promo card. Component:

```jsx
function PaystackCard() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    supabase.from('app_settings').select('value').eq('key', 'paystack').single()
      .then(({ data }) => { setEnabled(!!data?.value?.enabled); setLoading(false); });
  }, []);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from('app_settings')
      .upsert({ key: 'paystack', value: { enabled } }, { onConflict: 'key' });
    setSaving(false);
    if (error) showToast('Save failed', error.message, 'error');
    else showToast('Saved', `Paystack is now ${enabled ? 'ON' : 'OFF'} at checkout`, 'success');
  };

  if (loading) return null;
  return (
    <div className="dash-card" style={{ marginTop: 16 }}>
      <div className="dash-card-title">Paystack Payments</div>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '6px 0 14px' }}>
        Kill switch for the card/USSD payment option on both storefront checkouts.
        Turn OFF to instantly fall back to manual bank transfer only (no deploy needed).
      </p>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 14 }}>
        <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
        <span style={{ fontWeight: 700 }}>Enable Paystack at checkout</span>
      </label>
      <button className="btn-primary" onClick={save} disabled={saving}>
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  );
}
```

Adapt the imports/hook names to what Settings.jsx actually uses (`supabase` vs another client name, its toast hook) — mirror the Delivery Promo card's exact imports. Render `<PaystackCard />` where the other cards are composed.

- [ ] **Step 2: Orders page — Awaiting Payment filter**

In `src/pages/dashboard/Orders.jsx`:

Line 16, add the status:

```js
const statuses = ['all', 'pending_payment', 'pending', 'processing', 'shipped', 'delivered', 'cancelled'];
```

Line 441 (main fetch), hide awaiting-payment rows from "All":

```js
    if (filter !== 'all') q = q.eq('status', filter);
    else q = q.neq('status', 'pending_payment');
```

In the counts query area (line ~413, the `statusCounts` computation): apply the same `.neq('status','pending_payment')` to the query that computes the `all` count, so the pill numbers agree with the list.

Pill label (line 1043) — give the status a human name:

```jsx
          <button key={s} className={`dash-filter-btn${filter === s ? ' active' : ''}`} onClick={() => setFilter(s)}>
            {s === 'all' ? `All (${statusCounts.all || 0})`
              : s === 'pending_payment' ? `Awaiting Payment (${statusCounts.pending_payment || 0})`
              : `${s.charAt(0).toUpperCase() + s.slice(1)} (${statusCounts[s] || 0})`}
          </button>
```

Line 1293 (status-edit dropdown) — staff must not manually set it:

```js
options={statuses.filter(s => s !== 'all' && s !== 'pending_payment' && (canCancelOrder || s !== 'cancelled')).map(s => ({ value: s, label: s }))}
```

(The bulk-change list at line 1598 is a hardcoded array without `pending_payment` — leave it.)

- [ ] **Step 3: Lint, test, build, commit**

```bash
npx eslint src/pages/dashboard/Settings.jsx src/pages/dashboard/Orders.jsx
npx vitest run
npm run build
git add src/pages/dashboard/Settings.jsx src/pages/dashboard/Orders.jsx
git commit -m "feat: Paystack kill-switch card + Awaiting Payment orders filter"
```

---

### Task 11: Verification + rollout gate (STOPS for owner)

**Files:** none (verification + documented rollout).

- [ ] **Step 1: Automated verification sweep**

```bash
npx vitest run && npm run build
```

Then prod guards (read-only):

```bash
node --input-type=module -e "
import { createClient } from '@supabase/supabase-js';
const s = createClient('https://itpnfalqjjicesqcjzix.supabase.co', '<ANON KEY from Global Constraints>');
const q = async (sql) => { const { data, error } = await s.rpc('exec_read_only_sql', { q: sql }); if (error) throw error; return data; };
console.log('cron job:', await q(\"select jobname, schedule, active from cron.job where jobname='reconcile-payments'\"));
console.log('kill switch:', await q(\"select value from app_settings where key='paystack'\"));
console.log('pending_payment leak into stats (must be 0 rows):', await q(\"select count(*) as n from orders where status='pending_payment'\"));
"
```

Health probes:

```bash
for f in initialize-payment paystack-webhook reconcile-payments; do
  echo -n "$f: "; curl -s "https://itpnfalqjjicesqcjzix.functions.supabase.co/$f?health=1"; echo;
done
```

Expected: suite + build green; cron active; kill switch `{"enabled": false}`; all health probes `ok:true` with every key flag `true` — any `false` flag is a secrets gap to fix in Step 2.

- [ ] **Step 2: Rollout checklist — REQUIRES OWNER, do not proceed autonomously**

Present this checklist to the owner and stop:

1. **Secrets** (owner supplies values):
   ```bash
   supabase secrets set PAYSTACK_SECRET_KEY=sk_test_...   # TEST key first
   SECRET=$(openssl rand -hex 24)
   supabase secrets set RECONCILE_HOOK_SECRET=$SECRET
   supabase db query --linked "select vault.create_secret('$SECRET', 'RECONCILE_HOOK_SECRET')"
   ```
   Also update `VITE_PAYSTACK_PUBLIC_KEY` in `.env` if stale (not used by this flow but kept accurate). Re-run the health probes — all flags must be `true`.
2. **Paystack dashboard** (owner): set the webhook URL to `https://itpnfalqjjicesqcjzix.functions.supabase.co/paystack-webhook`; confirm `smokeyhutdelight.com` is an allowed callback domain.
3. **Test-mode E2E** (with owner, Paystack test card `4084 0840 8408 4081`):
   a. Enable the kill switch (Admin → Settings → Paystack → ON). Deploy frontend (`npm run build && firebase deploy --only hosting`).
   b. **Happy path:** place a small order via Paystack → hosted page → pay → success page confirms; order appears as `pending` with `paid_at`; confirmation email received; partner push fires (check `net._http_response`).
   c. **Abandon:** start a payment, close the tab. Order stays `pending_payment`, invisible in Orders default/All and stats; after 2h+ the sweeper cancels it (`cancel_reason='Payment expired (Paystack)'`) and it never reaches the partner.
   d. **Delayed webhook:** temporarily set a wrong webhook URL in the Paystack dashboard, pay, land on success page → the 30s verify-payment backup promotes the order; restore the webhook URL after.
   e. **Regression:** place a manual bank-transfer order — flow unchanged end to end.
4. **Go live:** swap `PAYSTACK_SECRET_KEY` to the live `sk_live_...` key, re-run health probes, keep the kill switch ON. Watch the first real payments on the Payments admin page and `net._http_response`.
5. **Rollback at any point:** Admin → Settings → Paystack → OFF (checkout instantly reverts to transfer-only; all backend stays inert).
