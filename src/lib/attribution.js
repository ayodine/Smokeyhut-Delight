/**
 * First-Party Ad & Traffic Attribution Tracking
 * 
 * Captures ad click parameters (fbclid, ScCid, gclid, ttclid), UTM tags,
 * and external referrers on user landing. Persists across page navigation,
 * cart changes, and Paystack payment redirects.
 */

const SESSION_STORAGE_KEY = 'smokeyhut_attribution_session';
const PERSISTENT_STORAGE_KEY = 'smokeyhut_attribution_persistent';
const ATTRIBUTION_WINDOW_DAYS = 30;

function isBrowser() {
  return typeof window !== 'undefined';
}

/**
 * Checks if a referrer URL belongs to an internal / self domain or payment gateway.
 */
function isInternalOrPaymentReferrer(referrer) {
  if (!referrer) return true;
  try {
    const url = new URL(referrer);
    const host = url.hostname.toLowerCase();
    return (
      host.includes('smokeyhut') ||
      host.includes('paystack.com') ||
      host === 'localhost' ||
      host === '127.0.0.1'
    );
  } catch {
    return false;
  }
}

/**
 * Extracts and classifies attribution parameters from URL and referrer.
 */
export function extractAttributionFromLocation(searchStr = '', referrerStr = '') {
  const params = new URLSearchParams(searchStr.startsWith('?') ? searchStr.slice(1) : searchStr);

  // Case-insensitive lookup for parameters
  const getParam = (key) => {
    const target = key.toLowerCase();
    for (const [k, v] of params.entries()) {
      if (k.toLowerCase() === target) return v.trim();
    }
    return '';
  };

  const utmSource = getParam('utm_source');
  const utmMedium = getParam('utm_medium');
  const utmCampaign = getParam('utm_campaign');
  const utmContent = getParam('utm_content');
  const utmTerm = getParam('utm_term');

  // Click IDs (case-insensitive and support all common aliases)
  const scCid = getParam('sccid') || getParam('sc_cid') || getParam('ScCid');
  const fbclid = getParam('fbclid');
  const gclid = getParam('gclid') || getParam('wbraid') || getParam('gbraid');
  const ttclid = getParam('ttclid');

  const ref = (referrerStr || '').trim();
  const isInternal = isInternalOrPaymentReferrer(ref);
  const externalRef = isInternal ? '' : ref;

  let refHost = '';
  if (externalRef) {
    try {
      refHost = new URL(externalRef).hostname.toLowerCase();
    } catch {
      refHost = externalRef.toLowerCase();
    }
  }

  const sLower = utmSource.toLowerCase();
  const mLower = utmMedium.toLowerCase();
  const refLower = (externalRef + ' ' + refHost).toLowerCase();

  // 1. SNAPCHAT ADS
  if (
    scCid ||
    sLower === 'snapchat' ||
    sLower === 'snap' ||
    mLower === 'snapchat' ||
    refLower.includes('snapchat') ||
    refLower.includes('com.snapchat.android') ||
    refLower.includes('picaboo')
  ) {
    return {
      traffic_source: 'Snapchat Ad',
      channel: 'Snapchat',
      is_ad: true,
      ad_click_id: scCid || (refLower.includes('snapchat') ? 'snap_ref' : 'snap_utm'),
      click_id_type: 'ScCid',
      utm_source: utmSource || 'snapchat',
      utm_medium: utmMedium || (scCid ? 'paid' : 'referral'),
      utm_campaign: utmCampaign || null,
      utm_content: utmContent || null,
      utm_term: utmTerm || null,
      referrer: externalRef || null,
      timestamp: new Date().toISOString()
    };
  }

  // 2. FACEBOOK / INSTAGRAM (META) ADS
  if (
    fbclid ||
    sLower === 'facebook' ||
    sLower === 'fb' ||
    sLower === 'instagram' ||
    sLower === 'ig' ||
    sLower === 'meta' ||
    refLower.includes('facebook') ||
    refLower.includes('instagram')
  ) {
    const isInsta = sLower === 'instagram' || sLower === 'ig' || refLower.includes('instagram');
    const platform = isInsta ? 'Instagram' : 'Facebook';
    const isAd = Boolean(fbclid || /paid|cpc|ads|stories|feed/i.test(mLower));

    return {
      traffic_source: isAd ? `${platform} Ad` : (isInsta ? 'Instagram Link' : platform),
      channel: platform,
      is_ad: isAd,
      ad_click_id: fbclid || (isAd ? 'fb_utm' : null),
      click_id_type: fbclid ? 'fbclid' : null,
      utm_source: utmSource || (isInsta ? 'instagram' : 'facebook'),
      utm_medium: utmMedium || (fbclid ? 'paid' : 'referral'),
      utm_campaign: utmCampaign || null,
      utm_content: utmContent || null,
      utm_term: utmTerm || null,
      referrer: externalRef || null,
      timestamp: new Date().toISOString()
    };
  }

  // 3. WHATSAPP (including official l.wl.co link shim)
  if (
    sLower === 'whatsapp' ||
    sLower === 'wa' ||
    refLower.includes('whatsapp') ||
    refLower.includes('l.wl.co') ||
    refLower.includes('wl.co') ||
    refLower.includes('wa.me') ||
    refLower.includes('wa.link')
  ) {
    return {
      traffic_source: 'WhatsApp',
      channel: 'WhatsApp',
      is_ad: false,
      ad_click_id: null,
      click_id_type: null,
      utm_source: utmSource || 'whatsapp',
      utm_medium: utmMedium || 'referral',
      utm_campaign: utmCampaign || null,
      utm_content: utmContent || null,
      utm_term: utmTerm || null,
      referrer: externalRef || null,
      timestamp: new Date().toISOString()
    };
  }

  // 3. GOOGLE ADS / SEARCH
  if (gclid || (sLower === 'google' && /cpc|paid|ad/i.test(mLower))) {
    return {
      traffic_source: 'Google Ad',
      channel: 'Google',
      is_ad: true,
      ad_click_id: gclid || 'google_utm',
      click_id_type: 'gclid',
      utm_source: utmSource || 'google',
      utm_medium: utmMedium || 'cpc',
      utm_campaign: utmCampaign || null,
      utm_content: utmContent || null,
      utm_term: utmTerm || null,
      referrer: externalRef || null,
      timestamp: new Date().toISOString()
    };
  }

  if (refHost.includes('google.')) {
    return {
      traffic_source: 'Google Search',
      channel: 'Google',
      is_ad: false,
      ad_click_id: null,
      click_id_type: null,
      utm_source: 'google',
      utm_medium: 'organic',
      utm_campaign: null,
      utm_content: null,
      utm_term: null,
      referrer: externalRef || null,
      timestamp: new Date().toISOString()
    };
  }

  // 4. TIKTOK ADS
  if (ttclid || sLower === 'tiktok' || refHost.includes('tiktok.com')) {
    const isAd = Boolean(ttclid || /paid|cpc|ads/i.test(mLower));
    return {
      traffic_source: isAd ? 'TikTok Ad' : 'TikTok',
      channel: 'TikTok',
      is_ad: isAd,
      ad_click_id: ttclid || (isAd ? 'tt_utm' : null),
      click_id_type: 'ttclid',
      utm_source: utmSource || 'tiktok',
      utm_medium: utmMedium || (ttclid ? 'paid' : 'referral'),
      utm_campaign: utmCampaign || null,
      utm_content: utmContent || null,
      utm_term: utmTerm || null,
      referrer: externalRef || null,
      timestamp: new Date().toISOString()
    };
  }

  // 5. CUSTOM UTM CAMPAIGN
  if (utmSource) {
    const cleanSource = utmSource.charAt(0).toUpperCase() + utmSource.slice(1);
    const isAd = /paid|cpc|ads/i.test(mLower);
    return {
      traffic_source: isAd ? `${cleanSource} Ad` : cleanSource,
      channel: cleanSource,
      is_ad: isAd,
      ad_click_id: null,
      click_id_type: null,
      utm_source: utmSource,
      utm_medium: utmMedium || null,
      utm_campaign: utmCampaign || null,
      utm_content: utmContent || null,
      utm_term: utmTerm || null,
      referrer: externalRef || null,
      timestamp: new Date().toISOString()
    };
  }

  // 6. OTHER EXTERNAL REFERRER
  if (externalRef && refHost) {
    let cleanRef = refHost.replace(/^www\./, '');
    if (cleanRef.includes('t.co') || cleanRef.includes('twitter.com') || cleanRef.includes('x.com')) {
      cleanRef = 'Twitter / X';
    }
    return {
      traffic_source: cleanRef,
      channel: cleanRef,
      is_ad: false,
      ad_click_id: null,
      click_id_type: null,
      utm_source: cleanRef.toLowerCase(),
      utm_medium: 'referral',
      utm_campaign: null,
      utm_content: null,
      utm_term: null,
      referrer: externalRef,
      timestamp: new Date().toISOString()
    };
  }

  // 7. DIRECT / NO CAMPAIGN DETECTED
  return null;
}

