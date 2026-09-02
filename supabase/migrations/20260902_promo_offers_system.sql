-- Migration: 20260902_promo_offers_system.sql
-- Custom Promo Offers & Daily Quota Engine

-- 1. Create promo_offers table
CREATE TABLE IF NOT EXISTS public.promo_offers (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title                     text NOT NULL,
  description               text,
  badge_text                text DEFAULT '🔥 Daily Special',
  banner_message            text,
  offer_type                text NOT NULL DEFAULT 'buy_x_get_y_free', -- 'buy_x_get_y_free' | 'daily_gift' | 'cart_discount'
  qualifying_type           text NOT NULL DEFAULT 'guinea_fowl_birds', -- 'guinea_fowl_birds' | 'category' | 'specific_products' | 'min_amount'
  qualifying_product_ids    bigint[] DEFAULT '{}',
  qualifying_category_id    text,
  min_qualifying_qty        int NOT NULL DEFAULT 3,
  min_order_amount          numeric DEFAULT 0,
  reward_type               text NOT NULL DEFAULT 'free_product', -- 'free_product' | 'discount_percent' | 'discount_fixed'
  reward_product_id         bigint REFERENCES public.products(id) ON DELETE SET NULL,
  reward_product_name       text DEFAULT 'Free Guinea Fowl (Daily Promo Reward)',
  reward_qty                int NOT NULL DEFAULT 1,
  reward_discount_value     numeric DEFAULT 0,
  daily_quota               int DEFAULT 20, -- NULL means unlimited
  per_customer_daily_limit  int DEFAULT 1,
  auto_apply                boolean NOT NULL DEFAULT true,
  promo_code                text,
  start_date                date,
  end_date                  date,
  active_days               int[] DEFAULT '{0,1,2,3,4,5,6}', -- 0=Sun..6=Sat
  priority                  int DEFAULT 0,
  is_active                 boolean NOT NULL DEFAULT true,
  created_at                timestamptz DEFAULT now(),
  updated_at                timestamptz DEFAULT now()
);

ALTER TABLE public.promo_offers ENABLE ROW LEVEL SECURITY;

-- Public can read active promo offers
DROP POLICY IF EXISTS "Public read active promo offers" ON public.promo_offers;
CREATE POLICY "Public read active promo offers"
  ON public.promo_offers FOR SELECT
  USING (true);

-- Authenticated users (admin/staff) can manage promo offers
DROP POLICY IF EXISTS "Auth manage promo offers" ON public.promo_offers;
CREATE POLICY "Auth manage promo offers"
  ON public.promo_offers FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- 2. Create promo_redemptions table
CREATE TABLE IF NOT EXISTS public.promo_redemptions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_id         uuid NOT NULL REFERENCES public.promo_offers(id) ON DELETE CASCADE,
  order_id         text REFERENCES public.orders(id) ON DELETE SET NULL,
  customer_phone   text,
  customer_email   text,
  customer_name    text,
  user_id          uuid,
  redemption_date  date NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Lagos')::date,
  status           text NOT NULL DEFAULT 'completed' CHECK (status IN ('reserved', 'completed', 'cancelled')),
  reward_details   jsonb DEFAULT '{}'::jsonb,
  created_at       timestamptz DEFAULT now()
);

ALTER TABLE public.promo_redemptions ENABLE ROW LEVEL SECURITY;

-- Authenticated users (admin/staff) can manage redemptions
DROP POLICY IF EXISTS "Auth manage promo redemptions" ON public.promo_redemptions;
CREATE POLICY "Auth manage promo redemptions"
  ON public.promo_redemptions FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Create lookup and quota indexes
CREATE INDEX IF NOT EXISTS idx_promo_redemptions_quota 
  ON public.promo_redemptions (promo_id, redemption_date, status);

CREATE INDEX IF NOT EXISTS idx_promo_redemptions_phone 
  ON public.promo_redemptions (customer_phone, promo_id, redemption_date);

CREATE INDEX IF NOT EXISTS idx_promo_redemptions_order 
  ON public.promo_redemptions (order_id);

