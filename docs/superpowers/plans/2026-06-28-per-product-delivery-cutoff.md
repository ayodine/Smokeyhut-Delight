# Per-Product Delivery Cutoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let any product carry an optional same-day order cutoff time; warn customers before ordering and require acknowledgment when an item has passed today's cutoff (so it will arrive next day).

**Architecture:** One nullable `same_day_cutoff` column on `products` drives everything. A single shared helper `getCutoffState(product, now)` (evaluated in Africa/Lagos time) is consumed by the product card, cart, and checkout. Cart items already spread the full product object, so the cutoff flows to checkout automatically once it's in the product fetch.

**Tech Stack:** React (Vite), Supabase (Postgres), Vitest.

## Global Constraints

- All "now"/time logic evaluated in timezone `Africa/Lagos` via `Intl.DateTimeFormat` — never the device clock.
- `same_day_cutoff` is a Postgres `time`, nullable. NULL = no rule = current behavior (zero regression).
- Message copy is generated from the cutoff time (no per-product free-text field).
- Applies to both delivery and pickup; wording differs ("delivered tomorrow" vs "ready tomorrow").
- Behavior = warn + require acknowledgment; never block ordering.
- Follow existing code style (inline styles, existing component patterns). No new dependencies.
- Migrations are applied manually by the user in the Supabase SQL editor (no DB password available locally).

---

### Task 1: Database column + data plumbing

Adds the column and makes sure it reaches both the storefront and the admin form. Without the `select` edits the column is invisible to the UI.

**Files:**
- Create: `supabase/migrations/20260628_product_same_day_cutoff.sql`
- Modify: `src/lib/productsCache.js:10` (storefront product fetch select)
- Modify: `src/pages/dashboard/Products.jsx:48` (admin product fetch select)

**Interfaces:**
- Produces: every product object now optionally has `same_day_cutoff` (string `"HH:MM:SS"` or `null`).

- [ ] **Step 1: Create the migration**

Create `supabase/migrations/20260628_product_same_day_cutoff.sql`:

```sql
-- Optional per-product same-day order cutoff. When set, ordering this product
-- after this time (Africa/Lagos) means it can only be delivered/picked up the
-- next day. NULL = no special rule (product follows the normal store promise).
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS same_day_cutoff time;

-- The first product with this rule: "Travel standard Dry Guineafowl" (id 5),
-- cutoff 12:00 PM.
UPDATE public.products SET same_day_cutoff = '12:00:00' WHERE id = 5;
```

- [ ] **Step 2: Apply the migration**

Paste the SQL above into the Supabase SQL editor and run it. (Manual — no local DB password.)

Verify with this node check (run from repo root):

```bash
node -e '
import("fs").then(async ({default:fs})=>{
const env=fs.readFileSync(".env","utf8");
const url=env.match(/VITE_SUPABASE_URL=(.*)/)[1].trim();
const key=env.match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1].trim();
const r=await fetch(url+"/rest/v1/products?select=id,name,same_day_cutoff&id=eq.5",{headers:{apikey:key,Authorization:"Bearer "+key}});
console.log(await r.text());
});'
```

Expected output includes: `"same_day_cutoff":"12:00:00"`.

- [ ] **Step 3: Add `same_day_cutoff` to the storefront fetch**

In `src/lib/productsCache.js` line 10, add `same_day_cutoff` to the products select. Change:

```js
    supabase.from('products').select('id,name,short_desc,price,compare_price,image,badge,stock,category_id,free_shipping,is_active').or('is_active.is.null,is_active.eq.true').is('deleted_at', null).order('created_at', { ascending: false }),
```

to:

```js
    supabase.from('products').select('id,name,short_desc,price,compare_price,image,badge,stock,category_id,free_shipping,is_active,same_day_cutoff').or('is_active.is.null,is_active.eq.true').is('deleted_at', null).order('created_at', { ascending: false }),
```

- [ ] **Step 4: Add `same_day_cutoff` to the admin fetch**

In `src/pages/dashboard/Products.jsx` line 48, add `same_day_cutoff` to the select. Change:

```js
        supabase.from('products').select('id,name,description,short_desc,price,compare_price,stock,category_id,badge,image,is_active,free_shipping,created_at').is('deleted_at', null).order('created_at', { ascending: false }),
```

to:

```js
        supabase.from('products').select('id,name,description,short_desc,price,compare_price,stock,category_id,badge,image,is_active,free_shipping,created_at,same_day_cutoff').is('deleted_at', null).order('created_at', { ascending: false }),
```

- [ ] **Step 5: Build to verify no breakage**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260628_product_same_day_cutoff.sql src/lib/productsCache.js src/pages/dashboard/Products.jsx
git commit -m "feat(products): add same_day_cutoff column + include in fetches"
```

---

### Task 2: `getCutoffState` shared helper (TDD)

The single source of truth for cutoff logic. This is the only piece with real logic, so it is fully unit-tested.

**Files:**
- Create: `src/lib/deliveryCutoff.js`
- Test: `src/lib/deliveryCutoff.test.js`

**Interfaces:**
- Produces:
  - `getCutoffState(product, now = new Date()) => { hasCutoff: boolean, cutoffLabel: string, isPastCutoff: boolean }`
  - `anyItemPastCutoff(items, now = new Date()) => boolean`

- [ ] **Step 1: Write the failing test**

Create `src/lib/deliveryCutoff.test.js`:

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/deliveryCutoff.test.js`
Expected: FAIL — cannot resolve `./deliveryCutoff`.

- [ ] **Step 3: Implement the helper**

Create `src/lib/deliveryCutoff.js`:

```js
// Single source of truth for per-product same-day delivery cutoffs.
// A product may carry `same_day_cutoff` — a "HH:MM" / "HH:MM:SS" time string.
// If set and the current time in Lagos is at/after it, the product can only be
// delivered (or picked up) the next day. All time logic is in Africa/Lagos.

const LAGOS_TZ = 'Africa/Lagos';

// Wall-clock minutes-since-midnight in Lagos for a given instant, independent of
// the device timezone.
function lagosMinutesNow(now) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: LAGOS_TZ, hour12: false, hour: '2-digit', minute: '2-digit',
  }).formatToParts(now);
  const h = Number(parts.find(p => p.type === 'hour').value) % 24;
  const m = Number(parts.find(p => p.type === 'minute').value);
  return h * 60 + m;
}

// "HH:MM" / "HH:MM:SS" -> minutes since midnight, or null if invalid.
function parseCutoffMinutes(cutoff) {
  if (!cutoff || typeof cutoff !== 'string') return null;
  const m = cutoff.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

// minutes-since-midnight -> "1:05 PM"
function formatLabel(minutes) {
  let h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
}

export function getCutoffState(product, now = new Date()) {
  const cutoffMin = parseCutoffMinutes(product?.same_day_cutoff);
  if (cutoffMin == null) {
    return { hasCutoff: false, cutoffLabel: '', isPastCutoff: false };
  }
  return {
    hasCutoff: true,
    cutoffLabel: formatLabel(cutoffMin),
    isPastCutoff: lagosMinutesNow(now) >= cutoffMin,
  };
}

export function anyItemPastCutoff(items, now = new Date()) {
  return (items || []).some(it => getCutoffState(it, now).isPastCutoff);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/deliveryCutoff.test.js`