/**
 * Initializes attribution tracking on landing or route change.
 * Stores attribution in sessionStorage (session) and localStorage (persistent 30-day window).
 */
export function initAttribution() {
  if (!isBrowser()) return null;

  try {
    const search = window.location.search || '';
    const referrer = document.referrer || '';
    const extracted = extractAttributionFromLocation(search, referrer);

    if (extracted) {
      // New campaign/ad detected on current page load — update session and persistent store
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(extracted));
      localStorage.setItem(PERSISTENT_STORAGE_KEY, JSON.stringify(extracted));
      return extracted;
    }

    // Check existing in sessionStorage
    const existingSession = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (existingSession) {
      try {
        return JSON.parse(existingSession);
      } catch {
        // invalid json
      }
    }

    // Check persistent store within 30-day window
    const existingPersistent = localStorage.getItem(PERSISTENT_STORAGE_KEY);
    if (existingPersistent) {
      try {
        const parsed = JSON.parse(existingPersistent);
        if (parsed.timestamp) {
          const ageDays = (Date.now() - new Date(parsed.timestamp).getTime()) / (1000 * 60 * 60 * 24);
          if (ageDays <= ATTRIBUTION_WINDOW_DAYS) {
            // Rehydrate session
            sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(parsed));
            return parsed;
          }
        }
      } catch {
        // invalid json
      }
    }
  } catch (err) {
    console.warn('[Attribution] initAttribution failed:', err);
  }

  return null;
}

