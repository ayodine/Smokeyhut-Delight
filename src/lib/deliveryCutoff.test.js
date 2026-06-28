import { describe, it, expect } from 'vitest';
import { getCutoffState, anyItemPastCutoff } from './deliveryCutoff';

// Lagos is UTC+1, no DST. 2026-06-28T09:00:00Z === 10:00 Lagos (before noon),
// 2026-06-28T11:00:00Z === 12:00 Lagos (exactly noon),
// 2026-06-28T12:00:00Z === 13:00 Lagos (after noon).
const beforeNoon = new Date('2026-06-28T09:00:00Z');
const atNoon     = new Date('2026-06-28T11:00:00Z');
const afterNoon  = new Date('2026-06-28T12:00:00Z');

describe('getCutoffState', () => {
  it('no cutoff set → inactive', () => {
    expect(getCutoffState({ same_day_cutoff: null }, beforeNoon))
      .toEqual({ hasCutoff: false, cutoffLabel: '', isPastCutoff: false });
    expect(getCutoffState({}, beforeNoon).hasCutoff).toBe(false);
  });

  it('before cutoff → not past, with label', () => {
    const s = getCutoffState({ same_day_cutoff: '12:00:00' }, beforeNoon);
    expect(s.hasCutoff).toBe(true);
    expect(s.cutoffLabel).toBe('12:00 PM');
    expect(s.isPastCutoff).toBe(false);
  });

  it('exactly at cutoff → past (>=)', () => {
    expect(getCutoffState({ same_day_cutoff: '12:00:00' }, atNoon).isPastCutoff).toBe(true);
  });

  it('after cutoff → past', () => {
    expect(getCutoffState({ same_day_cutoff: '12:00:00' }, afterNoon).isPastCutoff).toBe(true);
  });

  it('formats labels for AM, half-hours, and midnight', () => {
    expect(getCutoffState({ same_day_cutoff: '09:30:00' }, beforeNoon).cutoffLabel).toBe('9:30 AM');
    expect(getCutoffState({ same_day_cutoff: '00:00' }, beforeNoon).cutoffLabel).toBe('12:00 AM');
    expect(getCutoffState({ same_day_cutoff: '13:05:00' }, beforeNoon).cutoffLabel).toBe('1:05 PM');
  });

  it('ignores malformed cutoff values', () => {
    expect(getCutoffState({ same_day_cutoff: 'nonsense' }, afterNoon).hasCutoff).toBe(false);
  });
});

describe('anyItemPastCutoff', () => {
  it('true if any item is past its cutoff', () => {
    const items = [{ same_day_cutoff: null }, { same_day_cutoff: '12:00:00' }];
    expect(anyItemPastCutoff(items, afterNoon)).toBe(true);
    expect(anyItemPastCutoff(items, beforeNoon)).toBe(false);
  });

  it('false for empty/undefined', () => {
    expect(anyItemPastCutoff([], afterNoon)).toBe(false);
    expect(anyItemPastCutoff(undefined, afterNoon)).toBe(false);
  });
});
