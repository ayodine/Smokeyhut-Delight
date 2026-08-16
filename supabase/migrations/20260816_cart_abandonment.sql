-- ============================================================================
-- Cart Abandonment Tracking & Analytics
-- Tracks both guest visitors and authenticated customers
-- ============================================================================

BEGIN;

-- 1. Create cart_sessions table
CREATE TABLE IF NOT EXISTS public.cart_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text UNIQUE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_name text,
  customer_phone text,
  customer_email text,
  delivery_zone text,
  delivery_address text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  item_count int DEFAULT 0,
  cart_total numeric(12,2) DEFAULT 0,
  stage text NOT NULL DEFAULT 'cart', -- 'cart' | 'checkout' | 'contact_captured' | 'payment_pending' | 'converted'
  order_id text REFERENCES public.orders(id) ON DELETE SET NULL,
  recovered boolean DEFAULT false,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  last_active_at timestamptz DEFAULT now(),
  converted_at timestamptz
);

-- 2. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_cart_sessions_last_active ON public.cart_sessions(last_active_at DESC);
CREATE INDEX IF NOT EXISTS idx_cart_sessions_stage ON public.cart_sessions(stage);
CREATE INDEX IF NOT EXISTS idx_cart_sessions_created_at ON public.cart_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cart_sessions_phone ON public.cart_sessions(customer_phone) WHERE customer_phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cart_sessions_user_id ON public.cart_sessions(user_id) WHERE user_id IS NOT NULL;

-- 3. Row Level Security
ALTER TABLE public.cart_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff manage cart_sessions" ON public.cart_sessions;
CREATE POLICY "Staff manage cart_sessions" ON public.cart_sessions
  FOR ALL TO authenticated USING (is_staff()) WITH CHECK (is_staff());

-- 4. Storefront Upsert RPC (Callable by public/anon & customer)
CREATE OR REPLACE FUNCTION public.upsert_cart_session(p jsonb)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id text;
  v_existing_stage text;
  v_new_stage text;
BEGIN
  v_session_id := p->>'session_id';
  IF v_session_id IS NULL OR trim(v_session_id) = '' THEN
    RETURN NULL;
  END IF;

  v_new_stage := COALESCE(NULLIF(p->>'stage', ''), 'cart');

  -- Look up existing session stage
  SELECT stage INTO v_existing_stage
  FROM public.cart_sessions
  WHERE session_id = v_session_id;

  -- If session is already converted and client sends non-empty cart, keep converted or allow re-entry if specified
  IF v_existing_stage = 'converted' AND v_new_stage <> 'converted' THEN
    -- If items count is > 0 and it's a new cart session, we can start fresh or retain history
    -- Do not revert stage to cart if it was converted unless explicitly starting a new cycle
    v_new_stage := 'cart';
  END IF;

  INSERT INTO public.cart_sessions (
    session_id,
    user_id,
    customer_name,
    customer_phone,
    customer_email,
    delivery_zone,
    delivery_address,
    items,
    item_count,
    cart_total,
    stage,
    metadata,
    created_at,
    last_active_at
  ) VALUES (
    v_session_id,
    auth.uid(),
    NULLIF(p->>'customer_name', ''),
    NULLIF(p->>'customer_phone', ''),
    NULLIF(p->>'customer_email', ''),
    NULLIF(p->>'delivery_zone', ''),
    NULLIF(p->>'delivery_address', ''),
    COALESCE(p->'items', '[]'::jsonb),
    COALESCE((p->>'item_count')::int, 0),
    COALESCE((p->>'cart_total')::numeric, 0),
    v_new_stage,
    COALESCE(p->'metadata', '{}'::jsonb),
    now(),
    now()
  )
  ON CONFLICT (session_id) DO UPDATE SET
    user_id          = COALESCE(auth.uid(), public.cart_sessions.user_id),
    customer_name    = COALESCE(NULLIF(EXCLUDED.customer_name, ''), public.cart_sessions.customer_name),
    customer_phone   = COALESCE(NULLIF(EXCLUDED.customer_phone, ''), public.cart_sessions.customer_phone),
    customer_email   = COALESCE(NULLIF(EXCLUDED.customer_email, ''), public.cart_sessions.customer_email),
    delivery_zone    = COALESCE(NULLIF(EXCLUDED.delivery_zone, ''), public.cart_sessions.delivery_zone),
    delivery_address = COALESCE(NULLIF(EXCLUDED.delivery_address, ''), public.cart_sessions.delivery_address),
    items            = CASE WHEN jsonb_array_length(EXCLUDED.items) > 0 THEN EXCLUDED.items ELSE public.cart_sessions.items END,
    item_count       = CASE WHEN EXCLUDED.item_count > 0 THEN EXCLUDED.item_count ELSE public.cart_sessions.item_count END,
    cart_total       = CASE WHEN EXCLUDED.cart_total > 0 THEN EXCLUDED.cart_total ELSE public.cart_sessions.cart_total END,
    stage            = CASE 
                         WHEN public.cart_sessions.stage = 'converted' AND EXCLUDED.stage <> 'converted' THEN public.cart_sessions.stage
                         ELSE EXCLUDED.stage 
                       END,
    metadata         = COALESCE(public.cart_sessions.metadata, '{}'::jsonb) || COALESCE(EXCLUDED.metadata, '{}'::jsonb),
    last_active_at   = now();

  RETURN v_session_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_cart_session(jsonb) TO anon, authenticated;

