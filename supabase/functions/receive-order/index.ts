import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
};

const API_KEY        = Deno.env.get('WHATSAPP_ORDER_API_KEY') ?? '';
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // Auth check
  const incomingKey = req.headers.get('x-api-key') ?? '';
  if (!API_KEY || incomingKey !== API_KEY) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();

    // Validate required fields
    const required = ['customer_name', 'customer_phone', 'delivery_address', 'total', 'items'];
    for (const field of required) {
      if (!body[field]) {
        return new Response(JSON.stringify({ ok: false, error: `Missing required field: ${field}` }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    if (!Array.isArray(body.items) || body.items.length === 0) {
      return new Response(JSON.stringify({ ok: false, error: 'items must be a non-empty array' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    // Deduplication: reject same phone + total within 60 seconds
    const since = new Date(Date.now() - 60_000).toISOString();
    const { data: existing } = await supabase
      .from('orders')
      .select('id')
      .eq('customer_phone', body.customer_phone)
      .eq('total', Number(body.total))
      .eq('channel', 'whatsapp')
      .gte('created_at', since)
      .limit(1)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ ok: true, order_id: existing.id, deduplicated: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Insert order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        customer_name:    body.customer_name,
        customer_phone:   body.customer_phone,
        customer_email:   body.customer_email ?? null,
        delivery_address: body.delivery_address,
        notes:            body.notes ?? null,
        total:            Number(body.total),
        delivery_fee:     body.delivery_fee != null ? Number(body.delivery_fee) : null,
        payment_method:   'cash',
        channel:          'whatsapp',
        status:           'pending',
      })
      .select('id')
      .single();

    if (orderError) throw orderError;

    // Insert order items
    const items = body.items.map((item: { name: string; price: number; qty: number }) => ({
      order_id: order.id,
      name:     item.name,
      price:    Number(item.price),
      qty:      Number(item.qty) || 1,
    }));

    const { error: itemsError } = await supabase.from('order_items').insert(items);
    if (itemsError) throw itemsError;

    return new Response(JSON.stringify({ ok: true, order_id: order.id }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
