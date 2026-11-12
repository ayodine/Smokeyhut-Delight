-- Migration: 20261112_website_orders_kpi_rpc.sql
-- Description: Fast, authoritative server-side KPI aggregate metrics for the Ops Dashboard Website Orders page

CREATE OR REPLACE FUNCTION public.get_website_orders_kpis(
  p_from timestamptz DEFAULT NULL,
  p_to   timestamptz DEFAULT NULL
)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'total_orders',      COUNT(*),
    'total_revenue',     COALESCE(SUM(total), 0),
    'walkin_count',      COUNT(*) FILTER (WHERE channel ILIKE '%walk%' OR channel ILIKE '%pos%'),
    'intake_count',      COUNT(*) FILTER (WHERE packaging_status = 'ready_for_fulfillment'),
    'packaging_count',   COUNT(*) FILTER (WHERE packaging_status = 'in_packaging'),
    'transit_count',     COUNT(*) FILTER (WHERE delivery_status ILIKE 'in%transit%' OR delivery_status = 'out_for_delivery'),
    'delivered_count',   COUNT(*) FILTER (WHERE delivery_status ILIKE 'delivered%')
  )
  FROM orders
  WHERE deleted_at IS NULL
    AND status NOT IN ('cancelled', 'refunded', 'pending_payment')
    AND (paid_at IS NOT NULL OR status IN ('processing', 'delivered'))
    AND (p_from IS NULL OR created_at >= p_from)
    AND (p_to   IS NULL OR created_at <= p_to);
$$;

GRANT EXECUTE ON FUNCTION public.get_website_orders_kpis(timestamptz, timestamptz) TO anon, authenticated;
