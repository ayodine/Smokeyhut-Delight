-- Migration: 20261113_payment_kpis_pos_and_ops_access.sql
-- Updates get_payment_kpis to include POS totals and support ops dashboard access
-- while blocking non-staff authenticated storefront users.

CREATE OR REPLACE FUNCTION public.get_payment_kpis(p_store_id int DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_staff() THEN
    RAISE EXCEPTION 'Unauthorized: staff only';
  END IF;

  SELECT json_build_object(
    'total',         COALESCE(SUM(total) FILTER (WHERE paid_at IS NOT NULL OR status IN ('processing', 'shipped', 'delivered', 'paid')), 0),
    'paystack',      COALESCE(SUM(total) FILTER (WHERE (paid_at IS NOT NULL OR status IN ('processing', 'shipped', 'delivered', 'paid')) AND LOWER(COALESCE(payment_method, '')) IN ('paystack', 'card', 'online')), 0),
    'bank_transfer', COALESCE(SUM(total) FILTER (WHERE (paid_at IS NOT NULL OR status IN ('processing', 'shipped', 'delivered', 'paid')) AND LOWER(COALESCE(payment_method, '')) = 'bank_transfer'), 0),
    'cash',          COALESCE(SUM(total) FILTER (WHERE (paid_at IS NOT NULL OR status IN ('processing', 'shipped', 'delivered', 'paid')) AND LOWER(COALESCE(payment_method, '')) = 'cash'), 0),
    'pos',           COALESCE(SUM(total) FILTER (WHERE (paid_at IS NOT NULL OR status IN ('processing', 'shipped', 'delivered', 'paid')) AND LOWER(COALESCE(payment_method, '')) = 'pos'), 0)
  ) INTO result
  FROM public.orders
  WHERE deleted_at IS NULL
    AND (p_store_id IS NULL OR store_id = p_store_id);

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_payment_kpis(int) TO anon, authenticated;
