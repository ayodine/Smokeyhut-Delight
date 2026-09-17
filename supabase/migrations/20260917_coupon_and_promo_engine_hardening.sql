-- Migration: 20260917_coupon_and_promo_engine_hardening.sql
-- Comprehensive hardening for Coupons and Promo Offers:
-- 1. Adds complete server-side coupon validation (active, unexpired, usage limit, min order amount) to create_storefront_order.
-- 2. Makes promo reservation resilient against abandoned Paystack checkouts (30-min active reservation TTL).
-- 3. Automatically synchronizes promo_redemptions status when order status changes (paid -> completed, cancelled -> cancelled).

-- ── 1. Function to sync promo redemption status with order status ──
CREATE OR REPLACE FUNCTION public.handle_order_promo_status_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('paid', 'delivered', 'processing') THEN
    UPDATE public.promo_redemptions
    SET status = 'completed'
    WHERE order_id = NEW.id AND status = 'reserved';
  ELSIF NEW.status = 'cancelled' THEN
    UPDATE public.promo_redemptions
    SET status = 'cancelled'
    WHERE order_id = NEW.id AND status != 'cancelled';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_order_promo_status ON public.orders;
CREATE TRIGGER trg_sync_order_promo_status
  AFTER INSERT OR UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_order_promo_status_sync();

