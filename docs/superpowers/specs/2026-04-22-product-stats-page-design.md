# Product Stats Page — Design Spec
**Date:** 2026-04-22
**Status:** Approved

---

## Overview

A full-page analytics view accessible from the Products dashboard. Provides ranked top-list KPIs for products, customers, and delivery locations. Scoped by the currently selected store and a user-chosen time period.

---

## Route

`/admin/products/stats`

Lazy-loaded via `React.lazy`, registered as a nested child route under `/admin` in `src/App.jsx`, alongside existing dashboard routes.

---

## Entry Point

A **"View Stats"** button is added to the Products page header, between the existing "Categories" and "Add Product" buttons. Uses `btn-secondary` style with a `BarChart2` icon (lucide-react). Navigates via `react-router-dom` `<Link>` to `/admin/products/stats`.

---

## Page Layout

### Header
- Back arrow (`<Link to="/admin/products">`) + "Product Stats" title (Mona Sans, 1.4rem, dash-card-title style)
- Period filter pills on the right: **Today / This Week / This Month / All Time** — same `.dash-filter-btn` pattern as Overview and Payments pages
- Default period: **This Month**

### Store Scope
- Reads `selectedStore` from `useOutletContext()` — identical to how Payments and Shipping pages do it
- All data queries pass `p_store_id` (null = all stores)

---

## KPI Cards (top row — 4 cards)

| Card | Colour | Metric | Icon |
|------|--------|--------|------|
| Total Revenue | green | Sum of `total` on paid orders (status: processing/shipped/delivered) | DollarSign |
| Total Units Sold | blue | Sum of `qty` across all `order_items` in period | ShoppingBag |
| Average Order Value | yellow | Total revenue ÷ order count | TrendingUp |
| Unique Customers | red | Count of distinct `customer_phone` values | Users |

Uses existing `.kpi-card` classes with `.kpi-icon`, `.kpi-value`, `.kpi-label`.

---

## Top Lists (2-column grid of `dash-card`s)

Each card shows a title, then a ranked list of **up to 5 items**. Each row: rank badge (#1–#5), name/label, metric value right-aligned.

| Card Title | Ranked By | Source |
|------------|-----------|--------|
| Best Performing Products | Revenue (sum of qty × price from order_items) | order_items JOIN orders |
| Top Most Sold Products | Units sold (sum of qty) | order_items JOIN orders |
| Top Delivery Locations | Order count | orders.delivery_address (zone extracted) |
| Top Product by Qty Per Order | Avg qty per order line | order_items JOIN orders |
| Top Performing Customers | Total spend | orders grouped by customer_phone |
| Top Categories | Revenue | order_items JOIN products JOIN categories |

Rank #1 row is visually highlighted with a subtle red-tinted background (`rgba(192,32,31,0.06)`) and bold rank badge.

---

## Data Strategy — Supabase RPC Functions

Two RPC functions are created in a new Supabase migration:

### `get_product_stats_kpis(p_store_id INT, p_start TIMESTAMPTZ)`
Returns a single row:
```sql
{
  revenue        NUMERIC,
  units_sold     BIGINT,
  order_count    BIGINT,
  unique_customers BIGINT
}
```

### `get_product_stats_lists(p_store_id INT, p_start TIMESTAMPTZ)`
Returns a single JSON object with six keys, each an array of up to 5 rows:
```sql
{
  top_by_revenue:      [{ name, value }],
  top_by_units:        [{ name, value }],
  top_locations:       [{ name, value }],
  top_qty_per_order:   [{ name, value }],
  top_customers:       [{ name, value }],
  top_categories:      [{ name, value }]
}
```

`p_start` is computed on the frontend from the selected period:
- Today → start of current day
- This Week → Monday of current week
- This Month → 1st of current month
- All Time → `null` (no date filter applied)

Both RPCs filter by `orders.deleted_at IS NULL` and exclude `pending`/`cancelled` statuses to only count confirmed revenue.

---

## Loading State

While fetching, the page renders `<SkelKpiGrid count={4} />` and six `<SkelTable rows={5} cols={2} />` placeholders — reusing existing Skeleton components.

---

## Error Handling

If either RPC returns an error, a simple inline error message is shown inside each affected card: `"Could not load data"` in `var(--text-muted)` style. No page-level crash.

---

## File Structure

```
src/pages/dashboard/ProductStats.jsx   ← new page component
supabase/migrations/20260422_product_stats_rpcs.sql  ← new migration
```

`App.jsx` — add one lazy import + one `<Route>` entry.
`Products.jsx` — add one "View Stats" button to the header.

---

## Out of Scope

- Charts/graphs (top lists only, per spec)
- Export to Excel (can be added later)
- Product-level drill-down links
- Real-time updates (static fetch on load + period change)
