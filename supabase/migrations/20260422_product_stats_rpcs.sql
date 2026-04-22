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
    'revenue',          COALESCE(SUM(o.total),                 0),
    'units_sold',       COALESCE(SUM(oi.qty),                  0),
    'order_count',      COUNT(DISTINCT o.id),
    'unique_customers', COUNT(DISTINCT o.customer_phone)
  )
  FROM orders o
  LEFT JOIN order_items oi ON oi.order_id = o.id
  WHERE o.deleted_at IS NULL
    AND o.status IN ('processing','shipped','delivered')
    AND (p_store_id IS NULL OR o.store_id = p_store_id)
    AND (p_start   IS NULL OR o.created_at >= p_start);
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
      NULLIF(TRIM(SPLIT_PART(delivery_address, ',', -1)), '') AS name,
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
      COALESCE(c.label, 'Uncategorised') AS name,
      SUM(oi.qty * oi.price)             AS value
    FROM order_items oi
    JOIN confirmed_orders co ON co.id = oi.order_id
    JOIN products p          ON p.id  = oi.product_id
    LEFT JOIN categories c   ON c.id  = p.category_id
    GROUP BY COALESCE(c.label, 'Uncategorised')
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