Expected: PASS (all tests green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/deliveryCutoff.js src/lib/deliveryCutoff.test.js
git commit -m "feat: getCutoffState helper for per-product delivery cutoffs"
```

---

### Task 3: Admin — cutoff time field in the product form

Lets staff set/clear the cutoff on any product (the future-proofing mechanism).

**Files:**
- Modify: `src/pages/dashboard/Products.jsx` (form state init x2, `openEdit`, `handleSave` data, form JSX)

**Interfaces:**
- Consumes: `same_day_cutoff` on product rows (from Task 1).
- Produces: writes `same_day_cutoff` (`"HH:MM"` string or `null`) on insert/update.

- [ ] **Step 1: Add `cutoff` to both form-state initializers**

In `src/pages/dashboard/Products.jsx` line 38, change:

```js
  const [form, setForm] = useState({ name: '', desc: '', price: '', compare_price: '', category: '', image: '', badge: '', stock: '', free_shipping: false });
```
to (append `cutoff: ''`):
```js
  const [form, setForm] = useState({ name: '', desc: '', price: '', compare_price: '', category: '', image: '', badge: '', stock: '', free_shipping: false, cutoff: '' });
```

And line 79 (the reset in the "add new" path), change:
```js
    setForm({ name: '', desc: '', price: '', compare_price: '', category: catList[0]?.id || '', image: '', badge: '', stock: '', free_shipping: false });
```
to:
```js
    setForm({ name: '', desc: '', price: '', compare_price: '', category: catList[0]?.id || '', image: '', badge: '', stock: '', free_shipping: false, cutoff: '' });
```

- [ ] **Step 2: Populate `cutoff` when editing**

In `openEdit` (around line 87-97), add a `cutoff` line. Change the `free_shipping: p.free_shipping || false,` line inside `setForm({...})` to include cutoff after it:

```js
      free_shipping: p.free_shipping || false,
      cutoff: p.same_day_cutoff ? p.same_day_cutoff.slice(0, 5) : '',
```

(`<input type="time">` uses `"HH:MM"`, so we slice off any seconds.)

- [ ] **Step 3: Write `same_day_cutoff` on save**

In `handleSave`, the `data` object ends with `free_shipping: form.free_shipping,` (line 135). Add a cutoff line right after it:

```js
      free_shipping: form.free_shipping,
      same_day_cutoff: form.cutoff || null,
```

- [ ] **Step 4: Add the time field to the form JSX**

In `src/pages/dashboard/Products.jsx`, find the Badge form-group (line 536):

```js
              <div className="form-group"><label>Badge (optional)</label><input value={form.badge} onChange={set('badge')} placeholder="bestseller, new, hot, value" /></div>
```

Add a new form-group immediately after it (still inside the same `form-row` div):

```js
              <div className="form-group">
                <label>Same-day cutoff <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.73rem' }}>optional</span></label>
                <input type="time" value={form.cutoff} onChange={set('cutoff')} />
              </div>
```

- [ ] **Step 5: Build to verify**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 6: Manual check**

Run `npm run dev`, open the dashboard Products page, edit "Travel standard Dry Guineafowl" → the cutoff field shows `12:00`. Edit a different product → field is blank. Save a product with a cutoff and re-open it → value persists.

- [ ] **Step 7: Commit**

```bash
git add src/pages/dashboard/Products.jsx
git commit -m "feat(admin): same-day cutoff time field on product form"
```

---

### Task 4: Product card cutoff badge

Always shows the cutoff on the card so customers see it before adding. Both storefronts render `<ProductCard variant="shopify">`, so one edit to the shopify variant covers both; we also add it to the `menu` and default variants for completeness.

**Files:**
- Modify: `src/components/ProductCard.jsx`

**Interfaces:**
- Consumes: `getCutoffState` (Task 2), `product.same_day_cutoff` (Task 1).

- [ ] **Step 1: Import the helper**

In `src/components/ProductCard.jsx` line 4, after the lucide import, add:

```js
import { getCutoffState } from '../lib/deliveryCutoff';
```

- [ ] **Step 2: Compute cutoff state in the component**

Inside `function ProductCard({ product, variant })`, after the `isOutOfStock` line (line 35), add:

```js
  const cutoff = getCutoffState(product);
```

- [ ] **Step 3: Add the badge to the shopify variant**

In the shopify variant, find the price block (lines 75-80) ending with the closing `</div>` of the price row. Immediately after that price `</div>` and before the Add-to-Cart `<button>`, insert:

```js
          {cutoff.hasCutoff && (
            <div style={{ fontSize: '0.72rem', color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '4px 8px', marginBottom: 10, fontWeight: 600, lineHeight: 1.3 }}>
              ⏰ Order by {cutoff.cutoffLabel} for same-day delivery
            </div>
          )}
```

- [ ] **Step 4: Add the badge to the menu and default variants**

In both the `menu` variant and the default variant, find `<div className="product-desc-text">{product.shortDesc || product.desc}</div>` and add directly after it:

```js
          {cutoff.hasCutoff && (
            <div style={{ fontSize: '0.7rem', color: '#92400e', fontWeight: 600, marginTop: 4 }}>
              ⏰ Order by {cutoff.cutoffLabel} for same-day
            </div>
          )}
```

(There are two occurrences of that `product-desc-text` line — one in the `menu` variant ~line 128, one in the default ~line 168. Add the block after each.)

- [ ] **Step 5: Build to verify**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/components/ProductCard.jsx
git commit -m "feat(storefront): show same-day cutoff badge on product cards"
```

---

### Task 5: Cart cutoff notice

Shows an amber notice in the cart when any item has passed its cutoff.

**Files:**
- Modify: `src/components/CartSidebar.jsx`
- Modify: `src/pages/storefront/Cart.jsx`

**Interfaces:**
- Consumes: `anyItemPastCutoff` (Task 2), cart `items`.

- [ ] **Step 1: CartSidebar — import + notice**

In `src/components/CartSidebar.jsx`, add the import near the top (with the other imports):

```js
import { anyItemPastCutoff } from '../lib/deliveryCutoff';
```

Find the cart-note line (line 55):

```js
            <div className="cart-note">Delivery fee calculated at checkout. Order before 10am for same-day delivery.</div>
```

Immediately before it, insert (this component already has `items` in scope from `useCart`; if the variable is named differently, use that name):

```js
            {anyItemPastCutoff(items) && (
              <div style={{ fontSize: '0.78rem', color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 10px', marginBottom: 8, fontWeight: 600 }}>
                ⏰ Some items have passed today's cutoff and will be delivered tomorrow.
              </div>
            )}
```

If `items` is not already destructured in CartSidebar, add `items` to its `useCart()` destructure.

- [ ] **Step 2: Cart page — import + notice**

In `src/pages/storefront/Cart.jsx`, add the import:

```js
import { anyItemPastCutoff } from '../../lib/deliveryCutoff';
```

Find the items list opener `{items.map((item, idx) => {` (line 68). Immediately before that line's containing block (just above the `{items.map(`), insert:

```js
          {anyItemPastCutoff(items) && (
            <div style={{ fontSize: '0.82rem', color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 14px', margin: '0 16px 12px', fontWeight: 600 }}>
              ⏰ Some items have passed today's cutoff and will be delivered tomorrow.
            </div>
          )}
```

- [ ] **Step 3: Build to verify**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/CartSidebar.jsx src/pages/storefront/Cart.jsx
git commit -m "feat(cart): notice when items have passed same-day cutoff"
```

---

### Task 6: Checkout acknowledgment gate

If any item has passed its cutoff, require explicit acknowledgment before placing the order. Wording depends on delivery vs pickup. Reuses the existing modal pattern.

**Files:**
- Modify: `src/pages/storefront/Checkout.jsx` (import, state, reset effect, gate in `handleBankTransfer`, modal render, modal component)

**Interfaces:**
- Consumes: `anyItemPastCutoff` (Task 2), cart `items`, `deliveryType`, `handleBankTransfer`.

- [ ] **Step 1: Import the helper**

In `src/pages/storefront/Checkout.jsx`, add to the imports:

```js
import { anyItemPastCutoff } from '../../lib/deliveryCutoff';
```

- [ ] **Step 2: Add acknowledgment state**

After the disclaimer state (lines 52-53):

```js
  const [disclaimerAgreed, setDisclaimerAgreed] = useState(false);
  const [showDisclaimerModal, setShowDisclaimerModal] = useState(false);
```

add:

```js
  const [cutoffAck, setCutoffAck] = useState(false);
  const [showCutoffModal, setShowCutoffModal] = useState(false);
```

- [ ] **Step 3: Reset acknowledgment when the cart changes**

After the existing `useEffect` that ends at line 68 (`}, [deliveryType, disclaimerAgreed]);`), add a new effect:

```js
  // Re-require acknowledgment whenever the cart contents change.
  useEffect(() => { setCutoffAck(false); }, [items]);
