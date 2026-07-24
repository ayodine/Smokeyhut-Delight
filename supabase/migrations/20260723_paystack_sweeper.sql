-- Schedules the reconcile-payments sweeper via pg_cron + pg_net.
-- Prereq (rollout step, NOT in this file): the shared secret must exist in BOTH places:
--   select vault.create_secret('<value>', 'RECONCILE_HOOK_SECRET');
--   supabase secrets set RECONCILE_HOOK_SECRET=<value>
-- APPLY with: supabase db query --linked -f supabase/migrations/20260723_paystack_sweeper.sql

create extension if not exists pg_cron;

create or replace function public.invoke_reconcile_payments()
returns void
language plpgsql
security definer
set search_path = public, net, vault
as $$
declare
  hook_secret text;
begin
  begin
    select decrypted_secret into hook_secret
      from vault.decrypted_secrets
      where name = 'RECONCILE_HOOK_SECRET'
      limit 1;
  exception when others then
    hook_secret := null;
  end;

  perform net.http_post(
    url     := 'https://itpnfalqjjicesqcjzix.functions.supabase.co/reconcile-payments',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-hook-secret', coalesce(hook_secret, '')
    ),
    body    := '{}'::jsonb
  );
end;
$$;

-- cron.schedule upserts by job name, so re-applying is safe.
select cron.schedule('reconcile-payments', '*/15 * * * *', 'select public.invoke_reconcile_payments()');
