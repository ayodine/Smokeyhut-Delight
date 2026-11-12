-- Migration: 20261112_atomic_order_lifecycle_rpcs.sql
-- Description: Atomic, concurrent-safe, idempotent PostgreSQL RPC functions for Smokeyhut order lifecycle transitions

-- 1. Confirm Rider Collection (Driver Collect)
CREATE OR REPLACE FUNCTION public.confirm_rider_collection(p_order_ref text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order orders%ROWTYPE;
  v_canonical text;
  v_ledger_entry jsonb;
BEGIN
  v_canonical := trim(p_order_ref);
  IF v_canonical IS NULL OR v_canonical = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_id', 'message', 'Order reference required');
  END IF;

  -- Concurrency lock
  SELECT * INTO v_order FROM orders WHERE id = v_canonical FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found', 'message', 'Order ' || v_canonical || ' not found');
  END IF;

  IF v_order.rider_name IS NULL OR v_order.rider_name = '' OR v_order.rider_name = 'Unassigned' THEN
    RETURN jsonb_build_object('success', false, 'error', 'unassigned', 'message', 'Cannot dispatch: No driver assigned');
  END IF;

  -- Idempotency: if already in transit or delivered, return success with current record
  IF lower(COALESCE(v_order.delivery_status, '')) IN ('in transit', 'delivered') THEN
    RETURN jsonb_build_object('success', true, 'order', row_to_json(v_order), 'already_collected', true);
  END IF;

  -- Atomic update
  UPDATE orders
  SET
    delivery_status = 'In Transit',
    packaging_status = 'packaged',
    pickup_at = COALESCE(pickup_at, now()),
    updated_at = now()
  WHERE id = v_canonical
  RETURNING * INTO v_order;

  -- Update rider_trip_ledger atomically in app_settings
  v_ledger_entry := jsonb_build_object(
    'order_ref', v_canonical,
    'rider_name', v_order.rider_name,
    'rider_user_id', v_order.rider_id,
    'customer_name', v_order.customer_name,
    'address', v_order.delivery_address,
    'delivery_fee', COALESCE(v_order.delivery_fee, 0),
    'status', 'in_transit',
    'pickup_at', v_order.pickup_at,
    'dispatch_date', COALESCE(to_char(v_order.pickup_at, 'YYYY-MM-DD'), to_char(now(), 'YYYY-MM-DD'))
  );

  UPDATE app_settings
  SET
    value = COALESCE(value, '{}'::jsonb) || jsonb_build_object(v_canonical, COALESCE(value->v_canonical, '{}'::jsonb) || v_ledger_entry),
    updated_at = now()
  WHERE key = 'rider_trip_ledger';

  RETURN jsonb_build_object('success', true, 'order', row_to_json(v_order));
END;
$$;

-- 2. Mark Order Delivered
CREATE OR REPLACE FUNCTION public.mark_order_delivered(p_order_ref text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order orders%ROWTYPE;
  v_canonical text;
  v_ledger_entry jsonb;
BEGIN
  v_canonical := trim(p_order_ref);
  IF v_canonical IS NULL OR v_canonical = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_id', 'message', 'Order reference required');
  END IF;

  -- Concurrency lock
  SELECT * INTO v_order FROM orders WHERE id = v_canonical FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found', 'message', 'Order ' || v_canonical || ' not found');
  END IF;

  -- Idempotency check: if already delivered, return without duplicate side effects
  IF lower(COALESCE(v_order.delivery_status, '')) = 'delivered' AND lower(COALESCE(v_order.status, '')) = 'delivered' THEN
    RETURN jsonb_build_object('success', true, 'order', row_to_json(v_order), 'already_delivered', true);
  END IF;

  -- Atomic update
  UPDATE orders
  SET
    delivery_status = 'Delivered',
    status = 'delivered',
    packaging_status = 'packaged',
    delivered_at = COALESCE(delivered_at, now()),
    pickup_at = COALESCE(pickup_at, now()),
    updated_at = now()
  WHERE id = v_canonical
  RETURNING * INTO v_order;

  -- Update rider_trip_ledger atomically
  v_ledger_entry := jsonb_build_object(
    'order_ref', v_canonical,
    'rider_name', COALESCE(v_order.rider_name, 'Rider'),
    'rider_user_id', v_order.rider_id,
    'customer_name', v_order.customer_name,
    'address', v_order.delivery_address,
    'delivery_fee', COALESCE(v_order.delivery_fee, 0),
    'status', 'delivered',
    'delivered_at', v_order.delivered_at,
    'pickup_at', v_order.pickup_at,
    'dispatch_date', COALESCE(to_char(v_order.delivered_at, 'YYYY-MM-DD'), to_char(now(), 'YYYY-MM-DD'))
  );

  UPDATE app_settings
  SET
    value = COALESCE(value, '{}'::jsonb) || jsonb_build_object(v_canonical, COALESCE(value->v_canonical, '{}'::jsonb) || v_ledger_entry),
    updated_at = now()
  WHERE key = 'rider_trip_ledger';

  RETURN jsonb_build_object('success', true, 'order', row_to_json(v_order));
END;
$$;

-- 3. Accept Order Delivery (Rider)
CREATE OR REPLACE FUNCTION public.accept_order_delivery(p_order_ref text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order orders%ROWTYPE;
  v_canonical text;
BEGIN
  v_canonical := trim(p_order_ref);
  SELECT * INTO v_order FROM orders WHERE id = v_canonical FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found', 'message', 'Order not found');
  END IF;

  UPDATE orders
  SET
    delivery_status = 'In Transit',
    packaging_status = 'packaged',
    pickup_at = COALESCE(pickup_at, now()),
    updated_at = now()
  WHERE id = v_canonical
  RETURNING * INTO v_order;

  RETURN jsonb_build_object('success', true, 'order', row_to_json(v_order));
END;
$$;

-- 4. Decline Order Delivery (Rider)
CREATE OR REPLACE FUNCTION public.decline_order_delivery(p_order_ref text, p_reason text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order orders%ROWTYPE;
  v_canonical text;
  v_notes text;
BEGIN
  v_canonical := trim(p_order_ref);
  SELECT * INTO v_order FROM orders WHERE id = v_canonical FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found', 'message', 'Order not found');
  END IF;

  v_notes := COALESCE(v_order.notes, '');
  IF p_reason IS NOT NULL AND trim(p_reason) != '' THEN
    v_notes := trim(v_notes || ' [Declined by rider: ' || trim(p_reason) || ']');
  END IF;

  UPDATE orders
  SET
    delivery_status = 'Ready for Dispatch',
    rider_name = NULL,
    rider_id = NULL,
    pickup_at = NULL,
    notes = v_notes,
    updated_at = now()
  WHERE id = v_canonical
  RETURNING * INTO v_order;

  UPDATE app_settings
  SET
    value = COALESCE(value, '{}'::jsonb) || jsonb_build_object(
      v_canonical,
      COALESCE(value->v_canonical, '{}'::jsonb) || jsonb_build_object('status', 'pending', 'rider_name', 'Unassigned', 'rider_user_id', null)
    ),
    updated_at = now()
  WHERE key = 'rider_trip_ledger';

  RETURN jsonb_build_object('success', true, 'order', row_to_json(v_order));
END;
$$;

-- 5. Confirm Order Packaging (Kitchen Pack-Out)
CREATE OR REPLACE FUNCTION public.confirm_order_packaging(p_order_ref text, p_staff_name text DEFAULT 'Packaging Staff')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order orders%ROWTYPE;
  v_canonical text;
BEGIN
  v_canonical := trim(p_order_ref);
  SELECT * INTO v_order FROM orders WHERE id = v_canonical FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found', 'message', 'Order not found');
  END IF;

  UPDATE orders
  SET
    packaging_status = 'packaged',
    packaged_at = COALESCE(packaged_at, now()),
    packaged_by = COALESCE(nullif(trim(p_staff_name), ''), packaged_by, 'Packaging Staff'),
    updated_at = now()
  WHERE id = v_canonical
  RETURNING * INTO v_order;

  RETURN jsonb_build_object('success', true, 'order', row_to_json(v_order));
END;
$$;

-- 6. Mark Store Pickup Collected
CREATE OR REPLACE FUNCTION public.mark_store_pickup_collected(
  p_order_ref text,
  p_collected_by text,
  p_handover_staff text,
  p_collector_phone text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order orders%ROWTYPE;
  v_canonical text;
  v_notes text;
  v_meta text;
BEGIN
  v_canonical := trim(p_order_ref);
  SELECT * INTO v_order FROM orders WHERE id = v_canonical FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found', 'message', 'Order not found');
  END IF;

  -- Idempotent check
  IF lower(COALESCE(v_order.status, '')) = 'delivered' AND lower(COALESCE(v_order.delivery_status, '')) = 'delivered' THEN
    RETURN jsonb_build_object('success', true, 'order', row_to_json(v_order), 'already_delivered', true);
  END IF;

  v_meta := '[Store Pickup Collected by: ' || COALESCE(trim(p_collected_by), 'Customer') ||
            ', Handover: ' || COALESCE(trim(p_handover_staff), 'Staff') ||
            CASE WHEN p_collector_phone IS NOT NULL AND trim(p_collector_phone) != '' THEN ', Phone: ' || trim(p_collector_phone) ELSE '' END || ']';

  v_notes := trim(COALESCE(v_order.notes, '') || ' ' || v_meta);

  UPDATE orders
  SET
    status = 'delivered',
    delivery_status = 'Delivered',
    packaging_status = 'packaged',
    delivered_at = COALESCE(delivered_at, now()),
    pickup_at = COALESCE(pickup_at, now()),
    notes = v_notes,
    updated_at = now()
  WHERE id = v_canonical
  RETURNING * INTO v_order;

  RETURN jsonb_build_object('success', true, 'order', row_to_json(v_order));
END;
$$;

-- Grant execution permissions to anon and authenticated
GRANT EXECUTE ON FUNCTION public.confirm_rider_collection(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_order_delivered(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_order_delivery(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decline_order_delivery(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_order_packaging(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_store_pickup_collected(text, text, text, text) TO anon, authenticated;
