import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RESEND_API_KEY     = Deno.env.get('RESEND_API_KEY') ?? '';
const ADMIN_EMAIL        = Deno.env.get('ADMIN_EMAIL') ?? 'Smokeyhut04@gmail.com';
const FROM_EMAIL         = Deno.env.get('FROM_EMAIL') ?? 'Smokeyhut Delight <orders@smokeyhutdelight.com>';
// Optional WhatsApp via Twilio — skip if not configured
const TWILIO_ACCOUNT_SID   = Deno.env.get('TWILIO_ACCOUNT_SID') ?? '';
const TWILIO_AUTH_TOKEN    = Deno.env.get('TWILIO_AUTH_TOKEN') ?? '';
const TWILIO_WA_FROM       = Deno.env.get('TWILIO_WHATSAPP_FROM') ?? ''; // e.g. whatsapp:+14155238886

// Status copy for order progress emails / WhatsApp messages
const STATUS_INFO: Record<string, { subject: string; heading: string; body: string; wa: string }> = {
  processing: {
    subject: 'Order Processing',
    heading: 'Your order is being processed',
    body: 'We have received your order and our team is getting it ready for you.',
    wa: 'Your order is being processed. Our team is getting it ready! 🍗',
  },
  shipped: {
    subject: 'Order Shipped',
    heading: 'Your order is on the way!',
    body: 'Your order has been picked up by our delivery team and is heading to you.',
    wa: 'Your order has been shipped and is on the way to you. 🚗',
  },
  out_for_delivery: {
    subject: 'Out for Delivery',
    heading: 'Your rider is on the way',
    body: 'Your rider is heading to your address right now. Please be available to receive your order.',
    wa: 'Your order is out for delivery! Your rider is heading to you now. Please be available. 📦',
  },
  arrived: {
    subject: 'Order Arrived',
    heading: 'Your order has arrived',
    body: 'Your order has arrived at your location. Enjoy your meal!',
    wa: 'Your order has arrived! Enjoy your meal from Smokeyhut Delight. 🎉',
  },
  delivered: {
    subject: 'Order Delivered',
    heading: 'Order delivered!',
    body: 'Your order has been delivered successfully. Thank you for choosing Smokeyhut Delight! We hope you enjoy every bite.',
    wa: 'Your order has been delivered! Thank you for choosing Smokeyhut Delight. Enjoy! 🔥',
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

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!RESEND_API_KEY) return;
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject: `${subject} — Smokeyhut Delight`, html }),
  });
}

// ── WhatsApp (Twilio) ─────────────────────────────────────────────────────────

async function sendWhatsApp(rawPhone: string, message: string): Promise<void> {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_WA_FROM) return;
  // Normalise Nigerian numbers: 08012345678 → +2348012345678
  const digits = rawPhone.replace(/\D/g, '');
  const e164 = digits.startsWith('234') ? `+${digits}`
    : digits.startsWith('0') ? `+234${digits.slice(1)}`
    : `+${digits}`;
  const body = new URLSearchParams({ To: `whatsapp:${e164}`, From: TWILIO_WA_FROM, Body: message });
  await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`,
      },
      body: body.toString(),
    }
  );
}

// ── Handler ───────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const payload = await req.json();

    // ── 1. Database Webhook — order status changed ─────────────────
    // Supabase sends: { type: 'UPDATE', table: 'orders', record: {...}, old_record: {...} }
    if (payload.table === 'orders' && payload.type === 'UPDATE') {
      const { record, old_record } = payload;
      if (record.status !== old_record.status) {
        const info = STATUS_INFO[record.status];
        if (info) {
          if (record.customer_email) {
            await sendEmail(
              record.customer_email,
              info.subject,
              buildEmail(info.heading, info.body, record.id),
            );
          }
          if (record.customer_phone) {
            await sendWhatsApp(
              record.customer_phone,
              `[Smokeyhut Delight] Order ${record.id}: ${info.wa}`,
            );
          }
        }
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 2. Frontend call — order confirmed (Paystack) ──────────────
    const { type, order } = payload;

    if (type === 'order_confirmed') {
      const firstName = order.customer_name?.split(' ')[0] ?? 'there';

      // Customer
      if (order.customer_email) {
        await sendEmail(
          order.customer_email,
          'Order Confirmed',
          buildEmail(
            'Order Confirmed! 🎉',
            `Hi <strong style="color:#fff">${firstName}</strong>! Your payment was successful and your order is now being prepared. We'll send you updates as it progresses.`,
            order.id,
          ),
        );
      }
      if (order.customer_phone) {
        await sendWhatsApp(
          order.customer_phone,
          `[Smokeyhut Delight] Hi ${firstName}! Your order ${order.id} is confirmed and being prepared. We'll keep you updated! 🍗🔥`,
        );
      }

      // Admin
      await sendEmail(
        ADMIN_EMAIL,
        'New Order Received',
        buildEmail(
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
        ),
      );
    }

    // ── 3. Frontend call — bank transfer made ──────────────────────
    if (type === 'transfer_made') {
      await sendEmail(
        ADMIN_EMAIL,
        'Bank Transfer Alert',
        buildEmail(
          'Bank Transfer Alert',
          'A customer has clicked <strong style="color:#fff">"I Have Made the Transfer"</strong>. Please verify the payment in your dashboard and confirm the order.',
          order.id,
          `<table style="color:#bbb;font-size:0.9rem;border-collapse:collapse;width:100%;margin-bottom:20px">
            <tr><td style="padding:6px 0;color:#888;width:110px">Customer</td><td style="color:#fff">${order.customer_name}</td></tr>
            <tr><td style="padding:6px 0;color:#888">Phone</td><td style="color:#fff">${order.customer_phone}</td></tr>
            <tr><td style="padding:6px 0;color:#888">Amount</td><td style="color:#fff;font-weight:700;font-size:1.05rem">&#x20A6;${Number(order.total).toLocaleString()}</td></tr>
          </table>
          <a href="https://smokeyhut-delight.web.app/admin/orders" style="display:inline-block;background:#c0201f;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700">Check Dashboard &rarr;</a>`,
        ),
      );
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