-- ── 2. Update check_customer_claimed_promo_today ──
CREATE OR REPLACE FUNCTION public.check_customer_claimed_promo_today(
  p_promo_id uuid,
  p_phone text,
  p_email text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date;
  v_clean_phone text;
  v_clean_email text;
  v_phone_digits text;
  v_limit int := 1;
  v_claim_count int := 0;
BEGIN
  IF p_promo_id IS NULL THEN
    RETURN false;
  END IF;

  v_today := (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Lagos')::date;
  v_clean_phone := NULLIF(TRIM(p_phone), '');
  v_clean_email := NULLIF(LOWER(TRIM(p_email)), '');

  IF v_clean_phone IS NOT NULL THEN
    v_phone_digits := REGEXP_REPLACE(v_clean_phone, '\D', '', 'g');
  ELSE
    v_phone_digits := NULL;
  END IF;

  IF v_clean_phone IS NULL AND v_clean_email IS NULL THEN
    RETURN false;
  END IF;

  SELECT per_customer_daily_limit INTO v_limit 
  FROM public.promo_offers 
  WHERE id = p_promo_id;

  v_limit := COALESCE(v_limit, 1);

  SELECT count(*) INTO v_claim_count
  FROM public.promo_redemptions pr
  WHERE pr.promo_id = p_promo_id
    AND pr.redemption_date = v_today
    AND (
      pr.status = 'completed'
      OR (
        pr.status = 'reserved'
        AND pr.created_at > (now() - interval '30 minutes')
        AND COALESCE((SELECT o.status FROM public.orders o WHERE o.id = pr.order_id), '') NOT IN ('cancelled')
      )
    )
    AND (
      (v_phone_digits IS NOT NULL AND LENGTH(v_phone_digits) >= 10 AND (
        RIGHT(REGEXP_REPLACE(pr.customer_phone, '\D', '', 'g'), 10) = RIGHT(v_phone_digits, 10)
      ))
      OR
      (v_clean_phone IS NOT NULL AND pr.customer_phone = v_clean_phone)
      OR
      (v_clean_email IS NOT NULL AND LOWER(TRIM(pr.customer_email)) = v_clean_email)
    );

  RETURN v_claim_count >= v_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_customer_claimed_promo_today(uuid, text, text) TO anon, authenticated, service_role;

-- ── 3. Update get_active_promo_offers with accurate claimed count ──
CREATE OR REPLACE FUNCTION public.get_active_promo_offers()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date;
  v_dow int;
  v_result jsonb;
BEGIN
  v_today := (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Lagos')::date;
  v_dow := EXTRACT(DOW FROM (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Lagos'))::int;

  WITH active_offers AS (
    SELECT 
      po.*,
      COALESCE(
        (
          SELECT count(*)::int
          FROM public.promo_redemptions pr
          WHERE pr.promo_id = po.id
            AND pr.redemption_date = v_today
            AND (
              pr.status = 'completed'
              OR (
                pr.status = 'reserved'
                AND pr.created_at > (now() - interval '30 minutes')
                AND COALESCE((SELECT o.status FROM public.orders o WHERE o.id = pr.order_id), '') NOT IN ('cancelled')
              )
            )
        ),
        0
      ) AS claimed_today
    FROM public.promo_offers po
    WHERE po.is_active = true
      AND (po.start_date IS NULL OR po.start_date <= v_today)
      AND (po.end_date IS NULL OR po.end_date >= v_today)
      AND (po.active_days IS NULL OR v_dow = ANY(po.active_days))
    ORDER BY po.priority DESC, po.created_at ASC
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id,
      'title', title,
      'description', description,
      'badge_text', badge_text,
      'banner_message', banner_message,
      'offer_type', offer_type,
      'qualifying_type', qualifying_type,
      'qualifying_product_ids', qualifying_product_ids,
      'qualifying_category_id', qualifying_category_id,
      'min_qualifying_qty', min_qualifying_qty,
      'min_order_amount', min_order_amount,
      'reward_type', reward_type,
      'reward_product_id', reward_product_id,
      'reward_product_name', reward_product_name,
      'reward_qty', reward_qty,
      'reward_discount_value', reward_discount_value,
      'daily_quota', daily_quota,
      'claimed_today', claimed_today,
      'remaining_today', CASE 
        WHEN daily_quota IS NULL THEN 999999
        ELSE GREATEST(0, daily_quota - claimed_today)
      END,
      'per_customer_daily_limit', per_customer_daily_limit,
      'auto_apply', auto_apply,
      'promo_code', promo_code,
      'start_date', start_date,
      'end_date', end_date,
      'active_days', active_days,
      'today_date', v_today
    )
  ) INTO v_result
  FROM active_offers;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_promo_offers() TO anon, authenticated, service_role;

-- ── 4. Update create_storefront_order with complete coupon & promo validation ──
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
  v_coupon_rec record;
  v_customer_phone text;
  v_customer_email text;
  v_customer_name text;
  v_promo_id uuid;
  v_promo_offer public.promo_offers%ROWTYPE;
  v_today date;
  v_claimed_today int;
  v_has_claimed boolean;
  v_promo_claimed boolean := false;
  v_delivery_fee numeric;
  v_delivery_zone text;
  v_items jsonb;
  v_item jsonb;
  v_item_name text;
  v_item_qty int;
  v_qualifying_birds int := 0;
  v_is_bird boolean;
BEGIN
  v_status := COALESCE(NULLIF(p->>'status', ''), 'pending');
  v_session_id := NULLIF(p->>'session_id', '');
  v_coupon_code := NULLIF(UPPER(TRIM(p->>'coupon_code')), '');
  v_customer_phone := NULLIF(p->>'customer_phone', '');
  v_customer_email := NULLIF(p->>'customer_email', '');
  v_customer_name := NULLIF(p->>'customer_name', '');
  v_delivery_fee := COALESCE((p->>'delivery_fee')::numeric, 0);
  v_delivery_zone := COALESCE(p->>'delivery_zone', '');
  v_today := (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Lagos')::date;
  v_items := p->'items';

  IF (p->>'promo_id') IS NOT NULL AND (p->>'promo_id') != '' THEN
    BEGIN
      v_promo_id := (p->>'promo_id')::uuid;
    EXCEPTION WHEN OTHERS THEN
      v_promo_id := NULL;
    END;
  END IF;

  -- ── Comprehensive Coupon Validation ──
  IF v_coupon_code IS NOT NULL THEN
    SELECT * INTO v_coupon_rec
    FROM public.coupons
    WHERE UPPER(TRIM(code)) = v_coupon_code;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Coupon code % is invalid or does not exist.', v_coupon_code;
    END IF;

    IF v_coupon_rec.is_active != true THEN
      RAISE EXCEPTION 'Coupon code % is currently inactive.', v_coupon_code;
    END IF;

    IF v_coupon_rec.expires_at IS NOT NULL AND v_coupon_rec.expires_at < CURRENT_TIMESTAMP THEN
      RAISE EXCEPTION 'Coupon code % has expired.', v_coupon_code;
    END IF;

    IF v_coupon_rec.max_uses IS NOT NULL AND v_coupon_rec.uses >= v_coupon_rec.max_uses THEN
      RAISE EXCEPTION 'Coupon code % has reached its maximum usage limit.', v_coupon_code;
    END IF;

    IF v_coupon_rec.min_order_amount IS NOT NULL AND (p->>'total')::numeric < v_coupon_rec.min_order_amount THEN
      RAISE EXCEPTION 'Minimum order amount of ₦% required for coupon %.', v_coupon_rec.min_order_amount, v_coupon_code;
    END IF;

    -- Enforce 1-use-per-customer and whitelist restriction
    IF public.check_coupon_used_by_customer(v_coupon_code, v_customer_phone, v_customer_email) THEN
      RAISE EXCEPTION 'You have already used this coupon code on a previous order.';
    END IF;
  END IF;

  -- ── Atomic Promo Validation & Reservation ──
  IF v_promo_id IS NOT NULL THEN
    SELECT * INTO v_promo_offer
    FROM public.promo_offers
    WHERE id = v_promo_id AND is_active = true
    FOR UPDATE;

    IF FOUND THEN
      -- 1. Check customer daily limit
      v_has_claimed := public.check_customer_claimed_promo_today(v_promo_id, v_customer_phone, v_customer_email);
      IF v_has_claimed THEN
        RAISE EXCEPTION 'You have already claimed this daily promotion today.';
      END IF;

      -- 2. Check daily quota
      IF v_promo_offer.daily_quota IS NOT NULL THEN
        SELECT count(*) INTO v_claimed_today
        FROM public.promo_redemptions
        WHERE promo_id = v_promo_id
          AND redemption_date = v_today
          AND (
            status = 'completed'
            OR (
              status = 'reserved'
              AND created_at > (now() - interval '30 minutes')
              AND COALESCE((SELECT o.status FROM public.orders o WHERE o.id = promo_redemptions.order_id), '') NOT IN ('cancelled')
            )
          );

        IF v_claimed_today >= v_promo_offer.daily_quota THEN
          RAISE EXCEPTION 'Today''s promo slots for % have already been fully claimed (% of % limit).', 
            v_promo_offer.title, v_claimed_today, v_promo_offer.daily_quota;
        END IF;
      END IF;

      -- 3. Strict item validation if qualifying_type = 'guinea_fowl_birds'
      IF v_promo_offer.qualifying_type = 'guinea_fowl_birds' AND v_items IS NOT NULL AND jsonb_typeof(v_items) = 'array' THEN
        v_qualifying_birds := 0;
        FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
        LOOP
          v_item_name := lower(COALESCE(v_item->>'name', ''));
          v_item_qty := COALESCE((v_item->>'qty')::int, 1);

          -- Exclude combo packs, rice, eggs, drinks, sides, chicken, rabbit
          v_is_bird := (
            (v_item_name LIKE '%guinea%' OR v_item_name LIKE '%guineafowl%' OR v_item_name LIKE '%fowl%')
            AND v_item_name NOT LIKE '%pack%'
            AND v_item_name NOT LIKE '%rice%'
            AND v_item_name NOT LIKE '%egg%'
            AND v_item_name NOT LIKE '%chips%'
            AND v_item_name NOT LIKE '%sauce%'
            AND v_item_name NOT LIKE '%coleslaw%'
            AND v_item_name NOT LIKE '%drink%'
            AND v_item_name NOT LIKE '%combo%'
          );

          IF v_is_bird THEN
            v_qualifying_birds := v_qualifying_birds + v_item_qty;
          END IF;
        END LOOP;

        IF v_qualifying_birds < COALESCE(v_promo_offer.min_qualifying_qty, 3) THEN
          RAISE EXCEPTION 'This promo requires at least % individual Guinea Fowls (found %). Combo packs and side items do not count toward this promo.',
            COALESCE(v_promo_offer.min_qualifying_qty, 3), v_qualifying_birds;
        END IF;
      END IF;

      -- 4. Minimum order amount check if configured
      IF v_promo_offer.min_order_amount IS NOT NULL AND v_promo_offer.min_order_amount > 0 THEN
        IF (p->>'total')::numeric < v_promo_offer.min_order_amount THEN
          RAISE EXCEPTION 'Minimum order amount of ₦% required for this promo.', v_promo_offer.min_order_amount;
        END IF;
      END IF;

      v_promo_claimed := true;
    END IF;
  END IF;

  -- ── Prevent Delivery Fee Bypass ──
  IF v_delivery_fee = 0 AND v_delivery_zone != 'Store Pickup' THEN
    IF NOT (v_promo_claimed AND v_promo_offer.reward_type = 'free_delivery') AND v_coupon_code IS NULL THEN
      IF v_qualifying_birds < 3 THEN
        RAISE EXCEPTION 'Free delivery requires ordering at least 3 Guinea Fowls or selecting Store Pickup.';
      END IF;
    END IF;
  END IF;

  INSERT INTO public.orders (
    customer_name, customer_email, customer_phone,
    delivery_address, delivery_zone, store_id,
    payment_method, total, delivery_fee,
    coupon_code, coupon_discount, status, notes,
    paystack_ref, created_at, channel, user_id,
    traffic_source, utm_source, utm_medium, utm_campaign, ad_click_id
  ) VALUES (
    v_customer_name,
    v_customer_email,
    v_customer_phone,
    p->>'delivery_address',
    NULLIF(p->>'delivery_zone', ''),
    CASE WHEN (p->>'store_id') IS NOT NULL THEN (p->>'store_id')::bigint ELSE NULL END,
    p->>'payment_method',
    (p->>'total')::numeric,
    v_delivery_fee,
    v_coupon_code,
    COALESCE((p->>'coupon_discount')::numeric, 0),
    v_status,
    NULLIF(p->>'notes', ''),
    NULLIF(p->>'paystack_ref', ''),
    now(),
    'storefront',
    auth.uid(),
    NULLIF(p->>'traffic_source', ''),
    NULLIF(p->>'utm_source', ''),
    NULLIF(p->>'utm_medium', ''),
    NULLIF(p->>'utm_campaign', ''),
    NULLIF(p->>'ad_click_id', '')
  )
  RETURNING id INTO v_id;

  -- Record promo redemption if promo was claimed
  IF v_promo_claimed AND v_promo_offer.id IS NOT NULL THEN
    INSERT INTO public.promo_redemptions (
      promo_id, order_id, customer_phone, customer_email,
      customer_name, user_id, redemption_date, status,
      reward_details
    ) VALUES (
      v_promo_offer.id,
      v_id,
      v_customer_phone,
      v_customer_email,
      v_customer_name,
      auth.uid(),
      v_today,
      CASE WHEN v_status = 'pending_payment' THEN 'reserved' ELSE 'completed' END,
      jsonb_build_object(
        'reward_type', v_promo_offer.reward_type,
        'reward_product_id', v_promo_offer.reward_product_id,
        'reward_product_name', v_promo_offer.reward_product_name,
        'reward_qty', v_promo_offer.reward_qty,
        'reward_discount_value', v_promo_offer.reward_discount_value
      )
    );
  END IF;

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
