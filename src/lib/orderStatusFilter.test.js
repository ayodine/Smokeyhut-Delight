import { describe, it, expect } from 'vitest';
import { STATUS_FILTERS, DEFAULT_STATUS, toStatusParam, statusLabelFor } from './orderStatusFilter';

describe('orderStatusFilter', () => {
  it('defines exactly All, Delivered, Shipped, Pending in that order', () => {
    expect(STATUS_FILTERS.map(s => s.key)).toEqual(['all', 'delivered', 'shipped', 'pending']);
    expect(STATUS_FILTERS.map(s => s.label)).toEqual(['All', 'Delivered', 'Shipped', 'Pending']);
  });

  it('defaults to delivered', () => {
    expect(DEFAULT_STATUS).toBe('delivered');
  });

  it('maps "all" to null for the RPC param, passes real statuses through', () => {
    expect(toStatusParam('all')).toBeNull();
    expect(toStatusParam('delivered')).toBe('delivered');
    expect(toStatusParam('shipped')).toBe('shipped');
    expect(toStatusParam('pending')).toBe('pending');
  });

  it('produces human labels for the breakdown modal', () => {
    expect(statusLabelFor('all')).toBe('all statuses');
    expect(statusLabelFor('delivered')).toBe('delivered');
    expect(statusLabelFor('shipped')).toBe('shipped');
  });
});
