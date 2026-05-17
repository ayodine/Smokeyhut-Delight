import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = fs.readFileSync('.env', 'utf8');
const supabaseUrl = envFile.match(/^SUPABASE_URL=(.*)/m)[1].trim();
const supabaseKey = envFile.match(/^SUPABASE_SERVICE_ROLE_KEY=(.*)/m)[1].trim();

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkOrders() {
  const tenMinsAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('orders')
    .select('id, created_at, customer_name, channel')
    .gte('created_at', tenMinsAgo)
    .order('created_at', { ascending: false });
    
  console.log("Recent orders:", JSON.stringify(data, null, 2), "Error:", error);
}

checkOrders();
