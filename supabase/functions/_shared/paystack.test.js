import { describe, it, expect } from 'vitest';
import { resolveCallbackOrigin, decidePromotion, classifyPaystackStatus } from './paystack.ts';

describe('resolveCallbackOrigin', () => {
  it('accepts allowlisted production origins', () => {
    expect(resolveCallbackOrigin('https://smokeyhutdelight.com')).toBe('https://smokeyhutdelight.com');
    expect(resolveCallbackOrigin('https://www.smokeyhutdelight.com')).toBe('https://www.smokeyhutdelight.com');
    expect(resolveCallbackOrigin('https://smokeyhut-delight.web.app')).toBe('https://smokeyhut-delight.web.app');
  });
  it('accepts localhost with any port (dev)', () => {
    expect(resolveCallbackOrigin('http://localhost:5173')).toBe('http://localhost:5173');
    expect(resolveCallbackOrigin('http://localhost:4000')).toBe('http://localhost:4000');
  });
  it('falls back to the primary domain for anything else', () => {
    expect(resolveCallbackOrigin('https://evil.example.com')).toBe('https://smokeyhutdelight.com');
    expect(resolveCallbackOrigin('http://smokeyhutdelight.com')).toBe('https://smokeyhutdelight.com'); // http on prod → not allowlisted
    expect(resolveCallbackOrigin(null)).toBe('https://smokeyhutdelight.com');
    expect(resolveCallbackOrigin(undefined)).toBe('https://smokeyhutdelight.com');
    expect(resolveCallbackOrigin('')).toBe('https://smokeyhutdelight.com');
  });
});

describe('decidePromotion', () => {
  const order = (status, paid_at = null, total = 5000) => ({ status, paid_at, total });
  it('rejects amount mismatches before anything else', () => {
    expect(decidePromotion(order('pending_payment'), 499900)).toBe('amount_mismatch');
    expect(decidePromotion(order('pending_payment'), 0)).toBe('amount_mismatch');
  });
  it('promotes an awaiting-payment order on exact amount', () => {
    expect(decidePromotion(order('pending_payment'), 500000)).toBe('promote');
  });
  it('rescues a sweeper-cancelled unpaid order (late webhook)', () => {
    expect(decidePromotion(order('cancelled', null), 500000)).toBe('promote');
  });
  it('never touches a cancelled order that was already paid (refund case)', () => {
    expect(decidePromotion(order('cancelled', '2026-07-23T10:00:00Z'), 500000)).toBe('noop');
  });
  it('is a no-op for every already-progressed status', () => {
    for (const s of ['pending', 'shipped', 'delivered']) {
      expect(decidePromotion(order(s, '2026-07-23T10:00:00Z'), 500000)).toBe('noop');
    }
  });
  it('handles decimal totals without float drift', () => {
    expect(decidePromotion(order('pending_payment', null, 5200.5), 520050)).toBe('promote');
  });
  it('exercises Math.round on a non-representable decimal (19.99 * 100)', () => {
    expect(decidePromotion(order('pending_payment', null, 19.99), 1999)).toBe('promote');
  });
});

describe('classifyPaystackStatus', () => {
  const resp = (status) => ({ status: true, data: { status } });
  it('paid only on success', () => {
    expect(classifyPaystackStatus(true, resp('success')).outcome).toBe('paid');
  });
  it('unpaid on definitive failure states', () => {
    for (const s of ['failed', 'abandoned', 'reversed'])
      expect(classifyPaystackStatus(true, resp(s)).outcome).toBe('unpaid');
  });
  it('unknown on not-yet-terminal states (never unpaid)', () => {
    for (const s of ['pending', 'ongoing', 'processing', 'queued'])
      expect(classifyPaystackStatus(true, resp(s)).outcome).toBe('unknown');
  });
  it('unknown on transport/envelope failure — a Paystack outage must never read as unpaid', () => {
    expect(classifyPaystackStatus(false, resp('success')).outcome).toBe('unknown'); // non-2xx
    expect(classifyPaystackStatus(true, { status: false }).outcome).toBe('unknown'); // envelope failure
    expect(classifyPaystackStatus(true, null).outcome).toBe('unknown');
  });
});
