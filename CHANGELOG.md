# Smokeyhut Delight — Changelog

A running log of all features built, bugs fixed, and changes deployed.

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
