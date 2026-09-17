-- Migration: 20260917_allow_packs_in_free_delivery_rpc.sql
-- Updates create_storefront_order to include multi-bird Guinea Fowl packs in qualifying bird calculations:
-- Party Pack: 10 birds
-- Buy 10 Get 11: 11 birds
-- Stock Up Pack: 5 birds
-- Hangout Pack / Triple Delight: 3 birds
-- Single birds: 1 bird

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

  -- Calculate total qualifying Guinea Fowl birds in the cart (individual whole birds + qualifying packs)
  IF v_items IS NOT NULL AND jsonb_typeof(v_items) = 'array' THEN
    v_qualifying_birds := 0;
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
    LOOP
      v_item_name := lower(COALESCE(v_item->>'name', ''));
      v_item_qty := COALESCE((v_item->>'qty')::int, 1);

      -- 1. Exclude non-bird items: rice, eggs, drinks, sides, rabbits, chicken, kilishi, bags
      IF (
        v_item_name LIKE '%rice%'
        OR v_item_name LIKE '%egg%'
        OR v_item_name LIKE '%chips%'
        OR v_item_name LIKE '%sauce%'
        OR v_item_name LIKE '%coleslaw%'
        OR v_item_name LIKE '%drink%'
        OR v_item_name LIKE '%palm wine%'
        OR v_item_name LIKE '%palmwine%'
        OR v_item_name LIKE '%zobo%'
        OR v_item_name LIKE '%bag%'
        OR v_item_name LIKE '%kilishi%'
        OR v_item_name LIKE '%rabbit%'
        OR (v_item_name LIKE '%chicken%' AND v_item_name NOT LIKE '%guinea%')
      ) THEN
        NULL; -- non-bird, adds 0
      -- 2. Multi-bird packs containing >= 3 Guinea Fowls
      ELSIF v_item_name LIKE '%buy 10%' OR v_item_name LIKE '%11 bird%' THEN
        v_qualifying_birds := v_qualifying_birds + (11 * v_item_qty);
      ELSIF v_item_name LIKE '%party pack%' OR v_item_name LIKE '%10 bird%' OR v_item_name LIKE '%10-pack%' OR v_item_name LIKE '%10 pack%' THEN
        v_qualifying_birds := v_qualifying_birds + (10 * v_item_qty);
      ELSIF v_item_name LIKE '%stock up%' OR v_item_name LIKE '%stock-up%' OR v_item_name LIKE '%5 bird%' OR v_item_name LIKE '%5-pack%' OR v_item_name LIKE '%5 pack%' THEN
        v_qualifying_birds := v_qualifying_birds + (5 * v_item_qty);
      ELSIF v_item_name LIKE '%hangout%' OR v_item_name LIKE '%triple delight%' OR v_item_name LIKE '%3 bird%' OR v_item_name LIKE '%3-pack%' OR v_item_name LIKE '%3 pack%' THEN
        v_qualifying_birds := v_qualifying_birds + (3 * v_item_qty);
      -- 3. Individual whole Guinea Fowl bird
      ELSIF (v_item_name LIKE '%guinea%' OR v_item_name LIKE '%guineafowl%' OR v_item_name LIKE '%fowl%' OR v_item_name LIKE '%king size%') THEN
        v_qualifying_birds := v_qualifying_birds + (1 * v_item_qty);
      END IF;
    END LOOP;
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

      -- 3. Item validation if qualifying_type = 'guinea_fowl_birds'
      IF v_promo_offer.qualifying_type = 'guinea_fowl_birds' THEN
        IF v_qualifying_birds < COALESCE(v_promo_offer.min_qualifying_qty, 3) THEN
          RAISE EXCEPTION 'This promo requires at least % Guinea Fowls (found %). Non-bird items do not count toward this promo.',
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

GRANT EXECUTE ON FUNCTION public.create_storefront_order(jsonb) TO anon, authenticated, service_role;
