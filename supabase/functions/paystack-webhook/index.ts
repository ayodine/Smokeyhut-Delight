import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decidePromotion, promoteOrder, sendOrderConfirmedEmail } from "../_shared/paystack.ts";

// THE source of payment truth. Paystack calls this server-to-server on every
// charge event; nothing about marking an order paid depends on the customer's
// browser. verify-payment and reconcile-payments are backup entry points to
// the same shared promotion path.

const PAYSTACK_SECRET = (Deno.env.get('PAYSTACK_SECRET_KEY') ?? '').trim();
const SUPABASE_URL    = (Deno.env.get('SUPABASE_URL') ?? '').trim();
const SERVICE_KEY     = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();

async function verifySignature(body: string, signature: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(PAYSTACK_SECRET),
    { name: 'HMAC', hash: 'SHA-512' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  return hex === signature;
}

serve(async (req) => {
  if (req.method === 'GET' && new URL(req.url).searchParams.has('health')) {
    return new Response(JSON.stringify({ ok: true, paystack_key: !!PAYSTACK_SECRET, service_key: !!SERVICE_KEY }), {
      headers: { 'Content-Type': 'application/json' }, status: 200,
    });
  }
  if (req.method !== 'POST') return new Response('ok', { status: 200 });
  if (!PAYSTACK_SECRET || !SUPABASE_URL || !SERVICE_KEY) {
    console.error('paystack-webhook: configuration_error');
    return new Response('misconfigured', { status: 500 });
  }

  const body = await req.text();
  const signature = req.headers.get('x-paystack-signature') ?? '';
  if (!(await verifySignature(body, signature))) {
    return new Response('Unauthorized', { status: 401 });
  }

  const event = JSON.parse(body);
  if (event.event !== 'charge.success') {
    return new Response(JSON.stringify({ ok: true, ignored: event.event }), { status: 200 });
  }

  const reference = event.data?.reference;
  const orderId = event.data?.metadata?.order_id ?? null;
  const db = createClient(SUPABASE_URL, SERVICE_KEY);

  // metadata.order_id first, stored reference as fallback.
  let q = db.from('orders')
    .select('id, status, paid_at, total, customer_name, customer_email, customer_phone, delivery_address')
    .is('deleted_at', null).limit(1);
  q = orderId ? q.eq('id', orderId) : q.eq('paystack_ref', reference ?? '');
  const { data: rows, error } = await q;
  if (error) { console.error('paystack-webhook: db error', error.message); return new Response('db error', { status: 500 }); }
  const order = rows?.[0];
  if (!order) {
    console.warn(`paystack-webhook: no order for ref=${reference} order_id=${orderId}`);
    return new Response(JSON.stringify({ ok: true, skipped: 'order_not_found' }), { status: 200 });
  }

  const decision = decidePromotion(order, Number(event.data?.amount ?? -1));
  if (decision === 'amount_mismatch') {
    console.error(`paystack-webhook: AMOUNT MISMATCH order=${order.id} expected=${Math.round(order.total * 100)} got=${event.data?.amount}`);
    await db.from('orders')
      .update({ notes: `[PAYMENT AMOUNT MISMATCH ref=${reference}]` })
      .eq('id', order.id).eq('status', 'pending_payment');
    return new Response(JSON.stringify({ ok: true, flagged: 'amount_mismatch' }), { status: 200 });
  }
  if (decision === 'noop') {
    return new Response(JSON.stringify({ ok: true, skipped: 'already_processed' }), { status: 200 });
  }

  // Gate the email on the actual transition — verify-payment / sweeper may race us.
  const didPromote = await promoteOrder(db, order.id, { reference, channel: event.data?.channel });
  if (didPromote) await sendOrderConfirmedEmail(order);
  console.log(`paystack-webhook: ${didPromote ? 'promoted' : 'already-promoted'} ${order.id} (ref ${reference})`);
  return new Response(JSON.stringify({ ok: true, promoted: order.id }), { status: 200 });
});
