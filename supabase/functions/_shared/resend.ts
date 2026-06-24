// Pure helpers shared by the Resend edge functions. No Deno globals at module load
// so these are unit-testable under Vitest (Node).

export function personalizeForResend(body: string): string {
  return body
    .replace(/\{customer_name\}/g, '{{{FIRST_NAME}}}')
    .replace(/\n/g, '<br>');
}
