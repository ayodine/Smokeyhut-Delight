# Menu Page — Design Spec
**Date:** 2026-05-08  
**Route:** `/menu`  
**Purpose:** Single-page WhatsApp-first storefront. Staff sends the link to customers; customer picks items, fills details, and submits via WhatsApp or bank transfer — all without leaving the page.

---

## Architecture

`/menu` is its own route in `App.jsx`, placed **before** the `/*` wildcard so it doesn't render inside `StorefrontLayout`. MenuPage renders Navbar and Footer directly, controls the cart icon behaviour itself (opens checkout drawer instead of CartSidebar), and uses the global `CartContext` (already provided by the App-level `CartProvider`).

**Files changed:**
- `src/pages/storefront/MenuPage.jsx` — new, single file for everything
- `src/App.jsx` — add `<Route path="/menu" element={<MenuPage />} />` before `/*`

---

## Page Layout

```
Navbar (cart icon → opens checkout drawer)
─────────────────────────────────────────
breadcrumb: Home › Menu

Section header: "The Smokeyhut Menu"
Category filter pills  |  Search input

Product grid (reuses ProductCard, addItem updates CartContext)

Footer
─────────────────────────────────────────
WhatsApp bubble (fixed, bottom-right)
```

Breadcrumb links: `Home` → `/` (regular anchor, not SPA navigation).

---

## Checkout Drawer

Slides in from the right. Triggered by the Navbar cart icon (badge shows CartContext `itemCount`). Overlay backdrop closes it. Structure:

### Section 1 — Cart Review
- List of items with product image, name, unit price, qty +/− controls, remove button
- Empty state: "Your cart is empty" with link back to top of page
- Subtotal line

### Section 2 — Delivery Method
Toggle: **Delivery** | **Store Pickup**

If **Delivery**:
- Location search input with autocomplete (reuses `matchDeliveryZone` + `fetchDeliveryZones`)
- Street address input
- City (prefilled "Lagos")

If **Store Pickup**:
- Store selector (active stores from Supabase)

### Section 3 — Customer Details
- First Name * 
- Last Name *
- Phone *
- Email *  (required — user spec)
- Notes (optional textarea)

### Section 4 — Coupon Code
- Input + "Apply" button
- Shows applied coupon name + discount amount
- Error message for invalid/expired codes
- Same `coupons` table logic as existing Checkout.jsx

### Section 5 — Order Summary
```
Subtotal          ₦X,XXX
Delivery Fee      ₦X,XXX  (or Free / Pickup)
Coupon Discount  −₦X,XXX
VAT               ₦100
─────────────────────────
Grand Total       ₦X,XXX
```

### Section 6 — Payment Buttons
Two full-width buttons stacked:
1. **Send via WhatsApp** (green, MessageCircle icon) — saves order to Supabase → opens `wa.me/2348141748281` with pre-filled message → opens success drawer
2. **Bank Transfer** (red outline, Banknote icon) — saves order to Supabase → opens success drawer with bank details

Both buttons disabled while processing. iOS Safari fix: `window.open('', '_blank')` called synchronously before any `await` for the WhatsApp path (identical to existing Checkout.jsx pattern).

**Validation:** firstName, lastName, phone, email required; email regex check; delivery address + zone required when delivery type is "delivery"; cart must be non-empty.

---

## Order Submission

Reuses existing Supabase RPC: `create_storefront_order({ p: payload })` + `order_items` insert.

Payload shape (matches existing `buildOrderPayload`):
```js
{
  customer_name, customer_email, customer_phone,
  delivery_address, delivery_zone, store_id,
  payment_method,   // 'whatsapp' | 'bank_transfer'
  total,            // items subtotal − coupon + VAT
  delivery_fee,
  coupon_code, coupon_discount,
  status: 'pending',
  notes
}
```

Channel is set server-side by the RPC (= `'storefront'`).

After success: clear cart, increment coupon uses (same as Checkout.jsx).

---

## Success Drawer

Slides in from the right ON TOP of the checkout drawer (checkout drawer stays open underneath, or closes first). Shows:

**WhatsApp path:**
- "Order Sent!" heading
- "Your order has been saved. WhatsApp has opened — please send the message to complete your order."
- Order reference (copyable)
- "Continue Shopping" → clears cart, closes both drawers, scrolls to top

**Bank Transfer path:**
- "Order Placed!" heading
- "Complete payment via bank transfer using the details below."
- Order reference (copyable)
- Bank details card (bank name, account name, account number — each copyable, from `useSettings`)
- "Continue Shopping" → same as above

---

## Reused Existing Code

| What | From |
|------|------|
| `ProductCard` | `src/components/ProductCard.jsx` (no changes) |
| `CartContext` | `src/context/CartContext.jsx` (no changes) |
| `getProducts()` | `src/lib/productsCache.js` (no changes) |
| `fetchDeliveryZones` / `matchDeliveryZone` | `src/lib/deliveryMatcher.js` (no changes) |
| `publicSupabase` + RPC | `src/lib/supabase.js` (no changes) |
| `useSettings` | `src/context/SettingsContext.jsx` (no changes) |
| `useToast` | `src/context/ToastContext.jsx` (no changes) |
| `Navbar` / `Footer` | existing components, no changes |
| WhatsApp bubble | inline SVG, same as StorefrontLayout |

**No changes to CartSidebar, Checkout.jsx, Shop.jsx, or any existing storefront page.**

---

## What's NOT included

- Paystack / card payment (not requested)
- SEO meta tags (this is a private staff-shared link, not indexed)
- PaymentSuccess redirect flow
- OrderingGuidePopup

---

## Drawers CSS

Uses the existing `.dash-drawer` / `.dash-drawer-header` / `.dash-drawer-footer` / `.dash-drawer-content` pattern from the dashboard. Overlay uses existing `.cart-overlay` pattern. Width: `480px` desktop, `100vw` mobile (≤ 480px breakpoint via inline style).
