# Split Campaign Email (Gmail + Resend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route the campaign sender by tier — VIP + Standard stay on Gmail; the Regular tier sends its first 1,000 (by recency) through a Resend Broadcast and the ~327 overflow through the existing Gmail loop, with Resend delivery tracked via webhook.

**Architecture:** A new `send-broadcast` edge function syncs the top-1,000 regulars into a persistent Resend Audience, creates and sends a Broadcast, and pre-populates `campaign_logs`. A new `resend-webhook` edge function updates those logs as delivery events arrive. The existing `send-campaign` (Gmail) is untouched and handles VIP, Standard, and the regular overflow. Frontend `sendCampaign` branches on the `regular` tier to split the batch. Pure logic (split, audience diff, personalization, webhook mapping, signature verify) lives in small tested modules.

**Tech Stack:** React/Vite frontend, Supabase Edge Functions (Deno/TypeScript), Resend Broadcasts/Audiences API, Postgres (Supabase). New: Vitest for unit tests.

**Spec:** `docs/superpowers/specs/2026-06-24-split-campaign-email-gmail-resend-design.md`

---

## File Structure

**Create:**
- `vitest.config.js` — test runner config
- `src/lib/campaignAudience.js` — `splitRegularBatch()` (frontend, pure)
- `src/lib/campaignAudience.test.js` — its tests
- `src/lib/campaignStatus.js` — `isSent`/`isFailed`/`isPending` log classifiers (Gmail + Resend)
- `src/lib/campaignStatus.test.js` — its tests
- `supabase/functions/_shared/resend.ts` — pure helpers: `personalizeForResend`, `buildBroadcastHtml`, `computeAudienceDiff`, `mapResendEventToStatus`, `verifyResendSignature`
- `supabase/functions/_shared/resend.test.js` — tests for the pure helpers (Vitest imports the `.ts` directly)
- `supabase/functions/send-broadcast/index.ts` — Resend broadcast edge function
- `supabase/functions/resend-webhook/index.ts` — Resend webhook edge function
- `supabase/migrations/20260624_campaign_resend.sql` — schema changes

**Modify:**
- `package.json` — add `vitest` devDep + `test` script
- `src/pages/dashboard/Customers.jsx` — branch `sendCampaign` (the `onConfirm` at line ~765) on the `regular` tier

---

## Task 1: Add Vitest test runner

**Files:**
- Modify: `package.json`
- Create: `vitest.config.js`
- Create: `src/lib/smoke.test.js` (temporary smoke test, deleted at end of task)

- [ ] **Step 1: Add the dev dependency and script**

Run:
```bash
npm install -D vitest@^2
```

Then edit `package.json` `scripts` to add a `test` entry next to the existing ones:

```json
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "lint": "eslint .",
    "preview": "vite preview",
    "test": "vitest run"
  },
```

- [ ] **Step 2: Create the Vitest config**

Create `vitest.config.js`:

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.{js,jsx}', 'supabase/functions/**/*.test.{js,ts}'],
  },
});
```

- [ ] **Step 3: Add a smoke test**

Create `src/lib/smoke.test.js`:

```js
import { describe, it, expect } from 'vitest';

