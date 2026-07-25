# Frictionless Product Restocking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let dashboard staff top up `products.stock` in one click (inline + batch) so the number stops drifting to 0 while stock is physically available.

**Architecture:** One atomic `restock_product(id, add)` Postgres RPC is the single race-safe write path. Pure UI logic (amount parsing, low/out selection, batch payload) lives in a tested `src/lib/restock.js`. `src/pages/dashboard/Products.jsx` gets thin wiring: an inline `+qty Add` control on each row and on the (now actionable) stock-alert strip, plus a batch "Restock session" modal. No storefront changes; no schema changes.

**Tech Stack:** React 19 + Vite, Supabase (Postgres RPC + JS client), Vitest.

## Global Constraints

- Test runner: `npm test` (runs `vitest run`). Pure logic goes in `src/lib/*.js` with a co-located `*.test.js`. **There are no React component tests in this project** — `.jsx` wiring is verified by the documented manual smoke, not automated tests.
- Apply DB migrations with `supabase db query --linked -f <file>`. **NEVER** run `supabase db push` (remote migration history is out of sync).
- The dev server and all scripts talk to the **production** database. There is no staging. Do not place real orders during testing.
- **No schema changes** — this feature only adds the `restock_product` function and reads/writes the existing `products.stock`.
- **No storefront changes** — `stock === 0` still means out of stock and still blocks. A restocked product becomes buyable again through existing storefront logic.
- **All restock writes go through the `restock_product` RPC.** Never do a client-side read-then-write of `products.stock` (it would race the order auto-deduct trigger).
- UI restock controls are gated on the existing `canManage` permission.
- Restock amount is a **positive integer** (whole units).

---

### Task 1: `restock_product` RPC + verifier

**Files:**
- Create: `supabase/migrations/20260725_restock_product_rpc.sql`
- Create: `scripts/verify_restock_rpc.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: SQL function `restock_product(p_id int, p_add int) returns int`. Callable from the browser as `supabase.rpc('restock_product', { p_id, p_add })`. Returns the new stock level (int). Throws (PostgREST `error` set) when: `p_add` is null/≤0, caller role is not `authenticated`/`service_role`, or the product id does not exist / is soft-deleted.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260725_restock_product_rpc.sql`:

```sql
-- Atomic restock of products.stock — the single race-safe write path for the
-- dashboard restock UI (inline + batch). No schema change; only this function.
-- The order auto-deduct trigger (20260504) decrements stock concurrently, so a
-- restock must be an in-DB increment (stock = stock + N), never a client-side
-- read-modify-write.
create or replace function restock_product(p_id int, p_add int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new int;
begin
  if p_add is null or p_add <= 0 then
    raise exception 'restock amount must be positive';
  end if;
  if auth.role() not in ('authenticated', 'service_role') then
    raise exception 'not authorized';   -- blocks the public anon key
  end if;
  update products
     set stock = stock + p_add
   where id = p_id and deleted_at is null
   returning stock into v_new;
  if v_new is null then
    raise exception 'product not found';
  end if;
  return v_new;
end;
$$;

revoke all on function restock_product(int, int) from anon, public;
grant execute on function restock_product(int, int) to authenticated, service_role;
```

- [ ] **Step 2: Write the verifier script**

Create `scripts/verify_restock_rpc.mjs`. It creates a HIDDEN throwaway product (`is_active=false`, never on the storefront), exercises the atomic increment + guards, then HARD-DELETES it — touching no real inventory. It copies a valid `category_id` from an existing row so the insert satisfies constraints.

