import { publicSupabase } from './supabase';

/**
 * Checks if a customer (identified by phone and/or email) has already placed an order with the given coupon code.
 * @param {string} code - The coupon code to check
 * @param {string} phone - Customer phone number
 * @param {string} email - Customer email address
 * @returns {Promise<boolean>} - True if already used on a non-cancelled order, false otherwise
 */
export async function checkCustomerAlreadyUsedCoupon(code, phone, email) {
  if (!code || (!phone && !email)) return false;
  
  const cleanCode = code.trim().toUpperCase();
  const cleanPhone = (phone || '').trim();
  const cleanEmail = (email || '').trim().toLowerCase();

  try {
    const { data, error } = await publicSupabase.rpc('check_coupon_used_by_customer', {
      p_coupon_code: cleanCode,
      p_phone: cleanPhone,
      p_email: cleanEmail || null
    });

    if (!error && typeof data === 'boolean') {
      return data;
    }
  } catch (err) {
    console.warn('[CouponValidator] RPC check failed:', err);
  }

  return false;
}