/**
 * Retrieves the currently active attribution for checkout and order placement.
 */
export function getAttribution() {
  if (!isBrowser()) return null;

  try {
    const sessionVal = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (sessionVal) {
      return JSON.parse(sessionVal);
    }
    const persistentVal = localStorage.getItem(PERSISTENT_STORAGE_KEY);
    if (persistentVal) {
      const parsed = JSON.parse(persistentVal);
      if (parsed.timestamp) {
        const ageDays = (Date.now() - new Date(parsed.timestamp).getTime()) / (1000 * 60 * 60 * 24);
        if (ageDays <= ATTRIBUTION_WINDOW_DAYS) {
          return parsed;
        }
      }
    }
  } catch {
    // ignore
  }

  return null;
}

/**
 * Formats a clean, human-readable tag string for order notes.
 * e.g. "[Source: Snapchat Ad | Campaign: FreeFowl]" or "[Source: Facebook Ad]"
 */
export function formatAttributionForNotes(attr = null) {
  const data = attr || getAttribution();
  if (!data) return '';

  const parts = [];
  if (data.traffic_source) {
    parts.push(data.traffic_source);
  }
  if (data.utm_campaign) {
    parts.push(`Campaign: ${data.utm_campaign}`);
  }
  if (data.utm_medium && !data.traffic_source.toLowerCase().includes('ad')) {
    parts.push(`Medium: ${data.utm_medium}`);
  }

  return parts.length ? `[Source: ${parts.join(' | ')}]` : '';
}