```js
// Verifies the restock_product RPC end-to-end against the linked (prod) DB.
// Creates a HIDDEN throwaway product, exercises the atomic increment + guards,
// then hard-deletes it. Touches no real inventory. Needs SUPABASE_SERVICE_ROLE_KEY.
//   node scripts/verify_restock_rpc.mjs
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const db = createClient(env.SUPABASE_URL || env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

let failures = 0;
const ok  = (m) => console.log(`  ok   ${m}`);
const bad = (m) => { console.error(`  FAIL ${m}`); failures++; };

// Copy a valid category_id so the throwaway insert passes constraints.
const { data: sample, error: sErr } = await db.from('products').select('category_id').limit(1).single();
if (sErr) { console.error('setup (sample) failed:', sErr.message); process.exit(1); }

const { data: created, error: cErr } = await db.from('products').insert({
  name: `__restock_rpc_test__ ${Date.now()}`,
  description: 'temp', short_desc: 'temp',
  price: 1, stock: 0, is_active: false,
  category_id: sample?.category_id ?? null,
}).select('id').single();
if (cErr) { console.error('setup (insert) failed:', cErr.message); process.exit(1); }
const id = created.id;

try {
  let r = await db.rpc('restock_product', { p_id: id, p_add: 3 });
  if (r.error) bad(`+3 errored: ${r.error.message}`); else if (r.data === 3) ok('+3 -> 3'); else bad(`+3 -> ${r.data} (expected 3)`);

  r = await db.rpc('restock_product', { p_id: id, p_add: 2 });
  if (r.error) bad(`+2 errored: ${r.error.message}`); else if (r.data === 5) ok('+2 -> 5 (atomic sum)'); else bad(`+2 -> ${r.data} (expected 5)`);

  r = await db.rpc('restock_product', { p_id: id, p_add: 0 });
  if (r.error) ok('p_add=0 rejected'); else bad('p_add=0 was NOT rejected');

  r = await db.rpc('restock_product', { p_id: 999999999, p_add: 1 });
  if (r.error) ok('unknown id rejected'); else bad('unknown id was NOT rejected');
} finally {
  await db.from('products').delete().eq('id', id);  // throwaway has no orders
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 3: Run the verifier to confirm it FAILS (function not yet applied)**

Run: `node scripts/verify_restock_rpc.mjs`
Expected: FAIL — the `+3`/`+2` calls error with a message like `Could not find the function public.restock_product`, so the script prints `2 FAILED` and exits non-zero. (The guard cases pass vacuously because a missing function also errors.)

- [ ] **Step 4: Apply the migration to prod**

Run: `supabase db query --linked -f supabase/migrations/20260725_restock_product_rpc.sql`
Expected: no error (function created).

- [ ] **Step 5: Run the verifier to confirm it PASSES**

Run: `node scripts/verify_restock_rpc.mjs`
Expected:
```
  ok   +3 -> 3
  ok   +2 -> 5 (atomic sum)
  ok   p_add=0 rejected
  ok   unknown id rejected

ALL PASS
```
Exit code 0.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260725_restock_product_rpc.sql scripts/verify_restock_rpc.mjs
git commit -m "feat: restock_product RPC — atomic products.stock increment"
```

---

### Task 2: Restock helpers + unit tests

**Files:**
- Create: `src/lib/restock.js`
- Create: `src/lib/restock.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `parseRestockAmount(value) -> number | null` — returns a positive integer, or `null` for anything else (empty, 0, negative, non-numeric, non-integer).
  - `LOW_STOCK_THRESHOLD` — the constant `5`.
  - `selectLowOrOut(products) -> product[]` — the subset with `stock <= 5`, sorted out-of-stock (0) first, then ascending stock, then name A→Z.
  - `buildBatchPayload(entries) -> {id, add}[]` — from `[{id, value}]`, keeps only rows whose `value` is a valid positive integer, as `{id, add}`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/restock.test.js`:

```js
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
```

- [ ] **Step 2: Run the tests to verify they FAIL**

Run: `npm test -- src/lib/restock.test.js`
Expected: FAIL — `Failed to resolve import "./restock"` / functions not defined.

- [ ] **Step 3: Write the implementation**

Create `src/lib/restock.js`:

```js
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
```

- [ ] **Step 4: Run the tests to verify they PASS**

