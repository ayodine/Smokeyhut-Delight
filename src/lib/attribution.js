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

  const utmSource = (params.get('utm_source') || '').trim();
  const utmMedium = (params.get('utm_medium') || '').trim();
  const utmCampaign = (params.get('utm_campaign') || '').trim();
  const utmContent = (params.get('utm_content') || '').trim();
  const utmTerm = (params.get('utm_term') || '').trim();

  // Click IDs
  const scCid = (params.get('ScCid') || params.get('sccid') || '').trim();
  const fbclid = (params.get('fbclid') || '').trim();
  const gclid = (params.get('gclid') || params.get('wbraid') || params.get('gbraid') || '').trim();
  const ttclid = (params.get('ttclid') || '').trim();

  const ref = (referrerStr || '').trim();
  const isInternal = isInternalOrPaymentReferrer(ref);
  const externalRef = isInternal ? '' : ref;

  let refHost = '';
  if (externalRef) {
    try {
      refHost = new URL(externalRef).hostname.toLowerCase();
    } catch {
      refHost = '';
    }
  }

  const sLower = utmSource.toLowerCase();
  const mLower = utmMedium.toLowerCase();

  // 1. SNAPCHAT ADS
  if (scCid || sLower === 'snapchat' || sLower === 'snap' || mLower === 'snapchat' || refHost.includes('snapchat.com')) {
    return {
      traffic_source: 'Snapchat Ad',
      channel: 'Snapchat',
      is_ad: true,
      ad_click_id: scCid || (refHost.includes('snapchat') ? 'snap_ref' : 'snap_utm'),
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
  if (fbclid || sLower === 'facebook' || sLower === 'fb' || sLower === 'instagram' || sLower === 'ig' || sLower === 'meta' || refHost.includes('facebook.com') || refHost.includes('instagram.com')) {
    const isInsta = sLower === 'instagram' || sLower === 'ig' || refHost.includes('instagram.com');
    const platform = isInsta ? 'Instagram' : 'Facebook';
    const isAd = Boolean(fbclid || /paid|cpc|ads|stories|feed/i.test(mLower));

    return {
      traffic_source: isAd ? `${platform} Ad` : platform,
      channel: platform,
      is_ad: isAd,
      ad_click_id: fbclid || (isAd ? 'fb_utm' : null),
      click_id_type: 'fbclid',
      utm_source: utmSource || (isInsta ? 'instagram' : 'facebook'),
      utm_medium: utmMedium || (fbclid ? 'paid' : 'referral'),
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
    return {
      source: sLower.includes('ad') ? 'Instagram Ad' : 'Instagram',
      platform: 'Instagram',
      isAd: sLower.includes('ad'),
      badgeText: sLower.includes('ad') ? 'Instagram Ad' : 'Instagram',
      color: '#86198f',
      bg: '#fdf4ff',
      border: '#f0abfc',
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
