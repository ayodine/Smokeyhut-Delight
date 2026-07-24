import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveCallbackOrigin } from "../_shared/paystack.ts";

// Starts a Paystack hosted-page payment for an existing pending_payment order.
// The client sends ONLY {order_id, origin} — the charged amount always comes
// from the order row in the DB (tamper-proof), and the callback origin is
// allowlisted (the old hardcoded ISP-blocked web.app callback is the bug that
// sank the last integration).

const PAYSTACK_SECRET_KEY = (Deno.env.get('PAYSTACK_SECRET_KEY') ?? '').trim();
const SUPABASE_URL        = (Deno.env.get('SUPABASE_URL') ?? '').trim();
const SERVICE_KEY         = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // Deploy-time sanity probe (the April silent-killer check).
  if (req.method === 'GET' && new URL(req.url).searchParams.has('health')) {
    return json(200, { ok: true, paystack_key: !!PAYSTACK_SECRET_KEY, service_key: !!SERVICE_KEY });
  }
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });
  if (!PAYSTACK_SECRET_KEY || !SUPABASE_URL || !SERVICE_KEY) {
    console.error('initialize-payment: configuration_error (missing key)');
    return json(500, { error: 'configuration_error' });
  }

  let body: any;
  try { body = await req.json(); } catch { return json(400, { error: 'Bad JSON' }); }
  const orderId = body?.order_id;
  if (!orderId || typeof orderId !== 'string') return json(400, { error: 'Missing order_id' });

  const db = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: order, error } = await db
    .from('orders')
    .select('id, total, customer_email, status')
    .eq('id', orderId).is('deleted_at', null).maybeSingle();
  if (error) return json(500, { error: error.message });
  if (!order) return json(404, { error: 'Order not found' });
  if (order.status !== 'pending_payment') return json(409, { error: `Order is ${order.status}, not payable` });
  if (!order.customer_email) return json(400, { error: 'Order has no email' });

  const origin = resolveCallbackOrigin(body?.origin);
  const res = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: order.customer_email,
      amount: Math.round(Number(order.total) * 100),
      callback_url: `${origin}/payment/success`,
      metadata: { order_id: order.id },
    }),
  });
  const data = await res.json();
  if (!data?.status || !data?.data?.authorization_url) {
    console.error(`initialize-payment: Paystack init failed for ${orderId}: ${data?.message}`);
    return json(502, { error: data?.message || 'Paystack initialization failed' });
  }

  // Store the reference NOW so webhook / sweeper / success page can all find
  // the order by reference even if this response never reaches the client.
  const { error: refErr } = await db
    .from('orders').update({ paystack_ref: data.data.reference }).eq('id', order.id);
  if (refErr) {
    console.error(`initialize-payment: failed to store ref for ${orderId}: ${refErr.message}`);
    return json(500, { error: 'Could not record payment reference' });
  }

  return json(200, { authorization_url: data.data.authorization_url, reference: data.data.reference });
});
