-- ============================================================================
-- Migration: Add granular instagram_ad and instagram_link filtering to get_abandoned_cart_list
-- Supports separating Instagram Ads vs Organic Instagram Profile/Story/DM Links
-- ============================================================================

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
  IF NOT public.is_staff() THEN
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

GRANT EXECUTE ON FUNCTION public.get_abandoned_cart_list(timestamptz, timestamptz, text, text, int, int, text) TO authenticated;
