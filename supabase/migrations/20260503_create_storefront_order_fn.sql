-- Storefront orders use anon key which lacks SELECT on orders.
-- This SECURITY DEFINER function inserts and returns the generated ID
-- so Checkout.jsx doesn't need select() after insert.
CREATE OR REPLACE FUNCTION create_storefront_order(p jsonb)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE v_id text;
BEGIN
  INSERT INTO orders (
    customer_name, customer_email, customer_phone,
    delivery_address, delivery_zone, store_id,
    payment_method, total, delivery_fee,
    coupon_code, coupon_discount, status, notes,
    created_at, channel
  ) VALUES (
    p->>'customer_name',
    NULLIF(p->>'customer_email', ''),
    p->>'customer_phone',
    p->>'delivery_address',
    NULLIF(p->>'delivery_zone', ''),
    CASE WHEN (p->>'store_id') IS NOT NULL
         THEN (p->>'store_id')::int ELSE NULL END,
    p->>'payment_method',
    (p->>'total')::numeric,
    (p->>'delivery_fee')::numeric,
    NULLIF(p->>'coupon_code', ''),
    COALESCE((p->>'coupon_discount')::numeric, 0),
    'pending',
    NULLIF(p->>'notes', ''),
    now(),
    'storefront'
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
