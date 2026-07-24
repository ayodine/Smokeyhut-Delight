// Shared Paystack logic for initialize-payment, paystack-webhook,
// verify-payment, and reconcile-payments. The promotion path lives HERE and
// only here — webhook, verify, and sweeper are three entry points to one
// idempotent transition (pending_payment → pending + paid_at).

const ALLOWED_ORIGINS = [
  'https://smokeyhutdelight.com',
  'https://www.smokeyhutdelight.com',
  'https://smokeyhut-delight.web.app',
];
const DEFAULT_ORIGIN = 'https://smokeyhutdelight.com';
const LOCALHOST_RE = /^http:\/\/localhost:\d+$/;

export function resolveCallbackOrigin(origin?: string | null): string {
  if (!origin) return DEFAULT_ORIGIN;
  if (ALLOWED_ORIGINS.includes(origin) || LOCALHOST_RE.test(origin)) return origin;
  return DEFAULT_ORIGIN;
}

// Decide what a payment event means for an order. Amount check first:
// a mismatch must never promote, whatever the status.
export function decidePromotion(
  order: { status: string; paid_at: string | null; total: number },
  amountKobo: number,
): 'promote' | 'noop' | 'amount_mismatch' {
  if (amountKobo !== Math.round(Number(order.total) * 100)) return 'amount_mismatch';
  if (order.status === 'pending_payment') return 'promote';
  if (order.status === 'cancelled' && !order.paid_at) return 'promote'; // late-webhook rescue of a swept order
  return 'noop';
}

// GET /transaction/verify/:reference — returns the transaction data object
// when Paystack says success, null otherwise (including network errors).
export async function verifyTransaction(secretKey: string, reference: string): Promise<any | null> {
  try {
    const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    const body = await res.json();
    if (body?.status && body?.data?.status === 'success') return body.data;
    return null;
  } catch {
    return null;
  }
}

// Classify a Paystack verify RESPONSE into a three-way outcome. Pure so it can
// be unit-tested without network. 'unknown' means "could not decide" (transport
// failure, envelope error, or a not-yet-terminal state like pending/ongoing) —
// the sweeper must NEVER cancel on 'unknown', only on a definitive 'unpaid'.
export function classifyPaystackStatus(
  httpOk: boolean,
  body: any,
): { outcome: 'paid' | 'unpaid' | 'unknown'; data?: any } {
  if (!httpOk || !body?.status) return { outcome: 'unknown' };
  const st = body?.data?.status;
  if (st === 'success') return { outcome: 'paid', data: body.data };
  if (st === 'failed' || st === 'abandoned' || st === 'reversed') return { outcome: 'unpaid', data: body.data };
  return { outcome: 'unknown', data: body.data };
}

// Sweeper-only: re-verify a reference and classify it. Distinguishes a
// CONFIRMED-unpaid verdict from a failed verification attempt so a Paystack
// outage can never cancel a paid order. verify-payment keeps using
// verifyTransaction (it only ever promotes, never cancels).
export async function classifyTransaction(
  secretKey: string,
  reference: string,
): Promise<{ outcome: 'paid' | 'unpaid' | 'unknown'; data?: any }> {
  try {
    const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    let body: any = null;
    try { body = await res.json(); } catch { return { outcome: 'unknown' }; }
    return classifyPaystackStatus(res.ok, body);
  } catch {
    return { outcome: 'unknown' };
  }
}

// The single promotion write. Guarded so a concurrent/duplicate call can't
// double-promote: only rows still matching the promotable states update.
// Returns whether THIS call actually performed the transition — callers gate
// the confirmation email on that so a racing entry point can't double-send.
export async function promoteOrder(
  db: any,
  orderId: string,
  tx: { reference: string; channel?: string },
): Promise<boolean> {
  const { data, error } = await db
    .from('orders')
    .update({
      status: 'pending',
      paid_at: new Date().toISOString(),
      payment_channel: tx.channel ?? null,
      paystack_ref: tx.reference,
      cancel_reason: null,
    })
    .eq('id', orderId)
    .in('status', ['pending_payment', 'cancelled'])
    .is('paid_at', null)
    .select('id');
  if (error) throw new Error(`promoteOrder(${orderId}): ${error.message}`);
  return (data?.length ?? 0) > 0;
}

// Fire-and-forget confirmation email via the existing notify function.
// Never throws — the payment write is the critical section, not this.
export async function sendOrderConfirmedEmail(order: {
  id: string; customer_name: string | null; customer_email: string | null;
  customer_phone: string | null; delivery_address: string | null; total: number;
}): Promise<void> {
  const url = (Deno.env.get('SUPABASE_URL') ?? '').trim();
  const anon = (Deno.env.get('SUPABASE_ANON_KEY') ?? '').trim();
  if (!url || !anon) return;
  try {
    await fetch(`${url}/functions/v1/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${anon}`, apikey: anon },
      body: JSON.stringify({ type: 'order_confirmed', order }),
    });
  } catch { /* silent */ }
}
