-- Migration: 20261030_storefront_scheduled_delivery.sql
-- Enables storefront scheduled delivery orders by capturing scheduled_delivery_date and delivery_status in create_storefront_order

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

  -- ── 1. Product Availability & Active Status Validation ──
  IF v_items IS NOT NULL AND jsonb_typeof(v_items) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
    LOOP
      IF (v_item->>'id') IS NOT NULL 
         AND (v_item->>'id') != '' 
         AND COALESCE(v_item->>'is_promo_reward', 'false') != 'true' THEN
        DECLARE
          v_prod_id bigint;
          v_prod_rec record;
        BEGIN
          v_prod_id := (v_item->>'id')::bigint;
          SELECT id, name, is_active, deleted_at INTO v_prod_rec
          FROM public.products
          WHERE id = v_prod_id;

          IF NOT FOUND OR v_prod_rec.deleted_at IS NOT NULL THEN
            RAISE EXCEPTION 'Product "%" is no longer available.', COALESCE(v_item->>'name', 'Item');
          END IF;

          IF v_prod_rec.is_active = false THEN
            RAISE EXCEPTION 'Product "%" is currently out of stock / hidden and cannot be ordered.', COALESCE(v_prod_rec.name, v_item->>'name', 'Item');
          END IF;
        EXCEPTION 
          WHEN invalid_text_representation THEN
            NULL;
        END;
      END IF;
    END LOOP;
  END IF;

  IF (p->>'promo_id') IS NOT NULL AND (p->>'promo_id') != '' THEN
    BEGIN
      v_promo_id := (p->>'promo_id')::uuid;
    EXCEPTION WHEN OTHERS THEN
      v_promo_id := NULL;
    END;
  END IF;

  -- Calculate total qualifying Guinea Fowl birds in the cart
  IF v_items IS NOT NULL AND jsonb_typeof(v_items) = 'array' THEN
    v_qualifying_birds := 0;
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
    LOOP
      v_item_name := lower(COALESCE(v_item->>'name', ''));
      v_item_qty := COALESCE((v_item->>'qty')::int, 1);

      IF (
        v_item_name LIKE '%rice%'
        OR v_item_name LIKE '%egg%'
        OR v_item_name LIKE '%chips%'
        OR v_item_name LIKE '%sauce%'
        OR v_item_name LIKE '%coleslaw%'
        OR v_item_name LIKE '%bread%'
        OR v_item_name LIKE '%drink%'
        OR v_item_name LIKE '%water%'
        OR v_item_name LIKE '%juice%'
        OR v_item_name LIKE '%rabbit%'
        OR v_item_name LIKE '%chicken%'
        OR v_item_name LIKE '%kilishi%'
        OR v_item_name LIKE '%bag%'
        OR v_item_name LIKE '%package%'
        OR v_item_name LIKE '%gizzard%'
        OR v_item_name LIKE '%wing%'
      ) THEN
        CONTINUE;
      END IF;

      IF v_item_name LIKE '%2-bird%' OR v_item_name LIKE '%2 bird%' OR v_item_name LIKE '%two bird%' OR v_item_name LIKE '%duo%' OR v_item_name LIKE '%pair%' THEN
        v_qualifying_birds := v_qualifying_birds + (2 * v_item_qty);
      ELSIF v_item_name LIKE '%3-bird%' OR v_item_name LIKE '%3 bird%' OR v_item_name LIKE '%three bird%' OR v_item_name LIKE '%trio%' THEN
        v_qualifying_birds := v_qualifying_birds + (3 * v_item_qty);
      ELSIF v_item_name LIKE '%4-bird%' OR v_item_name LIKE '%4 bird%' OR v_item_name LIKE '%four bird%' OR v_item_name LIKE '%quad%' THEN
        v_qualifying_birds := v_qualifying_birds + (4 * v_item_qty);
      ELSIF v_item_name LIKE '%5-bird%' OR v_item_name LIKE '%5 bird%' OR v_item_name LIKE '%five bird%' OR v_item_name LIKE '%family pack%' OR v_item_name LIKE '%party pack%' OR v_item_name LIKE '%feast%' THEN
        v_qualifying_birds := v_qualifying_birds + (5 * v_item_qty);
      ELSIF v_item_name LIKE '%guinea%' OR v_item_name LIKE '%fowl%' OR v_item_name LIKE '%bird%' THEN
        v_qualifying_birds := v_qualifying_birds + v_item_qty;
      END IF;
    END LOOP;
  END IF;

  -- ── 2. Comprehensive Coupon Validation ──
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

    IF v_coupon_rec.expires_at IS NOT NULL AND v_coupon_rec.expires_at < now() THEN
      RAISE EXCEPTION 'Coupon code % has expired.', v_coupon_code;
    END IF;

    IF v_coupon_rec.usage_limit IS NOT NULL AND v_coupon_rec.times_used >= v_coupon_rec.usage_limit THEN
      RAISE EXCEPTION 'Coupon code % has reached its maximum usage limit.', v_coupon_code;
    END IF;

    IF v_coupon_rec.min_order_amount IS NOT NULL AND (p->>'total')::numeric < v_coupon_rec.min_order_amount THEN
      RAISE EXCEPTION 'Order total of ₦% does not meet the minimum requirement of ₦% for coupon %.',
        (p->>'total')::numeric, v_coupon_rec.min_order_amount, v_coupon_code;
    END IF;

    IF v_coupon_rec.type = 'free_delivery' AND v_delivery_zone = 'Store Pickup' THEN
      RAISE EXCEPTION 'Free delivery coupon cannot be used on pickup orders.';
    END IF;

    IF v_coupon_rec.type = 'free_delivery' AND v_qualifying_birds < 3 THEN
      RAISE EXCEPTION 'Free delivery coupon requires ordering at least 3 Guinea Fowls.';
    END IF;

    IF v_coupon_rec.is_restricted = true THEN
      DECLARE
        v_phone_clean text := regexp_replace(COALESCE(v_customer_phone, ''), '\D', '', 'g');
        v_phone_tail text := CASE WHEN length(v_phone_clean) >= 10 THEN right(v_phone_clean, 10) ELSE v_phone_clean END;
        v_email_clean text := lower(trim(COALESCE(v_customer_email, '')));
        v_cust_exists boolean := false;
      BEGIN
        SELECT EXISTS (
          SELECT 1 FROM jsonb_array_elements(COALESCE(v_coupon_rec.allowed_customers, '[]'::jsonb)) AS c
          WHERE (
            v_phone_tail != '' AND length(v_phone_tail) >= 10 AND 
            right(regexp_replace(COALESCE(c->>'phone', ''), '\D', '', 'g'), 10) = v_phone_tail
          ) OR (
            v_email_clean != '' AND 
            lower(trim(COALESCE(c->>'email', ''))) = v_email_clean
          )
        ) INTO v_cust_exists;

        IF NOT v_cust_exists THEN
          RAISE EXCEPTION 'This exclusive coupon (%) is reserved for specific customers.', v_coupon_code;
        END IF;
      END;
    END IF;

    IF v_status != 'pending_payment' THEN
      UPDATE public.coupons
      SET times_used = times_used + 1
      WHERE id = v_coupon_rec.id;
    END IF;
  END IF;

  -- ── 3. Strict Promo Offer Validation ──
  IF v_promo_id IS NOT NULL THEN
    SELECT * INTO v_promo_offer
    FROM public.promo_offers
    WHERE id = v_promo_id AND is_active = true;

    IF FOUND THEN
      IF (v_promo_offer.start_date IS NULL OR v_promo_offer.start_date <= v_today) AND
         (v_promo_offer.end_date IS NULL OR v_promo_offer.end_date >= v_today) THEN

        IF v_promo_offer.daily_total_limit IS NOT NULL THEN
          SELECT COUNT(*) INTO v_claimed_today
          FROM public.promo_redemptions
          WHERE promo_id = v_promo_id AND redemption_date = v_today;

          IF v_claimed_today >= v_promo_offer.daily_total_limit THEN
            RAISE EXCEPTION 'Today''s promo claim limit has been reached.';
          END IF;
        END IF;

        IF v_promo_offer.daily_user_limit IS NOT NULL AND v_customer_phone IS NOT NULL THEN
          SELECT EXISTS (
            SELECT 1 FROM public.promo_redemptions
            WHERE promo_id = v_promo_id
              AND redemption_date = v_today
              AND customer_phone = v_customer_phone
          ) INTO v_has_claimed;

          IF v_has_claimed THEN
            RAISE EXCEPTION 'You have already claimed this promotion today.';
          END IF;
        END IF;

        IF v_promo_offer.reward_type = 'free_delivery' AND v_delivery_zone = 'Store Pickup' THEN
          RAISE EXCEPTION 'Free delivery promo cannot be applied to Store Pickup.';
        END IF;

        IF v_promo_offer.reward_type = 'free_delivery' AND v_qualifying_birds < 3 THEN
          RAISE EXCEPTION 'Free delivery promo requires at least 3 Guinea Fowls.';
        END IF;

        v_promo_claimed := true;
      END IF;
    END IF;
  END IF;

  -- ── 4. Free Delivery Guard ──
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
    traffic_source, utm_source, utm_medium, utm_campaign, ad_click_id,
    scheduled_delivery_date, delivery_status
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
    NULLIF(p->>'ad_click_id', ''),
    NULLIF(p->>'scheduled_delivery_date', '')::date,
    NULLIF(p->>'delivery_status', '')
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

