import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decidePromotion, promoteOrder, verifyTransaction, sendOrderConfirmedEmail } from "../_shared/paystack.ts";

// Reconciliation sweeper — invoked by pg_cron every 15 minutes. For every
// order stuck in pending_payment: if Paystack says paid, promote it (missed
// webhook); if unpaid past the 2h cutoff, cancel it. INVARIANT: an order with
// a reference is NEVER cancelled without a same-run Paystack re-verification.

const PAYSTACK_SECRET = (Deno.env.get('PAYSTACK_SECRET_KEY') ?? '').trim();
const SUPABASE_URL    = (Deno.env.get('SUPABASE_URL') ?? '').trim();
const SERVICE_KEY     = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();
const HOOK_SECRET     = (Deno.env.get('RECONCILE_HOOK_SECRET') ?? '').trim();

const GRACE_MINUTES = 30;   // leave fresh checkouts alone
const EXPIRE_HOURS  = 2;    // unpaid past this → cancelled
const LOOKBACK_HOURS = 48;  // don't chase ancient rows forever
const BATCH = 50;

const safeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

serve(async (req) => {
  if (req.method === 'GET' && new URL(req.url).searchParams.has('health')) {
    return new Response(JSON.stringify({ ok: true, paystack_key: !!PAYSTACK_SECRET, service_key: !!SERVICE_KEY, hook_secret: !!HOOK_SECRET }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  if (req.method !== 'POST') return new Response('ok', { status: 200 });
  const provided = (req.headers.get('x-hook-secret') ?? '').trim();
  if (!HOOK_SECRET || !safeEqual(provided, HOOK_SECRET)) {
    return new Response('Unauthorized', { status: 401 });
  }
  if (!PAYSTACK_SECRET || !SUPABASE_URL || !SERVICE_KEY) {
    return new Response('misconfigured', { status: 500 });
  }

  const db = createClient(SUPABASE_URL, SERVICE_KEY);
  const now = Date.now();
  const newest = new Date(now - GRACE_MINUTES * 60_000).toISOString();
  const oldest = new Date(now - LOOKBACK_HOURS * 3_600_000).toISOString();

  const { data: rows, error } = await db
    .from('orders')
    .select('id, status, paid_at, total, paystack_ref, created_at, customer_name, customer_email, customer_phone, delivery_address')
    .eq('status', 'pending_payment')
    .is('deleted_at', null)
    .lt('created_at', newest)
    .gt('created_at', oldest)
    .order('created_at', { ascending: true })
    .limit(BATCH);
  if (error) return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 });

  let promoted = 0, cancelled = 0, left = 0;
  for (const order of rows ?? []) {
    const ageMs = now - Date.parse(order.created_at);
    const expired = ageMs > EXPIRE_HOURS * 3_600_000;

    const tx = order.paystack_ref ? await verifyTransaction(PAYSTACK_SECRET, order.paystack_ref) : null;
    if (tx && decidePromotion(order, Number(tx.amount ?? -1)) === 'promote') {
      // Gate the email on the actual transition — the webhook may be racing us.
      const didPromote = await promoteOrder(db, order.id, { reference: order.paystack_ref!, channel: tx.channel });
      if (didPromote) { await sendOrderConfirmedEmail(order); promoted++; }
      continue;
    }
    if (expired) {
      // Re-verified unpaid (or never got a reference — never charged). Safe to expire.
      await db.from('orders')
        .update({ status: 'cancelled', cancel_reason: 'Payment expired (Paystack)' })
        .eq('id', order.id).eq('status', 'pending_payment');
      cancelled++;
      continue;
    }
    left++;
  }

  const summary = { ok: true, scanned: rows?.length ?? 0, promoted, cancelled, awaiting: left };
  console.log('reconcile-payments:', JSON.stringify(summary));
  return new Response(JSON.stringify(summary), { status: 200, headers: { 'Content-Type': 'application/json' } });
});
