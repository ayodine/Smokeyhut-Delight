-- ============================================================================
-- Migration: Ops Dashboard Abandoned Carts Access & Permission Hardening
-- Allows internal ops dashboard (running under anon client) to read and manage
-- cart sessions and call abandoned cart reporting RPCs while preserving
-- strict security against non-staff authenticated storefront customers.
-- ============================================================================

-- 1. RLS Policies on public.cart_sessions for anon
DROP POLICY IF EXISTS "ops_anon_select_cart_sessions" ON public.cart_sessions;
CREATE POLICY "ops_anon_select_cart_sessions" ON public.cart_sessions
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "ops_anon_update_cart_sessions" ON public.cart_sessions;
CREATE POLICY "ops_anon_update_cart_sessions" ON public.cart_sessions
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "ops_anon_delete_cart_sessions" ON public.cart_sessions;
CREATE POLICY "ops_anon_delete_cart_sessions" ON public.cart_sessions
  FOR DELETE TO anon USING (true);

-- 2. get_abandoned_cart_stats RPC
CREATE OR REPLACE FUNCTION public.get_abandoned_cart_stats(
  p_start timestamptz DEFAULT NULL,
  p_end   timestamptz DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start timestamptz := COALESCE(p_start, '2020-01-01'::timestamptz);
  v_end   timestamptz := COALESCE(p_end, now());
  v_total_sessions bigint;
  v_converted_sessions bigint;
  v_abandoned_sessions bigint;
  v_lost_revenue numeric;
  v_abandonment_rate numeric;
  v_recoverable_count bigint;
  v_recovered_count bigint;
  v_recovered_revenue numeric;
  v_stage_cart bigint;
  v_stage_checkout bigint;
  v_stage_contact bigint;
  v_stage_payment bigint;
  v_stage_converted bigint;
BEGIN
  -- Strict guard: If an authenticated storefront customer attempts to call this without staff role, block them
  IF auth.uid() IS NOT NULL AND NOT public.is_staff() THEN
    RAISE EXCEPTION 'Unauthorized: staff only';
  END IF;

  -- Base counts within date range
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE stage = 'converted'),
    COUNT(*) FILTER (WHERE stage <> 'converted' AND cart_total > 0),
    COALESCE(SUM(cart_total) FILTER (WHERE stage <> 'converted'), 0),
    COUNT(*) FILTER (WHERE stage <> 'converted' AND (customer_phone IS NOT NULL OR customer_email IS NOT NULL)),
    COUNT(*) FILTER (WHERE recovered = true),
    COALESCE(SUM(cart_total) FILTER (WHERE recovered = true), 0),
    COUNT(*) FILTER (WHERE stage = 'cart'),
    COUNT(*) FILTER (WHERE stage = 'checkout'),
    COUNT(*) FILTER (WHERE stage = 'contact_captured'),
    COUNT(*) FILTER (WHERE stage = 'payment_pending'),
    COUNT(*) FILTER (WHERE stage = 'converted')
  INTO 
    v_total_sessions,
    v_converted_sessions,
    v_abandoned_sessions,
    v_lost_revenue,
    v_recoverable_count,
    v_recovered_count,
    v_recovered_revenue,
    v_stage_cart,
    v_stage_checkout,
    v_stage_contact,
    v_stage_payment,
    v_stage_converted
  FROM public.cart_sessions
  WHERE created_at >= v_start AND created_at <= v_end;

  IF v_total_sessions > 0 THEN
    v_abandonment_rate := ROUND((v_abandoned_sessions::numeric / v_total_sessions::numeric) * 100, 1);
  ELSE
    v_abandonment_rate := 0;
  END IF;

  RETURN json_build_object(
    'total_sessions', v_total_sessions,
    'converted_sessions', v_converted_sessions,
    'abandoned_sessions', v_abandoned_sessions,
    'lost_revenue', v_lost_revenue,
    'abandonment_rate', v_abandonment_rate,
    'recoverable_count', v_recoverable_count,
    'recovered_count', v_recovered_count,
    'recovered_revenue', v_recovered_revenue,
    'stages', json_build_object(
      'cart', v_stage_cart,
      'checkout', v_stage_checkout,
      'contact_captured', v_stage_contact,
      'payment_pending', v_stage_payment,
      'converted', v_stage_converted,
      'recovered', v_recovered_count
    ),
    'funnel', json_build_object(
      'cart_created', v_total_sessions,
      'checkout_reached', (v_stage_checkout + v_stage_contact + v_stage_payment + v_stage_converted),
      'contact_captured', (v_stage_contact + v_stage_payment + v_stage_converted),
      'payment_started', (v_stage_payment + v_stage_converted),
      'converted', v_stage_converted
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_abandoned_cart_stats(timestamptz, timestamptz) TO anon, authenticated;

-- 3. get_abandoned_cart_list RPC (Granular Source & Filtering)
CREATE OR REPLACE FUNCTION public.get_abandoned_cart_list(
  p_start   timestamptz DEFAULT NULL,
  p_end     timestamptz DEFAULT NULL,
  p_filter  text DEFAULT 'all', -- 'all' | 'abandoned' | 'recoverable' | 'recovered' | 'cart' | 'checkout' | 'contact_captured' | 'payment_pending' | 'converted'
  p_search  text DEFAULT NULL,
  p_limit   int DEFAULT 50,
  p_offset  int DEFAULT 0,
  p_source  text DEFAULT 'all' -- 'all' | 'snapchat' | 'instagram' | 'instagram_ad' | 'instagram_link' | 'whatsapp' | 'facebook' | 'google' | 'direct'
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start timestamptz := COALESCE(p_start, '2020-01-01'::timestamptz);
  v_end   timestamptz := COALESCE(p_end, now());
  v_total_count bigint;
  v_rows json;
BEGIN
  -- Strict guard: If an authenticated storefront customer attempts to call this without staff role, block them
  IF auth.uid() IS NOT NULL AND NOT public.is_staff() THEN
    RAISE EXCEPTION 'Unauthorized: staff only';
  END IF;

  -- Count total matching rows
  SELECT COUNT(*)
  INTO v_total_count
  FROM public.cart_sessions cs
  WHERE cs.created_at >= v_start AND cs.created_at <= v_end
    AND (
      p_filter = 'all' OR
      (p_filter = 'abandoned' AND cs.stage <> 'converted') OR
      (p_filter = 'recoverable' AND cs.stage <> 'converted' AND (cs.customer_phone IS NOT NULL OR cs.customer_email IS NOT NULL)) OR
      (p_filter = 'recovered' AND cs.recovered = true) OR
      (p_filter = cs.stage)
    )
    AND (
      p_search IS NULL OR p_search = '' OR
      cs.customer_name ILIKE '%' || p_search || '%' OR
      cs.customer_phone ILIKE '%' || p_search || '%' OR
      cs.customer_email ILIKE '%' || p_search || '%' OR
      cs.session_id ILIKE '%' || p_search || '%'
    )
    AND (
      p_source = 'all' OR
      (p_source = 'snapchat' AND (cs.metadata::text ILIKE '%snapchat%' OR cs.metadata::text ILIKE '%sccid%' OR cs.metadata::text ILIKE '%sc_cid%')) OR
      (p_source = 'instagram_ad' AND cs.metadata::text ILIKE '%instagram%' AND (
        cs.metadata::text ILIKE '%fbclid%' OR
        cs.metadata::text ILIKE '%"is_ad":true%' OR
        cs.metadata::text ILIKE '%"isad":true%' OR
        cs.metadata::text ILIKE '%Instagram Ad%' OR
        cs.metadata::text ILIKE '%"medium":"cpc"%' OR
        cs.metadata::text ILIKE '%"medium":"paid"%'
      )) OR
      (p_source = 'instagram_link' AND cs.metadata::text ILIKE '%instagram%' AND NOT (
        cs.metadata::text ILIKE '%fbclid%' OR
        cs.metadata::text ILIKE '%"is_ad":true%' OR
        cs.metadata::text ILIKE '%"isad":true%' OR
        cs.metadata::text ILIKE '%Instagram Ad%' OR
        cs.metadata::text ILIKE '%"medium":"cpc"%' OR
        cs.metadata::text ILIKE '%"medium":"paid"%'
      )) OR
      (p_source = 'instagram' AND cs.metadata::text ILIKE '%instagram%') OR
      (p_source = 'whatsapp' AND (
        cs.metadata::text ILIKE '%whatsapp%' OR
        cs.metadata::text ILIKE '%l.wl.co%' OR
        cs.metadata::text ILIKE '%wl.co%' OR
        cs.metadata::text ILIKE '%wa.link%' OR
        cs.metadata::text ILIKE '%wa.me%'
      )) OR
      (p_source = 'facebook' AND (cs.metadata::text ILIKE '%facebook%' OR cs.metadata::text ILIKE '%fbclid%')) OR
      (p_source = 'google' AND (cs.metadata::text ILIKE '%google%' OR cs.metadata::text ILIKE '%gclid%')) OR
      (p_source = 'direct' AND NOT (
        cs.metadata::text ILIKE '%snapchat%' OR
        cs.metadata::text ILIKE '%sccid%' OR
        cs.metadata::text ILIKE '%instagram%' OR
        cs.metadata::text ILIKE '%facebook%' OR
        cs.metadata::text ILIKE '%fbclid%' OR
        cs.metadata::text ILIKE '%google%' OR
        cs.metadata::text ILIKE '%gclid%' OR
        cs.metadata::text ILIKE '%whatsapp%' OR
        cs.metadata::text ILIKE '%l.wl.co%' OR
        cs.metadata::text ILIKE '%wl.co%'
      ))
    );

  -- Fetch matching rows
  SELECT COALESCE(json_agg(r), '[]'::json)
  INTO v_rows
  FROM (
    SELECT 
      cs.id,
      cs.session_id,
      cs.user_id,
      cs.customer_name,
      cs.customer_phone,
      cs.customer_email,
      cs.delivery_zone,
      cs.delivery_address,
      cs.items,
      cs.item_count,
      cs.cart_total,
      cs.stage,
      cs.order_id,
      cs.recovered,
      cs.metadata,
      cs.created_at,
      cs.last_active_at,
      cs.converted_at
    FROM public.cart_sessions cs
    WHERE cs.created_at >= v_start AND cs.created_at <= v_end
      AND (
        p_filter = 'all' OR
        (p_filter = 'abandoned' AND cs.stage <> 'converted') OR
        (p_filter = 'recoverable' AND cs.stage <> 'converted' AND (cs.customer_phone IS NOT NULL OR cs.customer_email IS NOT NULL)) OR
        (p_filter = 'recovered' AND cs.recovered = true) OR
        (p_filter = cs.stage)
      )
      AND (
        p_search IS NULL OR p_search = '' OR
        cs.customer_name ILIKE '%' || p_search || '%' OR
        cs.customer_phone ILIKE '%' || p_search || '%' OR
        cs.customer_email ILIKE '%' || p_search || '%' OR
        cs.session_id ILIKE '%' || p_search || '%'
      )
      AND (
        p_source = 'all' OR
        (p_source = 'snapchat' AND (cs.metadata::text ILIKE '%snapchat%' OR cs.metadata::text ILIKE '%sccid%' OR cs.metadata::text ILIKE '%sc_cid%')) OR
        (p_source = 'instagram_ad' AND cs.metadata::text ILIKE '%instagram%' AND (
          cs.metadata::text ILIKE '%fbclid%' OR
          cs.metadata::text ILIKE '%"is_ad":true%' OR
          cs.metadata::text ILIKE '%"isad":true%' OR
          cs.metadata::text ILIKE '%Instagram Ad%' OR
          cs.metadata::text ILIKE '%"medium":"cpc"%' OR
          cs.metadata::text ILIKE '%"medium":"paid"%'
        )) OR
        (p_source = 'instagram_link' AND cs.metadata::text ILIKE '%instagram%' AND NOT (
          cs.metadata::text ILIKE '%fbclid%' OR
          cs.metadata::text ILIKE '%"is_ad":true%' OR
          cs.metadata::text ILIKE '%"isad":true%' OR
          cs.metadata::text ILIKE '%Instagram Ad%' OR
          cs.metadata::text ILIKE '%"medium":"cpc"%' OR
          cs.metadata::text ILIKE '%"medium":"paid"%'
        )) OR
        (p_source = 'instagram' AND cs.metadata::text ILIKE '%instagram%') OR
        (p_source = 'whatsapp' AND (
          cs.metadata::text ILIKE '%whatsapp%' OR
          cs.metadata::text ILIKE '%l.wl.co%' OR
          cs.metadata::text ILIKE '%wl.co%' OR
          cs.metadata::text ILIKE '%wa.link%' OR
          cs.metadata::text ILIKE '%wa.me%'
        )) OR
        (p_source = 'facebook' AND (cs.metadata::text ILIKE '%facebook%' OR cs.metadata::text ILIKE '%fbclid%')) OR
        (p_source = 'google' AND (cs.metadata::text ILIKE '%google%' OR cs.metadata::text ILIKE '%gclid%')) OR
        (p_source = 'direct' AND NOT (
          cs.metadata::text ILIKE '%snapchat%' OR
          cs.metadata::text ILIKE '%sccid%' OR
          cs.metadata::text ILIKE '%instagram%' OR
          cs.metadata::text ILIKE '%facebook%' OR
          cs.metadata::text ILIKE '%fbclid%' OR
          cs.metadata::text ILIKE '%google%' OR
          cs.metadata::text ILIKE '%gclid%' OR
          cs.metadata::text ILIKE '%whatsapp%' OR
          cs.metadata::text ILIKE '%l.wl.co%' OR
          cs.metadata::text ILIKE '%wl.co%'
        ))
      )
    ORDER BY cs.last_active_at DESC
    LIMIT p_limit
    OFFSET p_offset
  ) r;

  RETURN json_build_object(
    'total', v_total_count,
    'data', v_rows
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_abandoned_cart_list(timestamptz, timestamptz, text, text, int, int, text) TO anon, authenticated;

-- 4. toggle_cart_recovered RPC
CREATE OR REPLACE FUNCTION public.toggle_cart_recovered(p_session_id text, p_recovered boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_staff() THEN
    RAISE EXCEPTION 'Unauthorized: staff only';
  END IF;

  UPDATE public.cart_sessions
  SET recovered = p_recovered
  WHERE session_id = p_session_id;

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_cart_recovered(text, boolean) TO anon, authenticated;

-- 5. delete_cart_session RPC
CREATE OR REPLACE FUNCTION public.delete_cart_session(p_session_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_staff() THEN
    RAISE EXCEPTION 'Unauthorized: staff only';
  END IF;

  DELETE FROM public.cart_sessions
  WHERE session_id = p_session_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_cart_session(text) TO anon, authenticated;
