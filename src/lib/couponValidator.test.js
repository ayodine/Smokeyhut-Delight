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

  it('temporarily bypasses checkCustomerAlreadyUsedCoupon for SHD-06595 customer', async () => {
    expect(await checkCustomerAlreadyUsedCoupon('FREEFOWL08', '09168652077', 'alimidaniel64@gmail.com')).toBe(false);
  });
});

describe('isCustomerEligibleForCoupon (Public vs Restricted)', () => {
  it('allows unrestricted/public coupons for ANY customer without requiring contact info', () => {
    expect(isCustomerEligibleForCoupon('CLOSETDELIGHT', {}).eligible).toBe(true);
    expect(isCustomerEligibleForCoupon('DELIGHTSDC6', { name: 'Random Person' }).eligible).toBe(true);
    // FREEFOWL08 when made public (isRestrictedOverride: false) qualifies ANY customer
    expect(isCustomerEligibleForCoupon('FREEFOWL08', { name: 'John Doe', phone: '08012345678' }, false).eligible).toBe(true);
    expect(isCustomerEligibleForCoupon('FREEFOWL08', {}, false).eligible).toBe(true);
  });

  it('requires contact details when coupon is restricted', () => {
    const res = isCustomerEligibleForCoupon('FREEFOWL08', {}, true);
    expect(res.eligible).toBe(false);
    expect(res.reason).toBe('contact_required');
  });

  it('rejects unqualified customers trying to use a restricted coupon', () => {
    const res = isCustomerEligibleForCoupon('FREEFOWL08', {
      name: 'Random Stranger',
      phone: '08099999999',
      email: 'stranger@example.com'
    }, true);
    expect(res.eligible).toBe(false);
    expect(res.reason).toBe('not_eligible');
  });

  it('qualifies all 21 target customers by phone when restricted (including international/spaced format)', () => {
    for (const q of QUALIFIED_FREEFOWL08_CUSTOMERS) {
      // Direct phone
      expect(isCustomerEligibleForCoupon('FREEFOWL08', { phone: q.phone }, true).eligible).toBe(true);
      // International +234 format
      const intlPhone = '+234 ' + q.phone.slice(1);
      expect(isCustomerEligibleForCoupon('FREEFOWL08', { phone: intlPhone }, true).eligible).toBe(true);
    }
  });

  it('qualifies all 21 target customers by email when restricted (case-insensitive)', () => {
    for (const q of QUALIFIED_FREEFOWL08_CUSTOMERS) {
      expect(isCustomerEligibleForCoupon('FREEFOWL08', { email: q.email.toUpperCase() }, true).eligible).toBe(true);
    }
  });

  it('qualifies target customer by name when restricted', () => {
    expect(isCustomerEligibleForCoupon('FREEFOWL08', { name: 'Seun Alli' }, true).eligible).toBe(true);
    expect(isCustomerEligibleForCoupon('FREEFOWL08', { name: 'Oluwaseun Oguntola' }, true).eligible).toBe(true);
    expect(isCustomerEligibleForCoupon('FREEFOWL08', { name: 'Kafilat Oyefeso' }, true).eligible).toBe(true);
    expect(isCustomerEligibleForCoupon('FREEFOWL08', { name: 'Hareez Maye' }, true).eligible).toBe(true);
    expect(isCustomerEligibleForCoupon('FREEFOWL08', { name: 'dan Daniel' }, true).eligible).toBe(true);
    expect(isCustomerEligibleForCoupon('FREEFOWL08', { name: 'Sunday Oguntoye' }, true).eligible).toBe(true);
  });

  it('qualifies target customer by street address keywords when restricted', () => {
    expect(isCustomerEligibleForCoupon('FREEFOWL08', { address: '17b Kingsley Emu Street Lekki Phase 1' }, true).eligible).toBe(true);
    expect(isCustomerEligibleForCoupon('FREEFOWL08', { address: '9A isaac John Street Ikeja GRA' }, true).eligible).toBe(true);
    expect(isCustomerEligibleForCoupon('FREEFOWL08', { address: '7/9 mobolade okoya thomas Vi' }, true).eligible).toBe(true);
  });

  it('qualifies customer SHD-06595 (Daniel) across all name and phone variations when restricted', () => {
    // Primary phone from order SHD-06595
    expect(isCustomerEligibleForCoupon('FREEFOWL08', { phone: '09168652077' }, true).eligible).toBe(true);
    // Alternate phone 1 (SHD-06617)
    expect(isCustomerEligibleForCoupon('FREEFOWL08', { phone: '07087316641' }, true).eligible).toBe(true);
    // Alternate phone 2 (SHD-06594)
    expect(isCustomerEligibleForCoupon('FREEFOWL08', { phone: '08159561128' }, true).eligible).toBe(true);
    // Canonical email
    expect(isCustomerEligibleForCoupon('FREEFOWL08', { email: 'alimidaniel64@gmail.com' }, true).eligible).toBe(true);
    // Variations of his name
    expect(isCustomerEligibleForCoupon('FREEFOWL08', { name: 'Daniel' }, true).eligible).toBe(true);
    expect(isCustomerEligibleForCoupon('FREEFOWL08', { name: 'Dan' }, true).eligible).toBe(true);
    expect(isCustomerEligibleForCoupon('FREEFOWL08', { name: 'dan Daniel' }, true).eligible).toBe(true);
    expect(isCustomerEligibleForCoupon('FREEFOWL08', { name: 'Daniel Alimi' }, true).eligible).toBe(true);
    expect(isCustomerEligibleForCoupon('FREEFOWL08', { name: 'may Mariam' }, true).eligible).toBe(true);
  });
});



