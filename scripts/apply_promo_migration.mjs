import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUPABASE_URL = 'https://itpnfalqjjicesqcjzix.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0cG5mYWxxamppY2VzcWNqeml4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTMwNzMxMSwiZXhwIjoyMDkwODgzMzExfQ.KMk76G3Ikn7xL3I25Uqbn6srn1TWijc7afmYr-W236E';

const sqlPath = path.join(__dirname, '../supabase/migrations/20260902_promo_offers_system.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

async function apply() {
  console.log('Applying migration...');
  // Try via apply-migration function or pg endpoint
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/apply-migration`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'apikey': SERVICE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql })
    });
    const data = await res.json();
    console.log('Function response:', data);
  } catch (err) {
    console.log('Function call failed, checking postgres endpoint:', err.message);
  }

  // Also check direct table query with service client to verify
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: offers, error } = await supabase.from('promo_offers').select('*');
  if (error) {
    console.log('promo_offers table query check:', error.message);
  } else {
    console.log('promo_offers table exists! Rows:', offers.length);
  }
}

apply().catch(console.error);
