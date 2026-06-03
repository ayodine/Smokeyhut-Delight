import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

// Read .env file
const envText = fs.readFileSync('.env', 'utf8');
const env = {};
envText.split('\n').forEach(line => {
  if (line.includes('=')) {
    const parts = line.split('=');
    const key = parts[0].trim();
    const value = parts.slice(1).join('=').trim();
    env[key] = value;
  }
});

const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY;

console.log('Using URL:', supabaseUrl);
console.log('Using Key starts with:', supabaseKey?.substring(0, 15));

const supabase = createClient(supabaseUrl, supabaseKey);

async function findFirstOrder() {
  const { data, error } = await supabase
    .from('orders')
    .select('id, created_at, customer_name, total')
    .order('created_at', { ascending: true })
    .limit(1);

  if (error) {
    console.error('Error fetching first order:', error);
  } else {
    console.log('FIRST_ORDER_DATA:', JSON.stringify(data));
  }
}

findFirstOrder();
