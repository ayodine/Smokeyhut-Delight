-- Migration: 20260909_coupon_customization_system.sql
-- Dynamic Coupon Customization & Customer Whitelisting System

-- 1. Add restriction columns to coupons table
ALTER TABLE public.coupons 
ADD COLUMN IF NOT EXISTS is_restricted boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS max_uses_per_customer integer DEFAULT 1;

-- 2. Create coupon_eligible_customers table
CREATE TABLE IF NOT EXISTS public.coupon_eligible_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  customer_name text,
  customer_phone text,
  customer_email text,
  customer_address text,
  reference_order_id text,
  max_uses integer DEFAULT 1,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coupon_eligible_coupon_id ON public.coupon_eligible_customers(coupon_id);
CREATE INDEX IF NOT EXISTS idx_coupon_eligible_phone ON public.coupon_eligible_customers(customer_phone);
CREATE INDEX IF NOT EXISTS idx_coupon_eligible_email ON public.coupon_eligible_customers(customer_email);

-- Enable RLS
ALTER TABLE public.coupon_eligible_customers ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Allow public read of coupon_eligible_customers" ON public.coupon_eligible_customers;
DROP POLICY IF EXISTS "Allow staff manage coupon_eligible_customers" ON public.coupon_eligible_customers;

-- RLS Policies
CREATE POLICY "Allow public read of coupon_eligible_customers"
  ON public.coupon_eligible_customers FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow staff manage coupon_eligible_customers"
  ON public.coupon_eligible_customers FOR ALL
  TO anon, authenticated, service_role
  USING (true)
  WITH CHECK (true);

-- 3. Set FREEFOWL08 to restricted
UPDATE public.coupons 
SET is_restricted = true, max_uses_per_customer = 1 
WHERE UPPER(TRIM(code)) = 'FREEFOWL08';

-- 4. Pre-populate coupon_eligible_customers with existing 21 customers for FREEFOWL08
DO $$
DECLARE
  v_coupon_id uuid;
