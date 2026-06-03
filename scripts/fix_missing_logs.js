import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://itpnfalqjjicesqcjzix.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0cG5mYWxxamppY2VzcWNqeml4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzMDczMTEsImV4cCI6MjA5MDg4MzMxMX0.M6AiZDTLqiGeOk9WrpBCwN381jq6OV2GbgWaDAjgM3E';

const supabase = createClient(SUPABASE_URL, ANON_KEY);

const CAMPAIGN_ID = '1cf062a4-82d5-4a22-aaaa-4900fdcd2366';
const CAMPAIGN_TIME = new Date('2026-06-02T01:11:27.083442+00:00').getTime();

async function run() {
  // 1. Fetch all orders (active)
  console.log('Fetching orders...');
  const { data: orders, error: ordersErr } = await supabase
    .from('orders')
    .select('id, customer_name, customer_email, customer_phone, total, created_at, status')
    .is('deleted_at', null);

  if (ordersErr) throw ordersErr;
  console.log(`Fetched ${orders.length} orders.`);

  // 2. Fetch existing logs for this campaign
  console.log('Fetching campaign logs...');
  const { data: logs, error: logsErr } = await supabase
    .from('campaign_logs')
    .select('email')
    .eq('campaign_id', CAMPAIGN_ID);

  if (logsErr) throw logsErr;
  console.log(`Fetched ${logs.length} existing logs.`);

  const loggedEmails = new Set(logs.map(l => l.email.trim().toLowerCase()));

  // 3. Filter orders created before campaign time
  const historicalOrders = orders.filter(o => new Date(o.created_at).getTime() < CAMPAIGN_TIME);
  console.log(`Orders before campaign time: ${historicalOrders.length}`);

  // 4. Construct customer list at that point in time
  const customerMap = {};
  historicalOrders.forEach(o => {
    const key = o.customer_phone || o.customer_email || o.customer_name;
    if (!key) return;
    if (!customerMap[key]) {
      customerMap[key] = {
        id: key,
        name: o.customer_name,
        email: o.customer_email,
        totalSpent: 0,
        orders: 0
      };
    }
    if (o.status !== 'cancelled') {
      customerMap[key].totalSpent += Number(o.total || 0);
    }
    customerMap[key].orders += 1;
  });

  const customersList = Object.values(customerMap).filter(c => c.email && c.email.trim() !== '');
  console.log(`Customers with email at that time: ${customersList.length}`);

  // Deduplicate by email
  const seenEmails = new Set();
  let deduplicatedCustomers = [];
  customersList.forEach(c => {
    const emailLower = c.email.trim().toLowerCase();
    if (!seenEmails.has(emailLower)) {
      seenEmails.add(emailLower);
      deduplicatedCustomers.push(c);
    }
  });
  console.log(`Deduplicated customers with email: ${deduplicatedCustomers.length}`);

  // Sort by spent to identify top 10%
  const sorted = [...deduplicatedCustomers].sort((a, b) => b.totalSpent - a.totalSpent);
  const limit = Math.ceil(sorted.length * 0.1);
  const topIds = new Set(sorted.slice(0, limit).map(c => c.id));

  // Audience was "ALL CUSTOMER EXCLUDE TOP10% MAY"
  // Let's filter out the top 10%
  const audience = deduplicatedCustomers.filter(c => !topIds.has(c.id));
  console.log(`Audience count (excluding top 10%): ${audience.length}`);

  // Find missing ones (audience members who are not in loggedEmails)
  const missing = audience.filter(c => !loggedEmails.has(c.email.trim().toLowerCase()));
  console.log(`Missing recipients: ${missing.length}`);

  if (missing.length > 0) {
    const toInsert = missing.map(c => ({
      campaign_id: CAMPAIGN_ID,
      email: c.email,
      name: c.name || null,
      status: 'failed',
      error: 'Pending execution'
    }));

    console.log(`Inserting ${toInsert.length} log entries into database...`);
    // Insert in batches of 100
    const BATCH_SIZE = 100;
    for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
      const batch = toInsert.slice(i, i + BATCH_SIZE);
      const { error: insertErr } = await supabase.from('campaign_logs').insert(batch);
      if (insertErr) {
        console.error('Insert error:', insertErr);
        break;
      }
      console.log(`Inserted batch ${i / BATCH_SIZE + 1}`);
    }
    console.log('All missing logs inserted successfully!');
  } else {
    console.log('No missing logs to insert.');
  }
}

run().catch(console.error);
