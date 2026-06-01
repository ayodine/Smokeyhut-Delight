-- ── campaign_logs: per-email delivery tracking ─────────────────────────────
create table if not exists public.campaign_logs (
  id           uuid        primary key default gen_random_uuid(),
  campaign_id  uuid        references public.email_campaigns(id) on delete cascade,
  email        text        not null,
  name         text,
  status       text        not null check (status in ('sent', 'failed')),
  error        text,
  created_at   timestamptz default now()
);

alter table public.campaign_logs enable row level security;

-- Authenticated staff can read logs
create policy "Auth read campaign_logs"
  on public.campaign_logs for select
  using (auth.role() = 'authenticated');

-- Allow any insert (edge function uses service role which bypasses RLS anyway,
-- but this keeps the policy permissive so the service client never gets blocked)
create policy "Service insert campaign_logs"
  on public.campaign_logs for insert
  with check (true);

-- Fast lookup by campaign
create index if not exists idx_campaign_logs_campaign_id
  on public.campaign_logs(campaign_id);

-- Also add sent_count column to email_campaigns in case it's missing
alter table public.email_campaigns
  add column if not exists sent_count integer default 0;
