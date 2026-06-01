import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://itpnfalqjjicesqcjzix.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0cG5mYWxxamppY2VzcWNqeml4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzMDczMTEsImV4cCI6MjA5MDg4MzMxMX0.M6AiZDTLqiGeOk9WrpBCwN381jq6OV2GbgWaDAjgM3E';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function runQuery(sql) {
  const { data, error } = await supabase.rpc('exec_read_only_sql', { q: sql });
  if (error) {
    console.error('Error running SQL:', error);
    throw error;
  }
  return data;
}

async function main() {
  console.log('Querying products table columns...');
  const prodCols = await runQuery(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'products'
  `);
  console.table(prodCols);

  console.log('\nQuerying order_items table columns...');
  const itemCols = await runQuery(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'order_items'
  `);
  console.table(itemCols);
}

main().catch(console.error);
