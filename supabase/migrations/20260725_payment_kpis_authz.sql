-- Server-side authorization for the Payments revenue KPIs. Previously any
-- authenticated staff could pull these figures; now only Admins or staff
-- explicitly granted the 'Payments:kpi' permission can. Output shape is
-- unchanged — only an auth guard is added (SECURITY DEFINER, reads the caller's
-- profile via auth.uid()). profiles.permissions is jsonb, so membership uses ?.
create or replace function get_payment_kpis(p_store_id int default null)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare result json;
begin
  if not exists (
    select 1 from profiles
    where id = auth.uid()
      and (role = 'Admin' or permissions ? 'Payments:kpi')
  ) then
    raise exception 'not authorized to view payment KPIs';
  end if;

  select json_build_object(
    'total',         coalesce(sum(total) filter (where status in ('processing','shipped','delivered')), 0),
    'paystack',      coalesce(sum(total) filter (where status in ('processing','shipped','delivered') and payment_method = 'paystack'), 0),
    'bank_transfer', coalesce(sum(total) filter (where status in ('processing','shipped','delivered') and payment_method = 'bank_transfer'), 0),
    'cash',          coalesce(sum(total) filter (where status in ('processing','shipped','delivered') and payment_method = 'cash'), 0)
  ) into result
  from orders
  where payment_method is not null
    and (p_store_id is null or store_id = p_store_id);

  return result;
end;
$$;
