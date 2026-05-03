# Product Stats Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/admin/products/stats` page with 4 KPI cards and 6 ranked top-list cards, scoped by store and time period.

**Architecture:** Two Supabase RPC functions handle all aggregation server-side. The React page calls both RPCs in parallel on mount and on period/store change, renders skeleton placeholders while loading, and shows inline errors per card on failure. No client-side aggregation.

**Tech Stack:** React 18, React Router v6 (useOutletContext, lazy/Suspense), Supabase JS client (rpc), lucide-react icons, existing CSS class system (.kpi-card, .dash-card, .dash-filter-btn)

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/20260422_product_stats_rpcs.sql` | Create | Two RPC functions: `get_product_stats_kpis` and `get_product_stats_lists` |
| `src/pages/dashboard/ProductStats.jsx` | Create | Full stats page component |
| `src/App.jsx` | Modify (line 50 area) | Add lazy import for ProductStats + one `<Route>` under `/admin` |
| `src/pages/dashboard/Products.jsx` | Modify (line 1–4 area) | Add "View Stats" button to header |

---

## Task 1: Supabase Migration — RPC Functions

**Files:**
- Create: `supabase/migrations/20260422_product_stats_rpcs.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260422_product_stats_rpcs.sql
-- Product stats RPC functions.
-- Both filter out deleted orders and exclude pending/cancelled statuses.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. KPI aggregates
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_product_stats_kpis(
  p_store_id int         DEFAULT NULL,
  p_start    timestamptz DEFAULT NULL
)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT json_build_object(
    'revenue',          COALESCE(SUM(total),                           0),
    'units_sold',       COALESCE((
                          SELECT SUM(oi.qty)
                          FROM order_items oi
                          JOIN orders o2 ON o2.id = oi.order_id
                          WHERE o2.deleted_at IS NULL
                            AND o2.status IN ('processing','shipped','delivered')
                            AND (p_store_id IS NULL OR o2.store_id = p_store_id)
                            AND (p_start   IS NULL OR o2.created_at >= p_start)
                        ), 0),
    'order_count',      COUNT(*),
    'unique_customers', COUNT(DISTINCT customer_phone)
  )
  FROM orders
  WHERE deleted_at IS NULL
    AND status IN ('processing','shipped','delivered')
    AND (p_store_id IS NULL OR store_id = p_store_id)
    AND (p_start   IS NULL OR created_at >= p_start);
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Top lists (returns single JSON object with six arrays, up to 5 rows each)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_product_stats_lists(
  p_store_id int         DEFAULT NULL,
  p_start    timestamptz DEFAULT NULL
)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH confirmed_orders AS (
    SELECT id, customer_phone, delivery_address
    FROM orders
    WHERE deleted_at IS NULL
      AND status IN ('processing','shipped','delivered')
      AND (p_store_id IS NULL OR store_id = p_store_id)
      AND (p_start   IS NULL OR created_at >= p_start)
  ),
  items AS (
    SELECT oi.product_id, oi.name AS item_name, oi.qty, oi.price, co.delivery_address, co.customer_phone
    FROM order_items oi
    JOIN confirmed_orders co ON co.id = oi.order_id
  ),
  by_revenue AS (
    SELECT item_name AS name, SUM(qty * price) AS value
    FROM items
    GROUP BY item_name
    ORDER BY value DESC
    LIMIT 5
  ),
  by_units AS (
    SELECT item_name AS name, SUM(qty) AS value
    FROM items
    GROUP BY item_name
    ORDER BY value DESC
    LIMIT 5
  ),
  by_location AS (
    SELECT
      SPLIT_PART(delivery_address, ',', -1) AS name,
      COUNT(*)::numeric AS value
    FROM confirmed_orders
    GROUP BY 1
    ORDER BY value DESC
    LIMIT 5
  ),
  by_qty_per_order AS (
    SELECT item_name AS name, AVG(qty) AS value
    FROM items
    GROUP BY item_name
    ORDER BY value DESC
    LIMIT 5
  ),
  by_customer AS (
    SELECT customer_phone AS name, COUNT(*)::numeric AS value
    FROM confirmed_orders
    GROUP BY customer_phone
    ORDER BY value DESC
    LIMIT 5
  ),
  by_category AS (
    SELECT
      COALESCE(c.name, 'Uncategorised') AS name,
      SUM(oi.qty * oi.price)            AS value
    FROM order_items oi
    JOIN confirmed_orders co ON co.id = oi.order_id
    JOIN products p          ON p.id  = oi.product_id
    LEFT JOIN categories c   ON c.id  = p.category_id
    GROUP BY c.name
    ORDER BY value DESC
    LIMIT 5
  )
  SELECT json_build_object(
    'top_by_revenue',    (SELECT json_agg(row_to_json(r)) FROM by_revenue    r),
    'top_by_units',      (SELECT json_agg(row_to_json(r)) FROM by_units      r),
    'top_locations',     (SELECT json_agg(row_to_json(r)) FROM by_location   r),
    'top_qty_per_order', (SELECT json_agg(row_to_json(r)) FROM by_qty_per_order r),
    'top_customers',     (SELECT json_agg(row_to_json(r)) FROM by_customer   r),
    'top_categories',    (SELECT json_agg(row_to_json(r)) FROM by_category   r)
  );
