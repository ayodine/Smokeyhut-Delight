-- ============================================================
-- SMOKEYHUT DELIGHT — Customer Tier Grouping Database Migration
-- Date: 2026-06-11
-- ============================================================

-- 1. DROP EXISTING FUNCTION TO PREVENT RETURN TYPE CONFLICTS
DROP FUNCTION IF EXISTS public.get_customers_directory(
  timestamp with time zone,
  timestamp with time zone,
  text,
  text,
  text,
  int,
  int
);

DROP FUNCTION IF EXISTS public.get_customers_directory(
  timestamp with time zone,
  timestamp with time zone,
  text,
  text,
  text,
  int,
  int,
  text,
  text
);

-- 2. CREATE REFACTORED get_customers_directory FUNCTION
CREATE OR REPLACE FUNCTION public.get_customers_directory(
  p_start timestamp with time zone DEFAULT NULL,
  p_end timestamp with time zone DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_sort_key text DEFAULT 'lastOrder',
  p_sort_dir text DEFAULT 'desc',
  p_limit int DEFAULT 20,
  p_offset int DEFAULT 0,
  p_group_timeframe text DEFAULT 'all_time',
  p_group_filter text DEFAULT 'all'
)
RETURNS TABLE (
  agg_id text,
  agg_name text,
  agg_email text,
  agg_phone text,
  agg_orders bigint,
  agg_total_spent numeric,
  agg_last_order timestamp with time zone,
  customer_group text,
  cnt bigint
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_search_query text;
-- Using different alias names in the internal CTE to avoid variable/column name conflicts with RETURNS TABLE
BEGIN
  v_search_query := '%' || COALESCE(p_search, '') || '%';
  
  RETURN QUERY
  WITH customer_orders_all_time AS (
    SELECT
      COALESCE(o.customer_phone, o.customer_email, o.customer_name) AS c_id,
      o.customer_name,
      o.customer_email,
      o.customer_phone,
      o.id AS order_id,
      o.total,
      o.status,
      o.created_at
    FROM orders o
    WHERE o.deleted_at IS NULL
  ),
  active_customers AS (
    SELECT DISTINCT c_id
    FROM customer_orders_all_time
    WHERE (p_start IS NULL OR created_at >= p_start)
      AND (p_end IS NULL OR created_at <= p_end)
  ),
  stats_timeframe AS (
    SELECT
      coa.c_id,
      COALESCE(COUNT(coa.order_id), 0) AS tf_orders,
      COALESCE(SUM(CASE WHEN coa.status != 'cancelled' THEN coa.total ELSE 0 END), 0) AS tf_spent
    FROM customer_orders_all_time coa
    WHERE CASE 
      WHEN p_group_timeframe = 'week' THEN coa.created_at >= now() - INTERVAL '7 days'
      WHEN p_group_timeframe = 'month' THEN coa.created_at >= now() - INTERVAL '30 days'
      ELSE TRUE
    END
    GROUP BY coa.c_id
  ),
  aggregated AS (
    SELECT
      coa.c_id AS internal_c_id,
      MAX(coa.customer_name) AS c_name,
      MAX(coa.customer_email) AS c_email,
      MAX(coa.customer_phone) AS c_phone,
      COALESCE(COUNT(coa.order_id), 0) AS c_orders,
      COALESCE(SUM(CASE WHEN coa.status != 'cancelled' THEN coa.total ELSE 0 END), 0) AS c_spent,
      MAX(coa.created_at) AS c_last_order,
      COALESCE(tf.tf_orders, 0) AS tf_orders,
      COALESCE(tf.tf_spent, 0) AS tf_spent
    FROM customer_orders_all_time coa
    JOIN active_customers ac ON ac.c_id = coa.c_id
    LEFT JOIN stats_timeframe tf ON tf.c_id = coa.c_id
    GROUP BY coa.c_id, tf.tf_orders, tf.tf_spent
  ),
  classified AS (
    SELECT
      a.internal_c_id,
      a.c_name,
      a.c_email,
      a.c_phone,
      a.c_orders,
      a.c_spent,
      a.c_last_order,
      CASE
        WHEN p_group_timeframe = 'week' THEN
          CASE
            WHEN a.tf_spent >= 15000 OR a.tf_orders >= 2 THEN 'vip'
            WHEN a.tf_spent >= 5000 OR a.tf_orders >= 1 THEN 'standard'
            ELSE 'regular'
          END
        WHEN p_group_timeframe = 'month' THEN
          CASE
            WHEN a.tf_spent >= 40000 OR a.tf_orders >= 4 THEN 'vip'
            WHEN a.tf_spent >= 15000 OR a.tf_orders >= 2 THEN 'standard'
            ELSE 'regular'
          END
        ELSE
          -- all_time
          CASE
            WHEN a.c_spent >= 150000 OR a.c_orders >= 10 THEN 'vip'
            WHEN a.c_spent >= 50000 OR a.c_orders >= 4 THEN 'standard'
            ELSE 'regular'
          END
      END AS customer_tier
    FROM aggregated a
  ),
  filtered AS (
    SELECT * FROM classified
    WHERE (p_search IS NULL OR p_search = '' OR 
           c_name ILIKE v_search_query OR 
           c_email ILIKE v_search_query OR 
           c_phone ILIKE v_search_query)
      AND (p_group_filter = 'all' OR customer_tier = p_group_filter)
  ),
  total_cnt AS (
    SELECT COUNT(*) AS cnt FROM filtered
  )
  SELECT 
    f.internal_c_id AS agg_id,
    f.c_name AS agg_name,
    f.c_email AS agg_email,
    f.c_phone AS agg_phone,
    f.c_orders AS agg_orders,
    f.c_spent AS agg_total_spent,
    f.c_last_order AS agg_last_order,
    f.customer_tier AS customer_group,
    tc.cnt
  FROM filtered f
  CROSS JOIN total_cnt tc
  ORDER BY
    CASE WHEN p_sort_dir = 'asc' THEN
      CASE 
        WHEN p_sort_key = 'name' THEN f.c_name
        WHEN p_sort_key = 'email' THEN f.c_email
        WHEN p_sort_key = 'phone' THEN f.c_phone
        ELSE NULL
      END
    END ASC,
    CASE WHEN p_sort_dir = 'desc' THEN
      CASE 
        WHEN p_sort_key = 'name' THEN f.c_name
        WHEN p_sort_key = 'email' THEN f.c_email
        WHEN p_sort_key = 'phone' THEN f.c_phone
        ELSE NULL
      END
    END DESC,
    CASE WHEN p_sort_dir = 'asc' THEN
      CASE 
        WHEN p_sort_key = 'orders' THEN f.c_orders::numeric
        WHEN p_sort_key = 'totalSpent' THEN f.c_spent
        WHEN p_sort_key = 'lastOrder' THEN EXTRACT(EPOCH FROM f.c_last_order)
        ELSE NULL
      END
    END ASC,
    CASE WHEN p_sort_dir = 'desc' THEN
      CASE 
        WHEN p_sort_key = 'orders' THEN f.c_orders::numeric
        WHEN p_sort_key = 'totalSpent' THEN f.c_spent
        WHEN p_sort_key = 'lastOrder' THEN EXTRACT(EPOCH FROM f.c_last_order)
        ELSE NULL
      END
    END DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_customers_directory TO anon, authenticated;

-- 3. CREATE NEW get_customer_group_counts FUNCTION
CREATE OR REPLACE FUNCTION public.get_customer_group_counts(p_group_timeframe text DEFAULT 'all_time')
RETURNS TABLE (
  vip_count bigint,
  standard_count bigint,
  regular_count bigint
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH customer_orders_all_time AS (
    SELECT
      COALESCE(o.customer_phone, o.customer_email, o.customer_name) AS c_id,
      o.id AS order_id,
      o.total,
      o.status,
      o.created_at
    FROM orders o
    WHERE o.deleted_at IS NULL
  ),
  stats_timeframe AS (
    SELECT
      coa.c_id,
      COALESCE(COUNT(coa.order_id), 0) AS tf_orders,
      COALESCE(SUM(CASE WHEN coa.status != 'cancelled' THEN coa.total ELSE 0 END), 0) AS tf_spent
    FROM customer_orders_all_time coa
    WHERE CASE 
      WHEN p_group_timeframe = 'week' THEN coa.created_at >= now() - INTERVAL '7 days'
      WHEN p_group_timeframe = 'month' THEN coa.created_at >= now() - INTERVAL '30 days'
      ELSE TRUE
    END
    GROUP BY coa.c_id
  ),
  aggregated AS (
    SELECT
      coa.c_id AS internal_c_id,
      COALESCE(COUNT(coa.order_id), 0) AS c_orders,
      COALESCE(SUM(CASE WHEN coa.status != 'cancelled' THEN coa.total ELSE 0 END), 0) AS c_spent,
      COALESCE(tf.tf_orders, 0) AS tf_orders,
      COALESCE(tf.tf_spent, 0) AS tf_spent
    FROM customer_orders_all_time coa
    LEFT JOIN stats_timeframe tf ON tf.c_id = coa.c_id
    GROUP BY coa.c_id, tf.tf_orders, tf.tf_spent
  ),
  classified AS (
    SELECT
      CASE
        WHEN p_group_timeframe = 'week' THEN
          CASE
            WHEN a.tf_spent >= 15000 OR a.tf_orders >= 2 THEN 'vip'
            WHEN a.tf_spent >= 5000 OR a.tf_orders >= 1 THEN 'standard'
            ELSE 'regular'
          END
        WHEN p_group_timeframe = 'month' THEN
          CASE
            WHEN a.tf_spent >= 40000 OR a.tf_orders >= 4 THEN 'vip'
            WHEN a.tf_spent >= 15000 OR a.tf_orders >= 2 THEN 'standard'
            ELSE 'regular'
          END
        ELSE
          -- all_time
          CASE
            WHEN a.c_spent >= 150000 OR a.c_orders >= 10 THEN 'vip'
            WHEN a.c_spent >= 50000 OR a.c_orders >= 4 THEN 'standard'
            ELSE 'regular'
          END
      END AS customer_tier
    FROM aggregated a
  )
  SELECT
    COALESCE(COUNT(*) FILTER (WHERE customer_tier = 'vip'), 0)::bigint AS vip_count,
    COALESCE(COUNT(*) FILTER (WHERE customer_tier = 'standard'), 0)::bigint AS standard_count,
    COALESCE(COUNT(*) FILTER (WHERE customer_tier = 'regular'), 0)::bigint AS regular_count
  FROM classified;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_customer_group_counts(text) TO anon, authenticated;

-- 4. UPDATE get_campaign_audience FUNCTION
DROP FUNCTION IF EXISTS public.get_campaign_audience(
  text,
  timestamp with time zone,
  timestamp with time zone
);

CREATE OR REPLACE FUNCTION public.get_campaign_audience(
  p_audience text,
  p_start timestamp with time zone DEFAULT NULL,
  p_end timestamp with time zone DEFAULT NULL
)
RETURNS TABLE (
  agg_id text,
  agg_name text,
  agg_email text,
  agg_phone text,
  agg_orders bigint,
  agg_total_spent numeric,
  agg_last_order timestamp with time zone
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH customer_orders_all_time AS (
    SELECT
      COALESCE(o.customer_phone, o.customer_email, o.customer_name) AS c_id,
      o.customer_name,
      o.customer_email,
      o.customer_phone,
      o.id AS order_id,
      o.total,
      o.status,
      o.created_at
    FROM orders o
    WHERE o.deleted_at IS NULL
  ),
  aggregated AS (
    SELECT
      coa.c_id AS internal_c_id,
      MAX(coa.customer_name) AS c_name,
      MAX(coa.customer_email) AS c_email,
      MAX(coa.customer_phone) AS c_phone,
      COALESCE(COUNT(coa.order_id), 0) AS c_orders,
      COALESCE(SUM(CASE WHEN coa.status != 'cancelled' THEN coa.total ELSE 0 END), 0) AS c_spent,
      MAX(coa.created_at) AS c_last_order,
      COALESCE(BOOL_OR(coa.status = 'cancelled'), false) AS c_has_cancelled,
      COUNT(coa.order_id) FILTER (WHERE EXTRACT(ISODOW FROM coa.created_at) IN (5, 6, 7)) AS c_weekend_orders
    FROM customer_orders_all_time coa
    GROUP BY coa.c_id
  ),
  base_list AS (
    SELECT * FROM aggregated
    WHERE c_email IS NOT NULL AND TRIM(c_email) != ''
  ),
  filtered_list AS (
    SELECT * FROM base_list
    WHERE CASE 
      WHEN p_audience NOT IN ('slipped_90', 'inactive_30', 'inactive_60', 'top_20_monthly') THEN
        (p_start IS NULL OR c_last_order >= p_start) AND
        (p_end IS NULL OR c_last_order <= p_end)
      ELSE TRUE
    END
  ),
  segmented AS (
    SELECT * FROM filtered_list
    WHERE CASE 
      -- Keep legacy options
      WHEN p_audience = 'vip_customers' THEN c_spent >= 200000
      WHEN p_audience = 'high_aov' THEN c_orders > 0 AND (c_spent / c_orders) >= 15000
      WHEN p_audience = 'loyal_buyers' THEN c_orders >= 3
      WHEN p_audience = 'weekend_lovers' THEN c_orders > 0 AND (c_weekend_orders::numeric / c_orders) >= 0.5
      WHEN p_audience = 'slipped_90' THEN c_last_order < now() - INTERVAL '90 days'
      WHEN p_audience = 'inactive_30' THEN c_last_order < now() - INTERVAL '30 days'
      WHEN p_audience = 'inactive_60' THEN c_last_order < now() - INTERVAL '60 days'
      WHEN p_audience = 'one_order' THEN c_orders = 1
      WHEN p_audience = 'abandoned_orders' THEN c_has_cancelled
      
      -- Add new unified tier options
      WHEN p_audience = 'vip' THEN c_spent >= 150000 OR c_orders >= 10
      WHEN p_audience = 'standard' THEN (c_spent >= 50000 OR c_orders >= 4) AND NOT (c_spent >= 150000 OR c_orders >= 10)
      WHEN p_audience = 'regular' THEN NOT (c_spent >= 50000 OR c_orders >= 4)
      ELSE TRUE
    END
  )
  SELECT 
    s.internal_c_id AS agg_id, 
    s.c_name AS agg_name, 
    s.c_email AS agg_email, 
    s.c_phone AS agg_phone, 
    s.c_orders AS agg_orders, 
    s.c_spent AS agg_total_spent, 
    s.c_last_order AS agg_last_order
  FROM segmented s
  WHERE p_audience NOT IN ('top_20_monthly', 'top_10_percent')
  
  UNION ALL
  
  -- Segment: top_10_percent
  SELECT 
    s.internal_c_id AS agg_id, 
    s.c_name AS agg_name, 
    s.c_email AS agg_email, 
    s.c_phone AS agg_phone, 
    s.c_orders AS agg_orders, 
    s.c_spent AS agg_total_spent, 
    s.c_last_order AS agg_last_order
  FROM (
    SELECT *, percent_rank() OVER (ORDER BY c_spent DESC) AS rnk
    FROM segmented
  ) s
  WHERE p_audience = 'top_10_percent' AND s.rnk <= 0.1
  
  UNION ALL
  
  -- Segment: top_20_monthly
  SELECT 
    s.internal_c_id AS agg_id, 
    s.c_name AS agg_name, 
    s.c_email AS agg_email, 
    s.c_phone AS agg_phone, 
    s.c_orders AS agg_orders, 
    s.c_spent AS agg_total_spent, 
    s.c_last_order AS agg_last_order
  FROM (
    SELECT 
      bl.internal_c_id, bl.c_name, bl.c_email, bl.c_phone, bl.c_orders, bl.c_spent, bl.c_last_order,
      COALESCE(SUM(o.total), 0) AS range_spent
    FROM base_list bl
    JOIN orders o ON COALESCE(o.customer_phone, o.customer_email, o.customer_name) = bl.internal_c_id
    WHERE o.deleted_at IS NULL 
      AND o.status != 'cancelled'
      AND (p_start IS NULL OR o.created_at >= p_start)
      AND (p_end IS NULL OR o.created_at <= p_end)
    GROUP BY bl.internal_c_id, bl.c_name, bl.c_email, bl.c_phone, bl.c_orders, bl.c_spent, bl.c_last_order
    ORDER BY range_spent DESC
    LIMIT 20
  ) s
  WHERE p_audience = 'top_20_monthly';
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_campaign_audience(text, timestamp with time zone, timestamp with time zone) TO anon, authenticated;
