import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://itpnfalqjjicesqcjzix.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0cG5mYWxxamppY2VzcWNqeml4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzMDczMTEsImV4cCI6MjA5MDg4MzMxMX0.M6AiZDTLqiGeOk9WrpBCwN381jq6OV2GbgWaDAjgM3E';

const supabase = createClient(SUPABASE_URL, ANON_KEY);

async function run() {
  console.log('Testing create_storefront_order RPC validation...');

  // Test 1: Inactive product (id 4: HANGOUT PACK)
  const inactivePayload = {
    customer_name: 'Test Inactive',
    customer_phone: '08012345678',
    delivery_address: '123 Test St, Lekki',
    delivery_zone: 'Lekki Phase 1',
    payment_method: 'bank_transfer',
    total: 35000,
    delivery_fee: 2500,
    items: [
      { id: 4, name: 'HANGOUT PACK', price: 35000, qty: 1 }
    ]
  };

  const { data: res1, error: err1 } = await supabase.rpc('create_storefront_order', { p: inactivePayload });
  console.log('Test 1 (Inactive Product):');
  if (err1) {
    console.log('✅ Correctly blocked inactive product:', err1.message);
  } else {
    console.error('❌ FAILED: Inactive product was allowed! Order ID:', res1);
  }

  // Test 2: Non-existent product (id 999999)
  const nonExistentPayload = {
    customer_name: 'Test Non-existent',
    customer_phone: '08012345678',
    delivery_address: '123 Test St, Lekki',
    delivery_zone: 'Lekki Phase 1',
    payment_method: 'bank_transfer',
    total: 10000,
    delivery_fee: 2500,
    items: [
      { id: 999999, name: 'Fake Deleted Product', price: 10000, qty: 1 }
    ]
  };

  const { data: res2, error: err2 } = await supabase.rpc('create_storefront_order', { p: nonExistentPayload });
  console.log('Test 2 (Non-existent / Deleted Product):');
  if (err2) {
    console.log('✅ Correctly blocked non-existent product:', err2.message);
  } else {
    console.error('❌ FAILED: Non-existent product was allowed! Order ID:', res2);
  }

  // Test 3: Free promo item (id null or is_promo_reward: true) alongside active product
  // Let's check with an active product (id 5: Travel standard Dry Guineafowl)
  const activePayload = {
    customer_name: 'Test Active Product',
    customer_phone: '08012345678',
    customer_email: 'test@example.com',
    delivery_address: '123 Test St, Lekki',
    delivery_zone: 'Lekki Phase 1',
    payment_method: 'bank_transfer',
    total: 45000,
    delivery_fee: 2500,
    status: 'pending',
    items: [
      { id: 5, name: 'Travel standard Dry Guineafowl', price: 15000, qty: 3 },
      { id: null, name: 'Free Guinea Fowl (Promo)', price: 0, qty: 1, is_promo_reward: true }
    ]
  };

  const { data: res3, error: err3 } = await supabase.rpc('create_storefront_order', { p: activePayload });
  console.log('Test 3 (Active Product + Promo Gift):');
  if (err3) {
    console.log('Order creation error:', err3.message);
  } else {
    console.log('✅ Order successfully created with active product & promo reward! Order ID:', res3);
  }
}

run().catch(console.error);
