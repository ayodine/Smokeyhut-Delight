import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { mapResendEventToStatus, verifyResendSignature } from "../_shared/resend.ts";

const RESEND_WEBHOOK_SECRET = Deno.env.get('RESEND_WEBHOOK_SECRET') ?? '';

serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  const body = await req.text();
  const headers = {
    'svix-id': req.headers.get('svix-id'),
    'svix-timestamp': req.headers.get('svix-timestamp'),
    'svix-signature': req.headers.get('svix-signature'),
  };

  if (!RESEND_WEBHOOK_SECRET || !(await verifyResendSignature(RESEND_WEBHOOK_SECRET, headers, body))) {
    return new Response('invalid signature', { status: 401 });
  }

  const event = JSON.parse(body);
  const status = mapResendEventToStatus(event.type);
  const broadcastId = event?.data?.broadcast_id;
  const to = Array.isArray(event?.data?.to) ? event.data.to[0] : event?.data?.to;

  // Ignore untracked events or non-broadcast emails (e.g. transactional order mails).
  if (!status || !broadcastId || !to) return new Response('ok', { status: 200 });

  const serviceClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  const { data: campaign } = await serviceClient
    .from('email_campaigns').select('id').eq('resend_broadcast_id', broadcastId).single();
  if (!campaign) return new Response('ok', { status: 200 });

  await serviceClient.from('campaign_logs')
    .update({ status, error: status === 'bounced' ? 'Bounced' : null })
    .eq('campaign_id', campaign.id)
    .eq('email', to);

  // Recompute aggregate counts from logs. Mirror the frontend classifiers
  // (src/lib/campaignStatus.js): delivered counts as sent; bounced/complained count
  // as failed; pre-populated 'Pending execution' rows and 'queued' are in-flight,
  // not failures, so they are excluded from both counts.
  const { data: logs } = await serviceClient
    .from('campaign_logs').select('status, error').eq('campaign_id', campaign.id);
  const sent = (logs ?? []).filter((l) => l.status === 'sent' || l.status === 'delivered').length;
  const failed = (logs ?? []).filter((l) =>
    (l.status === 'failed' && l.error !== 'Pending execution') ||
    l.status === 'bounced' || l.status === 'complained'
  ).length;
  await serviceClient.from('email_campaigns').update({ sent_count: sent, failed_count: failed }).eq('id', campaign.id);

  return new Response('ok', { status: 200 });
});
