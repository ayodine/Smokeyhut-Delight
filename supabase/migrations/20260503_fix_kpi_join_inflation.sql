-- Fix get_product_stats_kpis: the LEFT JOIN order_items caused SUM(o.total) to
-- be multiplied by the number of items per order. Separate the two aggregations.
CREATE OR REPLACE FUNCTION get_product_stats_kpis(
  p_store_id int         DEFAULT NULL,
  p_start    timestamptz DEFAULT NULL
)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH base_orders AS (
    SELECT id, total, customer_phone
    FROM orders
    WHERE deleted_at IS NULL
      AND status NOT IN ('cancelled')
      AND (p_store_id IS NULL OR store_id = p_store_id)
      AND (p_start   IS NULL OR created_at >= p_start)
  )
  SELECT json_build_object(
    'revenue',          COALESCE((SELECT SUM(total)                   FROM base_orders), 0),
    'units_sold',       COALESCE((SELECT SUM(oi.qty)
                                  FROM order_items oi
                                  JOIN base_orders b ON b.id = oi.order_id), 0),
    'order_count',      (SELECT COUNT(*)                              FROM base_orders),
    'unique_customers', (SELECT COUNT(DISTINCT customer_phone)        FROM base_orders)
  );
$$;
