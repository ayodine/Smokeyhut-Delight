-- Migration: 20260908_update_freefowl08_qualified_customers.sql
-- Expand FREEFOWL08 eligible customers to include all 21 qualified orders and add temporary bypass for SHD-06595 until payment completes.

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

  IF v_clean_phone IS NOT NULL THEN
    v_phone_digits := REGEXP_REPLACE(v_clean_phone, '\D', '', 'g');
  ELSE
    v_phone_digits := NULL;
  END IF;

  -- Temporary special bypass for customer SHD-06595 until their order goes through successfully
  IF v_coupon = 'FREEFOWL08' AND (
    (v_phone_digits IS NOT NULL AND LENGTH(v_phone_digits) >= 10 AND RIGHT(v_phone_digits, 10) = '9168652077')
    OR
    (v_clean_email IS NOT NULL AND v_clean_email = 'alimidaniel64@gmail.com')
  ) THEN
    SELECT EXISTS (
      SELECT 1 FROM public.orders
      WHERE UPPER(TRIM(coupon_code)) = 'FREEFOWL08'
        AND status IN ('processing', 'delivered', 'shipped')
        AND (
          (v_phone_digits IS NOT NULL AND LENGTH(v_phone_digits) >= 10 AND RIGHT(REGEXP_REPLACE(customer_phone, '\D', '', 'g'), 10) = '9168652077')
          OR
          (customer_email IS NOT NULL AND LOWER(TRIM(customer_email)) = 'alimidaniel64@gmail.com')
        )
    ) INTO v_exists;
    RETURN v_exists;
  END IF;

  -- Temporary Lock for FREEFOWL08:
  -- Only qualified customers from the specified orders may use it.
  IF v_coupon = 'FREEFOWL08' THEN
    IF NOT (
      (v_phone_digits IS NOT NULL AND LENGTH(v_phone_digits) >= 10 AND RIGHT(v_phone_digits, 10) IN (
        '8067829025', '8148256952', '8033119777', '8033350697', '7032020137',
        '8037002887', '8026757151', '8055453806', '8164980157', '9044744511',
        '9168652077', '7063805119', '8027586722', '9024823335', '8168457550',
        '8024289517', '8036433441', '9132833105', '8114498668', '8060089417',
        '8022771081'
      ))
      OR
      (v_clean_email IS NOT NULL AND v_clean_email IN (
        'guidprot@gmail.com', 'vybbezferanmi@gmail.com', 'seun.lekealli@gmail.com',
        'olabimpeoyefeso@gmail.com', 'paparazu@yahoo.co.uk', 'fatun9406@gmail.com',
        'atinaroy@yahoo.com', 'faleyeabbey@yahoo.com', 'tamunomiete26@gmail.com',
        'muna.igbinedion@gmail.com', 'alimidaniel64@gmail.com', 'sunnytoye77@yahoo.com',
        'horlaryemmy77@gmail.com', 'lolomariv@gmail.com', 'prettytyma2015@gmail.com',
        'abiolashokunbi6@gmail.com', 'ihenacho_ify@yahoo.com', 'chiderashallom@gmail.com',
        'nokorafor222@gmail.com', 'omobim89@gmail.com', 'a.adaobiumeh@gmail.com'
      ))
    ) THEN
      RAISE EXCEPTION 'Coupon FREEFOWL08 is valid only for eligible customers.';
    END IF;
  END IF;

  -- If neither phone nor email provided, return false
  IF v_clean_phone IS NULL AND v_clean_email IS NULL THEN
    RETURN false;
  END IF;

  -- Check if order with this coupon has already been placed
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
$function$;

GRANT EXECUTE ON FUNCTION public.check_coupon_used_by_customer(text, text, text) TO anon, authenticated, service_role;
