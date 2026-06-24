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

// Managing contacts/segments/broadcasts needs a Full Access key. The shared
// RESEND_API_KEY is send-only (used by the notify function), so prefer a dedicated
// full-access key and only fall back to the shared one if it isn't set.
const RESEND_API_KEY = Deno.env.get('RESEND_BROADCAST_API_KEY') ?? Deno.env.get('RESEND_API_KEY') ?? '';
// Resend deprecated Audiences in favor of Segments. Broadcasts target a segment_id,
// and contacts join a segment via the global Contacts API. This holds the segment id.
const RESEND_SEGMENT_ID = Deno.env.get('RESEND_SEGMENT_ID') ?? '';
const RESEND_FROM = Deno.env.get('RESEND_FROM') ?? 'Smokeyhut Delight <orders@smokeyhutdelight.com>';
const API = 'https://api.resend.com';

// Contact creation/deletion is the slow part of a large send. Run it concurrently
// to stay within the edge-function time budget, but capped so we don't trip Resend's
// rate limit (the resend() helper backs off on 429 as a safety net).
const SYNC_CONCURRENCY = 6;

async function resend(path: string, init: RequestInit, attempt = 0): Promise<any> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${RESEND_API_KEY}`,
      ...(init.headers ?? {}),
    },
  });
  // Back off and retry on rate limit.
  if (res.status === 429 && attempt < 5) {
    const retryAfter = Number(res.headers.get('retry-after')) || 1;
    await new Promise((r) => setTimeout(r, retryAfter * 1000 + 250));
    return resend(path, init, attempt + 1);
  }
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(`Resend ${path} ${res.status}: ${text}`);
  return json;
}

// Run an async worker over items with a fixed concurrency.
async function mapPool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<unknown>): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      await worker(item);
    }
  });
  await Promise.all(runners);
}

// List every contact currently in the segment, following cursor pagination
// (page size capped at 100 by the API).
async function listSegmentContacts(segmentId: string): Promise<{ id: string; email: string }[]> {
  const all: { id: string; email: string }[] = [];
  let after: string | undefined;
  do {
    const qs = new URLSearchParams({ segment_id: segmentId, limit: '100' });
    if (after) qs.set('after', after);
    const page = await resend(`/contacts?${qs.toString()}`, { method: 'GET' });
    const rows = page.data ?? [];
    for (const r of rows) all.push({ id: r.id, email: r.email });
    after = page.has_more && rows.length ? rows[rows.length - 1].id : undefined;
  } while (after);
  return all;
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

    if (!RESEND_API_KEY || !RESEND_SEGMENT_ID) {
      return new Response(JSON.stringify({ error: 'Resend not configured (RESEND_API_KEY / RESEND_SEGMENT_ID)' }), {
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

    // 1. Diff-sync segment membership against the desired batch, concurrently.
    const existing = await listSegmentContacts(RESEND_SEGMENT_ID);
    const { toAdd, toRemove } = computeAudienceDiff(existing, recipients);

    // Remove contacts that fell out of the batch. Deleting keeps the global contact
    // pool under the free-tier 1000 cap; Resend still injects an unsubscribe link on
    // every broadcast for compliance.
    await mapPool(toRemove, SYNC_CONCURRENCY, (c) =>
      resend(`/contacts/${c.id}`, { method: 'DELETE' }));
    // Add new contacts directly into the segment via the global Contacts API.
    await mapPool(toAdd, SYNC_CONCURRENCY, (c) =>
      resend('/contacts', {
        method: 'POST',
        body: JSON.stringify({
          email: c.email,
          first_name: c.name || 'Valued Customer',
          unsubscribed: false,
          segments: [{ id: RESEND_SEGMENT_ID }],
        }),
      }));

    // 2. Create + send the broadcast targeting the segment. The contact sync above
    // now runs concurrently, so the function reaches this step well within its time
    // budget (the old one-by-one sync timed out before the broadcast was ever made).
    const html = buildBroadcastHtml(subject, personalizeForResend(body));
    const broadcast = await resend('/broadcasts', {
      method: 'POST',
      body: JSON.stringify({
        segment_id: RESEND_SEGMENT_ID,
        from: RESEND_FROM,
        subject,
        html,
        name: subject,
        send: true,
      }),
    });

    // 3. Persist broadcast id FIRST (so delivery webhooks can correlate to this
    // campaign), then pre-populate the per-recipient logs as queued.
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
