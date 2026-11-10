-- Deep Egress & Realtime Remediation Migration

-- 1. Drop public.order_items from supabase_realtime publication (no client subscribes to order_items)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'order_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.order_items;
  END IF;
END $$;

-- 2. Harden broadcast_order_lifecycle() so it only fires on fresh orders (>= 2026-11-06)
--    and only when operational lifecycle columns actually change on UPDATE.
CREATE OR REPLACE FUNCTION public.broadcast_order_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_payload jsonb;
  v_event text;
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Ignore historical orders prior to the Nov 6, 2026 fresh-order cutoff
  IF NEW.created_at IS NOT NULL AND NEW.created_at < '2026-11-06T00:00:00Z'::timestamptz THEN
    RETURN NEW;
  END IF;

  -- On UPDATE, skip broadcasting if no operational field changed
  IF TG_OP = 'UPDATE' THEN
    IF NEW.status IS NOT DISTINCT FROM OLD.status
       AND NEW.packaging_status IS NOT DISTINCT FROM OLD.packaging_status
       AND NEW.delivery_status IS NOT DISTINCT FROM OLD.delivery_status
       AND NEW.rider_name IS NOT DISTINCT FROM OLD.rider_name
       AND NEW.rider_id IS NOT DISTINCT FROM OLD.rider_id
       AND NEW.pickup_at IS NOT DISTINCT FROM OLD.pickup_at
       AND NEW.delivered_at IS NOT DISTINCT FROM OLD.delivered_at
       AND NEW.notes IS NOT DISTINCT FROM OLD.notes
       AND NEW.scheduled_delivery_date IS NOT DISTINCT FROM OLD.scheduled_delivery_date
    THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Determine whether this is a newly active order or a lifecycle update
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
    'packaging_status', NEW.packaging_status,
    'payment_method', NEW.payment_method,
    'delivery_address', NEW.delivery_address,
    'delivery_zone', NEW.delivery_zone,
    'notes', NEW.notes,
    'delivery_fee', NEW.delivery_fee,
    'created_at', NEW.created_at,
    'event_type', TG_OP,
    'delivery_status', NEW.delivery_status,
    'rider_name', NEW.rider_name,
    'rider_id', NEW.rider_id,
    'rider_type', NEW.rider_type,
    'pickup_at', NEW.pickup_at,
    'delivered_at', NEW.delivered_at,
    'is_preorder', NEW.is_preorder,
    'scheduled_delivery_date', NEW.scheduled_delivery_date
  );

  PERFORM realtime.send(
    v_payload,
    v_event,
    'ops_context_system_broadcast',
    false
  );

  RETURN NEW;
END;
$function$;

-- 3. Prune order_pipeline_state in public.app_settings to only fresh orders (SHD-11110+)
--    and strip inline base64 data:image strings from fee_evidence_path
WITH current_map AS (
  SELECT k, val
  FROM jsonb_each((SELECT value::jsonb FROM public.app_settings WHERE key = 'order_pipeline_state')) AS t(k, val)
  WHERE k ~ '^SHD-[0-9]+$'
    AND CAST(regexp_replace(k, '\D', '', 'g') AS integer) >= 11110
),
cleaned_map AS (
  SELECT
    k,
    CASE
      WHEN (val->>'fee_evidence_path') LIKE 'data:%' OR length(COALESCE(val->>'fee_evidence_path', '')) > 1024
        THEN jsonb_set(val, '{fee_evidence_path}', '"uploaded_verified"'::jsonb)
      ELSE val
    END AS cleaned_val
  FROM current_map
)
UPDATE public.app_settings
SET value = COALESCE((SELECT jsonb_object_agg(k, cleaned_val) FROM cleaned_map), '{}'::jsonb),
    updated_at = NOW()
WHERE key = 'order_pipeline_state';

-- 4. Set 1-year immutable Cache-Control on product-images in Supabase Storage
UPDATE storage.objects
SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{cacheControl}', '"public, max-age=31536000, immutable"')
WHERE bucket_id = 'product-images';

