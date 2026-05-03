-- Fix Top Delivery Locations: use area name (Lekki, Yaba) not zone group name (Location 1).
-- Old orders have delivery_zone='Location X'; fall back to last segment of delivery_address.
-- New orders (after Checkout.jsx fix) will have the area name stored directly.

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
        -- Use delivery_zone unless it looks like a generic group name ("Location 1")
        CASE
          WHEN delivery_zone IS NULL OR TRIM(delivery_zone) = ''
               OR delivery_zone ~* '^location\s*\d'
          THEN NULL
          ELSE NULLIF(TRIM(delivery_zone), '')
        END,
        -- Fall back to last comma-segment of delivery_address (contains area name)
        NULLIF(TRIM(SPLIT_PART(delivery_address, ',', -1)), '')
      ) AS name,
      COUNT(*)::numeric AS value
    FROM confirmed_orders
    WHERE COALESCE(
        CASE
          WHEN delivery_zone IS NULL OR TRIM(delivery_zone) = ''
               OR delivery_zone ~* '^location\s*\d'
          THEN NULL
          ELSE NULLIF(TRIM(delivery_zone), '')
        END,
        NULLIF(TRIM(SPLIT_PART(delivery_address, ',', -1)), '')
      ) IS NOT NULL
      AND delivery_address NOT ILIKE 'store pickup%'
    GROUP BY 1 ORDER BY value DESC LIMIT 5
  ),
  by_qty_per_order AS (
    SELECT item_name AS name, AVG(qty) AS value
    FROM items GROUP BY item_name ORDER BY value DESC LIMIT 5
  ),
  by_customer AS (
    SELECT
      mode() WITHIN GROUP (ORDER BY customer_name) AS name,
      customer_phone                               AS phone,
      COUNT(*)::numeric                            AS value
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
