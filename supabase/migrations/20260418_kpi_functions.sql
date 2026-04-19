-- KPI aggregate functions — run once in Supabase SQL editor
-- All functions accept an optional store_id filter (NULL = all stores).
-- Using SECURITY DEFINER so the anon/authenticated role can call them via RPC.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Shipping KPIs
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_shipping_kpis(p_store_id int DEFAULT NULL)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT json_build_object(
    'pending',         COUNT(*) FILTER (WHERE status = 'pending'),
    'processing',      COUNT(*) FILTER (WHERE status = 'processing'),
    'shipped',         COUNT(*) FILTER (WHERE status = 'shipped'),
    'delivered',       COUNT(*) FILTER (WHERE status = 'delivered'),
    'total_fees',      COALESCE(SUM(delivery_fee) FILTER (WHERE status != 'cancelled'), 0),
    'delivered_count', COUNT(*) FILTER (WHERE status = 'delivered'),
    'delivered_fees',  COALESCE(SUM(delivery_fee) FILTER (WHERE status = 'delivered'), 0)
  )
  FROM orders
  WHERE (p_store_id IS NULL OR store_id = p_store_id);
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Weekly delivery revenue chart (Mon–Sun of current week, Lagos timezone)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_weekly_delivery_chart(p_store_id int DEFAULT NULL)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH week_days AS (
    SELECT generate_series(
      date_trunc('week', now() AT TIME ZONE 'Africa/Lagos')::date,
      (date_trunc('week', now() AT TIME ZONE 'Africa/Lagos') + interval '6 days')::date,
      '1 day'::interval
    )::date AS day
  ),
  daily AS (
    SELECT
      (created_at AT TIME ZONE 'Africa/Lagos')::date AS day,
      COALESCE(SUM(delivery_fee), 0) AS revenue
    FROM orders
    WHERE status = 'delivered'
      AND (p_store_id IS NULL OR store_id = p_store_id)
      AND (created_at AT TIME ZONE 'Africa/Lagos')::date
          BETWEEN (date_trunc('week', now() AT TIME ZONE 'Africa/Lagos'))::date
              AND (date_trunc('week', now() AT TIME ZONE 'Africa/Lagos') + interval '6 days')::date
    GROUP BY 1
  )
  SELECT json_agg(COALESCE(d.revenue, 0) ORDER BY w.day)
  FROM week_days w
  LEFT JOIN daily d ON d.day = w.day;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Overview KPIs (period-aware — pass NULL start for all-time)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_overview_kpis(
  p_store_id int DEFAULT NULL,
  p_start    timestamptz DEFAULT NULL
)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT json_build_object(
    'revenue',           COALESCE(SUM(total) FILTER (WHERE status != 'cancelled'), 0),
    'order_count',       COUNT(*),
    'pending_shipments', COUNT(*) FILTER (WHERE status IN ('pending', 'processing'))
  )
  FROM orders
  WHERE (p_store_id IS NULL OR store_id = p_store_id)
    AND (p_start IS NULL OR created_at >= p_start);
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Weekly revenue chart (Mon–Sun of current week, Lagos timezone)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_weekly_revenue_chart(p_store_id int DEFAULT NULL)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH week_days AS (
    SELECT generate_series(
      date_trunc('week', now() AT TIME ZONE 'Africa/Lagos')::date,
      (date_trunc('week', now() AT TIME ZONE 'Africa/Lagos') + interval '6 days')::date,
      '1 day'::interval
    )::date AS day
  ),
  daily AS (
    SELECT
      (created_at AT TIME ZONE 'Africa/Lagos')::date AS day,
      COALESCE(SUM(total), 0) AS revenue
    FROM orders
    WHERE status != 'cancelled'
      AND (p_store_id IS NULL OR store_id = p_store_id)
      AND (created_at AT TIME ZONE 'Africa/Lagos')::date
          BETWEEN (date_trunc('week', now() AT TIME ZONE 'Africa/Lagos'))::date
              AND (date_trunc('week', now() AT TIME ZONE 'Africa/Lagos') + interval '6 days')::date
    GROUP BY 1
  )
  SELECT json_agg(COALESCE(d.revenue, 0) ORDER BY w.day)
  FROM week_days w
  LEFT JOIN daily d ON d.day = w.day;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Payment KPIs (confirmed = processing + shipped + delivered)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_payment_kpis(p_store_id int DEFAULT NULL)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT json_build_object(
    'total',         COALESCE(SUM(total) FILTER (WHERE status IN ('processing','shipped','delivered')), 0),
    'paystack',      COALESCE(SUM(total) FILTER (WHERE status IN ('processing','shipped','delivered') AND payment_method = 'paystack'), 0),
    'bank_transfer', COALESCE(SUM(total) FILTER (WHERE status IN ('processing','shipped','delivered') AND payment_method = 'bank_transfer'), 0),
    'cash',          COALESCE(SUM(total) FILTER (WHERE status IN ('processing','shipped','delivered') AND payment_method = 'cash'), 0)
  )
  FROM orders
  WHERE payment_method IS NOT NULL
    AND (p_store_id IS NULL OR store_id = p_store_id);
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Recommended indexes (add if not already present)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_orders_status        ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_store_id      ON orders(store_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at    ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
