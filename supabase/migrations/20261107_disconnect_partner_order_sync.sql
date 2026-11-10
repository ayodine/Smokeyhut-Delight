-- Disconnect StreetMBA outbound partner order synchronization (real-time webhook push & polling fallback)

-- 1. Drop real-time partner push trigger and function on public.orders
DROP TRIGGER IF EXISTS trg_push_partner_order ON public.orders;
DROP FUNCTION IF EXISTS public.notify_partner_order();

-- 2. Drop order_items statement-level touch triggers and functions used for partner sync
DROP TRIGGER IF EXISTS trg_touch_order_item_ins ON public.order_items;
DROP TRIGGER IF EXISTS trg_touch_order_item_upd ON public.order_items;
DROP TRIGGER IF EXISTS trg_touch_order_item_del ON public.order_items;
DROP FUNCTION IF EXISTS public.touch_orders_from_new();
DROP FUNCTION IF EXISTS public.touch_orders_from_old();

-- 3. Remove internal hook secret from Supabase Vault
DELETE FROM vault.secrets WHERE name = 'PARTNER_PUSH_HOOK_SECRET';

