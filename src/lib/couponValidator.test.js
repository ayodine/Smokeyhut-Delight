import { describe, it, expect, vi } from 'vitest';
import {
  checkCustomerAlreadyUsedCoupon,
  isCustomerEligibleForCoupon,
  QUALIFIED_FREEFOWL08_CUSTOMERS,
  normalizePhoneDigits,
  normalizeText
} from './couponValidator';

vi.mock('./supabase', () => ({
  publicSupabase: {
    rpc: vi.fn(async (name, params) => {
      if (params.p_coupon_code === 'USED30' && (params.p_phone === '08012345678' || params.p_email === 'used@test.com')) {
        return { data: true, error: null };
      }
      if (params.p_coupon_code === 'FREEFOWL08' && (params.p_phone === '08033119777' || params.p_email === 'seun.lekealli@gmail.com') && params.p_phone === 'ALREADY_USED') {
        return { data: true, error: null };
      }
      return { data: false, error: null };
    }),
  },
}));

describe('checkCustomerAlreadyUsedCoupon', () => {
  it('returns false if no code or contact info provided', async () => {
    expect(await checkCustomerAlreadyUsedCoupon('', '', '')).toBe(false);
    expect(await checkCustomerAlreadyUsedCoupon('CODE', '', '')).toBe(false);
  });

  it('detects if customer already used coupon by phone or email', async () => {
    expect(await checkCustomerAlreadyUsedCoupon('USED30', '08012345678', '')).toBe(true);
    expect(await checkCustomerAlreadyUsedCoupon('USED30', '', 'used@test.com')).toBe(true);
  });

  it('allows new customer who has not used coupon before', async () => {
    expect(await checkCustomerAlreadyUsedCoupon('USED30', '08099999999', 'new@test.com')).toBe(false);
  });
});

describe('isCustomerEligibleForCoupon (FREEFOWL08 lock)', () => {
  it('allows unrestricted coupons for any customer', () => {
    expect(isCustomerEligibleForCoupon('CLOSETDELIGHT', {}).eligible).toBe(true);
    expect(isCustomerEligibleForCoupon('DELIGHTSDC6', { name: 'Random Person' }).eligible).toBe(true);
  });

  it('requires contact details when applying FREEFOWL08', () => {
    const res = isCustomerEligibleForCoupon('FREEFOWL08', {});
    expect(res.eligible).toBe(false);
    expect(res.reason).toBe('contact_required');
  });

  it('rejects unqualified customers trying to use FREEFOWL08', () => {
    const res = isCustomerEligibleForCoupon('FREEFOWL08', {
      name: 'John Doe',
      phone: '08099999999',
      email: 'john@example.com'
    });
    expect(res.eligible).toBe(false);
    expect(res.reason).toBe('not_eligible');
  });

  it('qualifies all 10 target customers by phone (including international/spaced format)', () => {
    for (const q of QUALIFIED_FREEFOWL08_CUSTOMERS) {
      // Direct phone
      expect(isCustomerEligibleForCoupon('FREEFOWL08', { phone: q.phone }).eligible).toBe(true);
      // International +234 format
      const intlPhone = '+234 ' + q.phone.slice(1);
      expect(isCustomerEligibleForCoupon('FREEFOWL08', { phone: intlPhone }).eligible).toBe(true);
    }
  });

  it('qualifies all 10 target customers by email (case-insensitive)', () => {
    for (const q of QUALIFIED_FREEFOWL08_CUSTOMERS) {
      expect(isCustomerEligibleForCoupon('FREEFOWL08', { email: q.email.toUpperCase() }).eligible).toBe(true);
    }
  });

  it('qualifies target customer by name', () => {
    expect(isCustomerEligibleForCoupon('FREEFOWL08', { name: 'Seun Alli' }).eligible).toBe(true);
    expect(isCustomerEligibleForCoupon('FREEFOWL08', { name: 'Oluwaseun Oguntola' }).eligible).toBe(true);
    expect(isCustomerEligibleForCoupon('FREEFOWL08', { name: 'Kafilat Oyefeso' }).eligible).toBe(true);
    expect(isCustomerEligibleForCoupon('FREEFOWL08', { name: 'Hareez Maye' }).eligible).toBe(true);
  });

  it('qualifies target customer by street address keywords', () => {
    expect(isCustomerEligibleForCoupon('FREEFOWL08', { address: '17b Kingsley Emu Street Lekki Phase 1' }).eligible).toBe(true);
    expect(isCustomerEligibleForCoupon('FREEFOWL08', { address: '9A isaac John Street Ikeja GRA' }).eligible).toBe(true);
  });
});

