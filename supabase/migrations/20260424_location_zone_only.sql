-- supabase/migrations/20260424_location_zone_only.sql
-- Fix Top Delivery Locations to use delivery_zone column only.
-- Drops address-parse fallback that was surfacing WALKIN/PICKUP values
-- from legacy orders. Only orders with a real zone name are counted.

CREATE OR REPLACE FUNCTION get_product_stats_lists(
  p_store_id int         DEFAULT NULL,
  p_start    timestamptz DEFAULT NULL
)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH confirmed_orders AS (
    SELECT id, customer_phone, delivery_zone
    FROM orders
    WHERE deleted_at IS NULL
      AND status IN ('processing','shipped','delivered')
      AND (p_store_id IS NULL OR store_id = p_store_id)
      AND (p_start   IS NULL OR created_at >= p_start)
  ),
  items AS (
    SELECT oi.product_id, oi.name AS item_name, oi.qty, oi.price, co.customer_phone
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
    SELECT delivery_zone AS name, COUNT(*)::numeric AS value
    FROM confirmed_orders
    WHERE delivery_zone IS NOT NULL
      AND TRIM(delivery_zone) <> ''
      AND LOWER(TRIM(delivery_zone)) NOT IN ('store pickup', 'walkin', 'walk-in', 'pickup', 'manual/pickup')
    GROUP BY delivery_zone
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
    'top_by_revenue',    (SELECT json_agg(row_to_json(r)) FROM by_revenue       r),
    'top_by_units',      (SELECT json_agg(row_to_json(r)) FROM by_units         r),
    'top_locations',     (SELECT json_agg(row_to_json(r)) FROM by_location      r),
    'top_qty_per_order', (SELECT json_agg(row_to_json(r)) FROM by_qty_per_order r),
    'top_customers',     (SELECT json_agg(row_to_json(r)) FROM by_customer      r),
    'top_categories',    (SELECT json_agg(row_to_json(r)) FROM by_category      r)
  );
$$;
