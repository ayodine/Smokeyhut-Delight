-- Atomic restock of products.stock — the single race-safe write path for the
-- dashboard restock UI (inline + batch). No schema change; only this function.
-- The order auto-deduct trigger (20260504) decrements stock concurrently, so a
-- restock must be an in-DB increment (stock = stock + N), never a client-side
-- read-modify-write.
create or replace function restock_product(p_id int, p_add int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new int;
begin
  if p_add is null or p_add <= 0 then
    raise exception 'restock amount must be positive';
  end if;
  if auth.role() not in ('authenticated', 'service_role') then
    raise exception 'not authorized';   -- blocks the public anon key
  end if;
  update products
     set stock = stock + p_add
   where id = p_id and deleted_at is null
   returning stock into v_new;
  if v_new is null then
    raise exception 'product not found';
  end if;
  return v_new;
end;
$$;

revoke all on function restock_product(int, int) from anon, public;
grant execute on function restock_product(int, int) to authenticated, service_role;
