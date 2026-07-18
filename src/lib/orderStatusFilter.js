// Shared status-filter definitions for the Stats and Units Sold pages.
// Single source of truth so the two pages' pill rows cannot drift.
// 'processing' is intentionally absent: 0 orders all-time use it.

export const STATUS_FILTERS = [
  { key: 'all',       label: 'All' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'shipped',   label: 'Shipped' },
  { key: 'pending',   label: 'Pending' },
];

export const DEFAULT_STATUS = 'delivered';

// RPC param: NULL means "all non-cancelled" on the SQL side.
export const toStatusParam = (key) => (key === 'all' ? null : key);

// Human label for copy like "90 units — delivered".
export const statusLabelFor = (key) => (key === 'all' ? 'all statuses' : key);
