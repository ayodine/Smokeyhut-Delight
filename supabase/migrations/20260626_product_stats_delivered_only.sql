-- Product stats accuracy fix.
-- "Units sold" previously counted every non-cancelled order (including pending /
-- pending_payment / paid orders that hadn't been fulfilled yet), which inflated
-- counts vs. physical stock. Count units as DELIVERED-only (stock that actually
-- left). Revenue and order/customer counts are unchanged (still non-cancelled).
-- Also soft-deletes the last live duplicate "GUINEAFOWL" product (ids 20-22 were
-- already soft-deleted); the canonical product is id 7 "Full Smokey Guineafowl".

-- 1. KPIs: units_sold -> delivered only.
CREATE OR REPLACE FUNCTION public.get_product_stats_kpis(p_store_id integer DEFAULT NULL::integer, p_start timestamp with time zone DEFAULT NULL::timestamp with time zone, p_end timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  WITH base_orders AS (
    SELECT id, total, customer_phone, status
    FROM orders
    WHERE deleted_at IS NULL
      AND status NOT IN ('cancelled')
      AND (p_store_id IS NULL OR store_id = p_store_id)
      AND (p_start    IS NULL OR created_at >= p_start)
      AND (p_end      IS NULL OR created_at <= p_end)
  )
  SELECT json_build_object(
    'revenue',          COALESCE((SELECT SUM(total) FROM base_orders), 0),
    'units_sold',       COALESCE((SELECT SUM(oi.qty)
                                  FROM order_items oi
                                  JOIN base_orders b ON b.id = oi.order_id
                                  WHERE b.status = 'delivered'), 0),
    'order_count',      (SELECT COUNT(*)                       FROM base_orders),
    'unique_customers', (SELECT COUNT(DISTINCT customer_phone) FROM base_orders)
  );
$function$;

-- 2. All-products list: units -> delivered only; revenue stays non-cancelled.
CREATE OR REPLACE FUNCTION public.get_stats_all_products(p_store_id integer DEFAULT NULL::integer, p_start timestamp with time zone DEFAULT NULL::timestamp with time zone, p_end timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(name text, revenue numeric, units bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT
    CASE
      WHEN oi.name ~* '\s*\(?\s*CHOPPED\s*\)?\s*$' THEN
        regexp_replace(oi.name, '\s*\(?\s*CHOPPED\s*\)?\s*$', '', 'i') || ' (CHOPPED)'
      ELSE oi.name
    END AS name,
    SUM(oi.qty * oi.price)::numeric                                  AS revenue,
    COALESCE(SUM(oi.qty) FILTER (WHERE o.status = 'delivered'), 0)::bigint AS units
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  WHERE o.deleted_at IS NULL
    AND o.status NOT IN ('cancelled')
    AND (p_store_id IS NULL OR o.store_id = p_store_id)
    AND (p_start    IS NULL OR o.created_at >= p_start)
    AND (p_end      IS NULL OR o.created_at <= p_end)
  GROUP BY 1
  ORDER BY revenue DESC;
$function$;

-- 3. Lists: top_by_units & top_qty_per_order -> delivered only; revenue/location/
--    customer/category lists unchanged.
CREATE OR REPLACE FUNCTION public.get_product_stats_lists(p_store_id integer DEFAULT NULL::integer, p_start timestamp with time zone DEFAULT NULL::timestamp with time zone, p_end timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  WITH confirmed_orders AS (
    SELECT id, customer_name, customer_phone, delivery_address, delivery_zone, status
    FROM orders
    WHERE deleted_at IS NULL
      AND status NOT IN ('cancelled')
      AND (p_store_id IS NULL OR store_id = p_store_id)
      AND (p_start    IS NULL OR created_at >= p_start)
      AND (p_end      IS NULL OR created_at <= p_end)
  ),
  items AS (
    SELECT
      oi.product_id,
      CASE
        WHEN oi.name ~* '\s*\(?\s*CHOPPED\s*\)?\s*$' THEN
          regexp_replace(oi.name, '\s*\(?\s*CHOPPED\s*\)?\s*$', '', 'i') || ' (CHOPPED)'
        ELSE oi.name
      END AS item_name,
      oi.qty,
      oi.price,
      co.delivery_zone,
      co.delivery_address,
      co.customer_phone,
      co.status
    FROM order_items oi
    JOIN confirmed_orders co ON co.id = oi.order_id
  ),
  by_revenue AS (
    SELECT item_name AS name, SUM(qty * price) AS value
    FROM items GROUP BY item_name ORDER BY value DESC LIMIT 5
  ),
  by_units AS (
    SELECT item_name AS name, SUM(qty) AS value
    FROM items WHERE status = 'delivered' GROUP BY item_name ORDER BY value DESC LIMIT 5
  ),
  by_location AS (
    SELECT
      COALESCE(
        CASE
          WHEN delivery_zone IS NULL OR TRIM(delivery_zone) = ''
               OR delivery_zone ~* '^location\s*\d'
          THEN NULL
          ELSE NULLIF(TRIM(delivery_zone), '')
        END,
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
    FROM items WHERE status = 'delivered' GROUP BY item_name ORDER BY value DESC LIMIT 5
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
$function$;

-- 4. Soft-delete the last live duplicate "GUINEAFOWL" (id 23). Historical order_items
--    are preserved (their denormalised name stays), so past stats are untouched; this
--    only removes it from the live menu and future orders.
UPDATE products SET deleted_at = now(), is_active = false WHERE id = 23 AND deleted_at IS NULL;