$$;
```

- [ ] **Step 2: Apply the migration in Supabase**

Open the Supabase dashboard → SQL Editor → paste the full file contents → Run.

OR via CLI:
```bash
npx supabase db push
```

Verify: in Supabase Dashboard → Database → Functions, you should see `get_product_stats_kpis` and `get_product_stats_lists`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260422_product_stats_rpcs.sql
git commit -m "feat: add product stats RPC functions"
```

---

## Task 2: ProductStats.jsx — Page Component

**Files:**
- Create: `src/pages/dashboard/ProductStats.jsx`

- [ ] **Step 1: Create the file**

```jsx
import React, { useState, useEffect } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { ArrowLeft, DollarSign, ShoppingBag, TrendingUp, Users } from 'lucide-react';
import { SkelKpiGrid, SkelTable, SkelFilterPills } from '../../components/Skeleton';
import { supabase } from '../../lib/supabase';

const fmt    = (n) => '₦' + Number(n).toLocaleString();
const fmtNum = (n) => Number(n).toLocaleString();

const PERIODS = [
  { key: 'today',  label: 'Today' },
  { key: 'week',   label: 'This Week' },
  { key: 'month',  label: 'This Month' },
  { key: 'all',    label: 'All Time' },
];

function periodStart(key) {
  const now = new Date();
  if (key === 'today') {
    const d = new Date(now); d.setHours(0, 0, 0, 0); return d.toISOString();
  }
  if (key === 'week') {
    const d = new Date(now);
    const day = d.getDay(); // 0 = Sun
    d.setDate(d.getDate() - ((day + 6) % 7)); // back to Monday
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }
  if (key === 'month') {
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  }
  return null; // all time
}

const RANK_STYLE = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 22, height: 22, borderRadius: '50%', fontSize: '0.72rem',
  fontWeight: 700, background: 'var(--border-subtle)', color: 'var(--text-muted)',
  flexShrink: 0,
};

const RANK1_STYLE = {
  ...RANK_STYLE, background: 'var(--red)', color: '#fff',
};

function TopList({ title, rows, error, valueLabel = '', isCurrency = false }) {
  return (
    <div className="dash-card">
      <div className="dash-card-header" style={{ marginBottom: 14 }}>
        <div className="dash-card-title" style={{ fontSize: '0.95rem' }}>{title}</div>
      </div>
      {error ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Could not load data</p>
      ) : !rows || rows.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No data for this period</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows.map((row, i) => (
            <div
              key={i}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '6px 8px', borderRadius: 8,
                background: i === 0 ? 'rgba(192,32,31,0.06)' : 'transparent',
              }}
            >
              <span style={i === 0 ? RANK1_STYLE : RANK_STYLE}>#{i + 1}</span>
              <span style={{ flex: 1, fontWeight: i === 0 ? 600 : 400, fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {row.name || '—'}
              </span>
              <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--red)', flexShrink: 0 }}>
                {isCurrency ? fmt(row.value) : fmtNum(Number(row.value).toFixed(row.value % 1 === 0 ? 0 : 1))}
                {valueLabel && <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 2 }}>{valueLabel}</span>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ProductStats() {
  const { selectedStore } = useOutletContext() || {};
  const [period, setPeriod]   = useState('month');
  const [kpis,   setKpis]     = useState(null);
  const [lists,  setLists]    = useState(null);
  const [kpiErr, setKpiErr]   = useState(false);
  const [listErr,setListErr]  = useState(false);
  const [loading,setLoading]  = useState(true);

  useEffect(() => { fetchAll(); }, [selectedStore, period]);

  const fetchAll = async () => {
    setLoading(true);
    setKpiErr(false);
    setListErr(false);

    const storeParam = selectedStore && selectedStore !== 'all' ? Number(selectedStore) : null;
    const startParam = periodStart(period);

    const [kpisRes, listsRes] = await Promise.all([
      supabase.rpc('get_product_stats_kpis',  { p_store_id: storeParam, p_start: startParam }),
      supabase.rpc('get_product_stats_lists', { p_store_id: storeParam, p_start: startParam }),
    ]);

    if (kpisRes.error)  setKpiErr(true);  else setKpis(kpisRes.data);
    if (listsRes.error) setListErr(true); else setLists(listsRes.data);
    setLoading(false);
  };

  const avgOrder = kpis && kpis.order_count > 0
    ? kpis.revenue / kpis.order_count
    : 0;

  return (
    <div>
      {/* Header */}
      <div className="dash-card-header" style={{ marginBottom: 20, alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Link to="/admin/products" style={{ color: 'var(--text-muted)', display: 'flex' }}>
            <ArrowLeft size={20} />
          </Link>
          <div className="dash-card-title" style={{ fontFamily: "'Mona Sans','Mona-Sans','Helvetica Neue',sans-serif", fontSize: '1.4rem' }}>
            Product Stats
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {PERIODS.map(p => (
            <button
              key={p.key}
              className={`dash-filter-btn${period === p.key ? ' active' : ''}`}
              onClick={() => setPeriod(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      {loading ? (
        <>
          <SkelKpiGrid count={4} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16, marginTop: 8 }}>
            {Array.from({ length: 6 }).map((_, i) => <SkelTable key={i} rows={5} cols={2} />)}
          </div>
        </>
      ) : (
        <>
          <div className="kpi-grid" style={{ marginBottom: 24 }}>
            <div className="kpi-card green">
              <div className="kpi-icon"><DollarSign size={24} /></div>
              <div className="kpi-value">{kpiErr ? '—' : fmt(kpis?.revenue ?? 0)}</div>
              <div className="kpi-label">Total Revenue</div>
            </div>
            <div className="kpi-card blue">
              <div className="kpi-icon"><ShoppingBag size={24} /></div>
              <div className="kpi-value">{kpiErr ? '—' : fmtNum(kpis?.units_sold ?? 0)}</div>
              <div className="kpi-label">Total Units Sold</div>
            </div>
            <div className="kpi-card yellow">
              <div className="kpi-icon"><TrendingUp size={24} /></div>
              <div className="kpi-value">{kpiErr ? '—' : fmt(avgOrder)}</div>
              <div className="kpi-label">Average Order Value</div>
            </div>
            <div className="kpi-card red">
              <div className="kpi-icon"><Users size={24} /></div>
              <div className="kpi-value">{kpiErr ? '—' : fmtNum(kpis?.unique_customers ?? 0)}</div>
              <div className="kpi-label">Unique Customers</div>
            </div>
          </div>

          {/* Top Lists */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
            <TopList title="Best Performing Products"      rows={lists?.top_by_revenue}    error={listErr} isCurrency />
            <TopList title="Top Most Sold Products"        rows={lists?.top_by_units}       error={listErr} valueLabel="units" />
            <TopList title="Top Delivery Locations"        rows={lists?.top_locations}      error={listErr} valueLabel="orders" />
            <TopList title="Top Product by Qty Per Order"  rows={lists?.top_qty_per_order}  error={listErr} valueLabel="avg qty" />
            <TopList title="Top Performing Customers"      rows={lists?.top_customers}      error={listErr} valueLabel="orders" />
            <TopList title="Top Categories"                rows={lists?.top_categories}     error={listErr} isCurrency />
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/dashboard/ProductStats.jsx
git commit -m "feat: add ProductStats page component"
```

