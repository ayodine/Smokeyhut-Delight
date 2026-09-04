import { publicSupabase } from './supabase';

/**
 * Temporary lock: Customers who qualified for FREEFOWL08 based on specific order IDs.
 */
export const QUALIFIED_FREEFOWL08_CUSTOMERS = [
  {
    orderId: 'SHD-03022',
    name: 'Hareez Maye',
    phone: '08067829025',
    email: 'guidprot@gmail.com',
    address: 'Store Pickup — Lagos Mainland'
  },
  {
    orderId: 'SHD-06603',
    name: 'Ben Ashiru',
    phone: '08148256952',
    email: 'vybbezferanmi@gmail.com',
    address: 'Springville gardens Oakland estate idowu dabiri street sangotedo, Sangotedo'
  },
  {
    orderId: 'SHD-06632',
    name: 'Seun Alli',
    phone: '08033119777',
    email: 'seun.lekealli@gmail.com',
    address: '17b Kingsley Emu Street Lekki Phase 1, LEKKI'
  },
  {
    orderId: 'SHD-06641',
    name: 'Kafilat Oyefeso',
    phone: '08033350697',
    email: 'olabimpeoyefeso@gmail.com',
    address: '12 Taoridi Street off BodeThomas Rd beside Rita Lori Hotel Surulere , Surulere'
  },
  {
    orderId: 'SHD-06642',
    name: 'Oluwaseun Oguntola',
    phone: '07032020137',
    email: 'paparazu@yahoo.co.uk',
    address: '9A isaac John Street Ikeja GRA opposite Ebeano supermarket , Ikeja'
  },
  {
    orderId: 'SHD-06648',
    name: 'Motunrayo Daramola',
    phone: '08037002887',
    email: 'fatun9406@gmail.com',
    address: 'No 3 surulere industry road off adeniye John Ikeja , Ikeja'
  },
  {
    orderId: 'SHD-06654',
    name: 'Yemi Onobun',
    phone: '08026757151',
    email: 'atinaroy@yahoo.com',
    address: 'Store Pickup — Lagos Mainland'
  },
  {
    orderId: 'SHD-06657',
    name: 'Abbey Abiodun',
    phone: '08055453806',
    email: 'faleyeabbey@yahoo.com',
    address: '112 old ewu road aviation estate mafoluku oshodi, Oshodi'
  },
  {
    orderId: 'SHD-06659',
    name: 'Tamunomiete Ekine',
    phone: '08164980157',
    email: 'tamunomiete26@gmail.com',
    address: 'No 4 Adedayo close peace estate, Isheri igando road by iyanodo opposite amala ibadan, Isheri Oshun'
  },
  {
    orderId: 'SHD-06661',
    name: 'Muna Igbinedion',
    phone: '09044744511',
    email: 'muna.igbinedion@gmail.com',
    address: 'Kingdom Court, 11 Kayode Abraham street, off Ligali Ayorinde road, Victoria island , Victoria Island'
  }
];

/**
 * Normalizes phone numbers to compare the last 10 digits.
 */
