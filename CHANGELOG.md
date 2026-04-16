# Smokeyhut Delight — Changelog

A running log of all features built, bugs fixed, and changes deployed.

---

## [2026-04-16] — Realtime Fix, Stock-on-Ship, 5s Chime, Shipping Date Filter

### Realtime Order Notification — Fixed

**File:** `src/pages/dashboard/Orders.jsx`

**Problem:** The live order alert (visual banner + chime sound) stopped working silently. Two root causes:

1. **Stale channel conflict** — the Supabase channel was registered with the hardcoded name `'orders-realtime'`. On hot-reload or re-mount, a second subscription would conflict with the existing one, causing both to fail silently.
2. **AudioContext suspended** — browsers block audio until the user interacts with the page. `AudioContext` was created fresh on every `playChime()` call, starting in `'suspended'` state, so `OscillatorNode.start()` produced no sound.

**Fixes:**

- Channel name is now unique per mount: `orders-realtime-${Date.now()}`, preventing stale conflicts.
- Added a `.subscribe((status, err) => { ... })` callback that sets `realtimeStatus` state (`'ok'` or `'error'`).
- Added a coloured dot indicator in the Orders header:
  - Green dot = subscription active.
  - Red dot = subscription failed (tells the admin to refresh).
- Added a `getAudioCtx()` helper that reuses a single `AudioContext` instance across calls instead of creating a new one each time.
- `playChime()` now calls `ctx.resume()` before scheduling oscillators to lift the browser's autoplay suspension.
- Added a "Test Sound" (🔔) button in the Orders toolbar so the chime can be manually triggered to warm up the `AudioContext` after page load.

---

### Chime Duration Extended to 5 Seconds

**File:** `src/pages/dashboard/Orders.jsx` — `playChime()`

Previous chime was a single short note (~0.5 s). Replaced with a 5-note ascending/descending melody over 5 seconds:

| Note | Freq (Hz) | Start (s) | Duration (s) |
|------|-----------|-----------|--------------|
| 1    | 880       | 0.0       | 0.8          |
| 2    | 1100      | 0.9       | 0.8          |
| 3    | 1320      | 1.8       | 0.8          |
| 4    | 1100      | 2.7       | 0.8          |
| 5    | 880       | 3.6       | 1.4          |

Uses `triangle` oscillator type and a `DynamicsCompressorNode` to prevent clipping.

---

### Stock Decrement Moved to "Shipped" Status

**Previous behaviour:** Stock was decremented at checkout when the order was placed — even for abandoned, cancelled, or returned orders.

**New behaviour:** Stock decrements only when an admin manually marks an order as **Shipped** in the dashboard.

**Files changed:**

- `src/pages/storefront/Checkout.jsx` — removed `decrementStock()` function and all 3 call sites (Paystack, WhatsApp, bank transfer flows).
- `src/pages/dashboard/Orders.jsx` — `updateStatus()` now decrements stock when `newStatus === 'shipped'`, with an idempotency guard:
  1. Fetches the order's current status from the DB before decrementing.
  2. Only decrements if current DB status is not already `'shipped'` — prevents double-decrement if the admin refreshes and re-triggers the transition.
  3. Reads per-product quantities from `order_items`, fetches current stock, and writes `MAX(0, stock - qty)` per product.

**Reconciliation SQL** (run once to fix historical stock counts — non-destructive, only updates `products.stock`):

```sql
-- Add back qty from orders that were NOT shipped/delivered
-- (these were incorrectly decremented at checkout under the old system)
WITH bad_orders AS (
  SELECT oi.product_id, SUM(oi.qty) AS qty_to_restore
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  WHERE o.status IN ('pending', 'processing', 'cancelled')
    AND o.deleted_at IS NULL
  GROUP BY oi.product_id
)
UPDATE products p
SET stock = p.stock + bo.qty_to_restore
FROM bad_orders bo
WHERE p.id = bo.product_id;
```

---

### Date Filter Added to Shipping Page

**File:** `src/pages/dashboard/Shipping.jsx`

Mirrors the date filter already present on the Orders page.

- Added a date `<input>` to the right of the status filter buttons (Pending / Processing / Dispatched / Delivered / Active).
- When a date is selected, the table shows only orders placed on that date.
- A × clear button appears inside the input when a date is active, resetting the filter.
- The date filter stacks with the status filter — both conditions must match for a row to show.

---

## [2026-04-07] — Manual Order Price Fix

**File:** `src/pages/dashboard/Orders.jsx`

