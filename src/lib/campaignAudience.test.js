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
