import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

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

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
    const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'Smokeyhut Delight <noreply@smokeyhutdelight.com>'

    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: 'Email service not configured. Set RESEND_API_KEY in Supabase edge function secrets.' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { subject, body, recipients }: { subject: string; body: string; recipients: Recipient[] } = await req.json()

    if (!subject || !body || !recipients?.length) {
      return new Response(JSON.stringify({ error: 'subject, body, and recipients are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let sent = 0
    let failed = 0

    // Resend batch API — max 100 per request, chunk into 50 to stay safe
    const CHUNK_SIZE = 50
    for (let i = 0; i < recipients.length; i += CHUNK_SIZE) {
      const chunk = recipients.slice(i, i + CHUNK_SIZE)

      const batch = chunk.map((r: Recipient) => {
        const personalName = r.name || 'Valued Customer'
        const html = body
          .replace(/\{customer_name\}/g, personalName)
          .replace(/\n/g, '<br>')

        return {
          from: FROM_EMAIL,
          to: r.email,
          subject,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
              <img src="https://smokeyhut-delight.web.app/logo.svg" alt="Smokeyhut" style="height: 40px; margin-bottom: 24px;" />
              <div style="font-size: 15px; line-height: 1.7; color: #1a1a1a;">${html}</div>
              <hr style="margin: 32px 0; border: none; border-top: 1px solid #eee;" />
              <p style="font-size: 12px; color: #999;">You're receiving this because you've ordered from Smokeyhut Delight. © ${new Date().getFullYear()} Smokeyhut Delight.</p>
            </div>
          `,
          text: body.replace(/\{customer_name\}/g, personalName),
        }
      })

      const res = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify(batch),
      })

      if (res.ok) {
        sent += chunk.length
      } else {
        const errBody = await res.text()
        console.error('Resend batch error:', errBody)
        failed += chunk.length
      }
    }

    return new Response(JSON.stringify({ sent, failed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('send-campaign error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
