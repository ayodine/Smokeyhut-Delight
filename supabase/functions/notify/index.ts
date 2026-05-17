import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const FROM_EMAIL     = Deno.env.get('FROM_EMAIL') ?? 'Smokeyhut Delight <orders@smokeyhutdelight.com>';

// Statuses where customer + ADMIN_EMAIL + ADMIN_EMAIL_2 are notified
const DELIVERY_STATUSES = new Set(['shipped', 'delivered']);

// Status copy for order progress emails
const STATUS_INFO: Record<string, { subject: string; heading: string; body: string }> = {
  pending: {
    subject: 'Order Received',
    heading: 'New order is pending',
    body: 'A new order has been placed and is waiting to be processed.',
  },
  processing: {
    subject: 'Order Processing',
    heading: 'Your order is being processed',
    body: 'We have received your order and our team is getting it ready for you.',
  },
  shipped: {
    subject: 'Order Shipped',
    heading: 'Your order is on the way!',
    body: 'Your order has been picked up by our delivery team and is heading to you.',
  },
  out_for_delivery: {
    subject: 'Out for Delivery',
    heading: 'Your rider is on the way',
    body: 'Your rider is heading to your address right now. Please be available to receive your order.',
  },
  arrived: {
    subject: 'Order Arrived',
    heading: 'Your order has arrived',
    body: 'Your order has arrived at your location. Enjoy your meal!',
  },
  delivered: {
    subject: 'Order Delivered',
    heading: 'Order delivered!',
    body: 'Your order has been delivered successfully. Thank you for choosing Smokeyhut Delight! We hope you enjoy every bite.',
  },
};

// ── Email ─────────────────────────────────────────────────────────────────────

function buildEmail(heading: string, body: string, orderId?: string, extra?: string): string {
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:20px;background:#111;font-family:Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;background:#1a1a1a;border-radius:12px;overflow:hidden">
    <div style="background:#c0201f;padding:24px 32px;text-align:center">
      <h1 style="margin:0;color:#fff;font-size:1.3rem;letter-spacing:0.03em">Smokeyhut Delight</h1>
    </div>
    <div style="padding:32px">
      <h2 style="color:#fff;margin-top:0;font-size:1.35rem">${heading}</h2>
      <p style="color:#bbb;line-height:1.8;margin-bottom:20px">${body}</p>
      ${orderId ? `<div style="background:#111;border-radius:8px;padding:14px 18px;margin-bottom:20px;font-size:0.9rem">
        <span style="color:#888">Order Reference: </span>
        <strong style="color:#fff;font-family:monospace">${orderId}</strong>
      </div>` : ''}
      ${extra ?? ''}
    </div>
    <div style="padding:16px 32px;background:#0d0d0d;text-align:center;font-size:0.75rem;color:#555">
      Smokeyhut Delight &middot; Lagos, Nigeria
    </div>
  </div>
</body>
</html>`;
}

async function sendEmail(to: string, subject: string, html: string, cc?: string[]): Promise<void> {
  if (!RESEND_API_KEY) return;
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to,
      ...(cc?.length ? { cc } : {}),
      subject: `${subject} — Smokeyhut Delight`,
      html,
    }),
  });
}

// ── Handler ───────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const payload = await req.json();

    // ── 1. Database Webhook — order status changed ─────────────────
    if (payload.table === 'orders' && payload.type === 'UPDATE') {
      const { record, old_record } = payload;
      if (record.status !== old_record.status) {
        const info = STATUS_INFO[record.status];
        if (info) {
          // Only email the customer — shipped and delivered only
          if (DELIVERY_STATUSES.has(record.status) && record.customer_email) {
            await sendEmail(
              record.customer_email,
              info.subject,
              buildEmail(info.heading, info.body, record.id),
            );
          }
        }
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 2. Storefront — new order placed ──────────────────────────────
    if (payload.type === 'order_confirmed') {
      const order = payload.order;

      const bankExtra = `
        <div style="background:#111;border-radius:8px;padding:16px 18px;margin-bottom:20px">
          <p style="color:#888;font-size:0.8rem;margin:0 0 10px">Complete your payment via bank transfer:</p>
          <table style="width:100%;font-size:0.88rem;border-collapse:collapse">
            <tr><td style="color:#888;padding:4px 0">Bank</td><td style="color:#fff;font-weight:700;text-align:right">Moniepoint</td></tr>
            <tr><td style="color:#888;padding:4px 0">Account Name</td><td style="color:#fff;font-weight:700;text-align:right">Smokeyhut Delight</td></tr>
            <tr><td style="color:#888;padding:4px 0">Account Number</td><td style="color:#fff;font-weight:700;text-align:right">5655718527</td></tr>
            ${order.delivery_fee > 0 ? `<tr><td style="color:#888;padding:4px 0">Delivery Fee</td><td style="color:#fff;font-weight:700;text-align:right">₦${Number(order.delivery_fee).toLocaleString()}</td></tr>` : ''}
            <tr><td style="color:#888;padding:4px 0">Total Amount</td><td style="color:#c0201f;font-weight:900;text-align:right">₦${Number(order.total).toLocaleString()}</td></tr>
          </table>
          <p style="color:#888;font-size:0.78rem;margin:10px 0 0">Use your order reference <strong style="color:#fff">${order.id}</strong> as the payment description.</p>
        </div>`;

      // Email customer
      if (order.customer_email) {
        await sendEmail(
          order.customer_email,
          'Order Confirmed',
          buildEmail(
            `Thanks, ${order.customer_name?.split(' ')[0] || 'there'}! Your order is placed 🎉`,
            `We've received your order and are waiting to confirm your transfer. Once payment is verified, we'll get it ready for you right away.`,
            order.id,
            bankExtra,
          ),
        );
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
