# Per-Product Delivery Cutoff — Design

**Date:** 2026-06-28
**Status:** Approved (design)

## Problem

Some products take longer to prepare/dispatch than the general store promise allows.
The first such product is **"Travel standard Dry Guineafowl"** (product id 5): it must
be ordered **before 12:00 PM** for same-day delivery; ordered after 12:00 PM, it goes
out the **next day**. The storefront never communicates this, so a customer ordering at,
say, 2 PM expects same-day delivery and the promise is silently broken.

Today the same-day promise is **hardcoded** in several places (CartSidebar, the ticker,
OrderingGuidePopup, MenuPage pills) and is **not per-product**. There is no way to mark a
single product as having a stricter cutoff, and no warning surfaces before checkout.

## Goal

1. Make customers aware of a product's cutoff **before** they place the order.
2. Be **future-proof**: any product can be given the same behavior by an admin with no
   code change or deploy ("in case of another incident like this").

## Decisions (locked with the user)

- **Condition type:** a per-product **delivery cutoff time** only (no general rules engine,
  no per-product free-text notice — the message is generated from the time for consistency).
- **Timing:** a single **time-of-day**, the same every day the store is open.
- **Behavior when past cutoff:** **warn + require acknowledgment** before placing the order.
- **Scope:** applies to **both delivery and pickup** (wording differs: "delivered tomorrow"
  vs "ready tomorrow").

## Data model

Add one nullable column to `products`:

| Column | Type | Meaning |
|---|---|---|
| `same_day_cutoff` | `time` (nullable) | e.g. `12:00:00`. **NULL** = product follows the normal store promise (no special rule). **Set** = this product has its own same-day cutoff. |

- Migration also sets `same_day_cutoff = '12:00:00'` for product id 5.
- This single nullable field is the entire future-proofing mechanism: the behavior turns on
  for any product the moment an admin sets a time, and off when cleared.

## Core logic — one shared helper

`getCutoffState(product, now = new Date())` lives in a small shared module (e.g.
`src/lib/deliveryCutoff.js`) and is the **single source of truth** consumed by every UI
surface, so the rule cannot drift between storefronts.

Returns:

```js
{
  hasCutoff: boolean,      // product.same_day_cutoff is set
  cutoffLabel: string,     // "12:00 PM" (12-hour, for display)
  isPastCutoff: boolean,   // current Lagos time is at/after today's cutoff
}
```

- "Now" is evaluated **in Africa/Lagos** via `Intl.DateTimeFormat` with
  `timeZone: 'Africa/Lagos'` — never the customer's device clock — so a customer in any
  timezone sees the correct status.
- `isPastCutoff` is a same-day time-of-day comparison: `nowLagosMinutes >= cutoffMinutes`.

## UX surfaces (consistent, escalating)

All three are driven by `getCutoffState`. Added in **both** storefronts
(MenuPage single-page + Shop/Checkout multi-page).

1. **Product card / detail** — if `hasCutoff`: a small badge, always shown:
   - *"Order by 12:00 PM for same-day delivery."*
   - Passive awareness before the item is even added.

2. **Cart** (CartSidebar + Cart page) — if any item `isPastCutoff`: an amber line:
   - *"⏰ Some items have passed today's cutoff and will be delivered tomorrow."*

3. **Checkout** — the gate. If any item in the order `isPastCutoff`, a **required
   acknowledgment** before "Place Order", reusing the existing `DisclaimerModal` pattern:
   - Delivery: *"This order includes items that have passed today's cutoff. They will be
     **delivered tomorrow**, not today."*
   - Pickup: *"…they will be **ready tomorrow**, not today."*
   - Customer must confirm ("I understand") to proceed.
   - The acknowledgment **resets if the cart contents change** after confirming.

## Admin

Add an optional **"Same-day cutoff time"** field (HTML `<input type="time">`) to the
product edit form in `src/pages/dashboard/Products.jsx`. Blank = no rule. This is how
staff handle a future product themselves, with no developer involvement.

## Edge cases & robustness

- **No cutoff set** → behaves exactly as today; zero regression for all other products.
- **Both storefronts** surface it, all via the one helper.
- **Pickup vs delivery** wording handled in the checkout/cart copy based on the selected
  delivery type.
- **Known simplification (accepted):** "tomorrow" is the literal next calendar day; it does
  not skip a closed Sunday. This only nudges expectations conservatively and can be made
  store-hours-aware later if needed.

## Testing

- **Unit tests** (Vitest) for `getCutoffState`: before cutoff, after cutoff, exactly at
  cutoff, NULL cutoff, and Lagos-time correctness with `now` mocked.
- **Manual smoke:** set id 5 to `12:00`; before noon → badge only; after noon → badge +
  cart line + checkout acknowledgment gate. Confirm a normal (no-cutoff) product is
  unaffected, and that pickup vs delivery wording is correct.

## Out of scope

- General per-product rules engine (preorder-only, unavailable-on-day, min-notice).
- Weekday-varying cutoffs.
- Store-hours / closed-day awareness for the "tomorrow" wording.
- Free-text per-product notices.
