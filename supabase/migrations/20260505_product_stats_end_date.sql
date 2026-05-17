-- Migration to add p_end parameter to product stats RPCs

CREATE OR REPLACE FUNCTION public.get_product_stats_kpis(
  p_store_id integer DEFAULT NULL::integer,
  p_start timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_end timestamp with time zone DEFAULT NULL::timestamp with time zone
)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  WITH base_orders AS (
    SELECT id, total, customer_phone
    FROM orders
    WHERE deleted_at IS NULL
      AND status NOT IN ('cancelled')
      AND (p_store_id IS NULL OR store_id = p_store_id)
      AND (p_start    IS NULL OR created_at >= p_start)
      AND (p_end      IS NULL OR created_at <= p_end)
  )
  SELECT json_build_object(
    'revenue',          COALESCE((SELECT SUM(total)                FROM base_orders), 0),
    'units_sold',       COALESCE((SELECT SUM(oi.qty)
                                  FROM order_items oi
                                  JOIN base_orders b ON b.id = oi.order_id), 0),
    'order_count',      (SELECT COUNT(*)                           FROM base_orders),
    'unique_customers', (SELECT COUNT(DISTINCT customer_phone)     FROM base_orders)
  );
$function$;

CREATE OR REPLACE FUNCTION public.get_product_stats_lists(
  p_store_id integer DEFAULT NULL::integer,
  p_start timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_end timestamp with time zone DEFAULT NULL::timestamp with time zone
)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  WITH confirmed_orders AS (
    SELECT id, customer_name, customer_phone, delivery_address, delivery_zone
    FROM orders
    WHERE deleted_at IS NULL
      AND status NOT IN ('cancelled')
      AND (p_store_id IS NULL OR store_id = p_store_id)
      AND (p_start    IS NULL OR created_at >= p_start)
      AND (p_end      IS NULL OR created_at <= p_end)
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
$function$;


CREATE OR REPLACE FUNCTION public.get_stats_all_products(
  p_store_id integer DEFAULT NULL::integer,
  p_start timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_end timestamp with time zone DEFAULT NULL::timestamp with time zone
)
 RETURNS TABLE(name text, revenue numeric, units bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT
    oi.name,
    SUM(oi.qty * oi.price)::numeric AS revenue,
    SUM(oi.qty)::bigint             AS units
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  WHERE o.deleted_at IS NULL
    AND o.status NOT IN ('cancelled')
    AND (p_store_id IS NULL OR o.store_id = p_store_id)
    AND (p_start    IS NULL OR o.created_at >= p_start)
    AND (p_end      IS NULL OR o.created_at <= p_end)
  GROUP BY oi.name
  ORDER BY revenue DESC;
$function$;


CREATE OR REPLACE FUNCTION public.get_stats_all_customers(
  p_store_id integer DEFAULT NULL::integer,
  p_start timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_end timestamp with time zone DEFAULT NULL::timestamp with time zone
)
 RETURNS TABLE(customer_name text, customer_phone text, order_count bigint, total_spent numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT
    mode() WITHIN GROUP (ORDER BY o.customer_name) AS customer_name,
    o.customer_phone,
    COUNT(*)::bigint      AS order_count,
    SUM(o.total)::numeric AS total_spent
  FROM orders o
  WHERE o.deleted_at IS NULL
    AND o.status NOT IN ('cancelled')
    AND (p_store_id IS NULL OR o.store_id = p_store_id)
    AND (p_start    IS NULL OR o.created_at >= p_start)
    AND (p_end      IS NULL OR o.created_at <= p_end)
  GROUP BY o.customer_phone
  ORDER BY total_spent DESC;
$function$;
