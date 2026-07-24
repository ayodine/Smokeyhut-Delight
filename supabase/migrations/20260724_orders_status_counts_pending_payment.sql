-- Orders admin "Awaiting Payment" filter support.
-- get_orders_status_counts: exclude unpaid Paystack orders (pending_payment)
-- from the "all" badge so it matches the default order list, and add a
-- pending_payment count for the new pill. Only caller is Orders.jsx.
-- APPLY with: supabase db query --linked -f supabase/migrations/20260724_orders_status_counts_pending_payment.sql

create or replace function public.get_orders_status_counts(
  p_store_id integer     default null,
  p_start    timestamptz default null,
  p_end      timestamptz default null
)
returns json
language sql stable security definer
as $function$
  select json_build_object(
    'all',             count(*) filter (where status <> 'pending_payment'),
    'pending_payment', count(*) filter (where status = 'pending_payment'),
    'pending',         count(*) filter (where status = 'pending'),
    'processing',      count(*) filter (where status = 'processing'),
    'shipped',         count(*) filter (where status = 'shipped'),
    'delivered',       count(*) filter (where status = 'delivered'),
    'cancelled',       count(*) filter (where status = 'cancelled')
  )
  from orders
  where deleted_at is null
    and (p_store_id is null or store_id = p_store_id)
    and (p_start    is null or created_at >= p_start)
    and (p_end      is null or created_at <= p_end);
$function$;
