import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync('.env', 'utf-8');
const SUPABASE_URL = env.match(/SUPABASE_URL=(.*)/)[1].trim();
const SUPABASE_SERVICE_KEY = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function run() {
  const { data: savedOrder, error } = await supabase
    .from('orders')
    .select('*')
    .eq('id', 'SHD-00306')
    .single();

  if (error) {
    console.error("Error fetching order:", error);
    return;
  }

  console.log("\n--- VERIFICATION OF ORDER SHD-00306 ---");
  console.log("Customer:", savedOrder.customer_name);
  console.log("Payment Method:", savedOrder.payment_method);
  console.log("Status:", savedOrder.status);
  console.log("Saved Total (Product Only):", savedOrder.total);
  console.log("Saved Delivery Fee:", savedOrder.delivery_fee);
  
  if (savedOrder.total === 10000 && savedOrder.delivery_fee === 1500) {
    console.log("\n✅ SUCCESS: The delivery fee is correctly separated from the total!");
  } else {
    console.log("\n❌ FAILED: The total includes the delivery fee or values mismatch.");
  }
}
run();
