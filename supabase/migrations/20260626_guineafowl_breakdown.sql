-- Guinea fowl "incl. packs" figure for the product stats page.
-- Combo packs each contain multiple guinea fowl (Hangout=3, Stock Up=5, Party=10),
-- but the order line records them as 1 "pack", so the per-product stats undercount
-- guinea fowl. This returns the true bird count for a period (delivered-only):
--   direct  = guinea fowl sold as themselves (whole / chopped / dry, excludes rice)
--   in_packs = guinea fowl contained in Hangout / Stock Up / Party packs
--   total   = direct + in_packs
-- Matched by NAME (not product_id) because pack "slots" get renamed seasonally
-- (e.g. the same ids were Ileya packs previously). Unknown packs (Ileya) are left
-- out rather than guessed; edit the CASE below if their composition is confirmed.
CREATE OR REPLACE FUNCTION public.get_guineafowl_breakdown(p_store_id integer DEFAULT NULL::integer, p_start timestamp with time zone DEFAULT NULL::timestamp with time zone, p_end timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  WITH gf AS (
    SELECT
      oi.qty,
      CASE
        WHEN lower(oi.name) LIKE '%hangout%'                                    THEN 3
        WHEN lower(oi.name) LIKE '%stock up%' OR lower(oi.name) LIKE '%stock-up%' THEN 5
        WHEN lower(oi.name) LIKE '%party pack%'                                  THEN 10
        ELSE 0
      END AS pack_birds,
      CASE
        WHEN (lower(oi.name) LIKE '%guineafowl%' OR lower(oi.name) LIKE '%guinea fowl%')
             AND lower(oi.name) NOT LIKE '%rice%'
             AND lower(oi.name) NOT LIKE '%pack%' THEN 1
        ELSE 0
      END AS direct_bird
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE o.deleted_at IS NULL
      AND o.status = 'delivered'
      AND (p_store_id IS NULL OR o.store_id = p_store_id)
      AND (p_start    IS NULL OR o.created_at >= p_start)
      AND (p_end      IS NULL OR o.created_at <= p_end)
  )
  SELECT json_build_object(
    'direct',   COALESCE(SUM(qty * direct_bird), 0),
    'in_packs', COALESCE(SUM(qty * pack_birds), 0),
    'total',    COALESCE(SUM(qty * direct_bird) + SUM(qty * pack_birds), 0)
  )
  FROM gf;
$function$;
