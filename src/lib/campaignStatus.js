// Unified campaign_logs status classification across Gmail (sent/failed) and
// Resend (queued/delivered/bounced/complained) providers.
export const isSent = (status) => status === 'sent' || status === 'delivered';

export const isFailed = (status, error) =>
  (status === 'failed' && error !== 'Pending execution') ||
  status === 'bounced' || status === 'complained';

export const isPending = (status, error) =>
  (status === 'failed' && error === 'Pending execution') || status === 'queued';
