-- Customer login groundwork: link orders to auth users, and harden RLS so a
-- signed-in customer can only ever see their own orders (the existing policies
-- gave every authenticated user full access, which was safe only while all
-- authenticated users were staff).

-- 1. Owner column (NULL = guest order).
alter table orders add column if not exists user_id uuid references auth.users(id);
create index if not exists idx_orders_user_id on orders(user_id);

-- 2. Staff detector: an auth user that has a profiles row with a non-null role.
create or replace function is_staff()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from profiles where id = auth.uid() and role is not null);
$$;
revoke all on function is_staff() from anon, public;
grant execute on function is_staff() to authenticated;

-- 3. orders: replace the over-broad "authenticated == staff" policy.
drop policy if exists "Auth manage orders" on orders;
create policy "Staff manage orders" on orders
  for all to authenticated using (is_staff()) with check (is_staff());
create policy "Customer reads own orders" on orders
  for select to authenticated using (user_id = auth.uid());

-- 4. order_items: same hardening (line items reveal what everyone ordered).
drop policy if exists "Auth manage order_items" on order_items;
create policy "Staff manage order_items" on order_items
  for all to authenticated using (is_staff()) with check (is_staff());
create policy "Customer reads own order_items" on order_items
  for select to authenticated using (exists (
    select 1 from orders o where o.id = order_items.order_id and o.user_id = auth.uid()
  ));

-- 5. Stamp user_id from auth.uid() (full function re-created, original body + user_id).
create or replace function create_storefront_order(p jsonb)
returns text
language plpgsql security definer
as $$
declare v_id text;
begin
  insert into orders (
    customer_name, customer_email, customer_phone,
    delivery_address, delivery_zone, store_id,
    payment_method, total, delivery_fee,
    coupon_code, coupon_discount, status, notes,
    paystack_ref, created_at, channel, user_id
  ) values (
    p->>'customer_name',
    nullif(p->>'customer_email', ''),
    p->>'customer_phone',
    p->>'delivery_address',
    nullif(p->>'delivery_zone', ''),
    case when (p->>'store_id') is not null then (p->>'store_id')::int else null end,
    p->>'payment_method',
    (p->>'total')::numeric,
    (p->>'delivery_fee')::numeric,
    nullif(p->>'coupon_code', ''),
    coalesce((p->>'coupon_discount')::numeric, 0),
    coalesce(nullif(p->>'status', ''), 'pending'),
    nullif(p->>'notes', ''),
    nullif(p->>'paystack_ref', ''),
    now(),
    'storefront',
    auth.uid()
  )
  returning id into v_id;
  return v_id;
end;
$$;
grant execute on function create_storefront_order(jsonb) to anon, authenticated;
