import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://itpnfalqjjicesqcjzix.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0cG5mYWxxamppY2VzcWNqeml4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTMwNzMxMSwiZXhwIjoyMDkwODgzMzExfQ.KMk76G3Ikn7xL3I25Uqbn6srn1TWijc7afmYr-W236E';

const supabase = createClient(supabaseUrl, supabaseKey);

async function getAllSnapchatData() {
  // Fetch all cart_sessions without limit or large limit
  const { data: sessions, error } = await supabase
    .from('cart_sessions')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching cart_sessions:', error);
    return;
  }

  const snapSessions = sessions.filter(s => {
    const metaStr = JSON.stringify(s.metadata || {}).toLowerCase();
    const isSnap = metaStr.includes('snap') || metaStr.includes('sccid');
    return isSnap;
  });

  console.log(`Found ${snapSessions.length} total Snapchat sessions in database.\n`);

  const formatted = snapSessions.map((s, idx) => {
    const attr = s.metadata?.attribution || {};
    const ref = s.metadata?.referrer || '';
    const url = s.metadata?.url || '';
    
    return {
      index: idx + 1,
      id: s.id,
      session_id: s.session_id,
      created_at: s.created_at,
      last_active_at: s.last_active_at,
      stage: s.stage,
      cart_total: s.cart_total,
      item_count: s.item_count,
      items: s.items,
      customer_name: s.customer_name,
      customer_phone: s.customer_phone,
      customer_email: s.customer_email,
      delivery_address: s.delivery_address,
      delivery_zone: s.delivery_zone,
      order_id: s.order_id,
      recovered: s.recovered,
      url,
      referrer: ref,
      utm_source: attr.utm_source || 'snapchat',
      utm_medium: attr.utm_medium,
      utm_campaign: attr.utm_campaign,
      utm_content: attr.utm_content,
      utm_term: attr.utm_term,
      ad_click_id: attr.ad_click_id,
      traffic_source: attr.traffic_source || 'Snapchat'
    };
  });

  console.log(JSON.stringify(formatted, null, 2));

  // Also check if any new orders exist since this morning
  const { data: latestOrders } = await supabase
    .from('orders')
    .select('id, total, status, traffic_source, utm_source, notes, created_at')
    .or('traffic_source.ilike.%snap%,notes.ilike.%[Source: Snapchat%,utm_source.ilike.%snap%');

  console.log('\nOrders matching Snapchat count:', latestOrders?.length || 0);
}

getAllSnapchatData();