/**
 * Parses an order's attribution from either its dedicated columns or notes string.
 * Returns display-ready styling tokens for badges and drawers.
 */
export function parseOrderAttribution(order = {}) {
  const notes = order.notes || '';
  const colSource = order.traffic_source || '';
  const colCampaign = order.utm_campaign || '';
  const colMedium = order.utm_medium || '';
  const colClickId = order.ad_click_id || '';

  let source = colSource;
  let campaign = colCampaign;
  let medium = colMedium;
  let clickId = colClickId;

  // Fallback: parse from notes tag "[Source: ...]"
  if (!source && notes) {
    const match = notes.match(/\[Source:\s*([^\]]+)\]/i);
    if (match && match[1]) {
      const segs = match[1].split('|').map(s => s.trim());
      source = segs[0] || '';
      for (let i = 1; i < segs.length; i++) {
        if (/campaign:\s*(.+)/i.test(segs[i])) {
          campaign = segs[i].replace(/campaign:\s*/i, '').trim();
        } else if (/medium:\s*(.+)/i.test(segs[i])) {
          medium = segs[i].replace(/medium:\s*/i, '').trim();
        }
      }
    }
  }

  // Fallback 2: Check channel
  if (!source) {
    if (order.channel === 'whatsapp' || (notes && notes.includes('[via WhatsApp Menu]'))) {
      source = 'WhatsApp Menu';
    } else if (order.channel === 'storefront' || (notes && notes.includes('[via Website]'))) {
      source = 'Website Direct';
    } else {
      source = 'Direct';
    }
  }

  const sLower = source.toLowerCase();

  // Color tokens and styling
  if (sLower.includes('snap')) {
    return {
      source: 'Snapchat Ad',
      platform: 'Snapchat',
      isAd: true,
      badgeText: 'Snapchat Ad',
      color: '#854d0e',
      bg: '#fef9c3',
      border: '#fde047',
      campaign,
      medium,
      clickId,
      raw: source
    };
  }

  if (sLower.includes('instagram') || sLower.includes('insta')) {
    const isInstaAd = Boolean(
      sLower.includes('ad') ||
      (medium && ['paid', 'cpc', 'paid_social', 'ad'].includes(medium.toLowerCase())) ||
      Boolean(clickId)
    );
    return {
      source: isInstaAd ? 'Instagram Ad' : 'Instagram Link',
      platform: 'Instagram',
      isAd: isInstaAd,
      badgeText: isInstaAd ? 'Instagram Ad' : 'Instagram Link',
      color: isInstaAd ? '#86198f' : '#4338ca',
      bg: isInstaAd ? '#fdf4ff' : '#eef2ff',
      border: isInstaAd ? '#f0abfc' : '#c7d2fe',
      campaign,
      medium,
      clickId,
      raw: source
    };
  }

  if (sLower.includes('facebook') || sLower.includes('fb') || sLower.includes('meta')) {
    return {
      source: sLower.includes('ad') ? 'Facebook Ad' : 'Facebook',
      platform: 'Facebook',
      isAd: sLower.includes('ad'),
      badgeText: sLower.includes('ad') ? 'Facebook Ad' : 'Facebook',
      color: '#1e40af',
      bg: '#eff6ff',
      border: '#bfdbfe',
      campaign,
      medium,
      clickId,
      raw: source
    };
  }

  if (sLower.includes('google')) {
    const isAd = sLower.includes('ad') || (medium && /cpc|paid/i.test(medium));
    return {
      source: isAd ? 'Google Ad' : 'Google Search',
      platform: 'Google',
      isAd,
      badgeText: isAd ? 'Google Ad' : 'Google Search',
      color: '#c2410c',
      bg: '#fff7ed',
      border: '#fed7aa',
      campaign,
      medium,
      clickId,
      raw: source
    };
  }

  if (sLower.includes('tiktok')) {
    return {
      source: sLower.includes('ad') ? 'TikTok Ad' : 'TikTok',
      platform: 'TikTok',
      isAd: sLower.includes('ad'),
      badgeText: sLower.includes('ad') ? 'TikTok Ad' : 'TikTok',
      color: '#0f172a',
      bg: '#f8fafc',
      border: '#cbd5e1',
      campaign,
      medium,
      clickId,
      raw: source
    };
  }

  if (sLower.includes('whatsapp')) {
    return {
      source: 'WhatsApp Menu',
      platform: 'WhatsApp',
      isAd: false,
      badgeText: 'WhatsApp',
      color: '#15803d',
      bg: '#f0fdf4',
      border: '#bbf7d0',
      campaign,
      medium,
      clickId,
      raw: source
    };
  }

  return {
    source: source || 'Direct',
    platform: source || 'Direct',
    isAd: false,
    badgeText: source || 'Direct',
    color: '#475569',
    bg: '#f8fafc',
    border: '#e2e8f0',
    campaign,
    medium,
    clickId,
    raw: source
  };
}

