# Split Campaign Email: Gmail (VIP+Standard) + Resend Broadcast (Regular)

**Date:** 2026-06-24
**Status:** Approved design, pending implementation plan

## Problem

The admin campaign sender (`dashboard/customers` → Campaigns) sends every tier through
a single Gmail SMTP path. Gmail (a regular `@gmail.com` account) caps at ~500
recipients/day and throttles bursts, so it cannot deliver the **regular** tier
(currently **1,327** contacts) in a day. VIP (46) and Standard (342) are small and
Gmail handles them fine.

We want to keep Gmail for the small tiers and route the large regular tier through
Resend's Broadcast/Audience product, which is built for bulk marketing mail and gives
proper deliverability (verified domain, SPF/DKIM, managed unsubscribe).

## Constraints

- **Resend free tier:** marketing Audience caps at **1,000 contacts**; broadcast send to
  that audience is contacts-based (not subject to the 100/day transactional limit).
  Regular tier = 1,327, so **327 overflow** the free cap.
- Resend Broadcasts require a **verified sending domain** (DNS SPF/DKIM). Until verified,
  only test sends from `resend.dev` work.
- Resend sends broadcasts **asynchronously**; per-recipient results arrive via webhooks,
  not in the send response.
- Edge functions hold secrets server-side; the Resend API key must never reach the browser.

## Decisions (locked)

1. **Overflow:** Resend handles the top **1,000**, Gmail mops up the remaining **~327**
   (327 is well under Gmail's ~500/day).
2. **Split ordering:** regular recipients sorted **most-recent-order first**; first 1,000
   → Resend, the rest → Gmail. Most engaged regulars get Resend's deliverability.
3. **Sender domain:** user has a Resend account and owns a domain to verify. Regular
   broadcast sends from a domain address (e.g. `hello@<domain>`), not the Gmail address.
4. **Tracking:** build a Resend **webhook** that updates `campaign_logs` per recipient
   (delivered/bounced/complained) so dashboard stats match Gmail-path fidelity.

## Architecture

### Routing (frontend — `src/pages/dashboard/Customers.jsx`)

In the campaign send handler, branch by `form.audience` tier:

- `vip`, `standard`, and all legacy/other audiences → **existing Gmail loop**, unchanged.
- `regular` →
  1. Build the full deduped audience (already paginated to all 1,327 via
     `fetchFullAudience`).
  2. Sort by `lastOrder` descending.
  3. `resendBatch` = first 1,000; `gmailBatch` = remainder (~327).
  4. Call `send-broadcast` edge function with `resendBatch`.
  5. Run the existing Gmail chunk-loop for `gmailBatch`.
  6. Progress UI reflects both: "Queued 1,000 to Resend + sending 327 via Gmail…".

The 1,000/327 boundary is derived from the live Resend free cap; encode `RESEND_AUDIENCE_CAP = 1000` as a constant so it is changeable if the plan is upgraded.

### New edge function: `send-broadcast` (Resend path)

Auth: same admin/staff check as `send-campaign`. Uses a service-role Supabase client for
log writes and the Resend API key from secrets.

Steps:

1. **Diff-sync the audience.** Maintain one persistent Resend Audience (id from
   `RESEND_AUDIENCE_ID`).
   - `GET` existing contacts.
   - Compute delta vs. the incoming ≤1,000 batch (keyed by lowercased email).
   - Create contacts that are new (`email`, `first_name` = customer full name).
   - Remove contacts no longer in the batch (keeps audience ≤1,000 and current,
     preserves unsubscribe status for retained contacts).
2. **Create the broadcast.** `POST /broadcasts` with `audience_id`, `from`
   (`RESEND_FROM`), `subject`, and the branded HTML where:
   - `{customer_name}` → Resend merge tag `{{{FIRST_NAME}}}`.
   - Footer includes `{{{RESEND_UNSUBSCRIBE_URL}}}` (managed unsubscribe).
3. **Send** the broadcast (`POST /broadcasts/{id}/send`).
4. Store `resend_broadcast_id` on the `email_campaigns` row.
5. Pre-populate `campaign_logs` for the 1,000 with `provider='resend'`, `status='queued'`.
6. Return `{ broadcast_id, queued }`.

### New edge function: `resend-webhook` (delivery events)

Public endpoint (no JWT). Verifies Resend's Svix signature using `RESEND_WEBHOOK_SECRET`.

- Subscribes to `email.delivered`, `email.bounced`, `email.complained`, optionally
  `email.opened`.
- Correlates each event to a campaign via `broadcast_id → email_campaigns.resend_broadcast_id`,
  and to the row via recipient email.
- Updates `campaign_logs.status`:
  - `delivered` → `delivered`
  - `bounced` → `failed`
  - `complained` → `complained`
- Recomputes/updates `email_campaigns.sent_count` / `failed_count` from logs.

### Schema changes

- `email_campaigns`: add `resend_broadcast_id text null`.
- `campaign_logs`: add `provider text not null default 'gmail'`; allow statuses
  `queued`, `delivered`, `bounced`, `complained` in addition to `sent`/`failed`.
  Keep the existing `(campaign_id, email)` uniqueness; the webhook updates by that key.
- RLS: webhook writes use the service role (bypasses RLS). Existing read policies for the
  dashboard remain.

### Personalization & template

Reuse the existing branded HTML template from `send-campaign`. For the Resend path only,
rewrite `{customer_name}` → `{{{FIRST_NAME}}}` and append the unsubscribe footer. The
customer's full name is stored in the contact `first_name` field.

### Unsubscribe

Resend manages unsubscribe for broadcasts (List-Unsubscribe header + URL); unsubscribed
contacts are auto-skipped on future broadcasts. This is a compliance improvement for the
regular blast. (The Gmail path remains without unsubscribe — see Out of Scope.)

## Manual prerequisites (user, one-time)

1. Verify the sending domain in Resend (add DNS SPF/DKIM records).
2. Create a Resend API key.
3. Create (or let us create) the Audience; record its id.
4. Set Supabase secrets: `RESEND_API_KEY`, `RESEND_AUDIENCE_ID`, `RESEND_FROM`,
   `RESEND_WEBHOOK_SECRET`.
5. Register the `resend-webhook` function URL in Resend webhook settings.

## Out of scope (v1)

- Adding unsubscribe to the Gmail path.
- Moving VIP/Standard off Gmail.
- Background/scheduled audience sync outside of send time.
- Upgrading Resend to a paid tier (revisit when regular consistently exceeds ~1,000 minus
  the Gmail mop-up, i.e. when the list outgrows the split).

## Testing

- **`send-broadcast`:** mock Resend API; assert diff-sync computes correct add/remove sets
  (new batch, churned contacts, unchanged), template token rewrite, and that logs are
  pre-populated as `queued`/`resend`.
- **`resend-webhook`:** signature verification (valid/invalid), event→status mapping,
  correct campaign/row correlation, aggregate recount.
- **Frontend routing:** regular tier splits at 1,000 by recency; vip/standard unchanged;
  overflow goes to Gmail; progress reflects both providers.
- **End-to-end (staging):** small test audience on the verified domain, confirm a real
  broadcast send + webhook updates land in `campaign_logs`.

## Risks

- **Domain verification** is a hard gate; nothing live until DNS propagates.
- **Diff-sync churn:** if regulars churn faster than expected, frequent add/remove against
  the 1,000 cap. Acceptable at current volumes; revisit if noisy.
- **List growth:** as regular grows well past ~1,327, the Gmail mop-up share grows toward
  its daily cap. That's the trigger to upgrade Resend (out of scope now).
