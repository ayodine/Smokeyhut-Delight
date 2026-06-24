import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  personalizeForResend,
  buildBroadcastHtml,
  computeAudienceDiff,
} from "../_shared/resend.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const RESEND_AUDIENCE_ID = Deno.env.get('RESEND_AUDIENCE_ID') ?? '';
const RESEND_FROM = Deno.env.get('RESEND_FROM') ?? 'Smokeyhut Delight <orders@smokeyhutdelight.com>';
const API = 'https://api.resend.com';

async function resend(path: string, init: RequestInit) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${RESEND_API_KEY}`,
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(`Resend ${path} ${res.status}: ${text}`);
  return json;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // Auth: same admin/staff gate as send-campaign.
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    );
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!RESEND_API_KEY || !RESEND_AUDIENCE_ID) {
      return new Response(JSON.stringify({ error: 'Resend not configured (RESEND_API_KEY / RESEND_AUDIENCE_ID)' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { subject, body, recipients, campaign_id } = await req.json() as {
      subject: string; body: string;
      recipients: { email: string; name: string }[];
      campaign_id: string;
    };
    if (!subject || !body || !recipients?.length || !campaign_id) {
      return new Response(JSON.stringify({ error: 'subject, body, recipients, campaign_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // 1. Diff-sync contacts into the audience.
    const existing = (await resend(`/audiences/${RESEND_AUDIENCE_ID}/contacts`, { method: 'GET' })).data ?? [];
    const { toAdd, toRemove } = computeAudienceDiff(existing, recipients);

    for (const c of toRemove) {
      await resend(`/audiences/${RESEND_AUDIENCE_ID}/contacts/${c.id}`, { method: 'DELETE' });
    }
    for (const c of toAdd) {
      await resend(`/audiences/${RESEND_AUDIENCE_ID}/contacts`, {
        method: 'POST',
        body: JSON.stringify({ email: c.email, first_name: c.name || 'Valued Customer', unsubscribed: false }),
      });
    }

    // 2. Create the broadcast.
    const html = buildBroadcastHtml(subject, personalizeForResend(body));
    const broadcast = await resend('/broadcasts', {
      method: 'POST',
      body: JSON.stringify({ audience_id: RESEND_AUDIENCE_ID, from: RESEND_FROM, subject, html, name: subject }),
    });

    // 3. Send it.
    await resend(`/broadcasts/${broadcast.id}/send`, { method: 'POST', body: JSON.stringify({}) });

    // 4. Persist broadcast id + pre-populate logs as queued.
    await serviceClient.from('email_campaigns').update({ resend_broadcast_id: broadcast.id }).eq('id', campaign_id);

    const logRows = recipients.map((r) => ({
      campaign_id, email: r.email, name: r.name || null,
      status: 'queued', provider: 'resend', error: null,
    }));
    for (let i = 0; i < logRows.length; i += 100) {
      await serviceClient.from('campaign_logs')
        .upsert(logRows.slice(i, i + 100), { onConflict: 'campaign_id,email' });
    }

    return new Response(JSON.stringify({ broadcast_id: broadcast.id, queued: recipients.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('send-broadcast error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
