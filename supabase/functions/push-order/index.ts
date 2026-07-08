import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ORDER_COLUMNS, shapeOrders } from "../_shared/order-shape.ts";

// Real-time partner push. Invoked by the DB trigger (trg_push_partner_order) the
// instant an order is inserted or changes. It loads the order, shapes it exactly
// like the poll API (/export-orders), HMAC-signs the body, and POSTs it to the
// partner's webhook.
//
// Reliability: pg_net does not retry, so this push is best-effort. That is fine
// because /export-orders remains the reconciliation fallback — if a push fails
// (partner down, network blip), the partner's next scheduled poll picks up the
// change via upsert-by-id. A missed push is never lost data, only delayed.

const SUPABASE_URL   = (Deno.env.get('SUPABASE_URL') ?? '').trim();
const SERVICE_KEY    = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();
const HOOK_SECRET    = (Deno.env.get('PARTNER_PUSH_HOOK_SECRET') ?? '').trim(); // internal: trigger → this fn
const PARTNER_URL    = (Deno.env.get('PARTNER_WEBHOOK_URL') ?? '').trim();
const SIGNING_SECRET = (Deno.env.get('PARTNER_WEBHOOK_SECRET') ?? '').trim();   // HMAC: this fn → partner

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const enc = new TextEncoder();

// Constant-time-ish compare so the internal hook secret can't be guessed via timing.
const safeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

async function hmacHex(body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

serve(async (req) => {
  if (req.method !== 'POST') return json(405, { ok: false, error: 'Method not allowed' });
  if (!SUPABASE_URL || !SERVICE_KEY) return json(500, { ok: false, error: 'Not configured' });

  // Only our DB trigger may invoke this — it proves itself with the shared hook secret.
  const provided = (req.headers.get('x-hook-secret') ?? '').trim();
  if (!HOOK_SECRET || !safeEqual(provided, HOOK_SECRET)) {
    return json(401, { ok: false, error: 'Unauthorized' });
  }

  let payload: any;
  try { payload = await req.json(); } catch { return json(400, { ok: false, error: 'Bad JSON' }); }
  const id = payload?.id ?? payload?.record?.id;
  if (!id) return json(400, { ok: false, error: 'Missing order id' });

  // If the partner endpoint isn't wired up yet, accept-and-noop so the trigger
  // never errors and orders keep flowing through the poll fallback.
  if (!PARTNER_URL || !SIGNING_SECRET) {
    console.warn(`push-order: PARTNER_WEBHOOK_URL/SECRET not set — skipping push for ${id}`);
    return json(200, { ok: true, skipped: 'partner_not_configured' });
  }

  const db = createClient(SUPABASE_URL, SERVICE_KEY);

  // Load the order (exclude soft-deleted — a delete shouldn't leak the row to the partner).
  const { data: rows, error } = await db
    .from('orders').select(ORDER_COLUMNS).eq('id', id).is('deleted_at', null).limit(1);
  if (error) return json(500, { ok: false, error: error.message });
  if (!rows?.length) return json(200, { ok: true, skipped: 'not_found_or_deleted' });

  const [order] = await shapeOrders(db, rows);
  const bodyStr = JSON.stringify({ type: 'order.upserted', order });
  const signature = await hmacHex(bodyStr, SIGNING_SECRET);

  try {
    const res = await fetch(PARTNER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Smokey-Event': 'order.upserted',
        'X-Smokey-Signature': `sha256=${signature}`,
      },
      body: bodyStr,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.error(`push-order: partner ${res.status} for ${id}: ${txt.slice(0, 300)}`);
      return json(502, { ok: false, error: `partner responded ${res.status}` });
    }
  } catch (e) {
    console.error(`push-order: partner unreachable for ${id}:`, e);
    return json(502, { ok: false, error: 'partner unreachable' });
  }

  return json(200, { ok: true, pushed: id });
});