-- 5. Mark Cart Converted RPC
CREATE OR REPLACE FUNCTION public.convert_cart_session(p_session_id text, p_order_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_session_id IS NULL OR trim(p_session_id) = '' THEN
    RETURN false;
  END IF;

  UPDATE public.cart_sessions
  SET stage        = 'converted',
      order_id     = p_order_id,
      converted_at = now(),
      last_active_at = now()
  WHERE session_id = p_session_id;

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.convert_cart_session(text, text) TO anon, authenticated;

-- 6. Update create_storefront_order to link session_id
CREATE OR REPLACE FUNCTION public.create_storefront_order(p jsonb)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE 
  v_id text;
  v_session_id text;
  v_status text;
BEGIN
  v_status := COALESCE(NULLIF(p->>'status', ''), 'pending');
  v_session_id := NULLIF(p->>'session_id', '');

  INSERT INTO public.orders (
    customer_name, customer_email, customer_phone,
    delivery_address, delivery_zone, store_id,
    payment_method, total, delivery_fee,
    coupon_code, coupon_discount, status, notes,
    paystack_ref, created_at, channel, user_id
  ) VALUES (
    p->>'customer_name',
    NULLIF(p->>'customer_email', ''),
    p->>'customer_phone',
    p->>'delivery_address',
    NULLIF(p->>'delivery_zone', ''),
    CASE WHEN (p->>'store_id') IS NOT NULL THEN (p->>'store_id')::int ELSE NULL END,
    p->>'payment_method',
    (p->>'total')::numeric,
    (p->>'delivery_fee')::numeric,
    NULLIF(p->>'coupon_code', ''),
    COALESCE((p->>'coupon_discount')::numeric, 0),
    v_status,
    NULLIF(p->>'notes', ''),
    NULLIF(p->>'paystack_ref', ''),
    now(),
    'storefront',
    auth.uid()
  )
  RETURNING id INTO v_id;

  -- If session_id provided, link and advance stage
  IF v_session_id IS NOT NULL THEN
    UPDATE public.cart_sessions
    SET order_id     = v_id,
        stage        = CASE WHEN v_status = 'pending_payment' THEN 'payment_pending' ELSE 'converted' END,
        converted_at = CASE WHEN v_status = 'pending_payment' THEN NULL ELSE now() END,
        last_active_at = now()
    WHERE session_id = v_session_id;
  END IF;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_storefront_order(jsonb) TO anon, authenticated;

-- 7. Update confirm_storefront_order to also mark converted
CREATE OR REPLACE FUNCTION public.confirm_storefront_order(p_ref text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id text;
BEGIN
  UPDATE public.orders
  SET status = 'paid'
  WHERE paystack_ref = p_ref
    AND status IN ('pending_payment', 'pending')
  RETURNING id INTO v_order_id;

  IF v_order_id IS NOT NULL THEN
    UPDATE public.cart_sessions
    SET stage        = 'converted',
        converted_at = now(),
        last_active_at = now()
    WHERE order_id = v_order_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_storefront_order(text) TO anon, authenticated;

-- 8. Toggle Cart Recovered RPC
CREATE OR REPLACE FUNCTION public.toggle_cart_recovered(p_session_id text, p_recovered boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'Unauthorized: staff only';
  END IF;

  UPDATE public.cart_sessions
  SET recovered = p_recovered
  WHERE session_id = p_session_id;

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_cart_recovered(text, boolean) TO authenticated;

-- 9. Abandoned Cart Analytics KPI RPC
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
  IF NOT public.is_staff() THEN
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

GRANT EXECUTE ON FUNCTION public.get_abandoned_cart_stats(timestamptz, timestamptz) TO authenticated;

-- 10. Abandoned Cart List Query RPC (with filter, search, pagination)
CREATE OR REPLACE FUNCTION public.get_abandoned_cart_list(
  p_start   timestamptz DEFAULT NULL,
  p_end     timestamptz DEFAULT NULL,
  p_filter  text DEFAULT 'all', -- 'all' | 'recoverable' | 'recovered' | 'cart' | 'checkout' | 'contact_captured' | 'payment_pending' | 'converted'
  p_search  text DEFAULT NULL,
  p_limit   int DEFAULT 50,
  p_offset  int DEFAULT 0
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
    ORDER BY cs.last_active_at DESC
    LIMIT p_limit
    OFFSET p_offset
  ) r;

  RETURN json_build_object(
    'total', v_total_count,
    'limit', p_limit,
    'offset', p_offset,
    'data', v_rows
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_abandoned_cart_list(timestamptz, timestamptz, text, text, int, int) TO authenticated;

-- 8. Delete Cart Session RPC
CREATE OR REPLACE FUNCTION public.delete_cart_session(p_session_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'Unauthorized: staff only';
  END IF;

  DELETE FROM public.cart_sessions
  WHERE session_id = p_session_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_cart_session(text) TO authenticated;

COMMIT;