---

## Task 3: App.jsx — Register the Route

**Files:**
- Modify: `src/App.jsx` (around lines 50 and 126)

- [ ] **Step 1: Add lazy import (after line 50, after the `Inventory` import)**

Add this line immediately after the `Inventory` lazy import:

```js
const ProductStats  = lazy(() => import('./pages/dashboard/ProductStats'));
```

- [ ] **Step 2: Add the route (after the `products` route at line 126)**

Find this line:
```jsx
<Route path="products" element={<Suspense fallback={null}><Products /></Suspense>} />
```

Add directly below it:
```jsx
<Route path="products/stats" element={<Suspense fallback={null}><ProductStats /></Suspense>} />
```

- [ ] **Step 3: Verify the file looks correct around those areas**

The lazy imports block should end:
```js
const Inventory     = lazy(() => import('./pages/dashboard/finance/Inventory'));
const ProductStats  = lazy(() => import('./pages/dashboard/ProductStats'));
```

The routes block should have:
```jsx
<Route path="products" element={<Suspense fallback={null}><Products /></Suspense>} />
<Route path="products/stats" element={<Suspense fallback={null}><ProductStats /></Suspense>} />
```

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat: register /admin/products/stats route"
```

---

## Task 4: Products.jsx — Add "View Stats" Button

**Files:**
- Modify: `src/pages/dashboard/Products.jsx`

- [ ] **Step 1: Add `Link` to the import from react-router-dom**

Find the existing imports at the top. `react-router-dom` is not yet imported in Products.jsx. Add this line after the last import:

```js
import { Link } from 'react-router-dom';
```

- [ ] **Step 2: Find the header area with "Categories" and "Add Product" buttons**

Search in Products.jsx for the "Add Product" button or "Categories" button — it is rendered inside the JSX return. It will look something like:

```jsx
<button ... onClick={() => setShowCatModal(true)}>
  <FolderKanban ... /> Categories