- Fixed auto-populate price when selecting a product in the manual order modal.
  - Root cause: Supabase returns numeric IDs but `<select> onChange` returns strings. Strict `===` comparison always failed, so `p` was always `undefined` and price never populated.
  - Fix: changed `pr.id === productId` to `String(pr.id) === String(productId)`.
- Quantity × price total now reflects correctly as soon as a product is selected and qty is changed.

---

## [2026-04-06] — Storefront / Dashboard Connection, Invoice Redesign, Settings Cleanup

### Storefront Orders Not Appearing in Dashboard

**File:** `src/pages/storefront/Checkout.jsx`

- All Supabase writes in the storefront were using the authenticated `supabase` client instead of the anon `publicSupabase` client, causing silent failures.
- Switched all order inserts and updates to `publicSupabase` (3 locations: Paystack order insert, order_items insert, status update; bank transfer order insert, order_items insert).
- Fixed bank transfer success flow: `clearCart()` and `setSuccessRef()` were running unconditionally even when the DB insert failed, showing a false success screen. Moved them inside the success path and added `throw error` on failure.
- Removed `delivery_zone` field from `buildOrderPayload` — column does not exist in the DB schema.

**Supabase RLS (Row-Level Security)**

- Anon inserts were blocked because RLS policies existed but did not specify `TO anon`. User must run:
  ```sql
  CREATE POLICY "anon_insert_orders" ON orders FOR INSERT TO anon WITH CHECK (true);
  CREATE POLICY "anon_update_orders" ON orders FOR UPDATE TO anon USING (true) WITH CHECK (true);
  CREATE POLICY "anon_insert_order_items" ON order_items FOR INSERT TO anon WITH CHECK (true);
  ```

---

### Manual Order Modal Fixes

**File:** `src/pages/dashboard/Orders.jsx`

- Price field now auto-populates from product data when a product is selected from the dropdown.
- Fixed item row layout overflow: split from a single 4-column row into two rows:
  - Row 1: product dropdown + optional custom item name input.
  - Row 2: qty + price + delete button.
- Fixed invoice popup being blocked by browsers: replaced `window.open('', '_blank')` with a Blob URL (`URL.createObjectURL`).

---

### Invoice / Receipt Redesign

**File:** `src/pages/dashboard/Orders.jsx` — `generateInvoice()`

- Redesigned from A4 invoice to **80mm thermal receipt** format:
  - `@page { size: 80mm auto; margin: 0 }` for correct thermal printer sizing.
  - Monospace font (Courier New) for dot-matrix / thermal appearance.
  - Dashed dividers between sections.
  - Smokeyhut logo via absolute URL (`window.location.origin + '/logo.svg'`).
- Changed title from "INVOICE" to "Receipt".
- Removed fire emoji from footer.
- Removed order status badge from receipt.

---

### Settings Page Cleanup

**File:** `src/pages/dashboard/Settings.jsx`

- Removed the "Delivery Options" card (add/edit/delete area + fee UI) — superseded by the Delivery Zones page.
- Removed unused functions: `addDeliveryOption`, `updateDeliveryOption`, `removeDeliveryOption`.
- Removed unused imports: `Truck`, `Plus`, `Trash2`, `useAuth`.

---

## [Earlier] — Foundation & Infrastructure

### Authentication & RBAC

- Firebase Auth integration for admin login.
- Role-based access control (RBAC): Admin, Staff, Rider roles.
- Admin-only actions (delete order, manage staff) gated by `userRole`.

### Supabase Integration

- Two Supabase clients:
  - `supabase` — authenticated client for dashboard writes.
  - `publicSupabase` — anon client for storefront writes.
- Tables: `orders`, `order_items`, `products`, `stores`, `staff`, `delivery_zones`, `delivery_areas`.

### Storefront

- Product listing, cart, and checkout pages.
- Paystack popup integration for card payments.
- Bank transfer payment option with manual confirmation flow.
- Order success screen with order reference.

### Dashboard Pages

- **Orders** — view, filter, search, expand, update status, delete, manual order entry, invoice generation.
- **Shipping** — status flow (pending → processing → shipped → delivered), KPIs, delivery fee tracking.
- **Payments** — transaction list, revenue KPIs broken down by payment method.
- **Settings** — store name, contact info, operating hours, notification preferences.
- **Staff Management** — invite and manage staff with roles.
- **Rider Dashboard** — delivery assignments for riders.

### Deployment

- Hosted on Firebase Hosting (`smokeyhut-delight.web.app`).
- COEP headers removed to allow Paystack cross-origin popup.
