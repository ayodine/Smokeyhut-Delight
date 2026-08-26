import { describe, it, expect, vi } from 'vitest';
import { checkCustomerAlreadyUsedCoupon } from './couponValidator';

vi.mock('./supabase', () => ({
  publicSupabase: {
    rpc: vi.fn(async (name, params) => {
      if (params.p_coupon_code === 'USED30' && (params.p_phone === '08012345678' || params.p_email === 'used@test.com')) {
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
