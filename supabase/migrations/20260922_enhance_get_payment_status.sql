-- Enhance get_payment_status to return total and customer details so success page
-- can guarantee analytics tracking (Snapchat, Meta, GA4) even if sessionStorage is wiped.

create or replace function public.get_payment_status(p_ref text)
returns json
language sql stable security definer
as $function$
  select json_build_object(
    'order_id', o.id,
    'status',   o.status,
    'paid',     (o.paid_at is not null),
    'total',    o.total,
    'customer_name', o.customer_name,
    'customer_phone', o.customer_phone,
    'customer_email', o.customer_email
  )
  from orders o
  where o.paystack_ref = p_ref and o.deleted_at is null
  limit 1;
$function$;

grant execute on function public.get_payment_status(text) to anon;
