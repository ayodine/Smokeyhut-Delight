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
  },
  {
    orderId: 'SHD-06595',
    name: 'dan Daniel',
    phone: '09168652077',
    email: 'alimidaniel64@gmail.com',
    address: '7/9 mobolade okoya thomas Vi , Victoria Island'
  },
  {
    orderId: 'SHD-06617',
    name: 'Daniel (May Mariam)',
    phone: '07087316641',
    email: 'alimidaniel64@gmail.com',
    address: '7/9 mobolade okoya thomas Vi , Victoria Island'
  },
  {
    orderId: 'SHD-06594',
    name: 'Daniel (Caster Tunde)',
    phone: '08159561128',
    email: 'alimidaniel64@gmail.com',
    address: '7/9 mobolade okoya thomas Vi , Victoria Island'
  },
  {
    orderId: 'SHD-06720',
    name: 'Sunday Oguntoye',
    phone: '07063805119',
    email: 'sunnytoye77@yahoo.com',
    address: 'Plot E49,D close, Sokoloff Street,Banana Island , Ikoyi'
  },
  {
    orderId: 'SHD-06722',
    name: 'Yemi Sunday',
    phone: '08027586722',
    email: 'horlaryemmy77@gmail.com',
    address: 'Plot 25, Adekunle Banjo Avenue, Magodo Shangisha, Magodo Shangisha'
  },
  {
    orderId: 'SHD-06742',
    name: 'Valerie Lolomari',
    phone: '09024823335',
    email: 'lolomariv@gmail.com',
    address: 'Mathew Osawemen street, Ologolo , LEKKI'
  },
  {
    orderId: 'SHD-06746',
    name: 'Ipaye Fatima',
    phone: '08168457550',
    email: 'prettytyma2015@gmail.com',
    address: '57, bola Street by ondo ebute metta east, Ebutemetta'
  },
  {
    orderId: 'SHD-06750',
    name: 'Elizabella Elizabella',
    phone: '08024289517',
    email: 'abiolashokunbi6@gmail.com',
    address: 'Lsdpc Estate block 11 Ebute Metta , Ebutemetta'
  },
  {
    orderId: 'SHD-06753',
    name: 'Iphie LuxuryHairs',
    phone: '08036433441',
    email: 'ihenacho_ify@yahoo.com',
    address: 'Store Pickup — Lagos Mainland'
  },
  {
    orderId: 'SHD-06755',
    name: 'Dera Shallom',
    phone: '09132833105',
    email: 'chiderashallom@gmail.com',
    address: 'HRC estate Harris drive vgc lagos, VGC'
  },
  {
    orderId: 'SHD-06758',
    name: 'SCHOLASTICA SCHOLASTICA',
    phone: '08114498668',
    email: 'nokorafor222@gmail.com',
    address: 'No 4 Kelly John Street, Infinity estate (milestone hotel) Skido bus stop. Ado ,road Ajah, AJAH'
  },
  {
    orderId: 'SHD-06761',
    name: 'Oluranti Sadiq',
    phone: '08060089417',
    email: 'omobim89@gmail.com',
    address: '33, Michael Ayegoro, 3rd powerline Okeletu , IKORODU'
  },
  {
    orderId: 'SHD-06763',
    name: 'Omalicha Adaobi',
    phone: '08022771081',
    email: 'a.adaobiumeh@gmail.com',
    address: 'House 3,Elijah Abina  street, Lakeview phase 2 amuwo odofin , Amuwo Odofin'
  },
  {
    orderId: 'SHD-06650',
    name: 'John Asokhia',
    phone: '08032280483',
    email: 'johnasokhia@gmail.com',
    address: ''
  },
  {
    orderId: 'SHD-06780',
    name: 'Ruth Are',
    phone: '08131693463',
    email: 'aleezascott@gmail.com',
    address: ''
  },
  {
    orderId: 'SHD-06784',
    name: 'Ifeoma Linda',
    phone: '08134304570',
    email: 'ukazuifeoma@gmail.com',
    address: ''
  },
  {
    orderId: 'SHD-06788',
    name: 'Tola Odunlami',
    phone: '08052628751',
    email: 'odlamt@yahoo.com',
    address: ''
  },
  {
    orderId: 'SHD-06791',
    name: 'Owen Aghedo',
    phone: '08051931423',
    email: 'owen.aghedo@gmail.com',
    address: ''
  },
  {
    orderId: 'SHD-06801',
    name: 'Juanita Udemba',
    phone: '08023892195',
    email: 'juanitaudemba@gmail.com',
    address: ''
  },
  {
    orderId: 'SHD-06824',
    name: 'Mary Mary',
    phone: '08120573006',
    email: 't.fadina@yahoo.com',
    address: ''
  },
  {
    orderId: 'SHD-06828',
    name: 'Samuel Oshogia',
    phone: '08032697050',
    email: 'temitopeomofare@gmail.com',
    address: ''
  },
  {
    orderId: 'SHD-06829',
    name: 'Chiamaka Ihejirika',
    phone: '08166181871',
    email: 'perrinaihejirika@gmail.com',
    address: ''
  },
  {
    orderId: 'SHD-06835',
    name: 'Emmanuel Oguibe',
    phone: '07075232680',
    email: 'favouroguibe21@gmail.com',
    address: ''
  },
  {
    orderId: 'SHD-06839',
    name: 'Sunkanmi Ayeni',
    phone: '07085157363',
    email: 'tokanmi21@gmail.com',
    address: ''
  },
  {
    orderId: 'SHD-06840',
    name: 'Moses Momoh',
    phone: '08034251967',
    email: 'kenny4scott@gmail.com',
    address: ''
  },
  {
    orderId: 'SHD-06849',
    name: 'Kelvin Kuz£',
    phone: '08167674690',
    email: 'danmilitary221@gmail.com',
    address: ''
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

let dynamicEligibleCache = {};
let lastCacheFetchTime = 0;

export async function fetchEligibleCustomersFromDb(code) {
  const cleanCode = (code || '').trim().toUpperCase();
  const now = Date.now();
  if (dynamicEligibleCache[cleanCode] && now - lastCacheFetchTime < 120000) {
    return dynamicEligibleCache[cleanCode];
  }
  try {
    const { data: coupon } = await publicSupabase
      .from('coupons')
      .select('id, is_restricted')
      .eq('code', cleanCode)
      .maybeSingle();

    if (!coupon || !coupon.is_restricted) {
      dynamicEligibleCache[cleanCode] = [];
      return [];
    }

    const { data: rows } = await publicSupabase
      .from('coupon_eligible_customers')
      .select('customer_name, customer_phone, customer_email, customer_address, max_uses, reference_order_id')
      .eq('coupon_id', coupon.id);

    if (rows && rows.length > 0) {
      dynamicEligibleCache[cleanCode] = rows.map(r => ({
        name: r.customer_name,
        phone: r.customer_phone,
        email: r.customer_email,
        address: r.customer_address,
        orderId: r.reference_order_id,
        max_uses: r.max_uses
      }));
      lastCacheFetchTime = now;
    }
    return dynamicEligibleCache[cleanCode] || [];
  } catch (err) {
    console.warn('[CouponValidator] DB fetch eligible customers failed:', err);
    return [];
  }
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
      error: 'Please enter your phone number or email to apply this coupon'
    };
  }

  const pool = [...QUALIFIED_FREEFOWL08_CUSTOMERS, ...(dynamicEligibleCache[cleanCode] || [])];

  // Find match in qualified customer list
  const matched = pool.find(q => {
    const qPhoneDigits = normalizePhoneDigits(q.phone || q.customer_phone);
    const qEmail = normalizeText(q.email || q.customer_email);
    const qRawName = q.name || q.customer_name;
    const qName = normalizeText(qRawName);
    const qAddr = normalizeText(q.address || q.customer_address);

    // 1. Phone match (last 10 digits)
    const phoneMatches = inputPhoneDigits && qPhoneDigits && inputPhoneDigits.length >= 10 && qPhoneDigits === inputPhoneDigits;
    // 2. Email match (case-insensitive exact)
    const emailMatches = inputEmail && qEmail && inputEmail === qEmail;

    if (phoneMatches || emailMatches) return true;

    // If both phone AND email were supplied, and neither matched this customer, don't falsely match on name
    if (inputPhoneDigits && inputEmail && !phoneMatches && !emailMatches) {
      return false;
    }
    // If phone was supplied with 10+ digits and did not match, don't falsely match on name
    if (inputPhoneDigits && inputPhoneDigits.length >= 10 && qPhoneDigits && !phoneMatches) {
      return false;
    }

    // 3. Name match (exact or token match when contact details do not conflict)
    if (inputName && qName) {
      if (inputName === qName) return true;
      const qTokens = qName.split(' ').filter(t => t.length > 1);
      const inTokens = inputName.split(' ').filter(t => t.length > 1);
      if (qTokens.length >= 2 && qTokens.every(t => inTokens.includes(t))) return true;
      if (inTokens.length >= 2 && inTokens.every(t => qTokens.includes(t))) return true;
      // Handle 'dan daniel' matching 'daniel', 'dan', or 'daniel alimi'
      if (qName.includes('dan daniel') && (inTokens.includes('daniel') || inTokens.includes('dan'))) return true;
    }

    // 4. Address match
    if (inputAddress && qAddr) {
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

let lastCouponError = '';

export function getLastCouponError() {
  return lastCouponError;
}

/**
 * Checks if a customer (identified by phone and/or email) has already placed an order with the given coupon code,
 * or if they are eligible for a restricted coupon.
 * @param {string} code - The coupon code to check
 * @param {string} phone - Customer phone number
 * @param {string} email - Customer email address
 * @param {Object} [matchedCustomer] - Optional matched qualified customer profile
 * @returns {Promise<boolean>} - False if allowed, true if blocked/already used
 */
export async function checkCustomerAlreadyUsedCoupon(code, phone, email, matchedCustomer = null) {
  lastCouponError = '';
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
        lastCouponError = 'This coupon is valid only for eligible customers';
        return true;
      }
      console.warn('[CouponValidator] RPC error:', error);
      lastCouponError = error.message || 'Could not verify coupon eligibility';
      return true;
    }

    if (!error && typeof data === 'boolean' && data) {
      lastCouponError = 'You have already used this coupon code on a previous order';
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
          lastCouponError = 'You have already used this coupon code on a previous order';
          return true;
        }
      }
    }
  } catch (err) {
    console.warn('[CouponValidator] RPC check failed:', err);
  }

  return false;
}

