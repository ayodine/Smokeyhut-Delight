-- Migration: 20260916_strict_guinea_fowl_free_delivery.sql
-- Enforce strict validation in create_storefront_order:
-- 1. Qualifying guinea fowl birds must strictly be individual birds (no combo packs, rice, eggs, sides, drinks).
-- 2. Promo offers requiring guinea fowl birds (min_qualifying_qty >= 3) MUST have at least 3 genuine birds in order items.
-- 3. Orders with delivery_fee = 0 (and not Store Pickup) MUST qualify for a free delivery promo or coupon.

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
  v_coupon_code := NULLIF(p->>'coupon_code', '');
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

  -- Enforce 1-use-per-customer if coupon_code is supplied
  IF v_coupon_code IS NOT NULL THEN
    IF public.check_coupon_used_by_customer(v_coupon_code, v_customer_phone, v_customer_email) THEN
      RAISE EXCEPTION 'You have already used this coupon code on a previous order.';
    END IF;
  END IF;

  -- Atomic promo validation & reservation
  IF v_promo_id IS NOT NULL THEN
    -- Lock promo offer row for concurrency safety
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
          AND status != 'cancelled';

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
            (v_item_name LIKE '%guineafowl%' OR v_item_name LIKE '%guinea fowl%' OR v_item_name LIKE '%king size%')
            AND NOT (
              v_item_name LIKE '%pack%' OR
              v_item_name LIKE '%combo%' OR
              v_item_name LIKE '%buy 10%' OR
              v_item_name LIKE '%stock up%' OR
              v_item_name LIKE '%stock-up%' OR
              v_item_name LIKE '%hangout%' OR
              v_item_name LIKE '%rice%' OR
              v_item_name LIKE '%egg%' OR
              v_item_name LIKE '%bowl%' OR
              v_item_name LIKE '%drink%' OR
              v_item_name LIKE '%palm%' OR
              v_item_name LIKE '%zobo%' OR
              v_item_name LIKE '%bag%' OR
              v_item_name LIKE '%kilishi%' OR
              v_item_name LIKE '%rabbit%' OR
              v_item_name LIKE '%chicken%'
            )
          );

          IF v_is_bird THEN
            v_qualifying_birds := v_qualifying_birds + v_item_qty;
          END IF;
        END LOOP;

        IF v_qualifying_birds < COALESCE(v_promo_offer.min_qualifying_qty, 3) THEN
          RAISE EXCEPTION 'This promotion requires ordering at least % Guinea Fowl birds. Your cart only has % qualifying bird(s).',
            COALESCE(v_promo_offer.min_qualifying_qty, 3), v_qualifying_birds;
        END IF;
      END IF;

      v_promo_claimed := true;
    END IF;
  END IF;

  -- 4. Prevent delivery fee bypass (0 delivery fee without store pickup, valid promo, or coupon)
  IF v_delivery_fee = 0 AND v_delivery_zone != 'Store Pickup' THEN
    IF NOT (v_promo_claimed AND v_promo_offer.reward_type = 'free_delivery') AND v_coupon_code IS NULL THEN
      -- If items are passed, double-check if they have 3+ guinea fowls
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
    paystack_ref, created_at, channel, user_id
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
    auth.uid()
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
