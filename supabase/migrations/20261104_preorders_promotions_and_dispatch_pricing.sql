-- Migration: 20261104_preorders_promotions_and_dispatch_pricing.sql
-- Adds Product Pre-Order Management, Customer Delivery-Date Scheduling,
-- Homepage Pre-Order Promotions, and Dispatch-Capacity Pricing across
-- products, orders, order_items, and server-side RPCs.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. EXTEND public.products
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.products
  -- Pre-order configuration
  ADD COLUMN IF NOT EXISTS preorder_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS preorder_open_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS preorder_release_date date NULL,
  ADD COLUMN IF NOT EXISTS preorder_close_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS preorder_status text NOT NULL DEFAULT 'scheduled',
  ADD COLUMN IF NOT EXISTS preorder_scheduling_mode text NOT NULL DEFAULT 'schedule_after_release',
  ADD COLUMN IF NOT EXISTS preorder_max_capacity integer NULL,
  ADD COLUMN IF NOT EXISTS preorder_reserved_qty integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS preorder_message text NULL,

  -- Homepage promotion configuration
  ADD COLUMN IF NOT EXISTS homepage_promo_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS homepage_promo_headline text NULL,
  ADD COLUMN IF NOT EXISTS homepage_promo_description text NULL,
  ADD COLUMN IF NOT EXISTS homepage_promo_cta_label text NOT NULL DEFAULT 'Pre-order Now',
  ADD COLUMN IF NOT EXISTS homepage_promo_start_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS homepage_promo_end_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS homepage_promo_priority integer NOT NULL DEFAULT 0,

  -- Dispatch-capacity surcharge configuration
  ADD COLUMN IF NOT EXISTS dispatch_surcharge_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dispatch_threshold_qty integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS dispatch_threshold_unit text NOT NULL DEFAULT 'packs',
  ADD COLUMN IF NOT EXISTS dispatch_threshold_operator text NOT NULL DEFAULT 'gt',
  ADD COLUMN IF NOT EXISTS dispatch_fee_multiplier numeric NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS dispatch_fixed_surcharge numeric NULL,
  ADD COLUMN IF NOT EXISTS dispatch_aggregation_mode text NOT NULL DEFAULT 'per_item',
  ADD COLUMN IF NOT EXISTS dispatch_customer_message text NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. EXTEND public.orders & public.order_items
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS is_preorder boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS preorder_status text NULL,
  ADD COLUMN IF NOT EXISTS preorder_release_date date NULL,
  ADD COLUMN IF NOT EXISTS preorder_scheduling_mode text NULL,
  ADD COLUMN IF NOT EXISTS preorder_terms_snapshot jsonb NULL,
  ADD COLUMN IF NOT EXISTS scheduling_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS preorder_date_conflict_flagged boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS requires_dedicated_dispatch boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS base_delivery_fee numeric NULL,
  ADD COLUMN IF NOT EXISTS dispatch_surcharge_snapshot jsonb NULL;

CREATE INDEX IF NOT EXISTS idx_orders_is_preorder ON public.orders(is_preorder) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_orders_requires_dedicated_dispatch ON public.orders(requires_dedicated_dispatch) WHERE deleted_at IS NULL;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS is_preorder boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS preorder_release_date date NULL,
  ADD COLUMN IF NOT EXISTS preorder_snapshot jsonb NULL,
  ADD COLUMN IF NOT EXISTS dispatch_rule_snapshot jsonb NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. UPGRADE public.create_storefront_order(p jsonb)
-- ═══════════════════════════════════════════════════════════════════════════

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
  v_now timestamptz := now();
  v_claimed_today int;
  v_has_claimed boolean;
  v_promo_claimed boolean := false;
  v_delivery_fee numeric;
  v_base_delivery_fee numeric;
  v_delivery_zone text;
  v_items jsonb;
  v_item jsonb;
  v_item_name text;
  v_item_qty int;
  v_qualifying_birds int := 0;

  -- Pre-order & Dispatch-capacity variables
  v_is_preorder boolean := false;
  v_latest_release_date date := NULL;
  v_effective_scheduling_mode text := 'schedule_after_release';
  v_scheduled_delivery_date date := NULLIF(p->>'scheduled_delivery_date', '')::date;
  v_delivery_status text := NULLIF(p->>'delivery_status', '');
  v_preorder_status text := NULL;
  v_preorder_items_snapshot jsonb := '[]'::jsonb;
  v_scheduling_history jsonb := '[]'::jsonb;

  v_requires_dedicated_dispatch boolean := false;
  v_max_dispatch_multiplier numeric := 1;
  v_total_fixed_surcharge numeric := 0;
  v_dispatch_message text := NULL;
  v_dispatch_trigger_items jsonb := '[]'::jsonb;
  v_combined_compatible_qty int := 0;
  v_combined_rule_prod record;
  v_has_combined_rule boolean := false;
