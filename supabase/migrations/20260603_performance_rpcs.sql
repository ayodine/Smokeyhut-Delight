-- Migration: Performance RPC functions for Inventory, Customers, and Orders
-- Path: supabase/migrations/20260603_performance_rpcs.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. INVENTORY: Get items with ledger-derived stock levels
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_inventory_items_with_stock(p_category text)
RETURNS TABLE (
  id uuid,
  name text,
  unit text,
  unit_cost numeric,
  low_stock_threshold numeric,
  category text,
  is_active boolean,
  created_at timestamptz,
  current_stock numeric
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT 
    i.id,
    i.name,
    i.unit,
    i.unit_cost,
    i.low_stock_threshold,
    i.category,
    i.is_active,
    i.created_at,
    COALESCE(
      SUM(
        CASE 
          WHEN m.type = 'IN' THEN m.quantity
          WHEN m.type = 'OUT' THEN -m.quantity
          ELSE m.quantity
        END
      ),
      0
    ) AS current_stock
  FROM inventory_items i
  LEFT JOIN inventory_movements m ON m.item_id = i.id
  WHERE i.is_active = true AND i.category = p_category
  GROUP BY i.id
  ORDER BY i.name;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. INVENTORY: Aggregate stock flow report
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_inventory_flow_report(
  p_category text,
  p_start timestamptz,
  p_end timestamptz
)
RETURNS TABLE (
  item_id uuid,
  name text,
  unit text,
  low_stock_threshold numeric,
  unit_cost numeric,
  opening numeric,
  inflow numeric,
  outflow numeric,
  adjustment numeric,
  closing numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH before_mov AS (
    SELECT 
      m.item_id,
      COALESCE(
        SUM(
          CASE 
            WHEN m.type = 'IN' THEN m.quantity
            WHEN m.type = 'OUT' THEN -m.quantity
            ELSE m.quantity
          END
        ),
        0
      ) AS stock
    FROM inventory_movements m
    WHERE m.created_at < p_start
    GROUP BY m.item_id
  ),
  range_mov AS (
    SELECT 
      m.item_id,
      COALESCE(SUM(CASE WHEN m.type = 'IN' THEN m.quantity ELSE 0 END), 0) AS inflow,
      COALESCE(SUM(CASE WHEN m.type = 'OUT' THEN m.quantity ELSE 0 END), 0) AS outflow,
      COALESCE(SUM(CASE WHEN m.type = 'ADJUSTMENT' THEN m.quantity ELSE 0 END), 0) AS adjustment
    FROM inventory_movements m
    WHERE m.created_at >= p_start AND m.created_at <= p_end
    GROUP BY m.item_id
  )
  SELECT 
    i.id AS item_id,
    i.name,
    i.unit,
    i.low_stock_threshold,
    i.unit_cost,
    GREATEST(0, COALESCE(b.stock, 0)) AS opening,
    COALESCE(r.inflow, 0) AS inflow,
    COALESCE(r.outflow, 0) AS outflow,
    COALESCE(r.adjustment, 0) AS adjustment,
    GREATEST(0, COALESCE(b.stock, 0) + COALESCE(r.inflow, 0) - COALESCE(r.outflow, 0) + COALESCE(r.adjustment, 0)) AS closing
  FROM inventory_items i
  LEFT JOIN before_mov b ON b.item_id = i.id
  LEFT JOIN range_mov r ON r.item_id = i.id
  WHERE i.is_active = true AND i.category = p_category
  ORDER BY i.name;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. CUSTOMERS: Paginated Directory
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_customers_directory(
  p_start timestamptz DEFAULT NULL,
  p_end timestamptz DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_sort_key text DEFAULT 'lastOrder',
  p_sort_dir text DEFAULT 'desc',
  p_limit int DEFAULT 20,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id text,
  name text,
  email text,
  phone text,
  orders bigint,
  "totalSpent" numeric,
  "lastOrder" timestamptz,
  "totalCount" bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
DECLARE
  v_search_query text;
BEGIN
  v_search_query := '%' || COALESCE(p_search, '') || '%';
  
  RETURN QUERY
  WITH customer_orders_all_time AS (
    SELECT
      COALESCE(customer_phone, customer_email, customer_name) AS c_id,
      customer_name,
      customer_email,
      customer_phone,
      id AS order_id,
      total,
      status,
      created_at
    FROM orders
    WHERE deleted_at IS NULL
  ),
  active_customers AS (
    SELECT DISTINCT c_id
    FROM customer_orders_all_time
    WHERE (p_start IS NULL OR created_at >= p_start)
      AND (p_end IS NULL OR created_at <= p_end)
  ),
  aggregated AS (
    SELECT
      coa.c_id AS agg_id,
      MAX(coa.customer_name) AS agg_name,
      MAX(coa.customer_email) AS agg_email,
      MAX(coa.customer_phone) AS agg_phone,
      COUNT(coa.order_id) AS agg_orders,
      COALESCE(SUM(CASE WHEN coa.status != 'cancelled' THEN coa.total ELSE 0 END), 0) AS agg_total_spent,
      MAX(coa.created_at) AS agg_last_order
    FROM customer_orders_all_time coa
    JOIN active_customers ac ON ac.c_id = coa.c_id
    GROUP BY coa.c_id
  ),
  filtered AS (
    SELECT * FROM aggregated
    WHERE (p_search IS NULL OR p_search = '' OR 
           agg_name ILIKE v_search_query OR 
           agg_email ILIKE v_search_query OR 
           agg_phone ILIKE v_search_query)
  ),
  total_cnt AS (
    SELECT COUNT(*) AS cnt FROM filtered
  )
  SELECT 
    f.agg_id,
    f.agg_name,
    f.agg_email,
    f.agg_phone,
    f.agg_orders,
    f.agg_total_spent,
    f.agg_last_order,
    tc.cnt
  FROM filtered f
  CROSS JOIN total_cnt tc
  ORDER BY
    CASE WHEN p_sort_dir = 'asc' THEN
      CASE 
        WHEN p_sort_key = 'name' THEN f.agg_name
        WHEN p_sort_key = 'email' THEN f.agg_email
        WHEN p_sort_key = 'phone' THEN f.agg_phone
        ELSE NULL
      END
    END ASC,
    CASE WHEN p_sort_dir = 'desc' THEN
      CASE 
        WHEN p_sort_key = 'name' THEN f.agg_name
        WHEN p_sort_key = 'email' THEN f.agg_email
        WHEN p_sort_key = 'phone' THEN f.agg_phone
        ELSE NULL
      END
    END DESC,
    CASE WHEN p_sort_dir = 'asc' THEN
      CASE 
        WHEN p_sort_key = 'orders' THEN f.agg_orders::numeric
        WHEN p_sort_key = 'totalSpent' THEN f.agg_total_spent
        WHEN p_sort_key = 'lastOrder' THEN EXTRACT(EPOCH FROM f.agg_last_order)
        ELSE NULL
      END
    END ASC,
    CASE WHEN p_sort_dir = 'desc' THEN
      CASE 
        WHEN p_sort_key = 'orders' THEN f.agg_orders::numeric
        WHEN p_sort_key = 'totalSpent' THEN f.agg_total_spent
        WHEN p_sort_key = 'lastOrder' THEN EXTRACT(EPOCH FROM f.agg_last_order)
        ELSE NULL
      END
    END DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. CUSTOMERS: KPI Summary
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_customers_kpis(
  p_start timestamptz DEFAULT NULL,
  p_end timestamptz DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
DECLARE
  v_total_customers bigint;
  v_total_spent numeric;
  v_total_orders bigint;
  v_new_customers bigint;
  v_returning_customers bigint;
BEGIN
  -- Unique active customers in date range
  SELECT COUNT(DISTINCT COALESCE(customer_phone, customer_email, customer_name))
  INTO v_total_customers
  FROM orders
  WHERE deleted_at IS NULL
    AND (p_start IS NULL OR created_at >= p_start)
    AND (p_end IS NULL OR created_at <= p_end);
    
  -- Total spent in range (non-cancelled)
  SELECT COALESCE(SUM(total), 0)
  INTO v_total_spent
  FROM orders
  WHERE deleted_at IS NULL
    AND status != 'cancelled'
    AND (p_start IS NULL OR created_at >= p_start)
    AND (p_end IS NULL OR created_at <= p_end);
    
  -- Total orders in range
  SELECT COUNT(*)
  INTO v_total_orders
  FROM orders
  WHERE deleted_at IS NULL
    AND (p_start IS NULL OR created_at >= p_start)
    AND (p_end IS NULL OR created_at <= p_end);
    
  -- First order timestamp per customer
  WITH first_orders AS (
    SELECT 
      COALESCE(customer_phone, customer_email, customer_name) AS c_id,
      MIN(created_at) AS first_order_at
    FROM orders
    WHERE deleted_at IS NULL
    GROUP BY 1
  )
  SELECT COUNT(*)
  INTO v_new_customers
  FROM first_orders
  WHERE (p_start IS NULL OR first_order_at >= p_start)
    AND (p_end IS NULL OR first_order_at <= p_end);
    
  v_returning_customers := COALESCE(v_total_customers - v_new_customers, 0);
  
  RETURN json_build_object(
    'totalCustomers', v_total_customers,
    'totalSpent', v_total_spent,
    'totalOrders', v_total_orders,
    'newCustomers', v_new_customers,
    'returningCustomers', v_returning_customers
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. CUSTOMERS: Campaign Audience Segmenter
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_campaign_audience(
  p_audience text,
  p_start timestamptz DEFAULT NULL,
  p_end timestamptz DEFAULT NULL
)
RETURNS TABLE (
  id text,
  name text,
  email text,
  phone text,
  orders bigint,
  "totalSpent" numeric,
  "lastOrder" timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH customer_orders_all_time AS (
    SELECT
      COALESCE(customer_phone, customer_email, customer_name) AS c_id,
      customer_name,
      customer_email,
      customer_phone,
      id AS order_id,
      total,
      status,
      created_at
    FROM orders
    WHERE deleted_at IS NULL
  ),
  aggregated AS (
    SELECT
      coa.c_id AS agg_id,
      MAX(coa.customer_name) AS agg_name,
      MAX(coa.customer_email) AS agg_email,
      MAX(coa.customer_phone) AS agg_phone,
      COUNT(coa.order_id) AS agg_orders,
      COALESCE(SUM(CASE WHEN coa.status != 'cancelled' THEN coa.total ELSE 0 END), 0) AS agg_total_spent,
      MAX(coa.created_at) AS agg_last_order,
      BOOL_OR(coa.status = 'cancelled') AS agg_has_cancelled,
      COUNT(coa.order_id) FILTER (WHERE EXTRACT(ISODOW FROM coa.created_at) IN (5, 6, 7)) AS agg_weekend_orders
    FROM customer_orders_all_time coa
    GROUP BY coa.c_id
  ),
  base_list AS (
    SELECT * FROM aggregated
    WHERE agg_email IS NOT NULL AND TRIM(agg_email) != ''
  ),
  filtered_list AS (
    SELECT * FROM base_list
    WHERE CASE 
      WHEN p_audience NOT IN ('slipped_90', 'inactive_30', 'inactive_60', 'top_20_monthly') THEN
        (p_start IS NULL OR agg_last_order >= p_start) AND
        (p_end IS NULL OR agg_last_order <= p_end)
      ELSE TRUE
    END
  ),
  segmented AS (
    SELECT * FROM filtered_list
    WHERE CASE 
      WHEN p_audience = 'vip_customers' THEN agg_total_spent >= 200000
      WHEN p_audience = 'high_aov' THEN agg_orders > 0 AND (agg_total_spent / agg_orders) >= 15000
      WHEN p_audience = 'loyal_buyers' THEN agg_orders >= 3
      WHEN p_audience = 'weekend_lovers' THEN agg_orders > 0 AND (agg_weekend_orders::numeric / agg_orders) >= 0.5
      WHEN p_audience = 'slipped_90' THEN agg_last_order < now() - INTERVAL '90 days'
      WHEN p_audience = 'inactive_30' THEN agg_last_order < now() - INTERVAL '30 days'
      WHEN p_audience = 'inactive_60' THEN agg_last_order < now() - INTERVAL '60 days'
      WHEN p_audience = 'one_order' THEN agg_orders = 1
      WHEN p_audience = 'abandoned_orders' THEN agg_has_cancelled
      ELSE TRUE -- 'all', 'top_10_percent', 'top_20_monthly' handled below
    END
  )
  SELECT 
    s.agg_id, s.agg_name, s.agg_email, s.agg_phone, s.agg_orders, s.agg_total_spent, s.agg_last_order
  FROM segmented s
  WHERE p_audience NOT IN ('top_20_monthly', 'top_10_percent')
  
  UNION ALL
  
  -- Segment: top_10_percent
  SELECT 
    s.agg_id, s.agg_name, s.agg_email, s.agg_phone, s.agg_orders, s.agg_total_spent, s.agg_last_order
  FROM (
    SELECT *, percent_rank() OVER (ORDER BY agg_total_spent DESC) AS rnk
    FROM segmented
  ) s
  WHERE p_audience = 'top_10_percent' AND s.rnk <= 0.1
  
  UNION ALL
  
  -- Segment: top_20_monthly
  SELECT 
    s.agg_id, s.agg_name, s.agg_email, s.agg_phone, s.agg_orders, s.agg_total_spent, s.agg_last_order
  FROM (
    SELECT 
      bl.agg_id, bl.agg_name, bl.agg_email, bl.agg_phone, bl.agg_orders, bl.agg_total_spent, bl.agg_last_order,
      COALESCE(SUM(o.total), 0) AS range_spent
    FROM base_list bl
    JOIN orders o ON COALESCE(o.customer_phone, o.customer_email, o.customer_name) = bl.agg_id
    WHERE o.deleted_at IS NULL 
      AND o.status != 'cancelled'
      AND (p_start IS NULL OR o.created_at >= p_start)
      AND (p_end IS NULL OR o.created_at <= p_end)
    GROUP BY bl.agg_id, bl.agg_name, bl.agg_email, bl.agg_phone, bl.agg_orders, bl.agg_total_spent, bl.agg_last_order
    ORDER BY range_spent DESC
    LIMIT 20
  ) s
  WHERE p_audience = 'top_20_monthly';
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. ORDERS: Order Status navigation counts
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_orders_status_counts(
  p_store_id integer DEFAULT NULL,
  p_start    timestamptz DEFAULT NULL,
  p_end      timestamptz DEFAULT NULL
)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT json_build_object(
    'all',         COUNT(*),
    'pending',     COUNT(*) FILTER (WHERE status = 'pending'),
    'processing',  COUNT(*) FILTER (WHERE status = 'processing'),
    'shipped',     COUNT(*) FILTER (WHERE status = 'shipped'),
    'delivered',   COUNT(*) FILTER (WHERE status = 'delivered'),
    'cancelled',   COUNT(*) FILTER (WHERE status = 'cancelled')
  )
  FROM orders
  WHERE deleted_at IS NULL
    AND (p_store_id IS NULL OR store_id = p_store_id)
    AND (p_start    IS NULL OR created_at >= p_start)
    AND (p_end      IS NULL OR created_at <= p_end);
$$;