export function normalizePhoneDigits(phone) {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

/**
 * Normalizes a string for loose comparison (lowercase, trimmed, collapse multiple spaces).
 */
export function normalizeText(str) {
  if (!str) return '';
  return String(str).toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Checks if the customer is eligible for a restricted coupon (specifically FREEFOWL08).
 * @param {string} code - The coupon code to check
 * @param {Object} customer - { name, phone, email, address }
 * @returns {{ eligible: boolean, matchedCustomer?: Object, error?: string, reason?: string }}
 */
export function isCustomerEligibleForCoupon(code, customer = {}) {
  const cleanCode = (code || '').trim().toUpperCase();
  if (cleanCode !== 'FREEFOWL08') {
    return { eligible: true };
  }

  const inputName = normalizeText(customer.name);
  const inputPhoneDigits = normalizePhoneDigits(customer.phone);
  const inputEmail = normalizeText(customer.email);
  const inputAddress = normalizeText(customer.address);

  // If no contact details have been entered yet, we cannot verify eligibility
  if (!inputPhoneDigits && !inputEmail && !inputName && !inputAddress) {
    return {
      eligible: false,
      reason: 'contact_required',
      error: 'Please enter your name, phone, or email to apply this coupon'
    };
  }

  // Find match in qualified customer list
  const matched = QUALIFIED_FREEFOWL08_CUSTOMERS.find(q => {
    // 1. Phone match (last 10 digits)
    if (inputPhoneDigits && inputPhoneDigits.length >= 10) {
      const qPhoneDigits = normalizePhoneDigits(q.phone);
      if (qPhoneDigits === inputPhoneDigits) return true;
    }

    // 2. Email match (case-insensitive exact)
    if (inputEmail && q.email) {
      if (inputEmail === normalizeText(q.email)) return true;
    }

    // 3. Name match
    if (inputName && q.name) {
      const qName = normalizeText(q.name);
      if (inputName === qName) return true;
      // Also match if all tokens in qualified name exist in inputName or vice versa
      const qTokens = qName.split(' ').filter(t => t.length > 1);
      const inTokens = inputName.split(' ').filter(t => t.length > 1);
      if (qTokens.length >= 2 && qTokens.every(t => inTokens.includes(t))) return true;
      if (inTokens.length >= 2 && inTokens.every(t => qTokens.includes(t))) return true;
    }

    // 4. Address match
    if (inputAddress && q.address) {
      const qAddr = normalizeText(q.address);
      if (inputAddress === qAddr) return true;
      const streetKeywords = qAddr.split(',')[0].replace(/store pickup/g, '').trim();
      if (streetKeywords.length > 8 && (inputAddress.includes(streetKeywords) || (inputAddress.length > 8 && streetKeywords.includes(inputAddress)))) {
        return true;
      }
    }

    return false;
  });

  if (matched) {
    return { eligible: true, matchedCustomer: matched };
  }

  return {
    eligible: false,
    reason: 'not_eligible',
    error: 'This coupon is valid only for eligible customers'
  };
}

/**
 * Checks if a customer (identified by phone and/or email) has already placed an order with the given coupon code.
 * @param {string} code - The coupon code to check
 * @param {string} phone - Customer phone number
 * @param {string} email - Customer email address
 * @param {Object} [matchedCustomer] - Optional matched qualified customer profile
 * @returns {Promise<{ used: boolean, notEligible?: boolean, message?: string }>}
 */
export async function checkCustomerAlreadyUsedCoupon(code, phone, email, matchedCustomer = null) {
  if (!code || (!phone && !email && !matchedCustomer)) return false;
  
  const cleanCode = code.trim().toUpperCase();
  const cleanPhone = (phone || '').trim();
  const cleanEmail = (email || '').trim().toLowerCase();

  try {
    const { data, error } = await publicSupabase.rpc('check_coupon_used_by_customer', {
      p_coupon_code: cleanCode,
      p_phone: cleanPhone || null,
      p_email: cleanEmail || null
    });

    if (error) {
      if (error.message && error.message.includes('valid only for eligible customers')) {
        return true; // Rejected by database qualification rule
      }
      console.warn('[CouponValidator] RPC error:', error);
    }

    if (!error && typeof data === 'boolean' && data) {
      return true;
    }

    // If this is FREEFOWL08 and we matched a qualified customer, verify their canonical phone/email too
    if (cleanCode === 'FREEFOWL08' && matchedCustomer) {
      const qPhone = matchedCustomer.phone || null;
      const qEmail = (matchedCustomer.email || '').toLowerCase() || null;
      if ((qPhone && qPhone !== cleanPhone) || (qEmail && qEmail !== cleanEmail)) {
        const { data: qData, error: qError } = await publicSupabase.rpc('check_coupon_used_by_customer', {
          p_coupon_code: cleanCode,
          p_phone: qPhone,
          p_email: qEmail
        });
        if (!qError && typeof qData === 'boolean' && qData) {
          return true;
        }
      }
    }
  } catch (err) {
    console.warn('[CouponValidator] RPC check failed:', err);
  }

  return false;
}

