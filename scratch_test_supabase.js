import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://itpnfalqjjicesqcjzix.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0cG5mYWxxamppY2VzcWNqeml4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzMDczMTEsImV4cCI6MjA5MDg4MzMxMX0.M6AiZDTLqiGeOk9WrpBCwN381jq6OV2GbgWaDAjgM3E';

console.log('Connecting to:', supabaseUrl);

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  const { data, error } = await supabase.rpc('get_customers_directory', {
    p_start: null,
    p_end: null,
    p_search: '',
    p_sort_key: 'lastOrder',
    p_sort_dir: 'desc',
    p_limit: 20,
    p_offset: 0
  });

  if (error) {
    console.error('Error fetching directory:', error);
  } else {
    console.log('Success! Data count:', data ? data.length : 0);
    if (data && data.length > 0) {
      console.log('Sample data keys:', Object.keys(data[0]));
      console.log('First customer name:', data[0].name);
      console.log('First customer total spent:', data[0].totalSpent);
    }
  }
}

run();
