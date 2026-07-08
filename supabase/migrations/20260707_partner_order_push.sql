-- Real-time partner push. The moment an order is complete or changes, fire an
-- async HTTP POST (via pg_net) to the push-order edge function, which HMAC-signs
-- the order and forwards it to the partner's webhook. Lag drops from the poll
-- interval (1-5 min) to ~1-2s.
--
-- The /export-orders poll API stays as the reconciliation fallback: pg_net does
-- not retry, so a push that fails (partner down, network) is caught on the
-- partner's next scheduled poll via upsert-by-id. A missed push is never lost.

create extension if not exists pg_net;

-- The shared secret that proves a call to push-order came from THIS trigger and
-- not a random public caller. Stored in Vault, never in this file. Set it once,
-- and set the SAME value as the edge function's PARTNER_PUSH_HOOK_SECRET env var:
--
--   select vault.create_secret('<hook-secret>', 'PARTNER_PUSH_HOOK_SECRET');
--   supabase secrets set PARTNER_PUSH_HOOK_SECRET=<hook-secret>

create or replace function public.notify_partner_order()
returns trigger
language plpgsql
security definer
set search_path = public, net, vault
as $$
declare
  fn_url      text := 'https://itpnfalqjjicesqcjzix.functions.supabase.co/push-order';
  hook_secret text;
begin
  -- Never push a half-built order. The storefront RPC inserts the order row first
  -- and its line items a moment later, so on INSERT the items don't exist yet.
  -- Skip until the order actually has items; the order_items touch-trigger below
  -- re-fires this via an updated_at bump once they land.
  if not exists (select 1 from public.order_items oi where oi.order_id = NEW.id) then
    return NEW;
  end if;

  -- Read the internal hook secret from Vault. If it's missing, still POST (the
  -- edge function will reject it) rather than blowing up the order write.
  begin
    select decrypted_secret into hook_secret
      from vault.decrypted_secrets
      where name = 'PARTNER_PUSH_HOOK_SECRET'
      limit 1;
  exception when others then
    hook_secret := null;
  end;

  -- Async: net.http_post queues the request and returns immediately, so this
  -- never blocks or fails the order insert/update transaction.
  perform net.http_post(
    url     := fn_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-hook-secret', coalesce(hook_secret, '')
    ),
    body    := jsonb_build_object('id', NEW.id)
  );

  return NEW;
end;
$$;

drop trigger if exists trg_push_partner_order on public.orders;
create trigger trg_push_partner_order
  after insert or update on public.orders
  for each row
  execute function public.notify_partner_order();

-- When line items are added/changed/removed (they land after the order row on
-- storefront checkout, often as one bulk insert), bump the parent order's
-- updated_at. That single touch cascades into BOTH sync paths: it re-fires the
-- push trigger above (now with a complete order) and advances the /export-orders
-- poll cursor so the fallback also resurfaces the order with its items. Without
-- this, an order whose items arrive after the row would sync empty on both paths.
--
-- Statement-level with transition tables so a bulk insert of N items touches each
-- affected order exactly ONCE — one complete push per order, not N partial ones.
create or replace function public.touch_orders_from_new()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.orders o set updated_at = now()
  where o.id in (select distinct order_id from new_rows where order_id is not null);
  return null;
end;
$$;

create or replace function public.touch_orders_from_old()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.orders o set updated_at = now()
  where o.id in (select distinct order_id from old_rows where order_id is not null);
  return null;
end;
$$;

drop trigger if exists trg_touch_order_item_ins on public.order_items;
create trigger trg_touch_order_item_ins
  after insert on public.order_items
  referencing new table as new_rows
  for each statement execute function public.touch_orders_from_new();

drop trigger if exists trg_touch_order_item_upd on public.order_items;
create trigger trg_touch_order_item_upd
  after update on public.order_items
  referencing new table as new_rows
  for each statement execute function public.touch_orders_from_new();

drop trigger if exists trg_touch_order_item_del on public.order_items;
create trigger trg_touch_order_item_del
  after delete on public.order_items
  referencing old table as old_rows
  for each statement execute function public.touch_orders_from_old();
