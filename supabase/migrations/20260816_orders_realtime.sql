-- Migration: Enable Supabase Realtime for Orders Table
-- This allows the orders dashboard to receive instant WebSocket broadcast events when new orders arrive.

BEGIN;

-- 1. Ensure REPLICA IDENTITY is set to FULL so UPDATE/DELETE payloads contain old and new record data
ALTER TABLE public.orders REPLICA IDENTITY FULL;

-- 2. Add public.orders and public.order_items to the supabase_realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'order_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items;
  END IF;
END $$;

COMMIT;
