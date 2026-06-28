import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Partner order API (minimal pass-through).
// A trusted third party submits an order on a customer's behalf. They authenticate
// with a single shared API key in the `x-api-key` header. We trust the prices/total
// they send (pass-through) and just insert the order + line items, tagged
// channel = 'partner'. Returns the generated SHD-XXXXX order id.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const API_KEY      = (Deno.env.get('PARTNER_ORDER_API_KEY') ?? '').trim();
const SUPABASE_URL = (Deno.env.get('SUPABASE_URL') ?? '').trim();
const SERVICE_KEY  = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

// Constant-time-ish string compare to avoid leaking the key via timing.
const safeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? 0 : n;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { ok: false, error: 'Method not allowed' });

  if (!API_KEY || !SUPABASE_URL || !SERVICE_KEY) {
    return json(500, { ok: false, error: 'Order API not configured' });
  }

  // 1. Authenticate.
  const provided = (req.headers.get('x-api-key') ?? '').trim();
  if (!provided || !safeEqual(provided, API_KEY)) {
    return json(401, { ok: false, error: 'Invalid or missing API key' });
  }

  // 2. Parse + minimally validate.
  let p: any;
  try {
    p = await req.json();
  } catch {
    return json(400, { ok: false, error: 'Invalid JSON body' });
  }

  const items = Array.isArray(p?.items) ? p.items : [];
  if (!p?.customer_phone || !String(p.customer_phone).trim()) {
    return json(400, { ok: false, error: 'customer_phone is required' });
  }
  if (!items.length) {
    return json(400, { ok: false, error: 'At least one item is required' });
  }
  for (const it of items) {
    if (!it?.name || num(it?.qty) <= 0) {
      return json(400, { ok: false, error: 'Each item needs a name and a qty > 0' });
    }
  }

  // 3. Insert (pass-through: we trust the partner's prices/total).
  const db = createClient(SUPABASE_URL, SERVICE_KEY);
  try {
    const { data: order, error: orderErr } = await db
      .from('orders')
      .insert({
        customer_name:    p.customer_name ?? null,
        customer_email:   p.customer_email || null,
        customer_phone:   String(p.customer_phone).trim(),
        delivery_address: p.delivery_address ?? null,
        delivery_zone:    p.delivery_zone || null,
        store_id:         p.store_id != null ? Number(p.store_id) : null,
        payment_method:   p.payment_method || 'bank_transfer',
        total:            num(p.total),
        delivery_fee:     num(p.delivery_fee),
        notes:            p.notes || null,
        status:           'pending',
        channel:          'partner',
      })
      .select('id')
      .single();
    if (orderErr) throw orderErr;

    const orderId = order.id;
    const { error: itemsErr } = await db.from('order_items').insert(
      items.map((i: any) => ({
        order_id:   orderId,
        product_id: i.product_id != null ? Number(i.product_id) : null,
        name:       i.name,
        price:      num(i.price),
        qty:        num(i.qty),
      })),
    );
    if (itemsErr) throw itemsErr;

    return json(200, { ok: true, order_id: orderId });
  } catch (err) {
    console.error('receive-order error:', err);
    return json(500, { ok: false, error: (err as Error).message });
  }
});
