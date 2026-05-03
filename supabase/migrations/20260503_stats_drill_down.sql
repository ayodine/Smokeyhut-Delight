-- supabase/migrations/20260503_stats_drill_down.sql
-- 1. Fix existing stats RPCs: include pending orders, fix customer names
-- 2. Add drill-down RPCs for full product list, full customer list, customer order history

-- ─────────────────────────────────────────────────────────────────────────────
-- Fix get_product_stats_kpis: count all non-cancelled orders (was excluding pending)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_product_stats_kpis(
  p_store_id int         DEFAULT NULL,
  p_start    timestamptz DEFAULT NULL
)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT json_build_object(
    'revenue',          COALESCE(SUM(o.total),                 0),
    'units_sold',       COALESCE(SUM(oi.qty),                  0),
    'order_count',      COUNT(DISTINCT o.id),
    'unique_customers', COUNT(DISTINCT o.customer_phone)
  )
  FROM orders o
  LEFT JOIN order_items oi ON oi.order_id = o.id
  WHERE o.deleted_at IS NULL
    AND o.status NOT IN ('cancelled')
    AND (p_store_id IS NULL OR o.store_id = p_store_id)
    AND (p_start   IS NULL OR o.created_at >= p_start);
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Fix get_product_stats_lists: include pending, return customer_name not phone
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_product_stats_lists(
  p_store_id int         DEFAULT NULL,
  p_start    timestamptz DEFAULT NULL
)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH confirmed_orders AS (
    SELECT id, customer_name, customer_phone, delivery_address, delivery_zone
    FROM orders
    WHERE deleted_at IS NULL
      AND status NOT IN ('cancelled')
      AND (p_store_id IS NULL OR store_id = p_store_id)
      AND (p_start   IS NULL OR created_at >= p_start)
  ),
  items AS (
    SELECT oi.product_id, oi.name AS item_name, oi.qty, oi.price,
           co.delivery_zone, co.delivery_address, co.customer_phone
    FROM order_items oi
    JOIN confirmed_orders co ON co.id = oi.order_id
  ),
  by_revenue AS (
    SELECT item_name AS name, SUM(qty * price) AS value
    FROM items GROUP BY item_name ORDER BY value DESC LIMIT 5
  ),
  by_units AS (
    SELECT item_name AS name, SUM(qty) AS value
    FROM items GROUP BY item_name ORDER BY value DESC LIMIT 5
  ),
  by_location AS (
    SELECT
      COALESCE(
        NULLIF(TRIM(delivery_zone), ''),
        NULLIF(TRIM(SPLIT_PART(delivery_address, ',', -1)), '')
      ) AS name,
      COUNT(*)::numeric AS value
    FROM confirmed_orders
    WHERE COALESCE(
        NULLIF(TRIM(delivery_zone), ''),
        NULLIF(TRIM(SPLIT_PART(delivery_address, ',', -1)), '')
      ) IS NOT NULL
    GROUP BY 1 ORDER BY value DESC LIMIT 5
  ),
  by_qty_per_order AS (
    SELECT item_name AS name, AVG(qty) AS value
    FROM items GROUP BY item_name ORDER BY value DESC LIMIT 5
  ),
  by_customer AS (
    SELECT
      MAX(customer_name) AS name,
      customer_phone     AS phone,
      COUNT(*)::numeric  AS value
    FROM confirmed_orders
    GROUP BY customer_phone
    ORDER BY value DESC LIMIT 5
  ),
  by_category AS (
    SELECT
      COALESCE(c.label, 'Uncategorised') AS name,
      SUM(oi.qty * oi.price)             AS value
    FROM order_items oi
    JOIN confirmed_orders co ON co.id = oi.order_id
    JOIN products p          ON p.id  = oi.product_id
    LEFT JOIN categories c   ON c.id  = p.category_id
    GROUP BY COALESCE(c.label, 'Uncategorised')
    ORDER BY value DESC LIMIT 5
  )
  SELECT json_build_object(
    'top_by_revenue',    (SELECT json_agg(row_to_json(r)) FROM by_revenue       r),
    'top_by_units',      (SELECT json_agg(row_to_json(r)) FROM by_units         r),
    'top_locations',     (SELECT json_agg(row_to_json(r)) FROM by_location      r),
    'top_qty_per_order', (SELECT json_agg(row_to_json(r)) FROM by_qty_per_order r),
    'top_customers',     (SELECT json_agg(row_to_json(r)) FROM by_customer      r),
    'top_categories',    (SELECT json_agg(row_to_json(r)) FROM by_category      r)
  );
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- New: full product list for drill-down (no LIMIT)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_stats_all_products(
  p_store_id int         DEFAULT NULL,
  p_start    timestamptz DEFAULT NULL
)
RETURNS TABLE(name text, revenue numeric, units bigint)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    oi.name,
    SUM(oi.qty * oi.price)::numeric AS revenue,
    SUM(oi.qty)::bigint             AS units
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  WHERE o.deleted_at IS NULL
    AND o.status NOT IN ('cancelled')
    AND (p_store_id IS NULL OR o.store_id = p_store_id)
    AND (p_start   IS NULL OR o.created_at >= p_start)
  GROUP BY oi.name
  ORDER BY revenue DESC;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- New: full customer list for drill-down
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_stats_all_customers(
  p_store_id int         DEFAULT NULL,
  p_start    timestamptz DEFAULT NULL
)
RETURNS TABLE(customer_name text, customer_phone text, order_count bigint, total_spent numeric)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    MAX(o.customer_name)  AS customer_name,
    o.customer_phone,
    COUNT(*)::bigint      AS order_count,
    SUM(o.total)::numeric AS total_spent
  FROM orders o
  WHERE o.deleted_at IS NULL
    AND o.status NOT IN ('cancelled')
    AND (p_store_id IS NULL OR o.store_id = p_store_id)
    AND (p_start   IS NULL OR o.created_at >= p_start)
  GROUP BY o.customer_phone
  ORDER BY total_spent DESC;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- New: customer order history (all time, not period-filtered)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_customer_order_history(
  p_phone    text,
  p_store_id int DEFAULT NULL
)
RETURNS TABLE(id text, total numeric, status text, created_at timestamptz, delivery_address text, item_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    o.id,
    o.total::numeric,
    o.status,
    o.created_at,
    o.delivery_address,
    COUNT(oi.id)::bigint AS item_count
  FROM orders o
  LEFT JOIN order_items oi ON oi.order_id = o.id
  WHERE o.deleted_at IS NULL
    AND o.customer_phone = p_phone
    AND (p_store_id IS NULL OR o.store_id = p_store_id)
  GROUP BY o.id, o.total, o.status, o.created_at, o.delivery_address
  ORDER BY o.created_at DESC;
$$;
