-- Per-product order breakdown for the "Units Sold" page drill-down.
-- Given a (normalised) product name and period, returns every non-cancelled order
-- line for that product, so a card can open a table of the underlying orders.
-- Name matching uses the SAME "(CHOPPED)" normalisation as get_stats_all_products,
-- so the rows reconcile with the card: delivered lines sum to the card's units,
-- and all non-cancelled lines sum to the card's revenue.
CREATE OR REPLACE FUNCTION public.get_product_order_breakdown(p_name text, p_store_id integer DEFAULT NULL::integer, p_start timestamp with time zone DEFAULT NULL::timestamp with time zone, p_end timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(order_id text, created_at timestamp with time zone, customer_name text, status text, qty bigint, price numeric, line_total numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT
    o.id              AS order_id,
    o.created_at,
    o.customer_name,
    o.status,
    oi.qty::bigint    AS qty,
    oi.price,
    (oi.qty * oi.price)::numeric AS line_total
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  WHERE o.deleted_at IS NULL
    AND o.status NOT IN ('cancelled')
    AND (p_store_id IS NULL OR o.store_id = p_store_id)
    AND (p_start    IS NULL OR o.created_at >= p_start)
    AND (p_end      IS NULL OR o.created_at <= p_end)
    AND (
      CASE
        WHEN oi.name ~* '\s*\(?\s*CHOPPED\s*\)?\s*$' THEN
          regexp_replace(oi.name, '\s*\(?\s*CHOPPED\s*\)?\s*$', '', 'i') || ' (CHOPPED)'
        ELSE oi.name
      END
    ) = p_name
  ORDER BY o.created_at DESC;
$function$;
