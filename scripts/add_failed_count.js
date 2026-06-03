// Run with: node scripts/add_failed_count.js
const SUPABASE_URL = 'https://itpnfalqjjicesqcjzix.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0cG5mYWxxamppY2VzcWNqeml4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTMwNzMxMSwiZXhwIjoyMDkxMDgzMzExfQ.KMk76G3Ikn7xL3I25Uqbn6srn1Twijc7afmYr-W236E';

const sql = `
  alter table public.email_campaigns
    add column if not exists failed_count integer default 0;
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

  const text = await res.text();
  console.log('rpc status:', res.status);
  console.log('rpc result:', text);
}

run().catch(console.error);
