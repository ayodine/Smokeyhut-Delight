import { describe, it, expect } from 'vitest';
import { parseRestockAmount, selectLowOrOut, buildBatchPayload, LOW_STOCK_THRESHOLD } from './restock';

describe('parseRestockAmount', () => {
  it('accepts positive integers (number or string)', () => {
    expect(parseRestockAmount(3)).toBe(3);
    expect(parseRestockAmount('12')).toBe(12);
    expect(parseRestockAmount(' 7 ')).toBe(7);
  });
  it('rejects zero, negatives, blanks, and non-integers', () => {
    expect(parseRestockAmount(0)).toBeNull();
    expect(parseRestockAmount(-4)).toBeNull();
    expect(parseRestockAmount('')).toBeNull();
    expect(parseRestockAmount(null)).toBeNull();
    expect(parseRestockAmount(undefined)).toBeNull();
    expect(parseRestockAmount('abc')).toBeNull();
    expect(parseRestockAmount('2.5')).toBeNull();
    expect(parseRestockAmount(2.5)).toBeNull();
  });
});

describe('selectLowOrOut', () => {
  const P = [
    { id: 1, name: 'Beta',  stock: 0 },
    { id: 2, name: 'Alpha', stock: 0 },
    { id: 3, name: 'Gamma', stock: 3 },
    { id: 4, name: 'Delta', stock: 5 },
    { id: 5, name: 'Epsilon', stock: 6 },   // excluded (> threshold)
    { id: 6, name: 'Zeta', stock: 20 },      // excluded
  ];
  it('keeps only stock <= threshold', () => {
    expect(selectLowOrOut(P).map(p => p.id)).not.toContain(5);
    expect(selectLowOrOut(P).map(p => p.id)).not.toContain(6);
  });
  it('sorts out-of-stock first, then ascending stock, then name', () => {
    expect(selectLowOrOut(P).map(p => p.name)).toEqual(['Alpha', 'Beta', 'Gamma', 'Delta']);
  });
  it('exposes the threshold as 5', () => {
    expect(LOW_STOCK_THRESHOLD).toBe(5);
  });
});

describe('buildBatchPayload', () => {
  it('keeps only valid positive-integer rows as {id, add}', () => {
    const entries = [
      { id: 1, value: '10' },
      { id: 2, value: '' },      // skip
      { id: 3, value: '0' },     // skip
      { id: 4, value: '2.5' },   // skip
      { id: 5, value: 4 },
    ];
    expect(buildBatchPayload(entries)).toEqual([{ id: 1, add: 10 }, { id: 5, add: 4 }]);
  });
  it('returns [] when nothing is valid', () => {
    expect(buildBatchPayload([{ id: 1, value: '' }, { id: 2, value: 'x' }])).toEqual([]);
  });
});
