import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PAYSTACK_SECRET    = Deno.env.get('PAYSTACK_SECRET_KEY') ?? '';
const SUPABASE_URL       = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

async function verifySignature(body: string, signature: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(PAYSTACK_SECRET),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  const hex = Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return hex === signature;
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('ok', { status: 200 });
  }

  const body = await req.text();
  const signature = req.headers.get('x-paystack-signature') ?? '';

  if (!(await verifySignature(body, signature))) {
    return new Response('Unauthorized', { status: 401 });
  }

  const event = JSON.parse(body);

  if (event.event === 'charge.success') {
    const reference = event.data?.reference;
    if (!reference) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: order } = await supabase
      .from('orders')
      .select('id, status, notes')
      .eq('paystack_ref', reference)
      .maybeSingle();

    if (order && order.status === 'cancelled') {
      const newNotes = order.notes ? order.notes.replace('[Awaiting Payment]\n', '') : null;
      await supabase
        .from('orders')
        .update({ status: 'processing', notes: newNotes })
        .eq('id', order.id);
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  });
});
