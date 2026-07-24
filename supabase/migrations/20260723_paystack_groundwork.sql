-- Paystack re-integration groundwork.
-- 1) get_payment_status: minimal read for the success page (RLS on orders stays closed).
-- 2) notify_partner_order: partner must never see unpaid Paystack orders.
-- 3) Five stats RPCs: base predicate now also excludes pending_payment.
-- 4) Seed app_settings.paystack (kill switch, default OFF).
-- APPLY with: supabase db query --linked -f supabase/migrations/20260723_paystack_groundwork.sql

begin;

-- 1) Success-page poll: expose ONLY {order_id, status, paid} by Paystack reference.
create or replace function public.get_payment_status(p_ref text)
returns json
language sql stable security definer
as $function$
  select json_build_object(
    'order_id', o.id,
    'status',   o.status,
    'paid',     (o.paid_at is not null)
  )
  from orders o
  where o.paystack_ref = p_ref and o.deleted_at is null
  limit 1;
$function$;

grant execute on function public.get_payment_status(text) to anon;

-- 2) Partner push guard. Body identical to 20260707 except the paystack-unpaid
--    skip inserted before the items check. IF-form is NULL-safe: a NULL
--    payment_method fails the equality test and the push proceeds normally.
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
  -- Unpaid Paystack orders are invisible to the partner (spec unified rule).
  -- The promotion UPDATE (sets paid_at) delivers the order when it becomes real.
  if NEW.payment_method = 'paystack' and NEW.paid_at is null then
    return NEW;
  end if;

  if not exists (select 1 from public.order_items oi where oi.order_id = NEW.id) then
    return NEW;
  end if;

  begin
    select decrypted_secret into hook_secret
      from vault.decrypted_secrets
      where name = 'PARTNER_PUSH_HOOK_SECRET'
      limit 1;
  exception when others then
    hook_secret := null;
  end;

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

-- 3) Stats RPCs: swap base predicate `status <> 'cancelled'` for
--    `status not in ('cancelled','pending_payment')`. Bodies otherwise
--    byte-identical to 20260718_stats_status_filter.sql. Signatures unchanged
--    (CREATE OR REPLACE is safe — no DROP needed).

create or replace function public.get_stats_all_products(
  p_store_id integer     default null,
  p_start    timestamptz default null,
  p_end      timestamptz default null,
  p_status   text        default null
)
returns table(name text, revenue numeric, units bigint)
language sql stable security definer
as $function$
  select
    case
      when oi.name ~* '\s*\(?\s*CHOPPED\s*\)?\s*$' then
        regexp_replace(oi.name, '\s*\(?\s*CHOPPED\s*\)?\s*$', '', 'i') || ' (CHOPPED)'
      else oi.name
    end as name,
    sum(oi.qty * oi.price)::numeric as revenue,
    sum(oi.qty)::bigint             as units
  from order_items oi
  join orders o on o.id = oi.order_id
  where o.deleted_at is null
    and o.status not in ('cancelled','pending_payment')
    and (p_status   is null or o.status = p_status)
    and (p_store_id is null or o.store_id = p_store_id)
    and (p_start    is null or o.created_at >= p_start)
    and (p_end      is null or o.created_at <= p_end)
  group by 1
  order by revenue desc;
$function$;

create or replace function public.get_product_stats_kpis(
  p_store_id integer     default null,
  p_start    timestamptz default null,
  p_end      timestamptz default null,
  p_status   text        default null
)
returns json
language sql stable security definer
as $function$
  with base_orders as (
    select id, total, customer_phone
    from orders
    where deleted_at is null
      and status not in ('cancelled','pending_payment')
      and (p_status   is null or status = p_status)
      and (p_store_id is null or store_id = p_store_id)
      and (p_start    is null or created_at >= p_start)
      and (p_end      is null or created_at <= p_end)
  )
  select json_build_object(
    'revenue',          coalesce((select sum(total) from base_orders), 0),
    'units_sold',       coalesce((select sum(oi.qty)
                                  from order_items oi
                                  join base_orders b on b.id = oi.order_id), 0),
    'order_count',      (select count(*)                       from base_orders),
    'unique_customers', (select count(distinct customer_phone) from base_orders)
  );
$function$;