</button>
...
<button ... onClick={openAdd}>
  <Package ... /> Add Product
</button>
```

- [ ] **Step 3: Insert the "View Stats" button between Categories and Add Product**

```jsx
<Link
  to="/admin/products/stats"
  className="btn-secondary"
  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}
>
  <BarChart2 size={16} /> View Stats
</Link>
```

Note: `BarChart2` is already imported in Products.jsx (line 2 in the existing file).

- [ ] **Step 4: Commit**

```bash
git add src/pages/dashboard/Products.jsx
git commit -m "feat: add View Stats button to Products header"
```

---

## Task 5: Deploy

- [ ] **Step 1: Run the dev server and verify locally**

```bash
npm run dev
```

Navigate to `/admin/products` → click "View Stats" → confirm the page loads, period pills work, store filter works, and data appears in the top lists.

- [ ] **Step 2: Build for production**

```bash
npm run build
```

Expected: no TypeScript/ESLint errors.

- [ ] **Step 3: Deploy to Firebase**

```bash
firebase deploy --only hosting
```

- [ ] **Step 4: Confirm live**

Open the production URL, navigate to Products → View Stats. Verify all 4 KPI cards and all 6 top-list cards render with real data.

---

## Self-Review Notes

- **Spec coverage:** Route ✓, View Stats button ✓, period filter ✓, store scope ✓, 4 KPI cards ✓, 6 top-list cards ✓, rank #1 highlight ✓, skeleton loading ✓, inline error ✓, two RPC functions ✓
- **No placeholders:** All code blocks are complete and runnable
- **Type consistency:** `get_product_stats_kpis` returns `revenue`, `units_sold`, `order_count`, `unique_customers` — used exactly those keys in the JSX. `get_product_stats_lists` returns `top_by_revenue`, `top_by_units`, `top_locations`, `top_qty_per_order`, `top_customers`, `top_categories` — used exactly those keys in the `TopList` calls.