```

- [ ] **Step 4: Gate `handleBankTransfer`**

`handleBankTransfer` starts at line 227. Add the gate as the very first statement inside it (before any other logic / `setProcessing`):

```js
  const handleBankTransfer = async () => {
    if (anyItemPastCutoff(items) && !cutoffAck) {
      setShowCutoffModal(true);
      return;
    }
```

(Keep the rest of the function unchanged.)

- [ ] **Step 5: Render the modal**

Find the DisclaimerModal render (line 595):

```js
      <DisclaimerModal isOpen={showDisclaimerModal} onAgree={() => { setDisclaimerAgreed(true); setShowDisclaimerModal(false); }} />
```

Add right after it:

```js
      <CutoffModal
        isOpen={showCutoffModal}
        isPickup={deliveryType === 'pickup'}
        onAgree={() => { setCutoffAck(true); setShowCutoffModal(false); handleBankTransfer(); }}
        onClose={() => setShowCutoffModal(false)}
      />
```

- [ ] **Step 6: Add the `CutoffModal` component**

At the end of `src/pages/storefront/Checkout.jsx`, after the `DisclaimerModal` function (after line 697), add:

```js
function CutoffModal({ isOpen, isPickup, onAgree, onClose }) {
  if (!isOpen) return null;
  const when = isPickup ? 'ready for pickup tomorrow' : 'delivered tomorrow';
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 20, padding: 24, maxWidth: 400, width: '100%', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#fffbeb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: '1.5rem' }}>⏰</span>
          </div>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#92400e' }}>Next-Day Delivery Notice</h3>
        </div>
        <p style={{ fontSize: '0.9rem', color: '#555', lineHeight: 1.6, marginBottom: 24 }}>
          Your order includes an item that has passed today's order cutoff. It will be <strong>{when}</strong>, not today. Do you want to continue?
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 14, borderRadius: 12, background: '#f3f4f6', color: '#111', border: 'none', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer' }}>
            Go Back
          </button>
          <button onClick={onAgree} style={{ flex: 1, padding: 14, borderRadius: 12, background: '#c0201f', color: '#fff', border: 'none', fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer' }}>
            I Understand
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Build to verify**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/pages/storefront/Checkout.jsx
git commit -m "feat(checkout): acknowledgment gate for past-cutoff items"
```

---

### Task 7: Full test run, deploy, and manual smoke

**Files:** none (verification + release).

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass (including `deliveryCutoff.test.js`).

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Deploy**

Run: `firebase deploy`
Expected: "Deploy complete!"

- [ ] **Step 4: Manual smoke on the live site**

On `smokeyhutdelight.com`:
- Product card for "Travel standard Dry Guineafowl" shows "⏰ Order by 12:00 PM for same-day delivery".
- A normal product shows no cutoff badge.
- **If currently after 12:00 PM Lagos:** add the travel product → cart shows the amber "delivered tomorrow" notice; at checkout, clicking Place Order opens the "Next-Day Delivery Notice" modal; "I Understand" proceeds, "Go Back" cancels. Switch to pickup → modal says "ready for pickup tomorrow".
- **If currently before 12:00 PM Lagos:** no cart notice and no modal (order proceeds normally).
- Changing cart contents after acknowledging re-shows the modal on the next Place Order.

- [ ] **Step 5: Final commit (if any cleanup)**

```bash
git add -A
git commit -m "chore: per-product delivery cutoff verified" --allow-empty
```

---

## Self-Review

**Spec coverage:**
- Data model (`same_day_cutoff` nullable, id 5 = 12:00) → Task 1. ✓
- `getCutoffState` in Lagos time → Task 2. ✓
- Product card badge (both storefronts) → Task 4. ✓
- Cart notice → Task 5. ✓
- Checkout warn + acknowledgment, delivery/pickup wording, reset on cart change → Task 6. ✓
- Admin time field → Task 3. ✓
- Unit tests (before/after/at/null/Lagos) → Task 2. ✓
- Both storefronts → Task 4 (shared ProductCard shopify variant). ✓
- Pickup + delivery wording → Task 6. ✓

**Type consistency:** `getCutoffState` returns `{hasCutoff, cutoffLabel, isPastCutoff}` and `anyItemPastCutoff(items, now)` — used consistently in Tasks 4, 5, 6. ✓

**Placeholder scan:** none. All steps contain real code/commands. ✓
