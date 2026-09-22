import { describe, it, expect } from 'vitest';
import {
  extractAttributionFromLocation,
  formatAttributionForNotes,
  parseOrderAttribution,
  parseCartSessionAttribution
} from './attribution';

describe('Attribution Extraction', () => {
  it('identifies Snapchat ad with ScCid parameter', () => {
    const attr = extractAttributionFromLocation('?ScCid=test_snap_click_123&utm_source=snapchat&utm_campaign=freefowl_sept');
    expect(attr).not.toBeNull();
    expect(attr.traffic_source).toBe('Snapchat Ad');
    expect(attr.channel).toBe('Snapchat');
    expect(attr.is_ad).toBe(true);
    expect(attr.ad_click_id).toBe('test_snap_click_123');
    expect(attr.utm_campaign).toBe('freefowl_sept');
  });

  it('identifies Snapchat ad without UTM but with ScCid', () => {
    const attr = extractAttributionFromLocation('?ScCid=abc987xyz');
    expect(attr).not.toBeNull();
    expect(attr.traffic_source).toBe('Snapchat Ad');
    expect(attr.ad_click_id).toBe('abc987xyz');
    expect(attr.is_ad).toBe(true);
  });

  it('identifies Facebook ad with fbclid', () => {
    const attr = extractAttributionFromLocation('?fbclid=fb_click_token_456&utm_campaign=guinea_fowl_offer');
    expect(attr).not.toBeNull();
    expect(attr.traffic_source).toBe('Facebook Ad');
    expect(attr.channel).toBe('Facebook');
    expect(attr.is_ad).toBe(true);
    expect(attr.ad_click_id).toBe('fb_click_token_456');
    expect(attr.utm_campaign).toBe('guinea_fowl_offer');
  });

  it('identifies Instagram ad with fbclid and utm_source=instagram', () => {
    const attr = extractAttributionFromLocation('?fbclid=fb_click_token_456&utm_source=instagram&utm_medium=stories');
    expect(attr).not.toBeNull();
    expect(attr.traffic_source).toBe('Instagram Ad');
    expect(attr.channel).toBe('Instagram');
    expect(attr.is_ad).toBe(true);
  });

  it('identifies Google ad with gclid', () => {
    const attr = extractAttributionFromLocation('?gclid=google_click_789');
    expect(attr).not.toBeNull();
    expect(attr.traffic_source).toBe('Google Ad');
    expect(attr.is_ad).toBe(true);
  });

  it('identifies TikTok ad with ttclid', () => {
    const attr = extractAttributionFromLocation('?ttclid=tiktok_click_555&utm_source=tiktok');
    expect(attr).not.toBeNull();
    expect(attr.traffic_source).toBe('TikTok Ad');
    expect(attr.is_ad).toBe(true);
  });

  it('identifies organic Google search referrer', () => {
    const attr = extractAttributionFromLocation('', 'https://www.google.com/');
    expect(attr).not.toBeNull();
    expect(attr.traffic_source).toBe('Google Search');
    expect(attr.is_ad).toBe(false);
  });

  it('ignores self-referrals and Paystack checkout return URLs', () => {
    const attr1 = extractAttributionFromLocation('', 'https://checkout.paystack.com/xyz');
    expect(attr1).toBeNull();

    const attr2 = extractAttributionFromLocation('', 'https://smokeyhutdelight.com/cart');
    expect(attr2).toBeNull();
  });
});

describe('formatAttributionForNotes', () => {
  it('formats note tag with source and campaign', () => {
    const noteTag = formatAttributionForNotes({
      traffic_source: 'Snapchat Ad',
      utm_campaign: 'FreeFowl08'
    });
    expect(noteTag).toBe('[Source: Snapchat Ad | Campaign: FreeFowl08]');
  });

  it('formats note tag with source only when no campaign', () => {
    const noteTag = formatAttributionForNotes({
      traffic_source: 'Facebook Ad'
    });
    expect(noteTag).toBe('[Source: Facebook Ad]');
  });
});

describe('parseOrderAttribution', () => {
  it('parses Snapchat Ad from order notes tag', () => {
    const parsed = parseOrderAttribution({
      notes: '[via Website]\n[Source: Snapchat Ad | Campaign: Promo_Fall]'
    });
    expect(parsed.badgeText).toBe('Snapchat Ad');
    expect(parsed.isAd).toBe(true);
    expect(parsed.campaign).toBe('Promo_Fall');
  });

  it('parses Facebook Ad from traffic_source column', () => {
    const parsed = parseOrderAttribution({
      traffic_source: 'Facebook Ad',
      utm_campaign: 'Spring_Drop'
    });
    expect(parsed.badgeText).toBe('Facebook Ad');
    expect(parsed.isAd).toBe(true);
    expect(parsed.campaign).toBe('Spring_Drop');
  });

  it('parses WhatsApp menu channel correctly', () => {
    const parsed = parseOrderAttribution({
      channel: 'whatsapp',
      notes: '[via WhatsApp Menu]'
    });
    expect(parsed.badgeText).toBe('WhatsApp');
    expect(parsed.isAd).toBe(false);
  });

  it('parses Instagram Ad from traffic_source with paid medium or ad click', () => {
    const parsed = parseOrderAttribution({
      traffic_source: 'Instagram Ad',
      utm_medium: 'paid',
      ad_click_id: 'fb_click_123'
    });
    expect(parsed.badgeText).toBe('Instagram Ad');
    expect(parsed.source).toBe('Instagram Ad');
    expect(parsed.isAd).toBe(true);
    expect(parsed.color).toBe('#86198f');
  });

  it('parses Instagram Link from organic Instagram traffic', () => {
    const parsed = parseOrderAttribution({
      traffic_source: 'Instagram Link',
      utm_medium: 'referral'
    });
    expect(parsed.badgeText).toBe('Instagram Link');
    expect(parsed.source).toBe('Instagram Link');
    expect(parsed.isAd).toBe(false);
    expect(parsed.color).toBe('#4338ca');
  });

  it('defaults to Direct for standard website orders without ads', () => {
    const parsed = parseOrderAttribution({
      channel: 'storefront',
      notes: '[via Website]'
    });
    expect(parsed.badgeText).toBe('Website Direct');
    expect(parsed.isAd).toBe(false);
  });
});

