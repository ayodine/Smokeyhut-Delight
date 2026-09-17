import { describe, it, expect } from 'vitest';
import {
  extractAttributionFromLocation,
  formatAttributionForNotes,
  parseOrderAttribution
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

  it('defaults to Direct for standard website orders without ads', () => {
    const parsed = parseOrderAttribution({
      channel: 'storefront',
      notes: '[via Website]'
    });
    expect(parsed.badgeText).toBe('Website Direct');
    expect(parsed.isAd).toBe(false);
  });
});