/**
 * Parses attribution from a cart_session record.
 * Inspects session.metadata.attribution, session.metadata.referrer, and session.metadata.url.
 * Returns consistent styling tokens and metadata for dashboard display.
 */
export function parseCartSessionAttribution(session = {}) {
  const meta = session?.metadata || {};
  const attr = meta.attribution || {};
  const ref = meta.referrer || '';
  const url = meta.url || '';

  let trafficSource = attr.traffic_source || '';
  let channel = attr.channel || '';
  let isAd = attr.is_ad ?? false;
  let campaign = attr.utm_campaign || null;
  let medium = attr.utm_medium || null;
  let content = attr.utm_content || null;
  let term = attr.utm_term || null;
  let clickId = attr.ad_click_id || null;

  // Fallback: Infer from referrer if trafficSource is not set
  if (!trafficSource && ref) {
    const refLower = String(ref).toLowerCase();
    if (refLower.includes('snapchat')) {
      trafficSource = 'Snapchat Ad';
      channel = 'Snapchat';
      isAd = true;
    } else if (refLower.includes('instagram')) {
      trafficSource = 'Instagram';
      channel = 'Instagram';
    } else if (refLower.includes('facebook')) {
      trafficSource = 'Facebook';
      channel = 'Facebook';
    } else if (refLower.includes('google.')) {
      trafficSource = 'Google Search';
      channel = 'Google';
    } else if (refLower.includes('tiktok')) {
      trafficSource = 'TikTok';
      channel = 'TikTok';
    } else if (refLower.includes('t.co') || refLower.includes('twitter')) {
      trafficSource = 'Twitter / X';
      channel = 'Twitter / X';
    }
  }

  // Fallback 2: Check any raw string in metadata
  if (!trafficSource) {
    const metaStr = JSON.stringify(meta).toLowerCase();
    if (metaStr.includes('snapchat') || metaStr.includes('sccid')) {
      trafficSource = 'Snapchat Ad';
      channel = 'Snapchat';
      isAd = true;
    } else if (metaStr.includes('whatsapp') || metaStr.includes('l.wl.co') || metaStr.includes('wl.co') || metaStr.includes('wa.link')) {
      trafficSource = 'WhatsApp';
      channel = 'WhatsApp';
    } else if (metaStr.includes('instagram')) {
      trafficSource = 'Instagram';
      channel = 'Instagram';
    } else if (metaStr.includes('facebook') || metaStr.includes('fbclid')) {
      trafficSource = 'Facebook';
      channel = 'Facebook';
    }
  }

  if (!trafficSource) {
    trafficSource = 'Direct';
    channel = 'Direct';
  }

  const sLower = trafficSource.toLowerCase();

  // Snapchat
  if (sLower.includes('snap')) {
    return {
      source: 'Snapchat Ad',
      platform: 'Snapchat',
      isAd: true,
      badgeText: 'Snapchat Ad',
      color: '#854d0e',
      bg: '#fef9c3',
      border: '#fde047',
      campaign,
      medium: medium || 'paid',
      content,
      term,
      clickId,
      referrer: ref,
      url,
      raw: trafficSource,
    };
  }

  // WhatsApp (including l.wl.co referrer)
  if (
    sLower.includes('whatsapp') ||
    sLower === 'wa' ||
    (ref && (ref.includes('l.wl.co') || ref.includes('wl.co') || ref.includes('whatsapp') || ref.includes('wa.link') || ref.includes('wa.me')))
  ) {
    return {
      source: 'WhatsApp',
      platform: 'WhatsApp',
      isAd: false,
      badgeText: 'WhatsApp',
      color: '#15803d',
      bg: '#dcfce7',
      border: '#86efac',
      campaign,
      medium: medium || 'referral',
      content,
      term,
      clickId,
      referrer: ref,
      url,
      raw: trafficSource,
    };
  }

  // Instagram (Separating Instagram Ads vs Organic Instagram Links)
  if (sLower.includes('instagram') || sLower.includes('insta')) {
    const isInstaAd = Boolean(
      isAd ||
      sLower.includes('ad') ||
      medium === 'paid' ||
      medium === 'cpc' ||
      !!clickId
    );
    return {
      source: isInstaAd ? 'Instagram Ad' : 'Instagram Link',
      platform: 'Instagram',
      isAd: isInstaAd,
      badgeText: isInstaAd ? 'Instagram Ad' : 'Instagram Link',
      color: isInstaAd ? '#86198f' : '#4338ca',
      bg: isInstaAd ? '#fdf4ff' : '#eef2ff',
      border: isInstaAd ? '#f0abfc' : '#c7d2fe',
      campaign,
      medium: medium || (isInstaAd ? 'paid' : 'referral'),
      content,
      term,
      clickId,
      referrer: ref,
      url,
      raw: trafficSource,
    };
  }

  // Facebook
  if (sLower.includes('facebook') || sLower.includes('fb') || sLower.includes('meta')) {
    const isFbAd = isAd || sLower.includes('ad') || medium === 'paid' || medium === 'cpc' || !!clickId;
    return {
      source: isFbAd ? 'Facebook Ad' : 'Facebook',
      platform: 'Facebook',
      isAd: isFbAd,
      badgeText: isFbAd ? 'Facebook Ad' : 'Facebook',
      color: '#1e40af',
      bg: '#eff6ff',
      border: '#bfdbfe',
      campaign,
      medium: medium || (isFbAd ? 'paid' : 'referral'),
      content,
      term,
      clickId,
      referrer: ref,
      url,
      raw: trafficSource,
    };
  }

  // Google
  if (sLower.includes('google')) {
    const isGAd = isAd || sLower.includes('ad') || medium === 'cpc' || medium === 'paid' || !!clickId;
    return {
      source: isGAd ? 'Google Ad' : 'Google Search',
      platform: 'Google',
      isAd: isGAd,
      badgeText: isGAd ? 'Google Ad' : 'Google Search',
      color: '#c2410c',
      bg: '#fff7ed',
      border: '#fed7aa',
      campaign,
      medium: medium || (isGAd ? 'cpc' : 'organic'),
      content,
      term,
      clickId,
      referrer: ref,
      url,
      raw: trafficSource,
    };
  }

  // TikTok
  if (sLower.includes('tiktok')) {
    const isTtAd = isAd || sLower.includes('ad') || medium === 'paid' || !!clickId;
    return {
      source: isTtAd ? 'TikTok Ad' : 'TikTok',
      platform: 'TikTok',
      isAd: isTtAd,
      badgeText: isTtAd ? 'TikTok Ad' : 'TikTok',
      color: '#0f172a',
      bg: '#f8fafc',
      border: '#cbd5e1',
      campaign,
      medium,
      content,
      term,
      clickId,
      referrer: ref,
      url,
      raw: trafficSource,
    };
  }

  // Default / Direct
  return {
    source: trafficSource || 'Direct',
    platform: channel || 'Direct',
    isAd: false,
    badgeText: trafficSource || 'Direct',
    color: '#475569',
    bg: '#f8fafc',
    border: '#e2e8f0',
    campaign,
    medium,
    content,
    term,
    clickId,
    referrer: ref,
    url,
    raw: trafficSource,
  };
}

