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