create or replace function public.get_product_stats_lists(
  p_store_id integer     default null,
  p_start    timestamptz default null,
  p_end      timestamptz default null,
  p_status   text        default null
)
returns json
language sql stable security definer
as $function$
  with confirmed_orders as (
    select id, customer_name, customer_phone, delivery_address, delivery_zone
    from orders
    where deleted_at is null
      and status not in ('cancelled','pending_payment')
      and (p_status   is null or status = p_status)
      and (p_store_id is null or store_id = p_store_id)
      and (p_start    is null or created_at >= p_start)
      and (p_end      is null or created_at <= p_end)
  ),
  items as (
    select
      oi.product_id,
      case
        when oi.name ~* '\s*\(?\s*CHOPPED\s*\)?\s*$' then
          regexp_replace(oi.name, '\s*\(?\s*CHOPPED\s*\)?\s*$', '', 'i') || ' (CHOPPED)'
        else oi.name
      end as item_name,
      oi.qty,
      oi.price
    from order_items oi
    join confirmed_orders co on co.id = oi.order_id
  ),
  by_revenue as (
    select item_name as name, sum(qty * price) as value
    from items group by item_name order by value desc limit 5
  ),
  by_units as (
    select item_name as name, sum(qty) as value
    from items group by item_name order by value desc limit 5
  ),
  by_location as (
    select
      coalesce(
        case
          when delivery_zone is null or trim(delivery_zone) = ''
               or delivery_zone ~* '^location\s*\d'
          then null
          else nullif(trim(delivery_zone), '')
        end,
        nullif(trim(split_part(delivery_address, ',', -1)), '')
      ) as name,
      count(*)::numeric as value
    from confirmed_orders
    where coalesce(
        case
          when delivery_zone is null or trim(delivery_zone) = ''
               or delivery_zone ~* '^location\s*\d'
          then null
          else nullif(trim(delivery_zone), '')
        end,
        nullif(trim(split_part(delivery_address, ',', -1)), '')
      ) is not null
      and delivery_address not ilike 'store pickup%'
    group by 1 order by value desc limit 5
  ),
  by_qty_per_order as (
    select item_name as name, avg(qty) as value
    from items group by item_name order by value desc limit 5
  ),
  by_customer as (
    select
      mode() within group (order by customer_name) as name,
      customer_phone                               as phone,
      count(*)::numeric                            as value
    from confirmed_orders
    group by customer_phone
    order by value desc limit 5
  ),
  by_category as (
    select
      coalesce(c.label, 'Uncategorised') as name,
      sum(oi.qty * oi.price)             as value
    from order_items oi
    join confirmed_orders co on co.id = oi.order_id
    join products p          on p.id  = oi.product_id
    left join categories c   on c.id  = p.category_id
    group by coalesce(c.label, 'Uncategorised')
    order by value desc limit 5
  )
  select json_build_object(
    'top_by_revenue',    (select json_agg(row_to_json(r)) from by_revenue       r),
    'top_by_units',      (select json_agg(row_to_json(r)) from by_units         r),
    'top_locations',     (select json_agg(row_to_json(r)) from by_location      r),
    'top_qty_per_order', (select json_agg(row_to_json(r)) from by_qty_per_order r),
    'top_customers',     (select json_agg(row_to_json(r)) from by_customer      r),
    'top_categories',    (select json_agg(row_to_json(r)) from by_category      r)
  );
$function$;

create or replace function public.get_guineafowl_breakdown(
  p_store_id integer     default null,
  p_start    timestamptz default null,
  p_end      timestamptz default null,
  p_status   text        default null
)
returns json
language sql stable security definer
as $function$
  with gf as (
    select oi.qty,
      case
        when lower(oi.name) like '%hangout%'                                      then 3
        when lower(oi.name) like '%stock up%' or lower(oi.name) like '%stock-up%' then 5
        when lower(oi.name) like '%party pack%'                                   then 10
        else 0
      end as pack_birds,
      case
        when (lower(oi.name) like '%guineafowl%' or lower(oi.name) like '%guinea fowl%')
             and lower(oi.name) not like '%rice%' and lower(oi.name) not like '%pack%' then 1
        else 0
      end as direct_bird
    from order_items oi join orders o on o.id = oi.order_id
    where o.deleted_at is null
      and o.status not in ('cancelled','pending_payment')
      and (p_status   is null or o.status = p_status)
      and (p_store_id is null or o.store_id = p_store_id)
      and (p_start    is null or o.created_at >= p_start)
      and (p_end      is null or o.created_at <= p_end)
  )
  select json_build_object(
    'direct',   coalesce(sum(qty * direct_bird), 0),
    'in_packs', coalesce(sum(qty * pack_birds), 0),
    'total',    coalesce(sum(qty * direct_bird) + sum(qty * pack_birds), 0)
  ) from gf;
$function$;

create or replace function public.get_product_order_breakdown(
  p_name     text,
  p_store_id integer     default null,
  p_start    timestamptz default null,
  p_end      timestamptz default null,
  p_status   text        default null
)
returns table(order_id text, created_at timestamptz, customer_name text, status text, qty bigint, price numeric, line_total numeric)
language sql stable security definer
as $function$
  select
    o.id              as order_id,
    o.created_at,
    o.customer_name,
    o.status,
    oi.qty::bigint    as qty,
    oi.price,
    (oi.qty * oi.price)::numeric as line_total
  from order_items oi
  join orders o on o.id = oi.order_id
  where o.deleted_at is null
    and o.status not in ('cancelled','pending_payment')
    and (p_status   is null or o.status = p_status)
    and (p_store_id is null or o.store_id = p_store_id)
    and (p_start    is null or o.created_at >= p_start)
    and (p_end      is null or o.created_at <= p_end)
    and (
      case
        when oi.name ~* '\s*\(?\s*CHOPPED\s*\)?\s*$' then
          regexp_replace(oi.name, '\s*\(?\s*CHOPPED\s*\)?\s*$', '', 'i') || ' (CHOPPED)'
        else oi.name
      end
    ) = p_name
  order by o.created_at desc;
$function$;

-- 4) Kill switch, default OFF.
insert into app_settings (key, value)
values ('paystack', '{"enabled": false}'::jsonb)
on conflict (key) do nothing;

commit;
