-- Migration: 20260826_strict_coupon_single_use.sql
-- Enforce strict 1-use-per-customer for coupons

-- 1. Helper function to check if a customer has already used a specific coupon code
CREATE OR REPLACE FUNCTION public.check_coupon_used_by_customer(
  p_coupon_code text,
  p_phone text,
  p_email text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exists boolean := false;
  v_clean_phone text;
  v_clean_email text;
  v_phone_digits text;
  v_coupon text;
BEGIN
  IF p_coupon_code IS NULL OR TRIM(p_coupon_code) = '' THEN
    RETURN false;
  END IF;

  v_coupon := UPPER(TRIM(p_coupon_code));
  v_clean_phone := NULLIF(TRIM(p_phone), '');
  v_clean_email := NULLIF(LOWER(TRIM(p_email)), '');

  -- Extract digits from phone
  IF v_clean_phone IS NOT NULL THEN
    v_phone_digits := REGEXP_REPLACE(v_clean_phone, '\D', '', 'g');
  ELSE
    v_phone_digits := NULL;
  END IF;

  -- If neither phone nor email provided, return false
  IF v_clean_phone IS NULL AND v_clean_email IS NULL THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.orders
    WHERE UPPER(TRIM(coupon_code)) = v_coupon
      AND status != 'cancelled'
      AND (
        (v_phone_digits IS NOT NULL AND LENGTH(v_phone_digits) >= 10 AND (
          RIGHT(REGEXP_REPLACE(customer_phone, '\D', '', 'g'), 10) = RIGHT(v_phone_digits, 10)
        ))
        OR
        (v_clean_phone IS NOT NULL AND customer_phone = v_clean_phone)
        OR
        (v_clean_email IS NOT NULL AND LOWER(TRIM(customer_email)) = v_clean_email)
      )
  ) INTO v_exists;

  RETURN v_exists;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_coupon_used_by_customer(text, text, text) TO anon, authenticated, service_role;

-- 2. Update create_storefront_order to strictly enforce 1-use-per-customer if coupon is present
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
  v_coupon_code text;
  v_customer_phone text;
  v_customer_email text;
BEGIN
  v_status := COALESCE(NULLIF(p->>'status', ''), 'pending');
  v_session_id := NULLIF(p->>'session_id', '');
  v_coupon_code := NULLIF(p->>'coupon_code', '');
  v_customer_phone := NULLIF(p->>'customer_phone', '');
  v_customer_email := NULLIF(p->>'customer_email', '');

  -- Enforce 1-use-per-customer if coupon_code is supplied
  IF v_coupon_code IS NOT NULL THEN
    IF public.check_coupon_used_by_customer(v_coupon_code, v_customer_phone, v_customer_email) THEN
      RAISE EXCEPTION 'You have already used this coupon code on a previous order.';
    END IF;
  END IF;

  INSERT INTO public.orders (
    customer_name, customer_email, customer_phone,
    delivery_address, delivery_zone, store_id,
    payment_method, total, delivery_fee,
    coupon_code, coupon_discount, status, notes,
    paystack_ref, created_at, channel, user_id
  ) VALUES (
    p->>'customer_name',
    v_customer_email,
    v_customer_phone,
    p->>'delivery_address',
    NULLIF(p->>'delivery_zone', ''),
    CASE WHEN (p->>'store_id') IS NOT NULL THEN (p->>'store_id')::int ELSE NULL END,
    p->>'payment_method',
    (p->>'total')::numeric,
    (p->>'delivery_fee')::numeric,
    v_coupon_code,
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
