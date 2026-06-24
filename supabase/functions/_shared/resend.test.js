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
import { computeAudienceDiff } from './resend.ts';
import { mapResendEventToStatus } from './resend.ts';

describe('buildBroadcastHtml', () => {
  it('includes the subject, the body, and the unsubscribe merge tag', () => {
    const html = buildBroadcastHtml('June Offer', 'Hi {{{FIRST_NAME}}}');
    expect(html).toContain('June Offer');
    expect(html).toContain('Hi {{{FIRST_NAME}}}');
    expect(html).toContain('{{{RESEND_UNSUBSCRIBE_URL}}}');
  });
});

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
