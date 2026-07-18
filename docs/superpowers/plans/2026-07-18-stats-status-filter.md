# Status Filter for Stats & Units Sold Pages — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a whole-page status filter (All / Delivered / Shipped / Pending) to `/dashboard/stats` and `/dashboard/products-sold`, backed by a new `p_status` parameter on the five stats RPCs, so every number on a page describes the same set of orders.

**Architecture:** One SQL migration drops-and-recreates the five stats functions with an optional `p_status text` parameter (NULL → all non-cancelled; otherwise exact match; cancelled never included). A tiny shared frontend module defines the pill set; both pages add a segmented control and pass `p_status` on every RPC call.

**Tech Stack:** Postgres (Supabase) SQL functions, Vite + React 19, vitest, `@supabase/supabase-js`.

**Spec:** `docs/superpowers/specs/2026-07-18-stats-status-filter-design.md`

## Global Constraints

- **NEVER run `supabase db push`** — remote migration history is out of sync. Apply the migration with `supabase db query --linked -f <file>` (CLI v2.109; run `supabase link --project-ref itpnfalqjjicesqcjzix` first if the project is not linked).
- The `exec_sql` RPC referenced by `scripts/apply_campaign_logs.js` **no longer exists**; do not copy that pattern. Read-only prod SQL goes through the `exec_read_only_sql` RPC with the anon key (pattern below).
- Default status pill is **Delivered**. Pill set is exactly **All, Delivered, Shipped, Pending** (no "Processing").
- Cancelled orders are excluded under **every** filter value.
- Reference figures (computed 2026-07-18 WAT, for regression checks): 72 orders today → 51 delivered / 18 shipped / 3 pending; units 125 → 90 / 30 / 5. If executing on a later date, recompute with the cross-check query in Task 5 rather than expecting these exact numbers.
- Anon key for read-only checks (already public in `scripts/inspect_campaigns.js`):
  `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0cG5mYWxxamppY2VzcWNqeml4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzMDczMTEsImV4cCI6MjA5MDg4MzMxMX0.M6AiZDTLqiGeOk9WrpBCwN381jq6OV2GbgWaDAjgM3E`

---

### Task 1: Shared status-filter module

**Files:**
- Create: `src/lib/orderStatusFilter.js`
- Test: `src/lib/orderStatusFilter.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces (used verbatim by Tasks 3 & 4):
  - `STATUS_FILTERS: Array<{ key: string, label: string }>` — order: all, delivered, shipped, pending
  - `DEFAULT_STATUS: string` — `'delivered'`
  - `toStatusParam(key: string): string | null` — `null` for `'all'`, else the key unchanged
  - `statusLabelFor(key: string): string` — `'all statuses'` for `'all'`, else the key (lowercase, matches DB values)

- [ ] **Step 1: Write the failing test**

Create `src/lib/orderStatusFilter.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { STATUS_FILTERS, DEFAULT_STATUS, toStatusParam, statusLabelFor } from './orderStatusFilter';

