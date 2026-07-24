import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decidePromotion, promoteOrder, verifyTransaction, sendOrderConfirmedEmail } from "../_shared/paystack.ts";

// Backup entry point to the same promotion path the webhook uses. Called once
// by the success page when webhook delivery is slow. Server-side verification
// against Paystack — never trusts the client beyond the reference string.

const PAYSTACK_SECRET = (Deno.env.get('PAYSTACK_SECRET_KEY') ?? '').trim();
const SUPABASE_URL    = (Deno.env.get('SUPABASE_URL') ?? '').trim();
const SERVICE_KEY     = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });
  if (!PAYSTACK_SECRET || !SUPABASE_URL || !SERVICE_KEY) return json(500, { error: 'configuration_error' });

  let body: any;
  try { body = await req.json(); } catch { return json(400, { error: 'Bad JSON' }); }
  const reference = body?.reference;
  if (!reference || typeof reference !== 'string') return json(400, { error: 'Missing reference' });

  const tx = await verifyTransaction(PAYSTACK_SECRET, reference);
  if (!tx) return json(400, { success: false, error: 'Payment not verified by Paystack' });

  const db = createClient(SUPABASE_URL, SERVICE_KEY);
  const orderId = tx.metadata?.order_id ?? null;
  let q = db.from('orders')
    .select('id, status, paid_at, total, customer_name, customer_email, customer_phone, delivery_address')
    .is('deleted_at', null).limit(1);
  q = orderId ? q.eq('id', orderId) : q.eq('paystack_ref', reference);
  const { data: rows, error } = await q;
  if (error) return json(500, { error: error.message });
  const order = rows?.[0];
  if (!order) return json(404, { success: false, error: 'Order not found' });

  const decision = decidePromotion(order, Number(tx.amount ?? -1));
  if (decision === 'amount_mismatch') {
    console.error(`verify-payment: AMOUNT MISMATCH order=${order.id}`);
    return json(409, { success: false, error: 'amount_mismatch' });
  }
  if (decision === 'promote') {
    // Gate the email on the actual transition — the webhook may be racing us.
    const didPromote = await promoteOrder(db, order.id, { reference, channel: tx.channel });
    if (didPromote) await sendOrderConfirmedEmail(order);
    console.log(`verify-payment: ${didPromote ? 'promoted' : 'already-promoted'} ${order.id}`);
  }
  return json(200, { success: true, order_id: order.id, status: decision === 'promote' ? 'pending' : order.status });
});
