// Pure helpers shared by the Resend edge functions. No Deno globals at module load
// so these are unit-testable under Vitest (Node).

export function personalizeForResend(body: string): string {
  return body
    .replace(/\{customer_name\}/g, '{{{FIRST_NAME}}}')
    .replace(/\n/g, '<br>');
}

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