describe('orderStatusFilter', () => {
  it('defines exactly All, Delivered, Shipped, Pending in that order', () => {
    expect(STATUS_FILTERS.map(s => s.key)).toEqual(['all', 'delivered', 'shipped', 'pending']);
    expect(STATUS_FILTERS.map(s => s.label)).toEqual(['All', 'Delivered', 'Shipped', 'Pending']);
  });

  it('defaults to delivered', () => {
    expect(DEFAULT_STATUS).toBe('delivered');
  });

  it('maps "all" to null for the RPC param, passes real statuses through', () => {
    expect(toStatusParam('all')).toBeNull();
    expect(toStatusParam('delivered')).toBe('delivered');
    expect(toStatusParam('shipped')).toBe('shipped');
    expect(toStatusParam('pending')).toBe('pending');
  });

  it('produces human labels for the breakdown modal', () => {
    expect(statusLabelFor('all')).toBe('all statuses');
    expect(statusLabelFor('delivered')).toBe('delivered');
    expect(statusLabelFor('shipped')).toBe('shipped');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/orderStatusFilter.test.js`
Expected: FAIL — cannot resolve `./orderStatusFilter`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/orderStatusFilter.js`:

```js
// Shared status-filter definitions for the Stats and Units Sold pages.
// Single source of truth so the two pages' pill rows cannot drift.
// 'processing' is intentionally absent: 0 orders all-time use it.

export const STATUS_FILTERS = [
  { key: 'all',       label: 'All' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'shipped',   label: 'Shipped' },
  { key: 'pending',   label: 'Pending' },
];

export const DEFAULT_STATUS = 'delivered';

// RPC param: NULL means "all non-cancelled" on the SQL side.
export const toStatusParam = (key) => (key === 'all' ? null : key);

// Human label for copy like "90 units — delivered".
export const statusLabelFor = (key) => (key === 'all' ? 'all statuses' : key);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/orderStatusFilter.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Run the whole suite to check nothing else broke**

Run: `npx vitest run`
Expected: all existing tests in `src/lib/*.test.js` still pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/orderStatusFilter.js src/lib/orderStatusFilter.test.js
git commit -m "feat: shared status-filter constants for stats pages"
```

---

### Task 2: Migration — add `p_status` to the five stats RPCs

**Files:**
- Create: `supabase/migrations/20260718_stats_status_filter.sql`

**Interfaces:**
- Consumes: current function definitions (captured in this task's SQL — no lookup needed).
- Produces (called by Tasks 3 & 4 via `supabase.rpc(name, {...})`):
  - `get_stats_all_products(p_store_id int, p_start timestamptz, p_end timestamptz, p_status text) → TABLE(name text, revenue numeric, units bigint)`
  - `get_product_stats_kpis(p_store_id, p_start, p_end, p_status) → json {revenue, units_sold, order_count, unique_customers}`
  - `get_product_stats_lists(p_store_id, p_start, p_end, p_status) → json {top_by_revenue, top_by_units, top_locations, top_qty_per_order, top_customers, top_categories}`
  - `get_guineafowl_breakdown(p_store_id, p_start, p_end, p_status) → json {direct, in_packs, total}`
  - `get_product_order_breakdown(p_name text, p_store_id, p_start, p_end, p_status) → TABLE(order_id, created_at, customer_name, status, qty, price, line_total)`
  - All `p_status` params are `text DEFAULT NULL` — existing callers that omit it keep working (NULL = all non-cancelled). NOTE: for omitting callers, units figures CHANGE from delivered-only to all-non-cancelled; a repo grep (done during design) confirmed the only callers are the two pages updated in Tasks 3–4.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/20260718_stats_status_filter.sql` with exactly:

```sql
-- Whole-page status filter for Stats & Units Sold pages.
-- Adds p_status (text, default NULL) to the five stats RPCs.
-- Semantics: NULL -> all non-cancelled; otherwise status = p_status.
-- Cancelled is excluded under every filter value.
-- This also FIXES a denominator mismatch: units used to be hardcoded
-- delivered-only while revenue counted all non-cancelled; both now
-- compute over the same (scoped) order set.
--
-- APPLY with: supabase db query --linked -f supabase/migrations/20260718_stats_status_filter.sql
-- NEVER supabase db push (remote migration history is out of sync).

begin;

-- 1) get_stats_all_products ---------------------------------------------------
drop function if exists public.get_stats_all_products(integer, timestamptz, timestamptz);

create function public.get_stats_all_products(
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
    and o.status <> 'cancelled'
    and (p_status   is null or o.status = p_status)
    and (p_store_id is null or o.store_id = p_store_id)
    and (p_start    is null or o.created_at >= p_start)
    and (p_end      is null or o.created_at <= p_end)
  group by 1
  order by revenue desc;
$function$;

-- 2) get_product_stats_kpis ---------------------------------------------------
drop function if exists public.get_product_stats_kpis(integer, timestamptz, timestamptz);

create function public.get_product_stats_kpis(
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
      and status <> 'cancelled'
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

-- 3) get_product_stats_lists --------------------------------------------------
drop function if exists public.get_product_stats_lists(integer, timestamptz, timestamptz);

create function public.get_product_stats_lists(
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
      and status <> 'cancelled'
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

-- 4) get_guineafowl_breakdown -------------------------------------------------
drop function if exists public.get_guineafowl_breakdown(integer, timestamptz, timestamptz);

create function public.get_guineafowl_breakdown(
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
      and o.status <> 'cancelled'
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

-- 5) get_product_order_breakdown ----------------------------------------------
drop function if exists public.get_product_order_breakdown(text, integer, timestamptz, timestamptz);

create function public.get_product_order_breakdown(
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
    and o.status <> 'cancelled'
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

commit;
```

Behavioural notes baked into the SQL above (verify while writing, they are the point of the migration):
- `get_stats_all_products`: `units` no longer has `FILTER (WHERE o.status = 'delivered')` — revenue and units now share one scoped order set.
- `get_product_stats_kpis`: `units_sold` no longer has `WHERE b.status = 'delivered'`.
- `get_product_stats_lists`: `by_units` and `by_qty_per_order` no longer have `where status = 'delivered'`; `status` column dropped from the CTEs since nothing consumes it anymore.
- `get_guineafowl_breakdown`: hardcoded `o.status = 'delivered'` replaced by the scoped predicate.
- `get_product_order_breakdown`: gains the scoped predicate (was `status NOT IN ('cancelled')` only).
- Everything else (regexes, location/customer/category logic, ordering, limits) is byte-identical to the live definitions.

- [ ] **Step 2: Apply the migration (NOT db push)**

```bash
supabase db query --linked -f supabase/migrations/20260718_stats_status_filter.sql
```

Expected: success, no error output. If it errors with "project not linked": run `supabase link --project-ref itpnfalqjjicesqcjzix`, then retry. If `db query` itself is unavailable or fails for auth reasons, STOP and ask the human to paste the file into the Supabase dashboard SQL editor (project `itpnfalqjjicesqcjzix`) — do not try `db push`.

- [ ] **Step 3: Verify the new signatures exist in prod**

Run from repo root (uses the read-only RPC + anon key):

```bash
node --input-type=module -e "
import { createClient } from '@supabase/supabase-js';
const s = createClient('https://itpnfalqjjicesqcjzix.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0cG5mYWxxamppY2VzcWNqeml4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzMDczMTEsImV4cCI6MjA5MDg4MzMxMX0.M6AiZDTLqiGeOk9WrpBCwN381jq6OV2GbgWaDAjgM3E');
const { data, error } = await s.rpc('exec_read_only_sql', { q: \`
  select p.proname, pg_get_function_arguments(p.oid) as args
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('get_stats_all_products','get_product_stats_kpis','get_product_stats_lists','get_guineafowl_breakdown','get_product_order_breakdown')
  order by p.proname\` });
if (error) { console.error(error); process.exit(1); }
console.table(data);
const bad = data.filter(r => !r.args.includes('p_status'));
if (data.length !== 5 || bad.length) { console.error('MISSING p_status:', bad); process.exit(1); }
console.log('ALL 5 FUNCTIONS HAVE p_status ✓');
"
```

Expected: table of 5 rows, each `args` ending with `p_status text DEFAULT NULL::text`, then `ALL 5 FUNCTIONS HAVE p_status ✓`. Also confirm exactly 5 rows — a count of more than 5 means an old-signature overload survived (a DROP missed); investigate before proceeding.

- [ ] **Step 4: Functional smoke check of the scoping (today, WAT)**

```bash
node --input-type=module -e "
import { createClient } from '@supabase/supabase-js';
const s = createClient('https://itpnfalqjjicesqcjzix.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0cG5mYWxxamppY2VzcWNqeml4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzMDczMTEsImV4cCI6MjA5MDg4MzMxMX0.M6AiZDTLqiGeOk9WrpBCwN381jq6OV2GbgWaDAjgM3E');
const q = async (sql) => { const { data, error } = await s.rpc('exec_read_only_sql', { q: sql }); if (error) throw error; return data; };
// Independent truth: units per status for today (WAT), straight from tables.
const truth = await q(\`
  select o.status, sum(oi.qty) as units
  from orders o join order_items oi on oi.order_id = o.id
  where o.deleted_at is null and o.status <> 'cancelled'
    and (o.created_at at time zone 'Africa/Lagos')::date = (now() at time zone 'Africa/Lagos')::date
  group by o.status\`);
console.log('truth:', JSON.stringify(truth));
// New RPC, per pill value. Day window in WAT:
const kpi = async (st) => (await q(\`
  select public.get_product_stats_kpis(
    null,
    (date_trunc('day', now() at time zone 'Africa/Lagos') at time zone 'Africa/Lagos'),
    null,
    \${st === null ? 'null' : \`'\${st}'\`}
  ) as k\`))[0].k;
for (const st of ['delivered','shipped','pending',null]) {
  console.log(st ?? 'all', '->', JSON.stringify(await kpi(st)));
}
"
```

Expected: for each status, the RPC's `units_sold` equals that status's `units` in the `truth` output, and `all` equals their sum. (On 2026-07-18 that was delivered 90 / shipped 30 / pending 5 / all 125.) Mismatch = the migration's predicates are wrong; fix before proceeding.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260718_stats_status_filter.sql
git commit -m "feat: p_status param on the five stats RPCs (whole-page status scoping)"
```

---

### Task 3: Units Sold page (`ProductsSold.jsx`)

**Files:**
- Modify: `src/pages/dashboard/ProductsSold.jsx`

**Interfaces:**
- Consumes: `STATUS_FILTERS`, `DEFAULT_STATUS`, `toStatusParam`, `statusLabelFor` from `src/lib/orderStatusFilter.js` (Task 1); `p_status` param on `get_stats_all_products` and `get_product_order_breakdown` (Task 2).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Import the shared module and add state**

In `src/pages/dashboard/ProductsSold.jsx`, after the existing `DashCalendar` import (line 6), add:

```js
import { STATUS_FILTERS, DEFAULT_STATUS, toStatusParam, statusLabelFor } from '../../lib/orderStatusFilter';
```

In the `ProductsSold` component, after the `const [period, setPeriod] = useState('month');` line, add:

```js
const [status, setStatus]         = useState(DEFAULT_STATUS);
```

- [ ] **Step 2: Pass `p_status` on both RPC calls and refetch on change**

In `openDetail`, change the `get_product_order_breakdown` call to:

```js
const { data } = await supabase.rpc('get_product_order_breakdown', {
  p_name: product.name, p_store_id: storeParam, p_start: start, p_end: end,
  p_status: toStatusParam(status),
});
```

In the data-fetching `useEffect`, change the `get_stats_all_products` call to:

```js
const { data, error } = await supabase.rpc('get_stats_all_products', {
  p_store_id: storeParam, p_start: start, p_end: end,
  p_status: toStatusParam(status),
});
```

and change the effect's dependency array from `[selectedStore, period, customDate]` to `[selectedStore, period, customDate, status]`.

- [ ] **Step 3: Add the status pill row**

In the header JSX, inside the right-side `<div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>`, **before** the existing period `<div className="dash-segmented-control">`, insert:

```jsx
<div className="dash-segmented-control">
  {STATUS_FILTERS.map(s => (
    <button
      key={s.key}
      className={`dash-filter-btn${status === s.key ? ' active' : ''}`}
      onClick={() => setStatus(s.key)}
    >
      {s.label}
    </button>
  ))}
</div>
```

- [ ] **Step 4: Make the breakdown modal reflect the active status**

Change the `BreakdownModal` signature from `function BreakdownModal({ product, onClose })` to `function BreakdownModal({ product, statusLabel, onClose })`.

Replace the `deliveredUnits` line:

```js
const deliveredUnits = (rows || []).reduce((s, r) => s + (r.status === 'delivered' ? Number(r.qty) : 0), 0);
```

with (rows are already scoped server-side by `p_status`, so count them all):

```js
const countedUnits = (rows || []).reduce((s, r) => s + Number(r.qty), 0);
```

Replace the subtitle line:

```jsx
{fmtNum(units)} units sold (delivered) · {fmt(revenue)} revenue
```

with:

```jsx
{fmtNum(units)} units — {statusLabel} · {fmt(revenue)} revenue
```

Replace the footer span:

```jsx
<span>{fmtNum(deliveredUnits)} delivered units counted</span>
```

with:

```jsx
<span>{fmtNum(countedUnits)} units counted — {statusLabel}</span>
```

At the render site, change `{detail && <BreakdownModal product={detail} onClose={() => setDetail(null)} />}` to:

```jsx
{detail && <BreakdownModal product={detail} statusLabel={statusLabelFor(status)} onClose={() => setDetail(null)} />}
```

- [ ] **Step 5: Lint, test, build**

```bash
npx eslint src/pages/dashboard/ProductsSold.jsx
npx vitest run
npm run build
```

Expected: no new lint errors, tests pass, build succeeds. Note: `STATUS_COLOR` remains in use by the modal's per-row status badges — do not remove it.

- [ ] **Step 6: Commit**

```bash
git add src/pages/dashboard/ProductsSold.jsx
git commit -m "feat: status filter pills on Units Sold page"
```

---

### Task 4: Stats page (`ProductStats.jsx`)

**Files:**
- Modify: `src/pages/dashboard/ProductStats.jsx`

**Interfaces:**
- Consumes: `STATUS_FILTERS`, `DEFAULT_STATUS`, `toStatusParam` from `src/lib/orderStatusFilter.js` (Task 1); `p_status` on `get_product_stats_kpis`, `get_product_stats_lists`, `get_guineafowl_breakdown`, `get_stats_all_products` (Task 2).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Import and add state**

After the `DashCalendar` import at the top of `src/pages/dashboard/ProductStats.jsx`, add:

```js
import { STATUS_FILTERS, DEFAULT_STATUS, toStatusParam } from '../../lib/orderStatusFilter';
```

In the `Stats` component, after `const [period, setPeriod] = useState('month');`, add:

```js
const [status, setStatus]     = useState(DEFAULT_STATUS);
```

- [ ] **Step 2: Pass `p_status` to all four fetches; refetch on change**

In the `useEffect`, add above the `Promise.all`:

```js
const statusParam = toStatusParam(status);
```

Change the four calls in the `Promise.all` to:

```js
const [kpisRes, listsRes, prevKpisRes, gfRes] = await Promise.all([
  supabase.rpc('get_product_stats_kpis',  { p_store_id: storeParam, p_start: startParam, p_end: endParam, p_status: statusParam }),
  supabase.rpc('get_product_stats_lists', { p_store_id: storeParam, p_start: startParam, p_end: endParam, p_status: statusParam }),
  period === 'all'
    ? Promise.resolve({ data: null })
    : supabase.rpc('get_product_stats_kpis',  { p_store_id: storeParam, p_start: prevParams.start, p_end: prevParams.end, p_status: statusParam }),
  supabase.rpc('get_guineafowl_breakdown', { p_store_id: storeParam, p_start: startParam, p_end: endParam, p_status: statusParam }),
]);
```

(The prev-period call gets the SAME `p_status` so growth badges compare like-for-like.)

Change the effect dependency array from `[selectedStore, period, customDate]` to `[selectedStore, period, customDate, status]`.

- [ ] **Step 3: Pass `p_status` in the products drill-down**

In `openDrillDown`, change the `get_stats_all_products` call to:

```js
const { data } = await supabase.rpc('get_stats_all_products', { p_store_id: storeParam, p_start: startParam, p_end: endParam, p_status: toStatusParam(status) });
```

Leave `get_stats_all_customers` and `get_customer_order_history` untouched — per spec, the customers drill-down and the all-time customer history modal stay unscoped.

- [ ] **Step 4: Add the status pill row**

In the header JSX, inside the right-side `<div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>`, **before** the existing period `<div className="dash-segmented-control">`, insert:

```jsx
<div className="dash-segmented-control">
  {STATUS_FILTERS.map(s => (
    <button
      key={s.key}
      className={`dash-filter-btn${status === s.key ? ' active' : ''}`}
      onClick={() => setStatus(s.key)}
    >
      {s.label}
    </button>
  ))}
</div>
```

- [ ] **Step 5: Lint, test, build**

```bash
npx eslint src/pages/dashboard/ProductStats.jsx
npx vitest run
npm run build
```

Expected: clean lint on the file, tests pass, build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/pages/dashboard/ProductStats.jsx
git commit -m "feat: status filter pills on Stats page"
```

---

### Task 5: End-to-end verification

**Files:**
- No source changes. Uses `.claude/skills/verify/SKILL.md` (headless app-driving recipe) and the read-only SQL RPC.

**Interfaces:**
- Consumes: everything above, deployed to the local dev server (`npm run dev`).
- Produces: evidence for the completion claim.

- [ ] **Step 1: SQL cross-check (recompute truth fresh)**

Re-run the Task 2 / Step 4 script. Record the per-status units it prints — these are today's expected UI figures.

- [ ] **Step 2: Drive the UI (verify skill)**

Follow `.claude/skills/verify/SKILL.md` to run the app headlessly and log into the dashboard. On BOTH `/dashboard/products-sold` and `/dashboard/stats`, with period = Today:
1. Confirm the pill row renders: All | Delivered | Shipped | Pending, Delivered active by default.
2. Click each pill; confirm the units figure matches Step 1's truth per status, and All equals the sum.
3. Stats page: confirm Total Spend / order count / customers change together with the pill (whole-page scoping), and growth badges still render.
4. Units Sold page: open a product's breakdown modal under Shipped — modal rows must all be shipped orders and the footer must read "N units counted — shipped".

- [ ] **Step 3: Regression — Delivered pill equals pre-change figures**

With Delivered active and period Today, Total Units Sold must equal what the page showed before this change for the same moment (per design: delivered-only is exactly the old units computation — on 2026-07-18 that was 90). Screenshot both pages for the record.

- [ ] **Step 4: Full suite + build one last time**

```bash
npx vitest run && npm run build
```

Expected: all pass.

- [ ] **Step 5: Ask the owner about deploying**

Do NOT deploy unprompted. Ask: "Status filters verified locally. Deploy to Firebase hosting now (`npm run build && firebase deploy --only hosting`)?" — deploy only on approval.