BEGIN
  v_status := COALESCE(NULLIF(p->>'status', ''), 'pending');
  v_session_id := NULLIF(p->>'session_id', '');
  v_coupon_code := NULLIF(UPPER(TRIM(p->>'coupon_code')), '');
  v_customer_phone := NULLIF(p->>'customer_phone', '');
  v_customer_email := NULLIF(p->>'customer_email', '');
  v_customer_name := NULLIF(p->>'customer_name', '');
  v_delivery_fee := COALESCE((p->>'delivery_fee')::numeric, 0);
  v_base_delivery_fee := COALESCE((p->>'base_delivery_fee')::numeric, v_delivery_fee);
  v_delivery_zone := COALESCE(p->>'delivery_zone', '');
  v_today := (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Lagos')::date;
  v_items := p->'items';

  -- ── 1. Product Availability, Pre-Order Window, Capacity & Dispatch Rule Inspection ──
  IF v_items IS NOT NULL AND jsonb_typeof(v_items) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
    LOOP
      IF (v_item->>'id') IS NOT NULL 
         AND (v_item->>'id') != '' 
         AND COALESCE(v_item->>'is_promo_reward', 'false') != 'true' THEN
        DECLARE
          v_prod_id bigint;
          v_prod_rec public.products%ROWTYPE;
          v_qty int := GREATEST(1, COALESCE((v_item->>'qty')::int, 1));
          v_item_exceeds boolean := false;
        BEGIN
          v_prod_id := (v_item->>'id')::bigint;
          SELECT * INTO v_prod_rec
          FROM public.products
          WHERE id = v_prod_id;

          IF NOT FOUND OR v_prod_rec.deleted_at IS NOT NULL THEN
            RAISE EXCEPTION 'Product "%" is no longer available.', COALESCE(v_item->>'name', 'Item');
          END IF;

          IF v_prod_rec.is_active = false THEN
            RAISE EXCEPTION 'Product "%" is currently out of stock / hidden and cannot be ordered.', COALESCE(v_prod_rec.name, v_item->>'name', 'Item');
          END IF;

          -- Pre-Order Validation
          IF v_prod_rec.preorder_enabled = true THEN
            IF v_prod_rec.preorder_status IN ('closed', 'completed') THEN
              RAISE EXCEPTION 'Pre-orders for "%" are currently closed.', v_prod_rec.name;
            END IF;

            IF v_prod_rec.preorder_open_at IS NOT NULL AND v_now < v_prod_rec.preorder_open_at THEN
              RAISE EXCEPTION 'Pre-orders for "%" have not opened yet.', v_prod_rec.name;
            END IF;

            IF v_prod_rec.preorder_close_at IS NOT NULL AND v_now > v_prod_rec.preorder_close_at THEN
              RAISE EXCEPTION 'The pre-order window for "%" has closed.', v_prod_rec.name;
            END IF;

            IF v_prod_rec.preorder_max_capacity IS NOT NULL AND v_prod_rec.preorder_max_capacity > 0 THEN
              IF (COALESCE(v_prod_rec.preorder_reserved_qty, 0) + v_qty) > v_prod_rec.preorder_max_capacity THEN
                RAISE EXCEPTION 'Pre-order capacity for "%" has been reached (only % remaining).',
                  v_prod_rec.name, GREATEST(0, v_prod_rec.preorder_max_capacity - COALESCE(v_prod_rec.preorder_reserved_qty, 0));
              END IF;
            END IF;

            v_is_preorder := true;

            IF v_prod_rec.preorder_release_date IS NOT NULL THEN
              IF v_latest_release_date IS NULL OR v_prod_rec.preorder_release_date > v_latest_release_date THEN
                v_latest_release_date := v_prod_rec.preorder_release_date;
              END IF;
            END IF;

            IF v_prod_rec.preorder_scheduling_mode = 'schedule_at_checkout' THEN
              v_effective_scheduling_mode := 'schedule_at_checkout';
            END IF;

            v_preorder_items_snapshot := v_preorder_items_snapshot || jsonb_build_object(
              'product_id', v_prod_rec.id,
              'name', v_prod_rec.name,
              'qty', v_qty,
              'release_date', v_prod_rec.preorder_release_date,
              'scheduling_mode', v_prod_rec.preorder_scheduling_mode,
              'preorder_message', v_prod_rec.preorder_message,
              'open_at', v_prod_rec.preorder_open_at,
              'close_at', v_prod_rec.preorder_close_at
            );

            -- Atomically reserve pre-order capacity
            UPDATE public.products
            SET preorder_reserved_qty = COALESCE(preorder_reserved_qty, 0) + v_qty
            WHERE id = v_prod_rec.id;
          END IF;

          -- Dispatch-Capacity Surcharge Evaluation
          IF v_prod_rec.dispatch_surcharge_enabled = true AND v_delivery_zone != 'Store Pickup' THEN
            IF v_prod_rec.dispatch_aggregation_mode = 'combined_compatible' THEN
              v_combined_compatible_qty := v_combined_compatible_qty + v_qty;
              v_combined_rule_prod := v_prod_rec;
              v_has_combined_rule := true;
            ELSE
              IF v_prod_rec.dispatch_threshold_operator = 'gte' THEN
                v_item_exceeds := (v_qty >= COALESCE(v_prod_rec.dispatch_threshold_qty, 5));
              ELSE
                v_item_exceeds := (v_qty > COALESCE(v_prod_rec.dispatch_threshold_qty, 5));
              END IF;

              IF v_item_exceeds THEN
                v_requires_dedicated_dispatch := true;
                IF COALESCE(v_prod_rec.dispatch_fee_multiplier, 2) > v_max_dispatch_multiplier THEN
                  v_max_dispatch_multiplier := COALESCE(v_prod_rec.dispatch_fee_multiplier, 2);
                END IF;
                v_total_fixed_surcharge := v_total_fixed_surcharge + COALESCE(v_prod_rec.dispatch_fixed_surcharge, 0);
                v_dispatch_message := COALESCE(
                  NULLIF(v_prod_rec.dispatch_customer_message, ''),
                  'Your order exceeds the standard dispatch-box capacity. It will occupy the full dispatch box, so the rider cannot carry other customers'' orders alongside it. The delivery fee for this order is therefore doubled.'
                );
                v_dispatch_trigger_items := v_dispatch_trigger_items || jsonb_build_object(
                  'product_id', v_prod_rec.id,
                  'name', v_prod_rec.name,
                  'qty', v_qty,
                  'threshold_qty', v_prod_rec.dispatch_threshold_qty,
                  'threshold_operator', v_prod_rec.dispatch_threshold_operator,
                  'threshold_unit', v_prod_rec.dispatch_threshold_unit,
                  'multiplier', v_prod_rec.dispatch_fee_multiplier
                );
              END IF;
            END IF;
          END IF;

        EXCEPTION 
          WHEN invalid_text_representation THEN
            NULL;
        END;
      END IF;
    END LOOP;
  END IF;

  -- Check combined_compatible dispatch threshold if configured
  IF v_has_combined_rule AND v_delivery_zone != 'Store Pickup' THEN
    DECLARE
      v_comb_exceeds boolean := false;
    BEGIN
      IF v_combined_rule_prod.dispatch_threshold_operator = 'gte' THEN
        v_comb_exceeds := (v_combined_compatible_qty >= COALESCE(v_combined_rule_prod.dispatch_threshold_qty, 5));
      ELSE
        v_comb_exceeds := (v_combined_compatible_qty > COALESCE(v_combined_rule_prod.dispatch_threshold_qty, 5));
      END IF;

      IF v_comb_exceeds THEN
        v_requires_dedicated_dispatch := true;
        IF COALESCE(v_combined_rule_prod.dispatch_fee_multiplier, 2) > v_max_dispatch_multiplier THEN
          v_max_dispatch_multiplier := COALESCE(v_combined_rule_prod.dispatch_fee_multiplier, 2);
        END IF;
        v_total_fixed_surcharge := v_total_fixed_surcharge + COALESCE(v_combined_rule_prod.dispatch_fixed_surcharge, 0);
        v_dispatch_message := COALESCE(
          NULLIF(v_combined_rule_prod.dispatch_customer_message, ''),
          'Your order exceeds the standard dispatch-box capacity. It will occupy the full dispatch box, so the rider cannot carry other customers'' orders alongside it. The delivery fee for this order is therefore doubled.'
        );
      END IF;
    END;
  END IF;

  -- ── 1b. Enforce Pre-Order Delivery Scheduling Date Rules Server-Side ──
  IF v_is_preorder THEN
    IF v_effective_scheduling_mode = 'schedule_at_checkout' AND v_scheduled_delivery_date IS NULL THEN
      RAISE EXCEPTION 'Please select a delivery date on or after the pre-order release date (%).', v_latest_release_date;
    END IF;

    IF v_scheduled_delivery_date IS NOT NULL AND v_latest_release_date IS NOT NULL THEN
      IF v_scheduled_delivery_date < v_latest_release_date THEN
        RAISE EXCEPTION 'Selected delivery date (%) cannot be earlier than the product release date (%).',
          v_scheduled_delivery_date, v_latest_release_date;
      END IF;
    END IF;

    IF v_scheduled_delivery_date IS NOT NULL THEN
      v_preorder_status := 'date_selected';
      v_delivery_status := COALESCE(v_delivery_status, 'Scheduled');
      v_scheduling_history := jsonb_build_array(
        jsonb_build_object(
          'timestamp', v_now,
          'actor', COALESCE(v_customer_name, 'Customer'),
          'actor_type', 'customer',
          'previous_date', NULL,
          'new_date', v_scheduled_delivery_date,
          'note', 'Selected during pre-order checkout'
        )
      );
    ELSE
      IF v_latest_release_date IS NOT NULL AND v_today >= v_latest_release_date THEN
        v_preorder_status := 'awaiting_customer_date';
      ELSE
        v_preorder_status := 'awaiting_release';
      END IF;
    END IF;
  END IF;

  -- ── 1c. Enforce Dispatch-Capacity Delivery Fee Surcharge Server-Side ──
  IF v_requires_dedicated_dispatch AND v_delivery_zone != 'Store Pickup' THEN
    IF v_base_delivery_fee > 0 THEN
      v_delivery_fee := ROUND((v_base_delivery_fee * v_max_dispatch_multiplier) + v_total_fixed_surcharge);
    END IF;
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
  IF v_delivery_fee = 0 AND v_delivery_zone != 'Store Pickup' AND NOT v_requires_dedicated_dispatch THEN
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
    scheduled_delivery_date, delivery_status,
    is_preorder, preorder_status, preorder_release_date, preorder_scheduling_mode,
    preorder_terms_snapshot, scheduling_history,
    requires_dedicated_dispatch, base_delivery_fee, dispatch_surcharge_snapshot
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
    v_scheduled_delivery_date,
    v_delivery_status,
    v_is_preorder,
    v_preorder_status,
    v_latest_release_date,
    CASE WHEN v_is_preorder THEN v_effective_scheduling_mode ELSE NULL END,
    CASE WHEN v_is_preorder THEN jsonb_build_object(
      'captured_at', v_now,
      'release_date', v_latest_release_date,
      'scheduling_mode', v_effective_scheduling_mode,
      'selected_delivery_date_at_checkout', v_scheduled_delivery_date,
      'items', v_preorder_items_snapshot
    ) ELSE NULL END,
    v_scheduling_history,
    v_requires_dedicated_dispatch,
    v_base_delivery_fee,
    CASE WHEN v_requires_dedicated_dispatch THEN jsonb_build_object(
      'captured_at', v_now,
      'base_delivery_fee', v_base_delivery_fee,
      'multiplier', v_max_dispatch_multiplier,
      'fixed_surcharge', v_total_fixed_surcharge,
      'final_delivery_fee', v_delivery_fee,
      'customer_message', v_dispatch_message,
      'triggering_items', v_dispatch_trigger_items
    ) ELSE NULL END
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

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. CUSTOMER & ADMIN PRE-ORDER DELIVERY SCHEDULING RPCs
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_preorder_for_scheduling(
  p_order_id text,
  p_contact text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_items jsonb;
  v_contact_clean text := lower(trim(COALESCE(p_contact, '')));
  v_contact_phone text := right(regexp_replace(COALESCE(p_contact, ''), '\D', '', 'g'), 10);
  v_order_phone text;
  v_is_authorized boolean := false;
  v_today_lagos date := (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Lagos')::date;
BEGIN
  SELECT * INTO v_order
  FROM public.orders
  WHERE UPPER(TRIM(id)) = UPPER(TRIM(p_order_id))
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % was not found.', p_order_id;
  END IF;

  v_order_phone := right(regexp_replace(COALESCE(v_order.customer_phone, ''), '\D', '', 'g'), 10);

  IF auth.uid() IS NOT NULL AND (v_order.user_id = auth.uid() OR public.is_staff()) THEN
    v_is_authorized := true;
  ELSIF v_contact_clean != '' THEN
    IF (v_contact_phone != '' AND length(v_contact_phone) >= 7 AND v_order_phone = v_contact_phone)
       OR (v_order.customer_email IS NOT NULL AND lower(trim(v_order.customer_email)) = v_contact_clean) THEN
      v_is_authorized := true;
    END IF;
  END IF;

  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'Please provide the phone number or email address used for this order to view or schedule delivery.';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', oi.id,
    'name', oi.name,
    'qty', oi.qty,
    'price', oi.price,
    'is_preorder', oi.is_preorder,
    'preorder_release_date', oi.preorder_release_date
  )), '[]'::jsonb)
  INTO v_items
  FROM public.order_items oi
  WHERE oi.order_id = v_order.id;

  RETURN jsonb_build_object(
    'id', v_order.id,
    'customer_name', v_order.customer_name,
    'customer_phone', v_order.customer_phone,
    'customer_email', v_order.customer_email,
    'delivery_address', v_order.delivery_address,
    'delivery_zone', v_order.delivery_zone,
    'total', v_order.total,
    'delivery_fee', v_order.delivery_fee,
    'status', v_order.status,
    'created_at', v_order.created_at,
    'is_preorder', v_order.is_preorder,
    'preorder_status', v_order.preorder_status,
    'preorder_release_date', v_order.preorder_release_date,
    'preorder_scheduling_mode', v_order.preorder_scheduling_mode,
    'scheduled_delivery_date', v_order.scheduled_delivery_date,
    'delivery_status', v_order.delivery_status,
    'scheduling_history', COALESCE(v_order.scheduling_history, '[]'::jsonb),
    'requires_dedicated_dispatch', v_order.requires_dedicated_dispatch,
    'dispatch_surcharge_snapshot', v_order.dispatch_surcharge_snapshot,
    'can_schedule_now', CASE
      WHEN v_order.status IN ('cancelled', 'delivered') THEN false
      WHEN v_order.preorder_scheduling_mode = 'schedule_at_checkout' THEN true
      WHEN v_order.preorder_release_date IS NULL THEN true
      WHEN v_today_lagos >= v_order.preorder_release_date THEN true
      ELSE false
    END,
    'min_selectable_date', GREATEST(COALESCE(v_order.preorder_release_date, v_today_lagos), v_today_lagos),
    'order_items', v_items
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_preorder_for_scheduling(text, text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.schedule_preorder_delivery(
  p_order_id text,
  p_delivery_date date,
  p_contact text DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_contact_clean text := lower(trim(COALESCE(p_contact, '')));
  v_contact_phone text := right(regexp_replace(COALESCE(p_contact, ''), '\D', '', 'g'), 10);
  v_order_phone text;
  v_is_staff boolean := false;
  v_is_authorized boolean := false;
  v_today_lagos date := (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Lagos')::date;
  v_min_date date;
  v_actor_name text;
  v_actor_type text;
  v_history_entry jsonb;
  v_new_delivery_status text;
BEGIN
  IF p_delivery_date IS NULL THEN
    RAISE EXCEPTION 'Please select a valid delivery date.';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE UPPER(TRIM(id)) = UPPER(TRIM(p_order_id))
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % was not found.', p_order_id;
  END IF;

  IF v_order.status IN ('cancelled', 'delivered') THEN
    RAISE EXCEPTION 'Order % is already % and cannot be rescheduled.', v_order.id, v_order.status;
  END IF;

  IF auth.uid() IS NOT NULL THEN
    v_is_staff := public.is_staff();
  END IF;

  v_order_phone := right(regexp_replace(COALESCE(v_order.customer_phone, ''), '\D', '', 'g'), 10);

  IF v_is_staff THEN
    v_is_authorized := true;
    v_actor_type := 'admin';
    v_actor_name := COALESCE(NULLIF(p_contact, ''), 'Admin');
  ELSIF auth.uid() IS NOT NULL AND v_order.user_id = auth.uid() THEN
    v_is_authorized := true;
    v_actor_type := 'customer';
    v_actor_name := COALESCE(v_order.customer_name, 'Customer');
  ELSIF v_contact_clean != '' THEN
    IF (v_contact_phone != '' AND length(v_contact_phone) >= 7 AND v_order_phone = v_contact_phone)
       OR (v_order.customer_email IS NOT NULL AND lower(trim(v_order.customer_email)) = v_contact_clean) THEN
      v_is_authorized := true;
      v_actor_type := 'customer';
      v_actor_name := COALESCE(v_order.customer_name, 'Customer');
    END IF;
  END IF;

  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'Unauthorized: please verify your order phone number or email address.';
  END IF;

  -- Enforce release date gate for customer calls in schedule_after_release mode
  IF NOT v_is_staff
     AND v_order.is_preorder = true
     AND COALESCE(v_order.preorder_scheduling_mode, 'schedule_after_release') = 'schedule_after_release'
     AND v_order.preorder_release_date IS NOT NULL
     AND v_today_lagos < v_order.preorder_release_date THEN
    RAISE EXCEPTION 'Delivery date selection for this pre-order opens on %.', v_order.preorder_release_date;
  END IF;

  -- Earliest selectable date is GREATEST(release_date, today_lagos) for customers, or release_date for staff
  IF v_is_staff THEN
    v_min_date := COALESCE(v_order.preorder_release_date, v_today_lagos);
  ELSE
    v_min_date := GREATEST(COALESCE(v_order.preorder_release_date, v_today_lagos), v_today_lagos);
  END IF;

  IF p_delivery_date < v_min_date THEN
    RAISE EXCEPTION 'Selected delivery date (%) cannot be earlier than %.', p_delivery_date, v_min_date;
  END IF;

  v_new_delivery_status := CASE
    WHEN v_order.scheduled_delivery_date IS NULL THEN 'Scheduled'
    ELSE 'Rescheduled'
  END;

  v_history_entry := jsonb_build_object(
    'timestamp', now(),
    'actor', v_actor_name,
    'actor_type', v_actor_type,
    'previous_date', v_order.scheduled_delivery_date,
    'new_date', p_delivery_date,
    'note', COALESCE(NULLIF(p_note, ''), CASE WHEN v_order.scheduled_delivery_date IS NULL THEN 'Delivery date selected' ELSE 'Delivery date rescheduled' END)
  );

  UPDATE public.orders
  SET scheduled_delivery_date = p_delivery_date,
      delivery_status = v_new_delivery_status,
      delivery_rescheduled_at = now(),
      delivery_rescheduled_by = v_actor_name,
      preorder_status = CASE
        WHEN is_preorder = true AND COALESCE(preorder_status, '') IN ('', 'awaiting_release', 'awaiting_customer_date', 'overdue', 'date_selected')
          THEN 'date_selected'
        ELSE preorder_status
      END,
      preorder_date_conflict_flagged = false,
      scheduling_history = COALESCE(scheduling_history, '[]'::jsonb) || jsonb_build_array(v_history_entry)
  WHERE id = v_order.id
  RETURNING * INTO v_order;

  RETURN jsonb_build_object(
    'id', v_order.id,
    'scheduled_delivery_date', v_order.scheduled_delivery_date,
    'delivery_status', v_order.delivery_status,
    'preorder_status', v_order.preorder_status,
    'delivery_rescheduled_by', v_order.delivery_rescheduled_by,
    'delivery_rescheduled_at', v_order.delivery_rescheduled_at,
    'scheduling_history', v_order.scheduling_history
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.schedule_preorder_delivery(text, date, text, text) TO anon, authenticated, service_role;

