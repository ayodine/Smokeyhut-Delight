import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://itpnfalqjjicesqcjzix.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0cG5mYWxxamppY2VzcWNqeml4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTMwNzMxMSwiZXhwIjoyMDkxMDgzMzExfQ.KMk76G3Ikn7xL3I25Uqbn6srn1Twijc7afmYr-W236E';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { error } = await supabase.from('orders').insert({
    customer_name: 'Test',
    customer_phone: '12345',
    delivery_address: 'Test',
    total: 100,
    payment_method: 'bank_transfer',
    channel: 'whatsapp'
  });
  console.log('Error:', error);
}
run();
