-- Migration: 20260909_payment_success_coupon_redemption.sql
-- Ensures coupons are only counted as used/redeemed when payment is confirmed successful.
-- If payment fails, is cancelled, or is pending, the coupon remains unredeemed and the customer can retry.

-- 1. Trigger function on orders table to atomically sync coupons.uses
CREATE OR REPLACE FUNCTION public.handle_order_coupon_usage_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_code := NULLIF(UPPER(TRIM(NEW.coupon_code)), '');
    -- Only increment if order is immediately confirmed/paid (e.g. bank transfer or direct paid)
    -- NEVER increment for pending_payment or cancelled orders
    IF v_code IS NOT NULL AND NEW.status NOT IN ('pending_payment', 'cancelled') THEN
      UPDATE public.coupons
      SET uses = (
        SELECT COUNT(*)
        FROM public.orders
        WHERE UPPER(TRIM(coupon_code)) = v_code
          AND status NOT IN ('pending_payment', 'cancelled')
      )
      WHERE UPPER(TRIM(code)) = v_code;
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    v_code := COALESCE(NULLIF(UPPER(TRIM(NEW.coupon_code)), ''), NULLIF(UPPER(TRIM(OLD.coupon_code)), ''));
    
    -- When payment succeeds: transition from pending_payment -> processing/pending/paid/delivered
    -- When order is cancelled: transition from paid/active -> cancelled
    -- Or if coupon_code was modified
    IF v_code IS NOT NULL AND (
      (OLD.status = 'pending_payment' AND NEW.status NOT IN ('pending_payment', 'cancelled')) OR
      (OLD.status NOT IN ('pending_payment', 'cancelled') AND NEW.status = 'cancelled') OR
      (OLD.coupon_code IS DISTINCT FROM NEW.coupon_code)
    ) THEN
      UPDATE public.coupons
      SET uses = (
        SELECT COUNT(*)
        FROM public.orders
        WHERE UPPER(TRIM(coupon_code)) = v_code
          AND status NOT IN ('pending_payment', 'cancelled')
      )
      WHERE UPPER(TRIM(code)) = v_code;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

-- 2. Bind trigger to public.orders
DROP TRIGGER IF EXISTS trg_sync_order_coupon_uses ON public.orders;
CREATE TRIGGER trg_sync_order_coupon_uses
AFTER INSERT OR UPDATE OF status, coupon_code ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.handle_order_coupon_usage_sync();

-- 3. Ensure check_coupon_used_by_customer ignores pending_payment and cancelled orders
CREATE OR REPLACE FUNCTION public.check_coupon_used_by_customer(
  p_coupon_code text,
  p_phone text,
  p_email text DEFAULT NULL::text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_coupon text;
  v_clean_phone text;
  v_clean_email text;
  v_phone_digits text;
  v_coupon_record record;
  v_eligible_record record;
  v_used_count integer := 0;
  v_max_allowed integer := 1;
BEGIN
  IF p_coupon_code IS NULL OR TRIM(p_coupon_code) = '' THEN
    RETURN false;
  END IF;

  v_coupon := UPPER(TRIM(p_coupon_code));
  v_clean_phone := NULLIF(TRIM(p_phone), '');
  v_clean_email := NULLIF(LOWER(TRIM(p_email)), '');

  IF v_clean_phone IS NOT NULL THEN
    v_phone_digits := REGEXP_REPLACE(v_clean_phone, '\D', '', 'g');
  ELSE
    v_phone_digits := NULL;
  END IF;

  -- If neither phone nor email provided, return false
  IF v_clean_phone IS NULL AND v_clean_email IS NULL THEN
    RETURN false;
  END IF;

  -- Fetch coupon details
  SELECT id, code, is_restricted, max_uses_per_customer
  INTO v_coupon_record
  FROM public.coupons
  WHERE UPPER(TRIM(code)) = v_coupon;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- If coupon is restricted, check if customer is in coupon_eligible_customers
  IF v_coupon_record.is_restricted = true THEN
    SELECT *
    INTO v_eligible_record
    FROM public.coupon_eligible_customers
    WHERE coupon_id = v_coupon_record.id
      AND (
        (v_phone_digits IS NOT NULL AND LENGTH(v_phone_digits) >= 10 AND (
          RIGHT(REGEXP_REPLACE(COALESCE(customer_phone, ''), '\D', '', 'g'), 10) = RIGHT(v_phone_digits, 10)
        ))
        OR
        (v_clean_email IS NOT NULL AND LOWER(TRIM(COALESCE(customer_email, ''))) = v_clean_email)
      )
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Coupon % is valid only for eligible customers.', v_coupon;
    END IF;

    v_max_allowed := COALESCE(v_eligible_record.max_uses, v_coupon_record.max_uses_per_customer, 1);
  ELSE
    v_max_allowed := COALESCE(v_coupon_record.max_uses_per_customer, 1);
  END IF;

  -- Count ONLY completed/paid orders (ignore cancelled and pending_payment attempts)
  SELECT COUNT(*)
  INTO v_used_count
  FROM public.orders
  WHERE UPPER(TRIM(coupon_code)) = v_coupon
    AND status NOT IN ('cancelled', 'pending_payment')
    AND (
      (v_phone_digits IS NOT NULL AND LENGTH(v_phone_digits) >= 10 AND (
        RIGHT(REGEXP_REPLACE(customer_phone, '\D', '', 'g'), 10) = RIGHT(v_phone_digits, 10)
      ))
      OR
      (v_clean_phone IS NOT NULL AND customer_phone = v_clean_phone)
      OR
      (v_clean_email IS NOT NULL AND LOWER(TRIM(customer_email)) = v_clean_email)
    );

  RETURN (v_used_count >= v_max_allowed);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.check_coupon_used_by_customer(text, text, text) TO anon, authenticated, service_role;

-- 4. Recalculate and synchronize all coupons.uses based purely on actual paid orders
UPDATE public.coupons c
SET uses = (
  SELECT COUNT(*)
  FROM public.orders o
  WHERE UPPER(TRIM(o.coupon_code)) = UPPER(TRIM(c.code))
    AND o.status NOT IN ('pending_payment', 'cancelled')
);
