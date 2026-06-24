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
