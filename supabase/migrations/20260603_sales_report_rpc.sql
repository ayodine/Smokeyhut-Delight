-- Migration: Add Sales Report aggregation function
-- Path: supabase/migrations/20260603_sales_report_rpc.sql

CREATE OR REPLACE FUNCTION get_sales_report_data(
  p_store_id int         DEFAULT NULL,
  p_start    timestamptz DEFAULT NULL,
  p_end      timestamptz DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
DECLARE
  v_revenue numeric;
  v_delivery_fees numeric;
  v_discounts numeric;
  v_order_count bigint;
  v_expenses numeric;
  v_breakdown json;
BEGIN
  -- Calculate overall metrics for non-cancelled orders
  SELECT 
    COALESCE(SUM(oi.price * oi.qty), 0),
    COALESCE(SUM(o.delivery_fee), 0),
    COALESCE(SUM(o.coupon_discount), 0),
    COUNT(DISTINCT o.id)
  INTO 
    v_revenue,
    v_delivery_fees,
    v_discounts,
    v_order_count
  FROM orders o
  LEFT JOIN order_items oi ON oi.order_id = o.id
  WHERE o.deleted_at IS NULL
    AND o.status != 'cancelled'
    AND (p_store_id IS NULL OR o.store_id = p_store_id)
    AND (p_start IS NULL OR o.created_at >= p_start)
    AND (p_end IS NULL OR o.created_at <= p_end);

  -- Calculate total expenses in the period
  SELECT 
    COALESCE(SUM(amount), 0)
  INTO 
    v_expenses
  FROM expenses
  WHERE (p_start IS NULL OR date >= (p_start AT TIME ZONE 'Africa/Lagos')::date)
    AND (p_end IS NULL OR date <= (p_end AT TIME ZONE 'Africa/Lagos')::date);

  -- Calculate breakdown of orders by status (including cancelled)
  WITH status_list AS (
    SELECT unnest(ARRAY['pending', 'processing', 'shipped', 'delivered', 'cancelled']) AS status
  ),
  order_groups AS (
    SELECT 
      o.id,
      o.status,
      COALESCE(SUM(oi.price * oi.qty), 0) as total_items_value
    FROM orders o
    LEFT JOIN order_items oi ON oi.order_id = o.id
    WHERE o.deleted_at IS NULL
      AND (p_store_id IS NULL OR o.store_id = p_store_id)
      AND (p_start IS NULL OR o.created_at >= p_start)
      AND (p_end IS NULL OR o.created_at <= p_end)
    GROUP BY o.id, o.status
  ),
  grouped AS (
    SELECT 
      sl.status,
      COUNT(og.id)::bigint as count,
      COALESCE(SUM(og.total_items_value), 0)::numeric as total
    FROM status_list sl
    LEFT JOIN order_groups og ON og.status = sl.status
    GROUP BY sl.status
  )
  SELECT json_agg(json_build_object(
    'status', status,
    'count', count,
    'total', total
  ))
  INTO v_breakdown
  FROM grouped;

  RETURN json_build_object(
    'revenue', v_revenue,
    'deliveryFees', v_delivery_fees,
    'discounts', v_discounts,
    'expenses', v_expenses,
    'orderCount', v_order_count,
    'breakdown', v_breakdown
  );
END;
$$;
