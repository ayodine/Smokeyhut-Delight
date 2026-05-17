-- Update create_storefront_order to accept status and paystack_ref from payload
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
    paystack_ref, created_at, channel
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
    COALESCE(NULLIF(p->>'status', ''), 'pending'),
    NULLIF(p->>'notes', ''),
    NULLIF(p->>'paystack_ref', ''),
    now(),
    'storefront'
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Confirm a storefront order by its Paystack reference (callable by anon key)
CREATE OR REPLACE FUNCTION confirm_storefront_order(p_ref text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  UPDATE orders
  SET status = 'paid'
  WHERE paystack_ref = p_ref
    AND status IN ('pending_payment', 'pending');
END;
$$;

GRANT EXECUTE ON FUNCTION confirm_storefront_order(text) TO anon, authenticated;
