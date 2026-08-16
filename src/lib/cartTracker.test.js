import { describe, it, expect } from 'vitest';

function normalizeNigerianPhone(phone) {
  if (!phone) return '';
  let cleaned = String(phone).replace(/\D/g, '');
  if (cleaned.startsWith('0') && cleaned.length === 11) {
    return '234' + cleaned.slice(1);
  }
  if (cleaned.startsWith('234') && cleaned.length === 13) {
    return cleaned;
  }
  if (cleaned.length === 10) {
    return '234' + cleaned;
  }
  return cleaned;
}

function calculateAbandonmentRate(total, converted) {
  if (!total || total <= 0) return 0;
  const abandoned = Math.max(0, total - (converted || 0));
  return Math.round(((abandoned / total) * 100) * 10) / 10;
}

describe('Cart Abandonment Tracking Utilities', () => {
  describe('normalizeNigerianPhone', () => {
    it('formats standard 11-digit local phone with country code', () => {
      expect(normalizeNigerianPhone('08012345678')).toBe('2348012345678');
      expect(normalizeNigerianPhone('09098765432')).toBe('2349098765432');
    });

    it('preserves existing 234 international format', () => {
      expect(normalizeNigerianPhone('2348012345678')).toBe('2348012345678');
      expect(normalizeNigerianPhone('+234 801 234 5678')).toBe('2348012345678');
    });

    it('handles empty or missing input gracefully', () => {
      expect(normalizeNigerianPhone('')).toBe('');
      expect(normalizeNigerianPhone(null)).toBe('');
      expect(normalizeNigerianPhone(undefined)).toBe('');
    });
  });

  describe('calculateAbandonmentRate', () => {
    it('correctly calculates abandonment percentage', () => {
      expect(calculateAbandonmentRate(100, 20)).toBe(80);
      expect(calculateAbandonmentRate(100, 25)).toBe(75);
      expect(calculateAbandonmentRate(10, 3)).toBe(70);
    });

    it('returns 0 when there are no cart sessions', () => {
      expect(calculateAbandonmentRate(0, 0)).toBe(0);
      expect(calculateAbandonmentRate(null, 0)).toBe(0);
    });
  });
});
