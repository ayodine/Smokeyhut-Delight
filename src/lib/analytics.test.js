import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  trackPageView,
  trackViewContent,
  trackAddToCart,
  trackInitiateCheckout,
  trackAddPaymentInfo,
  trackPurchase,
  normalizeEmail,
  normalizePhone,
  normalizeName,
  splitFullName,
  normalizePostalCode,
  sha256,
  hasSnapPurchaseFired,
  markSnapPurchaseFired,
  SNAP_PIXEL_ID,
} from './analytics';

describe('analytics helper - normalization & hashing', () => {
  it('normalizes email properly', () => {
    expect(normalizeEmail('  Customer@Example.Com ')).toBe('customer@example.com');
    expect(normalizeEmail('')).toBe('');
    expect(normalizeEmail(null)).toBe('');
  });

  it('normalizes Nigerian phone numbers to E.164 without plus sign', () => {
    expect(normalizePhone('08141748281')).toBe('2348141748281');
    expect(normalizePhone('+234 814 174 8281')).toBe('2348141748281');
    expect(normalizePhone('2348141748281')).toBe('2348141748281');
    expect(normalizePhone('8141748281')).toBe('2348141748281');
    expect(normalizePhone('')).toBe('');
    expect(normalizePhone(null)).toBe('');
  });

  it('normalizes names and splits full names', () => {
    expect(normalizeName('  Ayobami, Olowookere! ')).toBe('ayobami olowookere');
    expect(splitFullName('Ayobami Olowookere')).toEqual({
      firstName: 'Ayobami',
      lastName: 'Olowookere',
    });
    expect(splitFullName('SingleName')).toEqual({
      firstName: 'SingleName',
      lastName: '',
    });
  });

  it('normalizes postal codes with Lagos fallback', () => {
    expect(normalizePostalCode(' 101233 ')).toBe('101233');
    expect(normalizePostalCode('')).toBe('100001');
    expect(normalizePostalCode(null)).toBe('100001');
  });

  it('computes sha256 hash matching known vectors', async () => {
    const hash = await sha256('test@example.com');
    expect(hash).toBe('973dfe463ec85785f5f95af5ba3906eedb2d931c24e69824a89ea65dba4e813b');
    const phoneHash = await sha256('2348141748281');
    expect(phoneHash).toBe('086fea32e9601f7f567c1a7a73ecd04acf8c4aeb013bd4fd1aab6ef6922fb2a9');
  });
});

describe('analytics helper - Snapchat Purchase & deduplication', () => {
  let localStorageMock;

  beforeEach(() => {
    let store = {};
    localStorageMock = {
      getItem: vi.fn((key) => store[key] || null),
      setItem: vi.fn((key, val) => { store[key] = String(val); }),
      removeItem: vi.fn((key) => { delete store[key]; }),
      clear: vi.fn(() => { store = {}; }),
    };

    globalThis.window = {
      fbq: vi.fn(),
      snaptr: vi.fn(),
      localStorage: localStorageMock,
      sessionStorage: {
        getItem: vi.fn(),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
    };
  });

  afterEach(() => {
    delete globalThis.window;
  });

  it('trackPurchase passes hashed customer identifiers, deduplication ID and order parameters', async () => {
    const customer = {
      email: 'Daniel@Gmail.com',
      phone: '09168652077',
      firstName: 'Daniel',
      lastName: 'Alimi',
      postalCode: '100001',
    };

    await trackPurchase({
      orderId: 'SHD-06595',
      total: 18500,
      itemsCount: 2,
      currency: 'NGN',
      customer,
    });

    // Check Meta Pixel
    expect(globalThis.window.fbq).toHaveBeenCalledWith('track', 'Purchase', {
      content_type: 'product',
      currency: 'NGN',
      value: 18500,
      num_items: 2,
      order_id: 'SHD-06595',
    });

    // Check Snap Pixel init called with user parameters
    expect(globalThis.window.snaptr).toHaveBeenCalledWith(
      'init',
      SNAP_PIXEL_ID,
      expect.objectContaining({
        user_email: 'daniel@gmail.com',
        user_hashed_email: expect.stringMatching(/^[a-f0-9]{64}$/),
        user_phone_number: '2349168652077',
        user_hashed_phone_number: expect.stringMatching(/^[a-f0-9]{64}$/),
        firstname: 'daniel',
        user_hashed_first_name: expect.stringMatching(/^[a-f0-9]{64}$/),
        lastname: 'alimi',
        user_hashed_last_name: expect.stringMatching(/^[a-f0-9]{64}$/),
        geo_postal_code: '100001',
        user_hashed_postal_code: expect.stringMatching(/^[a-f0-9]{64}$/),
      })
    );

    // Check Snap Pixel track PURCHASE called with deduplication ID and transaction ID
    expect(globalThis.window.snaptr).toHaveBeenCalledWith(
      'track',
      'PURCHASE',
      expect.objectContaining({
        currency: 'NGN',
        price: 18500,
        transaction_id: 'SHD-06595',
        client_dedup_id: 'SHD-06595',
        client_deduplication_id: 'SHD-06595',
        number_items: 2,
        user_hashed_email: expect.stringMatching(/^[a-f0-9]{64}$/),
        user_hashed_phone_number: expect.stringMatching(/^[a-f0-9]{64}$/),
      })
    );
  });

  it('ensures Snapchat Purchase event fires ONLY ONCE per completed order', async () => {
    const customer = {
      email: 'test@example.com',
      phone: '08012345678',
    };

    // First call
    await trackPurchase({
      orderId: 'SHD-UNIQUE-1',
      total: 10000,
      customer,
    });

    expect(globalThis.window.snaptr).toHaveBeenCalledWith('track', 'PURCHASE', expect.anything());
    const snapCallsCountFirst = globalThis.window.snaptr.mock.calls.filter(c => c[1] === 'PURCHASE').length;
    expect(snapCallsCountFirst).toBe(1);

    // Second call with same orderId (e.g. user refreshed /payment/success or polling re-triggered)
    await trackPurchase({
      orderId: 'SHD-UNIQUE-1',
      total: 10000,
      customer,
    });

    const snapCallsCountSecond = globalThis.window.snaptr.mock.calls.filter(c => c[1] === 'PURCHASE').length;
    // Must NOT have fired again!
    expect(snapCallsCountSecond).toBe(1);

    // Different orderId DOES fire
    await trackPurchase({
      orderId: 'SHD-UNIQUE-2',
      total: 12000,
      customer,
    });
    const snapCallsCountThird = globalThis.window.snaptr.mock.calls.filter(c => c[1] === 'PURCHASE').length;
    expect(snapCallsCountThird).toBe(2);
  });
});