Run: `npm test -- src/lib/restock.test.js`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/restock.js src/lib/restock.test.js
git commit -m "feat: restock pure helpers (parse, select low/out, batch payload)"
```

---

### Task 3: Inline quick-restock (rows + stock-alert strip)

**Files:**
- Modify: `src/pages/dashboard/Products.jsx` (imports; add `RestockInline` component + `handleRestock`; stock cell ~line 436; alert strip ~lines 349-357)

**Interfaces:**
- Consumes: `restock_product` RPC (Task 1) via `supabase.rpc`; `parseRestockAmount`, `selectLowOrOut` (Task 2).
- Produces: `handleRestock(product, rawValue) -> Promise<boolean>` (true on success) and a module-scope `RestockInline` component, both used again in Task 4's file.

- [ ] **Step 1: Import the helpers**

In `src/pages/dashboard/Products.jsx`, add after the `productsCache` import (line 5):

```js
import { parseRestockAmount, selectLowOrOut } from '../../lib/restock';
```

- [ ] **Step 2: Add the `RestockInline` component at module scope**

Immediately below the `const fmt = ...` line (line 13, before `export default function Products()`), add:

```jsx
// Compact "+qty [Add]" control. onAdd(rawValue) resolves true on success,
// which clears the input.
function RestockInline({ onAdd }) {
  const [val, setVal] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!val || busy) return;
    setBusy(true);
    const ok = await onAdd(val);
    setBusy(false);
    if (ok) setVal('');
  };
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      <input
        type="number" min="1" value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit(); }}
        placeholder="+ qty"
        style={{ width: 62, padding: '4px 6px', fontSize: '0.75rem', border: '1px solid var(--border-subtle)', borderRadius: 6, background: 'var(--white)', color: 'var(--text)', fontFamily: 'inherit' }}
      />
      <button type="button" onClick={submit} disabled={busy || !val}
        style={{ padding: '4px 10px', fontSize: '0.72rem', fontWeight: 700, borderRadius: 6, border: 'none', cursor: busy || !val ? 'default' : 'pointer', background: '#16a34a', color: '#fff', opacity: busy || !val ? 0.5 : 1 }}>
        {busy ? '…' : 'Add'}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Add the `handleRestock` handler**

Inside the `Products` component, next to the other handlers (e.g. just before `toggleActive`), add:

```jsx
const handleRestock = async (product, rawValue) => {
  const amount = parseRestockAmount(rawValue);
  if (amount === null) {
    showToast('Invalid amount', 'Enter a positive whole number.', 'error');
    return false;
  }
  const { data, error } = await supabase.rpc('restock_product', { p_id: product.id, p_add: amount });
  if (error) {
    showToast('Restock failed', error.message, 'error');
    return false;
  }
  setProductList(prev => prev.map(x => x.id === product.id ? { ...x, stock: data } : x));
  showToast('Restocked', `${product.name}: +${amount} → ${data} units`, 'success');
  return true;
};
```

- [ ] **Step 4: Add the inline control to the stock table cell**

Replace the stock cell (line 436):

```jsx
<td><div className={`stock-indicator ${stockLevel(p.stock)}`}><span className="stock-dot" />{p.stock} units</div></td>
```

with:

```jsx
<td>
  <div className={`stock-indicator ${stockLevel(p.stock)}`}><span className="stock-dot" />{p.stock} units</div>
  {canManage && <div style={{ marginTop: 6 }}><RestockInline onAdd={(raw) => handleRestock(p, raw)} /></div>}
</td>
```

- [ ] **Step 5: Make the stock-alert strip actionable**

Replace the alert strip block (lines 349-357):

```jsx
{(outOfStock.length > 0 || lowStock.length > 0) && (
  <div style={{ background: '#fef9c3', border: '1px solid #fcd34d', borderRadius: 10, padding: '12px 18px', marginBottom: 20, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
    <AlertTriangle size={18} color="#92400e" style={{ marginTop: 1, flexShrink: 0 }} />
    <div style={{ fontSize: '0.84rem', color: '#78350f', lineHeight: 1.6 }}>
      <strong>Stock alert:</strong>{' '}
      {outOfStock.length > 0 && <span><strong>{outOfStock.map(p => p.name).join(', ')}</strong> {outOfStock.length === 1 ? 'is' : 'are'} out of stock. </span>}
      {lowStock.length > 0 && <span><strong>{lowStock.map(p => p.name).join(', ')}</strong> {lowStock.length === 1 ? 'is' : 'are'} running low (≤ 5 units).</span>}
    </div>
  </div>
)}
```

with:

```jsx
{(outOfStock.length > 0 || lowStock.length > 0) && (
  <div style={{ background: '#fef9c3', border: '1px solid #fcd34d', borderRadius: 10, padding: '12px 18px', marginBottom: 20 }}>
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <AlertTriangle size={18} color="#92400e" style={{ marginTop: 1, flexShrink: 0 }} />
      <div style={{ fontSize: '0.84rem', color: '#78350f', lineHeight: 1.6 }}>
        <strong>Stock alert:</strong>{' '}
        {outOfStock.length > 0 && <span><strong>{outOfStock.map(p => p.name).join(', ')}</strong> {outOfStock.length === 1 ? 'is' : 'are'} out of stock. </span>}
        {lowStock.length > 0 && <span><strong>{lowStock.map(p => p.name).join(', ')}</strong> {lowStock.length === 1 ? 'is' : 'are'} running low (≤ 5 units).</span>}
      </div>
    </div>
    {canManage && (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
        {selectLowOrOut(productList).map(p => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.65)', borderRadius: 8, padding: '5px 8px' }}>
            <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#78350f' }}>{p.name} ({p.stock})</span>
            <RestockInline onAdd={(raw) => handleRestock(p, raw)} />
          </div>
        ))}
      </div>
    )}
  </div>
)}
```

- [ ] **Step 6: Lint + build**

Run: `npm run lint && npm run build`
Expected: no NEW errors attributable to Products.jsx (pre-existing warnings elsewhere are unchanged). Build succeeds.

- [ ] **Step 7: Manual smoke**

Run `npm run dev`, open the dashboard Products page as an admin:
1. A product's stock cell shows the `+ qty [Add]` control. Enter `3`, click Add → the "{n} units" number jumps by 3 and a "Restocked …" toast fires; the input clears.
2. Take a product to 0 first (via the batch or edit) — it appears in the yellow "Stock alert" strip with its own `+ qty [Add]`; restocking there updates its count and (if now > 5) drops it out of the strip on next render.
3. Enter a bad value (e.g. `0` or `abc`) → "Invalid amount" toast, no change.

- [ ] **Step 8: Commit**

```bash
git add src/pages/dashboard/Products.jsx
git commit -m "feat: inline quick-restock on product rows and stock-alert strip"
```

---

### Task 4: Batch "Restock session" modal

**Files:**
- Modify: `src/pages/dashboard/Products.jsx` (import `buildBatchPayload`; add state + toolbar button ~line 295; add `applyBatchRestock`; add modal near the existing `showForm` modal ~line 481)

**Interfaces:**
- Consumes: `restock_product` RPC (Task 1); `selectLowOrOut`, `buildBatchPayload` (Task 2); `setProductList`, `showToast` (existing).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Extend the restock import**

Change the Task 3 import line to add `buildBatchPayload`:

```js
import { parseRestockAmount, selectLowOrOut, buildBatchPayload } from '../../lib/restock';
```

- [ ] **Step 2: Add modal state**

Next to the other `useState` hooks (near line 30), add:

```jsx
const [showRestock, setShowRestock] = useState(false);
const [restockDrafts, setRestockDrafts] = useState({});
```

- [ ] **Step 3: Add the `applyBatchRestock` handler**

Next to `handleRestock`, add:

```jsx
const applyBatchRestock = async () => {
  const payload = buildBatchPayload(
    selectLowOrOut(productList).map(p => ({ id: p.id, value: restockDrafts[p.id] }))
  );
  if (payload.length === 0) {
    showToast('Nothing to restock', 'Enter a quantity for at least one item.', 'error');
    return;
  }
  const results = await Promise.all(payload.map(async ({ id, add }) => {
    const { data, error } = await supabase.rpc('restock_product', { p_id: id, p_add: add });
    return { id, data, error };
  }));
  const okResults = results.filter(r => !r.error);
  const failResults = results.filter(r => r.error);
  if (okResults.length) {
    setProductList(prev => prev.map(x => {
      const hit = okResults.find(r => r.id === x.id);
      return hit ? { ...x, stock: hit.data } : x;
    }));
  }
  if (failResults.length === 0) {
    showToast('Restocked', `Updated ${okResults.length} product${okResults.length === 1 ? '' : 's'}.`, 'success');
    setShowRestock(false);
    setRestockDrafts({});
  } else {
    showToast('Partial restock', `${okResults.length} updated, ${failResults.length} failed.`, 'error');
    setRestockDrafts(prev => {
      const next = { ...prev };
      okResults.forEach(r => { delete next[r.id]; });
      return next;
    });
  }
};
```

- [ ] **Step 4: Add the toolbar "Restock" button**

In the toolbar `<div style={{ display: 'flex', gap: 12 }}>` (line 291), add before the "+ Add Product" button:

