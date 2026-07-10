---
name: verify
description: How to build, run, and drive this app for runtime verification of storefront changes.
---

# Verifying Smokey-React changes

## Build & run
- `npm run build` — Vite production build (~1s), catches syntax/import errors.
- `npm run dev` — dev server; port varies (5173+, check output). Talks to the **production** Supabase DB — there is no staging.

## Driving the storefront (headless browse)
- Main checkout: `http://localhost:<port>/checkout`. WhatsApp storefront: `/menu`.
- Seed a cart without clicking: `browse storage set smokeyhut_cart '[{"id":2,"name":"Extra Bag","price":600,"qty":1}]'` then re-`goto` the page. Items need `id`, `name`, `price`, `qty`.
- Checkout shows a delivery-disclaimer modal — click the "I Agree" button first.
- Location picker: fill `input[placeholder*="Type your area"]`, wait ~1.5s, then dispatch `mousedown` (not click) on the suggestion div — suggestions use `onMouseDown`.
- Cheap product for safe live-config tests: Extra Bag (id 2, ₦600) — a solo-Extra-Bag cart never occurs organically.

## Gotchas
- The gstack browse daemon does NOT survive across Bash tool calls in the sandbox — run each full flow (goto → storage → interact → assert) in a single Bash invocation, using CSS selectors/JS instead of @refs from a previous call.
- `/menu` crashes the headless browser tab (heavy media/marquee); nav returns 200 then the daemon restarts. Verify MenuPage logic via its Checkout.jsx twin or a real browser.
- Don't place real orders: order creation triggers notification emails and the partner webhook push against production.
- Read-only prod SQL: `exec_read_only_sql` RPC works with the anon key (see scripts/inspect_campaigns.js). Writes need the service role key from `.env`; if it 401s, fetch the current one with `supabase projects api-keys --project-ref itpnfalqjjicesqcjzix` (JWT secret has been rotated before).
