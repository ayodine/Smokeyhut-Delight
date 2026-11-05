-- Migration: Real-time Order Delivery & Lifecycle Synchronization
-- Date: 2026-11-05
-- Description:
--   1. Ensures RLS policies allow SELECT for active orders and line items under the anon role.
--   2. Adds PostgreSQL trigger on orders to broadcast new orders and lifecycle transitions to Supabase Realtime.
--   3. Sets orders REPLICA IDENTITY to FULL for complete record snapshots in WAL replication.

-- 1. Ensure RLS SELECT policies on orders and order_items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'orders' AND policyname = 'ops_anon_select_orders'
  ) THEN
    CREATE POLICY "ops_anon_select_orders" ON public.orders
      FOR SELECT TO anon
      USING (deleted_at IS NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'order_items' AND policyname = 'ops_anon_select_order_items'
  ) THEN
    CREATE POLICY "ops_anon_select_order_items" ON public.order_items
      FOR SELECT TO anon
      USING (true);
  END IF;
END $$;

-- 2. Ensure REPLICA IDENTITY FULL on orders for complete WAL update payloads
ALTER TABLE public.orders REPLICA IDENTITY FULL;

-- 3. Create or replace the lifecycle broadcast function
CREATE OR REPLACE FUNCTION public.broadcast_order_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_payload jsonb;
  v_event text;
BEGIN
  -- If order was soft-deleted, skip active notification
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Detect whether this is a brand new active order or an update to an existing order
  IF (TG_OP = 'INSERT' AND NEW.status != 'pending_payment') OR
     (TG_OP = 'UPDATE' AND (OLD.status = 'pending_payment' OR OLD.status IS NULL) AND NEW.status != 'pending_payment') THEN
    v_event := 'new_order_alert';
  ELSE
    v_event := 'order_lifecycle_updated';
  END IF;

  v_payload := jsonb_build_object(
    'id', NEW.id,
    'order_ref', NEW.id,
    'customer_name', NEW.customer_name,
    'customer_phone', NEW.customer_phone,
    'customer_email', NEW.customer_email,
    'total', NEW.total,
    'status', NEW.status,
    'payment_method', NEW.payment_method,
    'delivery_address', NEW.delivery_address,
    'delivery_zone', NEW.delivery_zone,
    'notes', NEW.notes,
    'delivery_fee', NEW.delivery_fee,
    'created_at', NEW.created_at,
    'event_type', TG_OP,
    'delivery_status', NEW.delivery_status,
    'is_preorder', NEW.is_preorder,
    'scheduled_delivery_date', NEW.scheduled_delivery_date
  );

  -- Broadcast directly to ops dashboard topic
  PERFORM realtime.send(
    v_payload,
    v_event,
    'ops_context_system_broadcast',
    false
  );

  RETURN NEW;
END;
$$;

-- 4. Attach trigger to orders table
DROP TRIGGER IF EXISTS trg_broadcast_order_lifecycle ON public.orders;
CREATE TRIGGER trg_broadcast_order_lifecycle
  AFTER INSERT OR UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.broadcast_order_lifecycle();

