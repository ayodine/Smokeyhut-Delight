-- Allow orders submitted through the partner API (receive-order edge function)
-- to be tagged channel = 'partner', so they're distinguishable from storefront /
-- whatsapp orders in the dashboard and stats.
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_channel_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_channel_check
  CHECK (channel IN ('storefront', 'whatsapp', 'partner'));
