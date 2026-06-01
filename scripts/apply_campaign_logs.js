// Run with: node scripts/apply_campaign_logs.js
const SUPABASE_URL = 'https://itpnfalqjjicesqcjzix.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0cG5mYWxxamppY2VzcWNqeml4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTMwNzMxMSwiZXhwIjoyMDkxMDgzMzExfQ.KMk76G3Ikn7xL3I25Uqbn6srn1Twijc7afmYr-W236E';

const sql = `
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

  do $$ begin
    if not exists (
      select 1 from pg_policies
      where tablename = 'campaign_logs' and policyname = 'Auth read campaign_logs'
    ) then
      execute 'create policy "Auth read campaign_logs" on public.campaign_logs for select using (auth.role() = ''authenticated'')';
    end if;
  end $$;

  do $$ begin
    if not exists (
      select 1 from pg_policies
      where tablename = 'campaign_logs' and policyname = 'Service insert campaign_logs'
    ) then
      execute 'create policy "Service insert campaign_logs" on public.campaign_logs for insert with check (true)';
    end if;
  end $$;

  create index if not exists idx_campaign_logs_campaign_id
    on public.campaign_logs(campaign_id);

  alter table public.email_campaigns
    add column if not exists sent_count integer default 0;
`;

async function run() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql }),
  });

  if (!res.ok) {
    // Try the pg REST endpoint
    const res2 = await fetch(`${SUPABASE_URL}/pg`, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    });
    const text2 = await res2.text();
    console.log('pg endpoint result:', text2.slice(0, 300));
  } else {
    const text = await res.text();
    console.log('Result:', text.slice(0, 300));
  }
}

run().catch(console.error);
