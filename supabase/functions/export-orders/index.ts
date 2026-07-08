import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ORDER_COLUMNS, shapeOrders } from "../_shared/order-shape.ts";

// Partner order-export API (read / pull).
// A trusted third party polls this endpoint to sync orders OUT of our database
// into their software. They authenticate with a single shared API key in the
// `x-api-key` header and page forward with a `since` cursor (updated_at).
// Returns every non-deleted order (including cancelled, so partners see status
// transitions) changed after `since`, with full customer + line-item detail.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const API_KEY      = (Deno.env.get('PARTNER_ORDER_API_KEY') ?? '').trim();
const SUPABASE_URL = (Deno.env.get('SUPABASE_URL') ?? '').trim();
const SERVICE_KEY  = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

// Constant-time-ish compare to avoid leaking the key via timing.
const safeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'GET') return json(405, { ok: false, error: 'Method not allowed' });

  if (!API_KEY || !SUPABASE_URL || !SERVICE_KEY) {
    return json(500, { ok: false, error: 'Order export API not configured' });
  }

  // 1. Authenticate.
  const provided = (req.headers.get('x-api-key') ?? '').trim();
  if (!provided || !safeEqual(provided, API_KEY)) {
    return json(401, { ok: false, error: 'Invalid or missing API key' });
  }

  // 2. Parse params.
  const url = new URL(req.url);
  const since = url.searchParams.get('since');
  if (since && isNaN(Date.parse(since))) {
    return json(400, { ok: false, error: 'Invalid `since` — must be an ISO 8601 timestamp' });
  }
  let limit = Number(url.searchParams.get('limit') ?? DEFAULT_LIMIT);
  if (!Number.isFinite(limit) || limit <= 0) limit = DEFAULT_LIMIT;
  limit = Math.min(Math.floor(limit), MAX_LIMIT);

  const db = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    // 3. Page of orders changed after `since` (cancelled included; soft-deleted excluded).
    let q = db
      .from('orders')
      .select(ORDER_COLUMNS)
      .is('deleted_at', null)
      .order('updated_at', { ascending: true })
      .limit(limit);
    if (since) q = q.gt('updated_at', since);

    const { data: orders, error: ordersErr } = await q;
    if (ordersErr) throw ordersErr;

    // 4. Shape the page (fetches line items). Identical shape to the push API.
    const shaped = await shapeOrders(db, orders ?? []);

    // next_since: the last row's updated_at (feed it back on the next call). If the
    // page was empty, echo the caller's `since` so they can safely poll again.
    const next_since = shaped.length ? shaped[shaped.length - 1].updated_at : (since ?? null);

    return json(200, { ok: true, orders: shaped, count: shaped.length, next_since });
  } catch (err) {
    console.error('export-orders error:', err);
    return json(500, { ok: false, error: (err as Error).message });
  }
});
