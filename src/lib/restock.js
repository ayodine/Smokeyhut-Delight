// Pure helpers for the dashboard restock UI. No React, no Supabase — all the
// testable logic lives here; Products.jsx just wires these to the RPC.

export const LOW_STOCK_THRESHOLD = 5;

// A positive whole number, or null. Accepts numbers and numeric strings.
export function parseRestockAmount(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (s === '') return null;
  const n = Number(s);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

// Products at or below the low-stock threshold, ordered so the most urgent
// (out of stock) come first: stock ascending, then name A->Z.
export function selectLowOrOut(products) {
  return (products || [])
    .filter(p => Number(p.stock) <= LOW_STOCK_THRESHOLD)
    .sort((a, b) =>
      Number(a.stock) - Number(b.stock) ||
      String(a.name).localeCompare(String(b.name))
    );
}

// From [{id, value}] keep only valid positive-integer rows as [{id, add}].
export function buildBatchPayload(entries) {
  const out = [];
  for (const { id, value } of entries || []) {
    const add = parseRestockAmount(value);
    if (add !== null) out.push({ id, add });
  }
  return out;
}