describe('parseCartSessionAttribution', () => {
  it('parses Snapchat Ad from cart session metadata.attribution', () => {
    const session = {
      session_id: 'test-session-123',
      metadata: {
        attribution: {
          traffic_source: 'Snapchat Ad',
          channel: 'Snapchat',
          is_ad: true,
          ad_click_id: 'sc_click_999',
          utm_campaign: 'sept_promo_camp',
          utm_medium: 'paid',
        },
        referrer: 'https://ads.snapchat.com/',
        url: '/shop'
      }
    };
    const parsed = parseCartSessionAttribution(session);
    expect(parsed.badgeText).toBe('Snapchat Ad');
    expect(parsed.platform).toBe('Snapchat');
    expect(parsed.isAd).toBe(true);
    expect(parsed.campaign).toBe('sept_promo_camp');
    expect(parsed.clickId).toBe('sc_click_999');
    expect(parsed.color).toBe('#854d0e');
  });

  it('infers Instagram Link from organic referrer when attribution is not set', () => {
    const session = {
      session_id: 'test-session-456',
      metadata: {
        referrer: 'https://l.instagram.com/',
        url: '/checkout'
      }
    };
    const parsed = parseCartSessionAttribution(session);
    expect(parsed.badgeText).toBe('Instagram Link');
    expect(parsed.platform).toBe('Instagram');
    expect(parsed.isAd).toBe(false);
    expect(parsed.color).toBe('#4338ca');
  });

  it('infers Instagram Ad when fbclid or paid medium is present with Instagram source', () => {
    const session = {
      session_id: 'test-session-insta-ad',
      metadata: {
        attribution: {
          traffic_source: 'Instagram Ad',
          channel: 'Instagram',
          is_ad: true,
          ad_click_id: 'fb_click_123',
          utm_source: 'instagram',
          utm_medium: 'paid'
        },
        referrer: 'https://l.instagram.com/',
        url: '/shop'
      }
    };
    const parsed = parseCartSessionAttribution(session);
    expect(parsed.badgeText).toBe('Instagram Ad');
    expect(parsed.platform).toBe('Instagram');
    expect(parsed.isAd).toBe(true);
    expect(parsed.color).toBe('#86198f');
  });

  it('infers Snapchat Ad from referrer when referrer is snapchat.com', () => {
    const session = {
      session_id: 'test-session-789',
      metadata: {
        referrer: 'https://www.snapchat.com/',
        url: '/shop'
      }
    };
    const parsed = parseCartSessionAttribution(session);
    expect(parsed.badgeText).toBe('Snapchat Ad');
    expect(parsed.platform).toBe('Snapchat');
    expect(parsed.isAd).toBe(true);
  });

  it('handles lowercase sccid and sc_cid in URL search', () => {
    const attr1 = extractAttributionFromLocation('?sccid=test_lowercase_id');
    expect(attr1.traffic_source).toBe('Snapchat Ad');
    expect(attr1.ad_click_id).toBe('test_lowercase_id');

    const attr2 = extractAttributionFromLocation('?sc_cid=test_underscore_id');
    expect(attr2.traffic_source).toBe('Snapchat Ad');
    expect(attr2.ad_click_id).toBe('test_underscore_id');
  });

  it('defaults to Direct for sessions without attribution or external referrer', () => {
    const session = {
      session_id: 'test-session-000',
      metadata: {
        url: '/menu'
      }
    };
    const parsed = parseCartSessionAttribution(session);
    expect(parsed.badgeText).toBe('Direct');
    expect(parsed.platform).toBe('Direct');
    expect(parsed.isAd).toBe(false);
  });

  it('infers WhatsApp from l.wl.co link shim referrer', () => {
    const session = {
      session_id: 'test-session-wa',
      metadata: {
        referrer: 'https://l.wl.co/',
        url: '/shop'
      }
    };
    const parsed = parseCartSessionAttribution(session);
    expect(parsed.badgeText).toBe('WhatsApp');
    expect(parsed.platform).toBe('WhatsApp');
    expect(parsed.isAd).toBe(false);
    expect(parsed.color).toBe('#15803d');
  });

  it('identifies WhatsApp from l.wl.co in extractAttributionFromLocation', () => {
    const attr = extractAttributionFromLocation('', 'https://l.wl.co/');
    expect(attr.traffic_source).toBe('WhatsApp');
    expect(attr.channel).toBe('WhatsApp');
  });
});