describe('vitest', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 4: Run it**

Run: `npm test`
Expected: PASS, 1 test passed.

- [ ] **Step 5: Remove the smoke test and commit**

```bash
rm src/lib/smoke.test.js
git add package.json package-lock.json vitest.config.js
git commit -m "test: add vitest runner

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Pure helper — split the regular batch

The regular audience is sorted most-recent-order first; the first `cap` go to Resend, the rest to Gmail.

**Files:**
- Create: `src/lib/campaignAudience.js`
- Test: `src/lib/campaignAudience.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/lib/campaignAudience.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { splitRegularBatch } from './campaignAudience';

const mk = (email, lastOrder) => ({ email, name: email.split('@')[0], lastOrder });

describe('splitRegularBatch', () => {
  it('puts the most-recent cap recipients in resend, rest in gmail', () => {
    const recipients = [
      mk('a@x.com', '2026-01-01T00:00:00Z'),
      mk('b@x.com', '2026-06-01T00:00:00Z'),
      mk('c@x.com', '2026-03-01T00:00:00Z'),
    ];
    const { resend, gmail } = splitRegularBatch(recipients, 2);
    expect(resend.map(r => r.email)).toEqual(['b@x.com', 'c@x.com']);
    expect(gmail.map(r => r.email)).toEqual(['a@x.com']);
  });

  it('sends everything to resend when under the cap', () => {
    const recipients = [mk('a@x.com', '2026-01-01T00:00:00Z')];
    const { resend, gmail } = splitRegularBatch(recipients, 1000);
    expect(resend).toHaveLength(1);
    expect(gmail).toHaveLength(0);
  });

  it('treats missing lastOrder as oldest (goes to gmail overflow)', () => {
    const recipients = [
      mk('a@x.com', null),
      mk('b@x.com', '2026-06-01T00:00:00Z'),
    ];
    const { resend, gmail } = splitRegularBatch(recipients, 1);
    expect(resend.map(r => r.email)).toEqual(['b@x.com']);
    expect(gmail.map(r => r.email)).toEqual(['a@x.com']);
  });

  it('does not mutate the input array order', () => {
    const recipients = [mk('a@x.com', '2026-01-01T00:00:00Z'), mk('b@x.com', '2026-06-01T00:00:00Z')];
    splitRegularBatch(recipients, 1);
    expect(recipients.map(r => r.email)).toEqual(['a@x.com', 'b@x.com']);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- campaignAudience`
Expected: FAIL — cannot find module `./campaignAudience` / `splitRegularBatch is not a function`.

- [ ] **Step 3: Implement**

Create `src/lib/campaignAudience.js`:

```js
// Resend's free Audience caps at 1000 contacts. For the regular tier we send the
// most-recent `cap` customers via Resend Broadcast and overflow the rest to Gmail.
export const RESEND_AUDIENCE_CAP = 1000;

export function splitRegularBatch(recipients, cap = RESEND_AUDIENCE_CAP) {
  const ts = (r) => (r.lastOrder ? new Date(r.lastOrder).getTime() : 0);
  const sorted = [...recipients].sort((a, b) => ts(b) - ts(a));
  return {
    resend: sorted.slice(0, cap),
    gmail: sorted.slice(cap),
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- campaignAudience`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/campaignAudience.js src/lib/campaignAudience.test.js
git commit -m "feat(campaigns): add splitRegularBatch helper for Gmail/Resend split

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Database migration — schema changes

`campaign_logs.status` currently has a CHECK constraint allowing only `'sent'`/`'failed'`. We must replace it to allow the Resend statuses, add a `provider` column, and add `resend_broadcast_id` to `email_campaigns`.

**Files:**
- Create: `supabase/migrations/20260624_campaign_resend.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260624_campaign_resend.sql`:

```sql
-- Resend split: track broadcast id on campaigns, provider + richer statuses on logs.

ALTER TABLE email_campaigns
  ADD COLUMN IF NOT EXISTS resend_broadcast_id text;

ALTER TABLE campaign_logs
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'gmail';

-- Replace the status CHECK (was: 'sent','failed') to allow Resend lifecycle states.
ALTER TABLE campaign_logs
  DROP CONSTRAINT IF EXISTS campaign_logs_status_check;

ALTER TABLE campaign_logs
  ADD CONSTRAINT campaign_logs_status_check
  CHECK (status = ANY (ARRAY[
    'sent'::text, 'failed'::text, 'queued'::text,
    'delivered'::text, 'bounced'::text, 'complained'::text
  ]));

-- Index for webhook correlation (broadcast_id -> campaign).
CREATE INDEX IF NOT EXISTS email_campaigns_resend_broadcast_id_idx
  ON email_campaigns (resend_broadcast_id);
```

- [ ] **Step 2: Apply the migration**

Run:
```bash
npx supabase db push
```
Expected: applies `20260624_campaign_resend.sql`. If it prompts for the DB password, enter it.

If `db push` is not linked/available, apply the SQL via the Supabase dashboard SQL editor instead, then mark this step done.

- [ ] **Step 3: Verify columns exist**

Run:
```bash
node -e "import('@supabase/supabase-js').then(async ({createClient})=>{const s=createClient('https://itpnfalqjjicesqcjzix.supabase.co',process.env.SB_ANON||'PUT_ANON_KEY');const {data}=await s.rpc('exec_read_only_sql',{q:\"SELECT column_name FROM information_schema.columns WHERE table_name IN ('campaign_logs','email_campaigns') AND column_name IN ('provider','resend_broadcast_id')\"});console.log(data);})"
```
Expected: rows for `provider` and `resend_broadcast_id`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260624_campaign_resend.sql
git commit -m "feat(db): add resend_broadcast_id + provider + extend campaign_logs statuses

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Shared helper — personalize body for Resend

Resend Broadcasts use the merge tag `{{{FIRST_NAME}}}`. Our template token is `{customer_name}`. Convert it, and convert newlines to `<br>` (matching the Gmail path).

**Files:**
- Create: `supabase/functions/_shared/resend.ts`
- Test: `supabase/functions/_shared/resend.test.js`

- [ ] **Step 1: Write the failing test**

Create `supabase/functions/_shared/resend.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { personalizeForResend } from './resend.ts';

describe('personalizeForResend', () => {
  it('rewrites {customer_name} to the Resend merge tag', () => {
    expect(personalizeForResend('Hi {customer_name}, welcome'))
      .toBe('Hi {{{FIRST_NAME}}}, welcome');
  });

  it('rewrites every occurrence', () => {
    expect(personalizeForResend('{customer_name} {customer_name}'))
      .toBe('{{{FIRST_NAME}}} {{{FIRST_NAME}}}');
  });

  it('converts newlines to <br>', () => {
    expect(personalizeForResend('line1\nline2')).toBe('line1<br>line2');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- resend`
Expected: FAIL — cannot resolve `./resend.ts` / `personalizeForResend` undefined.

- [ ] **Step 3: Implement**

Create `supabase/functions/_shared/resend.ts`:

```ts
// Pure helpers shared by the Resend edge functions. No Deno globals at module load
// so these are unit-testable under Vitest (Node).

export function personalizeForResend(body: string): string {
  return body
    .replace(/\{customer_name\}/g, '{{{FIRST_NAME}}}')
    .replace(/\n/g, '<br>');
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- resend`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/resend.ts supabase/functions/_shared/resend.test.js
git commit -m "feat(resend): add personalizeForResend helper

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Shared helper — branded broadcast HTML

Wrap the personalized body in the Smokeyhut template and append the Resend-managed unsubscribe footer.

**Files:**
- Modify: `supabase/functions/_shared/resend.ts`
- Modify: `supabase/functions/_shared/resend.test.js`

- [ ] **Step 1: Add the failing test**

Append to `supabase/functions/_shared/resend.test.js`:

```js
import { buildBroadcastHtml } from './resend.ts';

describe('buildBroadcastHtml', () => {
  it('includes the subject, the body, and the unsubscribe merge tag', () => {
    const html = buildBroadcastHtml('June Offer', 'Hi {{{FIRST_NAME}}}');
    expect(html).toContain('June Offer');
    expect(html).toContain('Hi {{{FIRST_NAME}}}');
    expect(html).toContain('{{{RESEND_UNSUBSCRIBE_URL}}}');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- resend`
Expected: FAIL — `buildBroadcastHtml` is not exported.

- [ ] **Step 3: Implement**

Append to `supabase/functions/_shared/resend.ts`:

```ts
export function buildBroadcastHtml(subject: string, personalizedBody: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${subject}</title></head>
<body style="margin:0;padding:20px;background:#111;font-family:Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;background:#1a1a1a;border-radius:12px;overflow:hidden;border:1px solid #2a2a2a">
    <div style="background:#c0201f;padding:20px 32px;text-align:center">
      <span style="color:#fff;font-size:1.3rem;letter-spacing:0.03em;font-weight:900">Smokeyhut Delight</span>
    </div>
    <div style="padding:32px">
      <h2 style="color:#fff;margin-top:0;margin-bottom:20px;font-size:1.35rem;font-weight:bold">${subject}</h2>
      <div style="color:#bbb;font-size:15px;line-height:1.8;margin-bottom:20px">${personalizedBody}</div>
    </div>
    <div style="padding:16px 32px;background:#0d0d0d;text-align:center;font-size:0.75rem;color:#555;line-height:1.5;border-top:1px solid #222">
      You are receiving this because you ordered from Smokeyhut Delight.<br>
      <a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="color:#777">Unsubscribe</a><br>
      Smokeyhut Delight &middot; Lagos, Nigeria
    </div>
  </div>
</body>
</html>`;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- resend`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/resend.ts supabase/functions/_shared/resend.test.js
git commit -m "feat(resend): add buildBroadcastHtml with unsubscribe footer

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Shared helper — compute audience diff

Given the contacts already in the Resend audience and the desired batch, compute which to add and which to remove (keyed by lowercased email). This keeps the audience current and ≤ cap, preserving unsubscribe status for retained contacts.

**Files:**
- Modify: `supabase/functions/_shared/resend.ts`
- Modify: `supabase/functions/_shared/resend.test.js`

- [ ] **Step 1: Add the failing test**

Append to `supabase/functions/_shared/resend.test.js`:

```js
import { computeAudienceDiff } from './resend.ts';

describe('computeAudienceDiff', () => {
  const existing = [
    { id: '1', email: 'keep@x.com' },
    { id: '2', email: 'Churned@x.com' },
  ];
  const desired = [
    { email: 'keep@x.com', name: 'Keep' },
    { email: 'new@x.com', name: 'New' },
  ];

  it('adds desired contacts not already present (case-insensitive)', () => {
    const { toAdd } = computeAudienceDiff(existing, desired);
    expect(toAdd.map(c => c.email)).toEqual(['new@x.com']);
  });

  it('removes existing contacts not in the desired set', () => {
    const { toRemove } = computeAudienceDiff(existing, desired);
    expect(toRemove.map(c => c.id)).toEqual(['2']);
  });

  it('returns empty diffs when sets match', () => {
    const same = [{ email: 'keep@x.com', name: 'Keep' }];
    const ex = [{ id: '1', email: 'keep@x.com' }];
    const { toAdd, toRemove } = computeAudienceDiff(ex, same);
    expect(toAdd).toHaveLength(0);
    expect(toRemove).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- resend`
Expected: FAIL — `computeAudienceDiff` is not exported.

- [ ] **Step 3: Implement**

Append to `supabase/functions/_shared/resend.ts`:

```ts
interface ExistingContact { id: string; email: string; }
interface DesiredContact { email: string; name: string; }

export function computeAudienceDiff(
  existing: ExistingContact[],
  desired: DesiredContact[],
): { toAdd: DesiredContact[]; toRemove: ExistingContact[] } {
  const key = (e: string) => e.trim().toLowerCase();
  const existingByEmail = new Map(existing.map((c) => [key(c.email), c]));
  const desiredEmails = new Set(desired.map((c) => key(c.email)));

  const toAdd = desired.filter((c) => !existingByEmail.has(key(c.email)));
  const toRemove = existing.filter((c) => !desiredEmails.has(key(c.email)));
  return { toAdd, toRemove };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- resend`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/resend.ts supabase/functions/_shared/resend.test.js
git commit -m "feat(resend): add computeAudienceDiff for contact sync

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Shared helper — map webhook event to log status

**Files:**
- Modify: `supabase/functions/_shared/resend.ts`
- Modify: `supabase/functions/_shared/resend.test.js`

- [ ] **Step 1: Add the failing test**

Append to `supabase/functions/_shared/resend.test.js`:

```js
import { mapResendEventToStatus } from './resend.ts';

describe('mapResendEventToStatus', () => {
  it('maps delivery lifecycle events', () => {
    expect(mapResendEventToStatus('email.delivered')).toBe('delivered');
    expect(mapResendEventToStatus('email.bounced')).toBe('bounced');
    expect(mapResendEventToStatus('email.complained')).toBe('complained');
    expect(mapResendEventToStatus('email.sent')).toBe('sent');
  });

  it('returns null for events we do not track', () => {
    expect(mapResendEventToStatus('email.opened')).toBeNull();
    expect(mapResendEventToStatus('contact.created')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- resend`
Expected: FAIL — `mapResendEventToStatus` is not exported.

- [ ] **Step 3: Implement**

Append to `supabase/functions/_shared/resend.ts`:

```ts
export function mapResendEventToStatus(type: string): string | null {
  switch (type) {
    case 'email.sent': return 'sent';
    case 'email.delivered': return 'delivered';
    case 'email.bounced': return 'bounced';
    case 'email.complained': return 'complained';
    default: return null;
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- resend`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/resend.ts supabase/functions/_shared/resend.test.js
git commit -m "feat(resend): add mapResendEventToStatus

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Shared helper — verify Resend (Svix) webhook signature

Resend signs webhooks with Svix. The signed content is `${svix_id}.${svix_timestamp}.${body}`, HMAC-SHA256 with the secret (the base64 part after the `whsec_` prefix), base64-encoded. The `svix-signature` header is a space-separated list of `v1,<sig>` entries; a match on any is valid.

**Files:**
- Modify: `supabase/functions/_shared/resend.ts`
- Modify: `supabase/functions/_shared/resend.test.js`

- [ ] **Step 1: Add the failing test (self-consistent vector)**

Append to `supabase/functions/_shared/resend.test.js`:

```js
import { verifyResendSignature } from './resend.ts';
import { createHmac } from 'node:crypto';

function sign(secretB64, id, ts, body) {
  const signed = `${id}.${ts}.${body}`;
  return createHmac('sha256', Buffer.from(secretB64, 'base64')).update(signed).digest('base64');
}

describe('verifyResendSignature', () => {
  const secretB64 = Buffer.from('super-secret-key').toString('base64');
  const secret = `whsec_${secretB64}`;
  const id = 'msg_123';
  const ts = '1700000000';
  const body = '{"type":"email.delivered"}';

  it('accepts a valid signature', async () => {
    const sig = sign(secretB64, id, ts, body);
    const headers = { 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': `v1,${sig}` };
    expect(await verifyResendSignature(secret, headers, body)).toBe(true);
  });

  it('accepts when one of several signatures matches', async () => {
    const sig = sign(secretB64, id, ts, body);
    const headers = { 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': `v1,bogus v1,${sig}` };
    expect(await verifyResendSignature(secret, headers, body)).toBe(true);
  });

  it('rejects a tampered body', async () => {
    const sig = sign(secretB64, id, ts, body);
    const headers = { 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': `v1,${sig}` };
    expect(await verifyResendSignature(secret, headers, '{"tampered":true}')).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- resend`
Expected: FAIL — `verifyResendSignature` is not exported.

- [ ] **Step 3: Implement**

Append to `supabase/functions/_shared/resend.ts`:

```ts
// Verify a Svix-signed webhook (Resend). `headers` is a plain object with lowercased
// svix-id / svix-timestamp / svix-signature. Uses Web Crypto (available in Deno and Node).
export async function verifyResendSignature(
  secret: string,
  headers: Record<string, string | null>,
  body: string,
): Promise<boolean> {
  const id = headers['svix-id'];
  const ts = headers['svix-timestamp'];
  const sigHeader = headers['svix-signature'];
  if (!id || !ts || !sigHeader) return false;

  const secretB64 = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  const keyBytes = Uint8Array.from(atob(secretB64), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const signed = new TextEncoder().encode(`${id}.${ts}.${body}`);
  const sigBuf = await crypto.subtle.sign('HMAC', key, signed);
  const expected = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));

  // Header is space-separated "v1,<sig>" entries; accept if any matches.
  return sigHeader.split(' ').some((entry) => {
    const [, sig] = entry.split(',');
    return sig === expected;
  });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- resend`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/resend.ts supabase/functions/_shared/resend.test.js
git commit -m "feat(resend): add Svix webhook signature verification

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: `send-broadcast` edge function

Syncs the ≤1,000 batch into the Resend audience, creates + sends a broadcast, stores the broadcast id, and pre-populates logs as `queued`. Mirrors the auth check in `send-campaign`.

**Files:**
- Create: `supabase/functions/send-broadcast/index.ts`

- [ ] **Step 1: Write the function**

Create `supabase/functions/send-broadcast/index.ts`:

```ts
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
```

- [ ] **Step 2: Lint the shared module import path**

Run: `npm test -- resend`
Expected: PASS (confirms the shared module still imports cleanly after edits).

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/send-broadcast/index.ts
git commit -m "feat(campaigns): add send-broadcast edge function (Resend)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

> Deploy + live verification happens in Task 13 (needs secrets + audience first).

---

## Task 10: `resend-webhook` edge function

Public endpoint. Verifies the Svix signature, maps the event to a log status, correlates by `broadcast_id → email_campaigns.resend_broadcast_id`, updates the recipient's `campaign_logs` row, and recomputes campaign counts.

**Files:**
- Create: `supabase/functions/resend-webhook/index.ts`

- [ ] **Step 1: Write the function**

Create `supabase/functions/resend-webhook/index.ts`:

```ts
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

  // Recompute aggregate counts from logs.
  const { data: logs } = await serviceClient
    .from('campaign_logs').select('status').eq('campaign_id', campaign.id);
  const sent = (logs ?? []).filter((l) => l.status === 'sent' || l.status === 'delivered').length;
  const failed = (logs ?? []).filter((l) => l.status === 'failed' || l.status === 'bounced').length;
  await serviceClient.from('email_campaigns').update({ sent_count: sent, failed_count: failed }).eq('id', campaign.id);

  return new Response('ok', { status: 200 });
});
```

- [ ] **Step 2: Disable JWT verification for this function**

The webhook is called by Resend, not an authenticated user. Create `supabase/functions/resend-webhook/.npmrc`? No — instead deploy with `--no-verify-jwt` (done in Task 13). No code change here; note it.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/resend-webhook/index.ts
git commit -m "feat(campaigns): add resend-webhook edge function for delivery tracking

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 11: Frontend routing — split the regular tier in `sendCampaign`

When `form.audience === 'regular'`, split the recipients: top 1,000 (by recency) → `send-broadcast`, overflow → existing Gmail loop. Other tiers are unchanged.

**Files:**
- Modify: `src/pages/dashboard/Customers.jsx`

- [ ] **Step 1: Import the split helper**

At the top of `src/pages/dashboard/Customers.jsx`, after the existing imports (around line 6, the `supabase` import), add:

```js
import { splitRegularBatch, RESEND_AUDIENCE_CAP } from '../../lib/campaignAudience';
```

- [ ] **Step 2: Build recipients with lastOrder, and branch on the regular tier**

In `sendCampaign`'s `onConfirm` (around line 771-772), the recipients are currently built as:

```js
const recipients = audienceList.map(c => ({ email: c.email, name: c.name || '' }));
```

Replace that line with a version that keeps `lastOrder` (needed for the split):

```js
const recipients = audienceList.map(c => ({ email: c.email, name: c.name || '', lastOrder: c.lastOrder }));
```

- [ ] **Step 3: Route the regular tier through Resend + Gmail overflow**

Find, inside the same `try` block, the start of the Gmail send section — the comment `// 2. Invoke edge function in batches.` preceded by the chunk setup. Immediately BEFORE the existing `const CHUNK_SIZE = 15;` line, insert the Resend branch. It sends the top-1,000 via `send-broadcast`, then lets the existing Gmail loop run on only the overflow by reassigning the local recipient list used by the loop.

The existing Gmail loop iterates over `recipients`. To make it operate on the overflow only for the regular tier, introduce a `gmailRecipients` variable and have the loop use it. Concretely:

a) After the campaign row + log pre-population (immediately after the `// 1.5 Pre-populate campaign_logs ...` for-loop block, just before the `// 2. Invoke edge function in batches.` comment), insert:

```js
          // Regular tier: send the most-recent 1000 via Resend broadcast; the rest
          // fall through to the Gmail loop below. Other tiers send entirely via Gmail.
          let gmailRecipients = recipients;
          let resendQueued = 0;
          if (form.audience === 'regular') {
            const { resend: resendBatch, gmail: overflow } = splitRegularBatch(recipients, RESEND_AUDIENCE_CAP);
            gmailRecipients = overflow;
            if (resendBatch.length > 0) {
              setCampaignProgress({ title: `Queuing ${resendBatch.length} to Resend…`, sent: 0, failed: 0, total: recipients.length });
              const { data: bRes, error: bErr } = await supabase.functions.invoke('send-broadcast', {
                body: {
                  subject: form.subject,
                  body: form.body,
                  recipients: resendBatch.map(r => ({ email: r.email, name: r.name })),
                  campaign_id: campaignId,
                },
              });
              if (bErr) {
                console.error('send-broadcast failed:', bErr);
                showToast('Resend error', bErr.message || 'Broadcast failed; remaining sent via Gmail.', 'error');
              } else {
                resendQueued = bRes?.queued || resendBatch.length;
              }
            }
          }
```

b) Change the Gmail loop to iterate over `gmailRecipients` instead of `recipients`. Find the loop header:

```js
          for (let i = 0; i < recipients.length; i += CHUNK_SIZE) {
            const chunk = recipients.slice(i, i + CHUNK_SIZE);
```

Replace both `recipients` references in those two lines (and the `Math.ceil(recipients.length / CHUNK_SIZE)` in the progress title, and the `(i + CHUNK_SIZE) >= recipients.length` finished check) with `gmailRecipients`. There are four references in the loop body — update each:
- `for (let i = 0; i < gmailRecipients.length; i += CHUNK_SIZE)`
- `const chunk = gmailRecipients.slice(i, i + CHUNK_SIZE);`
- `... of ${Math.ceil(gmailRecipients.length / CHUNK_SIZE)}...`
- `const isFinished = (i + CHUNK_SIZE) >= gmailRecipients.length;`

c) The Gmail loop seeds counts with `let accumulatedSent = 0;` / `let accumulatedFailed = 0;`. Resend-queued recipients are tracked separately (status `queued`, updated later by the webhook), so they should NOT be counted as Gmail-sent. Leave the accumulators as-is. After the loop, update the final result line (around line 876) from:

```js
          setSendResult({ sent: accumulatedSent, failed: accumulatedFailed });
```

to:

```js
          setSendResult({ sent: accumulatedSent + resendQueued, failed: accumulatedFailed, resendQueued });
```

d) Update the success toast (around line 878) to mention the Resend split when used:

```js
          showToast('Success', resendQueued > 0
            ? `Campaign sent: ${resendQueued} queued to Resend + ${accumulatedSent} via Gmail (${accumulatedFailed} failed)`
            : `Campaign completed: ${accumulatedSent} sent, ${accumulatedFailed} failed`, 'success');
```

- [ ] **Step 4: Guard the final status when only Resend ran**

When the regular tier has ≤1,000 recipients, `gmailRecipients` is empty and the Gmail loop body never runs, so the campaign status is never set to a terminal value inside the loop. After the loop (before `setSendResult`), add:

```js
          if (gmailRecipients.length === 0 && resendQueued > 0) {
            await supabase.from('email_campaigns')
              .update({ status: 'sending', sent_count: 0, failed_count: 0 })
              .eq('id', campaignId);
            // Webhook will move counts/status as delivery events arrive.
          }
```

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: exit 0, no errors in `Customers.jsx`.

- [ ] **Step 6: Run unit tests**

Run: `npm test`
Expected: PASS (all helper tests green; no regressions).

- [ ] **Step 7: Commit**

```bash
git add src/pages/dashboard/Customers.jsx
git commit -m "feat(campaigns): route regular tier to Resend broadcast + Gmail overflow

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 12: Make campaign counters Resend-aware

The dashboard recomputes `sent_count`/`failed_count` from `campaign_logs` in ~6 places,
all assuming Gmail semantics (`status === 'sent'` / `'failed'` + `'Pending execution'`).
Resend logs use `queued` (in-flight), `delivered` (=sent), `bounced`/`complained` (=failed).
Without this, Resend deliveries are undercounted and the frontend reconciliation overwrites
the webhook's correct numbers. Centralize the classification and swap it in everywhere.

**Files:**
- Create: `src/lib/campaignStatus.js`
- Create: `src/lib/campaignStatus.test.js`
- Modify: `src/pages/dashboard/Customers.jsx`

- [ ] **Step 1: Write the failing test**

Create `src/lib/campaignStatus.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { isSent, isFailed, isPending } from './campaignStatus';

describe('campaign status classifiers', () => {
  it('counts sent and delivered as sent', () => {
    expect(isSent('sent')).toBe(true);
    expect(isSent('delivered')).toBe(true);
    expect(isSent('queued')).toBe(false);
    expect(isSent('bounced')).toBe(false);
  });

  it('counts real failures and bounces/complaints as failed', () => {
    expect(isFailed('failed', 'SMTP error')).toBe(true);
    expect(isFailed('bounced', null)).toBe(true);
    expect(isFailed('complained', null)).toBe(true);
    expect(isFailed('failed', 'Pending execution')).toBe(false);
    expect(isFailed('delivered', null)).toBe(false);
  });

  it('counts pre-populated and queued as pending', () => {
    expect(isPending('failed', 'Pending execution')).toBe(true);
    expect(isPending('queued', null)).toBe(true);
    expect(isPending('sent', null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- campaignStatus`
Expected: FAIL — cannot find module `./campaignStatus`.

- [ ] **Step 3: Implement**

Create `src/lib/campaignStatus.js`:

```js
// Unified campaign_logs status classification across Gmail (sent/failed) and
// Resend (queued/delivered/bounced/complained) providers.
export const isSent = (status) => status === 'sent' || status === 'delivered';

export const isFailed = (status, error) =>
  (status === 'failed' && error !== 'Pending execution') ||
  status === 'bounced' || status === 'complained';

export const isPending = (status, error) =>
  (status === 'failed' && error === 'Pending execution') || status === 'queued';
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- campaignStatus`
Expected: PASS, 3 tests.

- [ ] **Step 5: Import the classifiers in Customers.jsx**

Add to the imports (next to the Task-11 import):

```js
import { isSent, isFailed, isPending } from '../../lib/campaignStatus';
```

- [ ] **Step 6: Replace every inline status predicate**

There are six reconciliation sites plus the detail-view JSX. In each, replace the inline
predicates with the classifiers. The canonical replacements (apply to ALL occurrences):

`X.filter(l => l.status === 'sent').length`
→ `X.filter(l => isSent(l.status)).length`

`X.filter(l => l.status === 'failed' && l.error !== 'Pending execution').length`
→ `X.filter(l => isFailed(l.status, l.error)).length`

`X.filter(l => l.status === 'failed' && l.error === 'Pending execution').length`
→ `X.filter(l => isPending(l.status, l.error)).length`

(`X` is `data` or `logs` depending on the site, and the lambda param is `log` or `l` — keep
whatever the site uses.) The reconciliation sites are the `actualSent`/`actualFailed`/
`pendingCount` triples in: the sending auto-refresh effect, `viewCampaignDetail`, the
retry self-heal block, the retry error/catch block, and the send error/catch block.

Also update the detail-view badge logic: where a log row is treated as sent
(`log.status === 'sent'`) for green styling, use `isSent(log.status)`; where it shows the
"Pending execution" pill (`log.status === 'failed' && log.error === 'Pending execution'`),
use `isPending(log.status, log.error)`.

- [ ] **Step 7: Verify no naive predicates remain**

Run:
```bash
grep -n "status === 'sent'\|status === 'failed'" src/pages/dashboard/Customers.jsx
```
Expected: no matches (every site now uses the classifiers). If any remain in counting/badge
logic, convert them.

- [ ] **Step 8: Lint + test**

Run: `npm run lint && npm test`
Expected: lint exit 0; all tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/lib/campaignStatus.js src/lib/campaignStatus.test.js src/pages/dashboard/Customers.jsx
git commit -m "fix(campaigns): make log counters Resend-aware (delivered/bounced/queued)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 13: Manual setup, deploy, and live verification

This task needs the Resend dashboard and Supabase secrets. Do it once.

- [ ] **Step 1: Create the Resend Audience**

In the Resend dashboard → Audiences → create one named "Smokeyhut Regulars". Copy its Audience ID.

- [ ] **Step 2: Set Supabase secrets**

Run (replace values):
```bash
npx supabase secrets set RESEND_AUDIENCE_ID=<audience-id> --project-ref itpnfalqjjicesqcjzix
npx supabase secrets set RESEND_FROM="Smokeyhut Delight <orders@smokeyhutdelight.com>" --project-ref itpnfalqjjicesqcjzix
npx supabase secrets set RESEND_WEBHOOK_SECRET=<from-step-4> --project-ref itpnfalqjjicesqcjzix
```
(`RESEND_API_KEY` is already set from the `notify` integration — verify with `npx supabase secrets list --project-ref itpnfalqjjicesqcjzix`.)

- [ ] **Step 3: Deploy the functions**

```bash
npx supabase functions deploy send-broadcast --project-ref itpnfalqjjicesqcjzix
npx supabase functions deploy resend-webhook --no-verify-jwt --project-ref itpnfalqjjicesqcjzix
```
Expected: both deploy successfully.

- [ ] **Step 4: Register the webhook in Resend**

In Resend dashboard → Webhooks → add endpoint:
`https://itpnfalqjjicesqcjzix.supabase.co/functions/v1/resend-webhook`
Subscribe to: `email.sent`, `email.delivered`, `email.bounced`, `email.complained`.
Copy the signing secret (`whsec_...`) and set it as `RESEND_WEBHOOK_SECRET` (Step 2), then re-deploy `resend-webhook` so it picks up the secret.

- [ ] **Step 5: Live smoke test with a tiny audience**

Temporarily point the regular send at a 2-3 recipient test (e.g. create a throwaway campaign whose audience resolves to a couple of addresses you control, or lower `RESEND_AUDIENCE_CAP` mentally and send to a small regular slice). Send the campaign from the dashboard. Verify:
- `email_campaigns.resend_broadcast_id` is populated.
- `campaign_logs` rows for the Resend recipients appear with `provider='resend'`, `status='queued'`.
- Within a minute, the webhook flips them to `delivered` (check the logs table).
- The test inboxes receive the branded email with the correct name and a working unsubscribe link.

Run to inspect:
```bash
node scripts/inspect_campaigns.js  # or an ad-hoc exec_read_only_sql query on campaign_logs
```

- [ ] **Step 6: Confirm the Resend-vs-100/day assumption**

During the smoke test, confirm the broadcast to the audience is NOT rejected by a daily cap (the open risk noted in the spec). If it is throttled, escalate — the regular blast strategy needs a paid tier.

- [ ] **Step 7: Build, deploy frontend, final verify**

```bash
npm run build && npx firebase deploy --only hosting
```
Then send a real regular campaign and confirm the split (1,000 Resend + overflow Gmail) end to end.

---

## Self-Review Notes

- **Spec coverage:** routing by tier (Task 11), diff-sync audience (Tasks 6, 9), personalization + unsubscribe (Tasks 4, 5, 9), webhook tracking (Tasks 7, 8, 10), schema (Task 3), overflow-to-Gmail (Task 11), prerequisites (Task 13), Resend-aware counters (Task 12). All covered.
- **Open risk carried from spec:** broadcast vs. 100/day free cap — explicitly verified in Task 13 Step 6.
- **Webhook payload shape** (`data.broadcast_id`, `data.to`) is assumed from Resend docs and must be confirmed against a real event in Task 13 Step 5; if field names differ, adjust `resend-webhook/index.ts` accordingly.
- **No frontend test runner existed;** Task 1 adds Vitest, used by Tasks 2 and 4-8.
