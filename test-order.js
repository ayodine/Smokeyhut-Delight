import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://itpnfalqjjicesqcjzix.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0cG5mYWxxamppY2VzcWNqeml4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzMDczMTEsImV4cCI6MjA5MDg4MzMxMX0.M6AiZDTLqiGeOk9WrpBCwN381jq6OV2GbgWaDAjgM3E';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
  console.log("Creating order...");
  const payload = {
    customer_name: 'Test Customer',
    customer_email: 'test@example.com',
    customer_phone: '+2340000000',
    delivery_address: '123 Test St, Lagos',
    delivery_zone: 'Lekki',
    store_id: 1, // assuming store 1 exists
    payment_method: 'bank_transfer',
    total: 10000, // This is amountToPayNow (Product Total)
    delivery_fee: 1500,
    coupon_code: null,
    coupon_discount: 0,
    status: 'pending',
    notes: 'Test Order'
  };

  const { data: orderId, error: orderError } = await supabase.rpc('create_storefront_order', { p: payload });
  if (orderError) {
    console.error("Order creation failed:", orderError);
    return;
  }
  console.log("Order created with ID:", orderId);

  // Insert items
  const items = [
    { order_id: orderId, product_id: null, name: 'Test Product', price: 10000, qty: 1 }
  ];
  const { error: itemsError } = await supabase.from('order_items').insert(items);
  if (itemsError) {
    console.error("Item insertion failed:", itemsError);
    return;
  }
  console.log("Items inserted!");

  // Fetch the order back
  const { data: savedOrder, error: fetchError } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single();

  console.log("\n--- VERIFICATION ---");
  console.log("Saved Total:", savedOrder.total);
  console.log("Saved Delivery Fee:", savedOrder.delivery_fee);
  console.log("Amount to Pay Upfront:", savedOrder.total);
  console.log("Amount to Collect on Delivery:", savedOrder.delivery_fee);
}
run();