-- 3. Helper function: Check if customer has already claimed this promo today
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
  FROM public.promo_redemptions
  WHERE promo_id = p_promo_id
    AND redemption_date = v_today
    AND status != 'cancelled'
    AND (
      (v_phone_digits IS NOT NULL AND LENGTH(v_phone_digits) >= 10 AND (
        RIGHT(REGEXP_REPLACE(customer_phone, '\D', '', 'g'), 10) = RIGHT(v_phone_digits, 10)
      ))
      OR
      (v_clean_phone IS NOT NULL AND customer_phone = v_clean_phone)
      OR
      (v_clean_email IS NOT NULL AND LOWER(TRIM(customer_email)) = v_clean_email)
    );

  RETURN v_claim_count >= v_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_customer_claimed_promo_today(uuid, text, text) TO anon, authenticated, service_role;

-- 4. Helper function: Get active promo offers with live daily quota calculations
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
            AND pr.status != 'cancelled'
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
      'per_customer_daily_limit', per_customer_daily_limit,
      'auto_apply', auto_apply,
      'promo_code', promo_code,
      'start_date', start_date,
      'end_date', end_date,
      'active_days', active_days,
      'claimed_today', claimed_today,
      'remaining_today', CASE WHEN daily_quota IS NULL THEN 999999 ELSE GREATEST(0, daily_quota - claimed_today) END,
      'today_date', v_today
    )
  ) INTO v_result
  FROM active_offers;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_promo_offers() TO anon, authenticated, service_role;

-- 5. Trigger on orders: When an order is cancelled, cancel its promo redemptions to release the slot
CREATE OR REPLACE FUNCTION public.handle_order_cancelled_release_promo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'cancelled' AND (OLD.status IS NULL OR OLD.status != 'cancelled') THEN
    UPDATE public.promo_redemptions
    SET status = 'cancelled'
    WHERE order_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_release_promo_on_order_cancel ON public.orders;
CREATE TRIGGER trg_release_promo_on_order_cancel
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_order_cancelled_release_promo();

-- 6. Update create_storefront_order to atomically validate and reserve promo offers
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
BEGIN
  v_status := COALESCE(NULLIF(p->>'status', ''), 'pending');
  v_session_id := NULLIF(p->>'session_id', '');
  v_coupon_code := NULLIF(p->>'coupon_code', '');
  v_customer_phone := NULLIF(p->>'customer_phone', '');
  v_customer_email := NULLIF(p->>'customer_email', '');
  v_customer_name := NULLIF(p->>'customer_name', '');
  v_today := (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Lagos')::date;

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

      v_promo_claimed := true;
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

-- 7. Seed initial Guinea Fowl Daily Early Bird Promo Offer
DO $$
DECLARE
  v_prod_id bigint;
BEGIN
  -- Try to find an active Guinea Fowl product for reward linking
  SELECT id INTO v_prod_id 
  FROM public.products 
  WHERE is_active = true AND (name ILIKE '%guineafowl%' OR name ILIKE '%guinea fowl%')
  ORDER BY created_at ASC 
  LIMIT 1;

  IF NOT EXISTS (SELECT 1 FROM public.promo_offers WHERE title = 'Daily Early Bird: Free Guinea Fowl') THEN
    INSERT INTO public.promo_offers (
      title,
      description,
      badge_text,
      banner_message,
      offer_type,
      qualifying_type,
      min_qualifying_qty,
      reward_type,
      reward_product_id,
      reward_product_name,
      reward_qty,
      daily_quota,
      per_customer_daily_limit,
      auto_apply,
      is_active
    ) VALUES (
      'Daily Early Bird: Free Guinea Fowl',
      'Order 3 or more Guinea Fowls today and receive 1 FREE Guinea Fowl! Limited to the first 20 customers every day.',
      '🔥 First 20 Daily Promo',
      '🎁 Early Bird Special: First 20 customers to order 3+ Guinea Fowls today get 1 FREE!',
      'buy_x_get_y_free',
      'guinea_fowl_birds',
      3,
      'free_product',
      v_prod_id,
      'Free Guinea Fowl (Daily Promo Reward)',
      1,
      20,
      1,
      true,
      true
    );
  END IF;
END $$;
