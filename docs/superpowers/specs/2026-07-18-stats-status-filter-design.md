# Status Filter for Stats & Units Sold Pages — Design

**Date:** 2026-07-18
**Status:** Approved
**Pages:** `/dashboard/stats` (`src/pages/dashboard/ProductStats.jsx`), `/dashboard/products-sold` (`src/pages/dashboard/ProductsSold.jsx`)

## Problem

The two analytics pages are internally inconsistent about which order statuses they count:

- **Units Sold** (KPI + per-product cards + top-by-units lists) = `status = 'delivered'` only.
- **Revenue / Total Spend, order count, unique customers, top locations/customers/categories** = all `status NOT IN ('cancelled')`.

Consequences observed against production (2026-07-18 WAT: 72 orders → 51 delivered / 18 shipped / 3 pending; 125 units → 90 / 30 / 5):

1. On the Stats page, Total Spend reflects 72 orders while Total Units Sold reflects only the 51 delivered ones — the numbers never tie out on a busy day.
2. In `get_stats_all_products`, a product's revenue includes shipped/pending orders but its units exclude them — a product ordered but not yet delivered shows revenue with "0 units sold."
3. There is no way to see shipped or pending units at all (30 + 5 units invisible today).

## Decisions (locked with owner)

| Decision | Choice |
|---|---|
| Filter scope | **Whole-page**: picking a status re-scopes EVERY number (units, revenue, orders, customers, all top lists) to orders in that status |
| Default status | **Delivered** — preserves the current meaning of "Units Sold" |
| Select mode | Single pick + an **All** pill (All = all non-cancelled) |
| Pill set | **All, Delivered, Shipped, Pending** — `processing` omitted (0 orders all-time); `paid` / `pending_payment` omitted (historical Paystack remnants: 2 / 6 orders) |

### Accepted trade-off (explicitly flagged, owner approved)

No single status reproduces today's mixed view. With the Delivered default:

- Total Units Sold stays **unchanged** (delivered-only, e.g. 90 today).
- Total Spend / order count / unique customers **drop** on the default view — they become delivered-only instead of all-non-cancelled. The **All** pill restores the previous totals.

This is the page becoming consistent (every figure describes the same set of orders), at the cost of the default Total Spend figure visibly changing.

## Design

### 1. Backend — add `p_status` to five RPCs (single migration)

Migration: `supabase/migrations/20260718_stats_status_filter.sql`. Functions gain a new optional parameter:

```sql
p_status text DEFAULT NULL
```

Semantics: `NULL` (or `'all'`, normalized by the frontend to `NULL`) → `status NOT IN ('cancelled')`; any other value → `status = p_status`. Cancelled orders are **never** included, under any filter value.

Functions changed (all `CREATE OR REPLACE` preceded by `DROP FUNCTION` because the signature changes):

| Function | Change |
|---|---|
| `get_stats_all_products` | Replace `FILTER (WHERE o.status = 'delivered')` on units with the scoped predicate applied to the whole query — revenue and units now compute over the SAME order set |
| `get_product_stats_kpis` | `base_orders` CTE gains the scoped predicate; drop the inner `WHERE b.status = 'delivered'` on units_sold |
| `get_product_stats_lists` | `confirmed_orders` CTE gains the scoped predicate; drop the `WHERE status = 'delivered'` inside `by_units` and `by_qty_per_order` |
| `get_guineafowl_breakdown` | Replace hardcoded `o.status = 'delivered'` with the scoped predicate |
| `get_product_order_breakdown` | Add the scoped predicate so the modal rows match the page's active filter |

The shared predicate, verbatim in each function:

```sql
AND o.status <> 'cancelled'
AND (p_status IS NULL OR o.status = p_status)
```

**Application method:** run the migration via the Supabase dashboard SQL editor or a service-role script — NEVER `supabase db push` (remote migration history is out of sync; see HANDOFF.md). The file is still committed to `supabase/migrations/` as the source of truth.

**Backward compatibility:** existing callers that don't pass `p_status` get `NULL` → all-non-cancelled. Note this changes `get_stats_all_products` / `get_product_stats_kpis` unit counts for any caller that does not pass `p_status` (previously delivered-only). Both pages will always pass the param, so the only affected callers would be external ones — a repo grep confirms these five RPCs are called only from the two pages being changed.

### 2. Frontend — status pill row on both pages

Both pages, identically:

- New state: `const [status, setStatus] = useState('delivered');`
- New segmented control rendered beside the existing period pills, reusing `dash-segmented-control` / `dash-filter-btn` classes:
  `All | Delivered | Shipped | Pending`
- Every `supabase.rpc(...)` call to the five functions passes `p_status: status === 'all' ? null : status`.
- `status` added to the data-fetching `useEffect` dependency array so switching pills refetches.
- Shared constant for the pill definitions in `src/lib/orderStatusFilter.js` (new, tiny: exported `STATUS_FILTERS` array + `toParam()` helper) so the two pages cannot drift. No other refactoring of the duplicated helpers (`getPeriodParams`, `normalizeProductName`) — out of scope.

Stats page specifics: the previous-period comparison call (`get_product_stats_kpis` with prev params) and `get_guineafowl_breakdown` also receive `p_status`, so growth badges compare like-for-like.

ProductsSold page specifics: `openDetail` passes `p_status` to `get_product_order_breakdown`.

### 3. Copy fixes tied to the filter

- ProductsSold breakdown modal: "units sold (delivered)" → reflect active filter, e.g. `90 units — delivered`, `30 units — shipped`, `125 units — all statuses`. Same for the "delivered units counted" footer, which must count the active status instead of hardcoding delivered.
- ProductsSold summary line ("N products · M units sold") and empty-state copy stay as-is otherwise.

### 4. Error handling

No new error paths: RPC errors already set `err` / `kpiErr` / `listErr` flags on both pages. A bad `p_status` value cannot occur from the UI (fixed pill set), and the SQL treats unknown statuses as an empty result, not an error.

### 5. Verification

1. **SQL cross-check:** for today (WAT), each pill must tie to the independently computed figures — Delivered 90 / Shipped 30 / Pending 5 / All 125 units; All order count 72.
2. **UI drive:** use the `verify` skill recipe (`.claude/skills/verify/SKILL.md`) to load the dashboard, switch pills on both pages, and confirm numbers + modal contents change accordingly.
3. **Regression:** with the Delivered pill active, Total Units Sold must equal the pre-change value for the same period.

## Out of scope

- A `processing` status pill (status unused in data).
- Customers drill-down (`get_stats_all_customers`) and the all-time customer history modal (`get_customer_order_history`) — remain status-unscoped; the top-5 customers list IS scoped (via `get_product_stats_lists`), so the drill can differ from the list under a non-All pill.
- Multi-select status combinations.
- Refactoring the duplicated period/normalization helpers between the two pages.
- Overview page (`Overview.jsx`) and finance pages — untouched.
- Any change to how orders GET their statuses (Orders admin flow).
