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

import { buildBroadcastHtml } from './resend.ts';

describe('buildBroadcastHtml', () => {
  it('includes the subject, the body, and the unsubscribe merge tag', () => {
    const html = buildBroadcastHtml('June Offer', 'Hi {{{FIRST_NAME}}}');
    expect(html).toContain('June Offer');
    expect(html).toContain('Hi {{{FIRST_NAME}}}');
    expect(html).toContain('{{{RESEND_UNSUBSCRIBE_URL}}}');
  });
});