BEGIN
  SELECT id INTO v_coupon_id FROM public.coupons WHERE UPPER(TRIM(code)) = 'FREEFOWL08' LIMIT 1;
  IF v_coupon_id IS NOT NULL THEN
    -- Insert only if not already present
    INSERT INTO public.coupon_eligible_customers (coupon_id, customer_name, customer_phone, customer_email, customer_address, reference_order_id, max_uses)
    SELECT v_coupon_id, name, phone, email, address, order_id, 1
    FROM (
      VALUES
        ('Hareez Maye', '08067829025', 'guidprot@gmail.com', 'Store Pickup — Lagos Mainland', 'SHD-03022'),
        ('Ben Ashiru', '08148256952', 'vybbezferanmi@gmail.com', 'Springville gardens Oakland estate idowu dabiri street sangotedo, Sangotedo', 'SHD-06603'),
        ('Seun Alli', '08033119777', 'seun.lekealli@gmail.com', '17b Kingsley Emu Street Lekki Phase 1, LEKKI', 'SHD-06632'),
        ('Kafilat Oyefeso', '08033350697', 'olabimpeoyefeso@gmail.com', '12 Taoridi Street off BodeThomas Rd beside Rita Lori Hotel Surulere , Surulere', 'SHD-06641'),
        ('Oluwaseun Oguntola', '07032020137', 'paparazu@yahoo.co.uk', '9A isaac John Street Ikeja GRA opposite Ebeano supermarket , Ikeja', 'SHD-06642'),
        ('Motunrayo Daramola', '08037002887', 'fatun9406@gmail.com', 'No 3 surulere industry road off adeniye John Ikeja , Ikeja', 'SHD-06648'),
        ('Yemi Onobun', '08026757151', 'atinaroy@yahoo.com', 'Store Pickup — Lagos Mainland', 'SHD-06654'),
        ('Abbey Abiodun', '08055453806', 'faleyeabbey@yahoo.com', '112 old ewu road aviation estate mafoluku oshodi, Oshodi', 'SHD-06657'),
        ('Tamunomiete Ekine', '08164980157', 'tamunomiete26@gmail.com', 'No 4 Adedayo close peace estate, Isheri igando road by iyanodo opposite amala ibadan, Isheri Oshun', 'SHD-06659'),
        ('Muna Igbinedion', '09044744511', 'muna.igbinedion@gmail.com', 'Kingdom Court, 11 Kayode Abraham street, off Ligali Ayorinde road, Victoria island , Victoria Island', 'SHD-06661'),
        ('dan Daniel', '09168652077', 'alimidaniel64@gmail.com', '7/9 mobolade okoya thomas Vi , Victoria Island', 'SHD-06595'),
        ('Sunday Oguntoye', '07063805119', 'sunnytoye77@yahoo.com', 'Plot E49,D close, Sokoloff Street,Banana Island , Ikoyi', 'SHD-06720'),
        ('Yemi Sunday', '08027586722', 'horlaryemmy77@gmail.com', 'Plot 25, Adekunle Banjo Avenue, Magodo Shangisha, Magodo Shangisha', 'SHD-06722'),
        ('Valerie Lolomari', '09024823335', 'lolomariv@gmail.com', 'Mathew Osawemen street, Ologolo , LEKKI', 'SHD-06742'),
        ('Ipaye Fatima', '08168457550', 'prettytyma2015@gmail.com', '57, bola Street by ondo ebute metta east, Ebutemetta', 'SHD-06746'),
        ('Elizabella Elizabella', '08024289517', 'abiolashokunbi6@gmail.com', 'Lsdpc Estate block 11 Ebute Metta , Ebutemetta', 'SHD-06750'),
        ('Iphie LuxuryHairs', '08036433441', 'ihenacho_ify@yahoo.com', 'Store Pickup — Lagos Mainland', 'SHD-06753'),
        ('Dera Shallom', '09132833105', 'chiderashallom@gmail.com', 'HRC estate Harris drive vgc lagos, VGC', 'SHD-06755'),
        ('SCHOLASTICA SCHOLASTICA', '08114498668', 'nokorafor222@gmail.com', 'No 4 Kelly John Street, Infinity estate (milestone hotel) Skido bus stop. Ado ,road Ajah, AJAH', 'SHD-06758'),
        ('Oluranti Sadiq', '08060089417', 'omobim89@gmail.com', '33, Michael Ayegoro, 3rd powerline Okeletu , IKORODU', 'SHD-06761'),
        ('Omalicha Adaobi', '08022771081', 'a.adaobiumeh@gmail.com', 'House 3,Elijah Abina  street, Lakeview phase 2 amuwo odofin , Amuwo Odofin', 'SHD-06763')
    ) AS v(name, phone, email, address, order_id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.coupon_eligible_customers cec
      WHERE cec.coupon_id = v_coupon_id
        AND (
          (v.phone IS NOT NULL AND RIGHT(REGEXP_REPLACE(cec.customer_phone, '\D', '', 'g'), 10) = RIGHT(REGEXP_REPLACE(v.phone, '\D', '', 'g'), 10))
          OR (v.email IS NOT NULL AND LOWER(TRIM(cec.customer_email)) = LOWER(TRIM(v.email)))
        )
    );
  END IF;
END $$;

-- 5. Updated check_coupon_used_by_customer function
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

    -- Custom max_uses from eligible record if set, otherwise coupon level
    v_max_allowed := COALESCE(v_eligible_record.max_uses, v_coupon_record.max_uses_per_customer, 1);
  ELSE
    v_max_allowed := COALESCE(v_coupon_record.max_uses_per_customer, 1);
  END IF;

  -- Count previous completed orders (ignore cancelled and pending_payment attempts)
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

  RETURN v_used_count >= v_max_allowed;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.check_coupon_used_by_customer(text, text, text) TO anon, authenticated, service_role;