```jsx
{canManage && <button className="btn-secondary" onClick={() => { setRestockDrafts({}); setShowRestock(true); }} style={{ padding: '10px 16px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6 }}>
  <Package size={16} /> Restock
</button>}
```

- [ ] **Step 5: Add the modal**

Immediately before the `{showForm && (` block (line 481), add:

```jsx
{showRestock && (
  <div className="product-form-modal" onClick={() => setShowRestock(false)}>
    <div className="product-form-card" onClick={e => e.stopPropagation()} style={{ position: 'relative' }}>
      <h3 style={{ marginTop: 0, marginBottom: 20 }}>
        Restock session
        <button onClick={() => setShowRestock(false)} className="dash-drawer-close"><X size={16} /></button>
      </h3>
      {selectLowOrOut(productList).length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Nothing is low or out of stock. 🎉</p>
      ) : (
        <>
          {selectLowOrOut(productList).map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{p.name}</div>
                <div style={{ fontSize: '0.74rem', color: Number(p.stock) === 0 ? '#ef4444' : '#f59e0b' }}>
                  {Number(p.stock) === 0 ? 'Out of stock' : `Low — ${p.stock} left`}
                </div>
              </div>
              <input
                type="number" min="1" placeholder="+ qty"
                value={restockDrafts[p.id] ?? ''}
                onChange={e => setRestockDrafts(prev => ({ ...prev, [p.id]: e.target.value }))}
                style={{ width: 80, padding: '6px 8px', fontSize: '0.82rem', border: '1px solid var(--border-subtle)', borderRadius: 8, background: 'var(--white)', color: 'var(--text)', fontFamily: 'inherit' }}
              />
            </div>
          ))}
          <button className="btn-primary" onClick={applyBatchRestock} style={{ width: '100%', justifyContent: 'center', padding: '14px', marginTop: 16 }}>
            Apply all
          </button>
        </>
      )}
    </div>
  </div>
)}
```

- [ ] **Step 6: Lint + build**

Run: `npm run lint && npm run build`
Expected: no NEW errors from Products.jsx; build succeeds.

- [ ] **Step 7: Manual smoke**

On the Products page as an admin:
1. Click **Restock** in the toolbar → modal lists every out/low item, out-of-stock first, each with a `+ qty` input.
2. Fill in two items, leave others blank, click **Apply all** → only the filled items increase, a "Restocked — Updated 2 products" toast fires, the modal closes, and the table + alert strip reflect the new counts.
3. Open Restock again with nothing low/out → "Nothing is low or out of stock 🎉".
4. As a staff account **without** `canManage`, the Restock button and inline controls are absent.

- [ ] **Step 8: Commit**

```bash
git add src/pages/dashboard/Products.jsx
git commit -m "feat: batch Restock session modal for low/out products"
```

---

## Self-Review

**Spec coverage:**
- Atomic `restock_product` RPC, no client read-modify-write → Task 1. ✓
- No schema change (function only) → Task 1 (no DDL on tables). ✓
- Inline quick-restock per row → Task 3 Step 4. ✓
- Actionable stock-alert strip → Task 3 Step 5. ✓
- Batch Restock modal listing out/low → Task 4. ✓
- `canManage` gate → Tasks 3 & 4 (`{canManage && …}` on every control). ✓
- No storefront change → no storefront file touched; 0 still blocks via existing `ProductCard`. ✓
- No audit ledger (YAGNI) → nothing added. ✓
- Low threshold stays ≤5 → `LOW_STOCK_THRESHOLD = 5` (Task 2), matches existing `lowStock` memo. ✓
- RPC allows `authenticated` + `service_role`, blocks anon → Task 1 guard + grants. ✓
- Testing: RPC verifier (Task 1), pure-logic unit tests (Task 2), manual smokes for wiring (Tasks 3-4). ✓

**Placeholder scan:** none — every code step contains complete code; every run step has an exact command and expected output.

**Type consistency:** `restock_product(p_id, p_add)` returns int and is called with `{ p_id, p_add }` everywhere (Tasks 1, 3, 4). `parseRestockAmount` → number|null, `selectLowOrOut` → product[], `buildBatchPayload` → {id, add}[] used consistently. `handleRestock` and `RestockInline` defined in Task 3 and reused (not redefined) in Task 4. ✓
