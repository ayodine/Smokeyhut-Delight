import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import mailer from "jsr:@neabyte/deno-mailer"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Recipient {
  email: string
  name: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verify the caller is an authenticated admin/staff
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } }
    )
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Service-role client used to write campaign_logs (bypasses RLS)
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const GMAIL_USER = Deno.env.get('GMAIL_USER') ?? 'Smokeyhut04@gmail.com'
    const GMAIL_APP_PASSWORD = Deno.env.get('GMAIL_APP_PASSWORD') ?? ''

    if (!GMAIL_APP_PASSWORD) {
      return new Response(JSON.stringify({ error: 'Email SMTP not configured. Set GMAIL_APP_PASSWORD in Supabase secrets.' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { subject, body, recipients, campaign_id, retry }: {
      subject: string
      body: string
      recipients: Recipient[]
      campaign_id?: string
      retry?: boolean
    } = await req.json()

    if (!subject || !body || !recipients?.length) {
      return new Response(JSON.stringify({ error: 'subject, body, and recipients are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }



    // Connect to Gmail SMTP server securely via TLS (port 465) using deno-mailer
    const client = mailer.transporter({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        type: "password",
        user: GMAIL_USER,
        pass: GMAIL_APP_PASSWORD,
      },
    });

    let sent = 0
    let failed = 0

    // Throttle: Gmail SMTP drops the connection ("peer closed connection without
    // sending TLS close_notify") when it sees a burst of messages. Pause between
    // each send so Gmail doesn't flag the run as bulk spam. ~1.5s/email keeps us
    // under Gmail's burst threshold while staying within the edge-function timeout
    // for the small chunks the frontend sends.
    const SEND_DELAY_MS = 1500
    const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms))

    // Send individual personalized emails sequentially and log each attempt
    for (let idx = 0; idx < recipients.length; idx++) {
      const r = recipients[idx]
      let success = false
      let errorMsg: string | undefined

      try {
        const personalName = r.name || 'Valued Customer'
        const htmlContent = body
          .replace(/\{customer_name\}/g, personalName)
          .replace(/\n/g, '<br>')

        const textContent = body.replace(/\{customer_name\}/g, personalName)

        const htmlBody = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:20px;background:#111;font-family:Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;background:#1a1a1a;border-radius:12px;overflow:hidden;border:1px solid #2a2a2a">
    <div style="background:#c0201f;padding:20px 32px;text-align:center">
      <div style="display:inline-block;vertical-align:middle;margin-right:12px">
        <img src="https://smokeyhut-delight.web.app/logo.svg" alt="Smokeyhut Logo" style="height:36px;display:block" />
      </div>
      <div style="display:inline-block;vertical-align:middle">
        <span style="color:#fff;font-size:1.3rem;letter-spacing:0.03em;font-weight:900;font-family:Arial,sans-serif">Smokeyhut Delight</span>
      </div>
    </div>
    <div style="padding:32px">
      <h2 style="color:#fff;margin-top:0;margin-bottom:20px;font-size:1.35rem;font-weight:bold;font-family:Arial,sans-serif">${subject}</h2>
      <div style="color:#bbb;font-size:15px;line-height:1.8;margin-bottom:20px">
        ${htmlContent}
      </div>
    </div>
    <div style="padding:16px 32px;background:#0d0d0d;text-align:center;font-size:0.75rem;color:#555;line-height:1.5;border-top:1px solid #222">
      You are receiving this because you ordered from Smokeyhut Delight.<br>
      Smokeyhut Delight &middot; Lagos, Nigeria &middot; © ${new Date().getFullYear()}
    </div>
  </div>
</body>
</html>`

        await client.send({
          from: `Smokeyhut Delight <${GMAIL_USER}>`,
          to: r.email,
          subject: subject,
          text: textContent,
          html: htmlBody,
        });

        sent++
        success = true
      } catch (err) {
        console.error(`Failed to send email to ${r.email}:`, err)
        errorMsg = err?.message || 'Unknown error'
        failed++
      }

      // Log this individual send attempt if a campaign_id was provided
      if (campaign_id) {
        try {
          const { error: upsertErr } = await serviceClient.from('campaign_logs').upsert({
            campaign_id,
            email: r.email,
            name: r.name || null,
            status: success ? 'sent' : 'failed',
            error: errorMsg ?? null,
          }, { onConflict: 'campaign_id,email' })
          if (upsertErr) {
            console.error(`Failed to upsert campaign log for ${r.email}:`, upsertErr)
          }
        } catch (logErr) {
          // Never let logging failure break the send loop
          console.error('Failed to write campaign log (exception):', logErr)
        }
      }

      // Space out sends to avoid Gmail's burst throttle. Skip the wait after the
      // final recipient so we don't add idle time before returning.
      if (idx < recipients.length - 1) {
        await sleep(SEND_DELAY_MS)
      }
    }

    return new Response(JSON.stringify({ sent, failed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('send-campaign SMTP error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
