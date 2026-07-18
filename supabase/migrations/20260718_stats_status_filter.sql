-- Whole-page status filter for Stats & Units Sold pages.
-- Adds p_status (text, default NULL) to the five stats RPCs.
-- Semantics: NULL -> all non-cancelled; otherwise status = p_status.
-- Cancelled is excluded under every filter value.
-- This also FIXES a denominator mismatch: units used to be hardcoded
-- delivered-only while revenue counted all non-cancelled; both now
-- compute over the same (scoped) order set.
--
-- APPLY with: supabase db query --linked -f supabase/migrations/20260718_stats_status_filter.sql
-- NEVER supabase db push (remote migration history is out of sync).

begin;

-- 1) get_stats_all_products ---------------------------------------------------
drop function if exists public.get_stats_all_products(integer, timestamptz, timestamptz);

create function public.get_stats_all_products(
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
    and o.status <> 'cancelled'
    and (p_status   is null or o.status = p_status)
    and (p_store_id is null or o.store_id = p_store_id)
    and (p_start    is null or o.created_at >= p_start)
    and (p_end      is null or o.created_at <= p_end)
  group by 1
  order by revenue desc;
$function$;

-- 2) get_product_stats_kpis ---------------------------------------------------
drop function if exists public.get_product_stats_kpis(integer, timestamptz, timestamptz);

create function public.get_product_stats_kpis(
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
      and status <> 'cancelled'
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

-- 3) get_product_stats_lists --------------------------------------------------
drop function if exists public.get_product_stats_lists(integer, timestamptz, timestamptz);

create function public.get_product_stats_lists(
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
      and status <> 'cancelled'
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

-- 4) get_guineafowl_breakdown -------------------------------------------------
drop function if exists public.get_guineafowl_breakdown(integer, timestamptz, timestamptz);

create function public.get_guineafowl_breakdown(
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
      and o.status <> 'cancelled'
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

-- 5) get_product_order_breakdown ----------------------------------------------
drop function if exists public.get_product_order_breakdown(text, integer, timestamptz, timestamptz);

create function public.get_product_order_breakdown(
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
    and o.status <> 'cancelled'
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

commit;
