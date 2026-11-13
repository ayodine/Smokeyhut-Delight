-- Migration: 20261113_scheduled_orders_8am_auto_release.sql
-- Automatically moves scheduled delivery orders for the current day into the Packaging Queue
-- at 8:00 AM Africa/Lagos (07:00 UTC) every morning via pg_cron.

CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.release_due_scheduled_orders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now_lagos   timestamp := (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Lagos');
  v_today_lagos date      := (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Lagos')::date;
  v_now_time    time      := (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Lagos')::time;
  v_updated     integer   := 0;
BEGIN
  UPDATE public.orders
  SET
    delivery_status  = 'In Packaging Queue',
    packaging_status = COALESCE(NULLIF(packaging_status, ''), 'ready_for_fulfillment'),
    updated_at       = now()
  WHERE deleted_at IS NULL
    AND status NOT IN ('cancelled', 'delivered', 'pending_payment')
    AND scheduled_delivery_date IS NOT NULL
    AND (
      scheduled_delivery_date < v_today_lagos
      OR (scheduled_delivery_date = v_today_lagos AND v_now_time >= time '08:00:00')
    )
    AND COALESCE(delivery_status, 'Scheduled') IN ('Scheduled', 'Rescheduled')
    AND COALESCE(packaging_status, 'ready_for_fulfillment') = 'ready_for_fulfillment';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

-- Schedule daily at 07:00 UTC = 08:00 AM Africa/Lagos (WAT, UTC+1)
SELECT cron.schedule(
  'release-due-scheduled-orders-8am',
  '0 7 * * *',
  'SELECT public.release_due_scheduled_orders()'
);
