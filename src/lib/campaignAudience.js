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
