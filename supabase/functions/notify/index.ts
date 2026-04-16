import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const ADMIN_EMAIL    = Deno.env.get('ADMIN_EMAIL') ?? 'Smokeyhut04@gmail.com';
const ADMIN_EMAIL_2  = 'Smokeyhutdelight01@gmail.com';
const OPS_EMAIL      = 'Opleadsmokey@gmail.com'; // receives ALL status changes
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
          const adminHtml = buildEmail(
            `Order ${record.id} — ${info.subject}`,
            `Status changed to <strong style="color:#fff">${record.status}</strong> for order by ${record.customer_name}.`,
            record.id,
            `<a href="https://smokeyhut-delight.web.app/admin/orders" style="display:inline-block;background:#c0201f;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700">View in Dashboard &rarr;</a>`,
          );

          const promises: Promise<void>[] = [];

          // OPS_EMAIL is always the main recipient; CC admins only on Shipped and Delivered
          const adminCc = DELIVERY_STATUSES.has(record.status)
            ? [ADMIN_EMAIL, ADMIN_EMAIL_2]
            : undefined;
          promises.push(sendEmail(OPS_EMAIL, `Order Status: ${info.subject}`, adminHtml, adminCc));

          // Customer only gets Shipped and Delivered (separate email, no CC)
          if (DELIVERY_STATUSES.has(record.status) && record.customer_email) {
            promises.push(sendEmail(
              record.customer_email,
              info.subject,
              buildEmail(info.heading, info.body, record.id),
            ));
          }

          await Promise.all(promises);
        }
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 2. Frontend call — order confirmed (Paystack) ──────────────
    const { type, order } = payload;

    if (type === 'order_confirmed') {
      const newOrderHtml = buildEmail(
        'New Order Received',
        'A new order has been placed and payment confirmed via Paystack.',
        order.id,
        `<table style="color:#bbb;font-size:0.9rem;border-collapse:collapse;width:100%;margin-bottom:20px">
          <tr><td style="padding:6px 0;color:#888;width:110px">Customer</td><td style="color:#fff">${order.customer_name}</td></tr>
          <tr><td style="padding:6px 0;color:#888">Phone</td><td style="color:#fff">${order.customer_phone}</td></tr>
          <tr><td style="padding:6px 0;color:#888">Total</td><td style="color:#fff;font-weight:700">&#x20A6;${Number(order.total).toLocaleString()}</td></tr>
          <tr><td style="padding:6px 0;color:#888">Delivery</td><td style="color:#fff">${order.delivery_address}</td></tr>
        </table>
        <a href="https://smokeyhut-delight.web.app/admin/orders" style="display:inline-block;background:#c0201f;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700">View in Dashboard &rarr;</a>`,
      );

      await sendEmail(OPS_EMAIL, 'New Order Received', newOrderHtml);
    }

    // ── 3. Frontend call — bank transfer made ──────────────────────
    if (type === 'transfer_made') {
      const transferHtml = buildEmail(
        'Bank Transfer Alert',
        'A customer has clicked <strong style="color:#fff">"I Have Made the Transfer"</strong>. Please verify the payment in your dashboard and confirm the order.',
        order.id,
        `<table style="color:#bbb;font-size:0.9rem;border-collapse:collapse;width:100%;margin-bottom:20px">
          <tr><td style="padding:6px 0;color:#888;width:110px">Customer</td><td style="color:#fff">${order.customer_name}</td></tr>
          <tr><td style="padding:6px 0;color:#888">Phone</td><td style="color:#fff">${order.customer_phone}</td></tr>
          <tr><td style="padding:6px 0;color:#888">Amount</td><td style="color:#fff;font-weight:700;font-size:1.05rem">&#x20A6;${Number(order.total).toLocaleString()}</td></tr>
        </table>
        <a href="https://smokeyhut-delight.web.app/admin/orders" style="display:inline-block;background:#c0201f;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700">Check Dashboard &rarr;</a>`,
      );

      await sendEmail(OPS_EMAIL, 'Bank Transfer Alert', transferHtml);
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
