# Project Handoff: Smokeyhut Delight (React)

_Last updated: 2026-07-12. This is the living continuation doc — read this first when picking the project back up._

## 📋 Project Status
* **Current Status:** Partner real-time order sync is ✅ LIVE. Delivery Promo feature is ✅ LIVE (promo enabled, but the promo product is still hidden — see Open Items). Hide/unhide products shipped. All deployed.
* **Tech Stack:** Vite + React, Supabase (DB + Edge Functions), Firebase (Hosting).
* **Hosting:** https://smokeyhutdelight.com (Cloudflare; use this — `smokeyhut-delight.web.app` is ISP-blocked in Nigeria)
* **Supabase Project:** `itpnfalqjjicesqcjzix`

---

## ✅ Partner Order Sync (LIVE as of 2026-07-12)

Real-time push + polling fallback, replacing the old poll-only sync:

1. **Shared Order Shaper (`supabase/functions/_shared/order-shape.ts`):** both webhook push and poll fallback emit byte-identical JSON.
2. **Webhook Edge Function (`supabase/functions/push-order/index.ts`):** loads order, HMAC-SHA256 signs it, POSTs to the partner (`X-Smokey-Signature: sha256=<hex>` over raw body).
3. **Trigger System (`supabase/migrations/20260707_partner_order_push.sql`):** `pg_net` fires `push-order` on order insert/update; skips itemless orders; `order_items` statement-level triggers touch parent `updated_at` so a batch insert = exactly one complete push.
4. **Poll API (`supabase/functions/export-orders/index.ts`):** reconciliation fallback — pg_net doesn't retry, a failed push is picked up on the partner's next poll (upsert-by-id). A missed push is never lost data.
5. **Docs for partner:** `docs/PARTNER_ORDER_API.md`.

**Live config:** `PARTNER_WEBHOOK_URL` = `https://smokeyhut.streetmbasolution.com/api/integrations/smokeyhut/orders/webhook.php?tenant=26f2328591a041e83aaf90ab36fc0948098415607e81531a`

**Verified in production 2026-07-12:** real order pushed through the full chain (DB trigger → pg_net → push-order → signed POST) → `200 {"ok":true,"pushed":"SHD-03587"}`, partner replied `{"success":true}`.

**Activation history (5 rounds, all failures were on the partner's side):** v1 apex URL → 500 (their script fataled) → v2 subdomain → 404 (path not deployed) → v3 → 404 "Unknown tenant token" (token generated but never persisted in their Platform Admin → Tenant → Partner sync) → v4 → 401 (our signing secret not configured on their side) → v5 they saved `shd_whsec_9751…` → **live**.

**Monitoring deliveries:**
```sql
-- via the exec_read_only_sql RPC (anon key works):
select id, status_code, content, created from net._http_response order by id desc limit 20;
-- 200 {"ok":true,"pushed":…} = delivered | 502 "partner responded N" = their endpoint erred (poll fallback covers)
```

**Credentials (already delivered to partner):**
* Webhook Signing Secret: `shd_whsec_975175a8a78ba07f2c5b1a715626f8f994baa79dad704265`
* Polling API Key: `shd_5c34ab8b9f7bcee76453379b1a94dc5237114e36b48ff747`

**Gotchas:**
* Partner's Hostinger IP (77.37.52.84) is intermittently unreachable from local Nigerian ISPs — always verify from Supabase's side via pg_net, never trust a local timeout.
* Edge functions here deploy with `--no-verify-jwt` (custom `x-api-key`/HMAC auth, not Supabase JWT).
* CLI has no `functions logs` subcommand (v2.109) — use the pg_net query above or the dashboard.

---

## ✅ Delivery Promo (LIVE as of 2026-07-11, rule relaxed 2026-07-12)

Per-product delivery-fee promo that overlays discounted fees WITHOUT touching `delivery_zones`/`delivery_areas`.

* **Config:** single `app_settings` row, key `delivery_promo` → `{ enabled, product_ids, area_fees }`. `area_fees` keyed by lowercased `delivery_areas.name` (85 areas seeded: ₦2,000 / ₦1,500 / 0=free tiers). Seed migration: `supabase/migrations/20260710_delivery_promo_setting.sql` (ON CONFLICT DO NOTHING).
* **Qualification rule (current):** cart contains **at least one** promo product — other items don't affect it (`.some()` in `src/lib/deliveryPromo.js`; relaxed from the original only-promo-products rule on 2026-07-12).
* **Logic:** `src/lib/deliveryPromo.js` (`fetchDeliveryPromo` + `getPromoDeliveryFee`), shared by `src/pages/storefront/Checkout.jsx` and `src/pages/storefront/MenuPage.jsx` (both duplicate checkout UI — keep in sync). Charged fee = `min(promo, normal)`. Promo orders get `[Delivery Promo]` tag in notes.
* **Admin UI:** "Delivery Promo" card in dashboard Settings (`src/pages/dashboard/Settings.jsx`) — on/off toggle, product picker, searchable editable fee list; self-seeds from `src/lib/deliveryPromoSeed.js` if the DB row is missing. Plumbed through `src/context/SettingsContext.jsx` (key `delivery_promo`).
* **UI:** strikethrough old fee + green PROMO tag in suggestions/selected-chip/price summary on both checkouts.
* **Current live state:** `enabled: true`, `product_ids: [25]` (**Triple Delight Combo**, ₦37,500).
* **Assumed area-name mappings (flag if fees look wrong):** "Kola"→Ikola, "Kola Axis"→Kola AIT, "Oworo"→OWORONSHOKI.
* **Out of scope:** admin manual orders (dashboard Orders form) don't apply promo fees — staff adjust manually.

---

## ✅ Hide/Unhide Products (shipped 2026-07-11)

* Eye/EyeOff toggle button per row on the admin Products page (`src/pages/dashboard/Products.jsx`), gated by `Products:manage`. Flips `products.is_active`; storefront (`src/lib/productsCache.js`) already filtered on it, so hiding = instant removal from `/shop` + `/menu`. Hidden rows dim with a "Hidden" pill.
* **Bug fixed alongside:** `handleSave` used to hardcode `is_active: true` on every save — editing a hidden product silently un-hid it. Now `is_active` is only set on insert.

## ✅ Cutoff badge copy (shipped 2026-07-12)

Product-card same-day badge now reads: "⏰ Orders for this product stop by {time} for same day delivery" — all 3 card variants in `src/components/ProductCard.jsx` (was "Order by {time} for same-day delivery", truncated on compact variants).

---

## 🔧 Infra notes from this session

* **Supabase service-role key rotation:** the `SUPABASE_SERVICE_ROLE_KEY` in `.env` went stale (project JWT secret was rotated — old key had valid claims but dead signature, 401 "Invalid API key"). Fixed 2026-07-10 by pulling the current key via `supabase projects api-keys --project-ref itpnfalqjjicesqcjzix` and rewriting `.env`. If any other script/secret still holds the old key, it's silently failing.
* **Never `supabase db push` here:** remote migration history is missing ~20 locally-present migrations (they were applied manually via the dashboard); push would try to re-run them. Apply single migrations via service-role scripts or the dashboard SQL editor.
* **Read-only prod SQL:** `exec_read_only_sql` RPC works with the anon key (pattern in `scripts/inspect_campaigns.js`).
* **Verify recipe:** `.claude/skills/verify/SKILL.md` documents how to build/run/drive this app headlessly (cart seeding via localStorage, checkout flow, gotchas like `/menu` crashing the headless browser).

---

## 📋 Open Items (pick up here)

1. **Unhide the promo product:** Triple Delight Combo (product id 25) is still `is_active: false` — the promo is ON but customers can't buy the product. When ready to launch: Admin → Products → click the eye icon on Triple Delight Combo. (This may be intentional staging — confirm with owner.)
2. **Monitor first real webhook deliveries:** watch `net._http_response` (query above) over the next days; alert the partner if 502s appear.
3. **Promo wind-down (whenever the promo ends):** Admin → Settings → Delivery Promo → toggle OFF → Save. Nothing else to clean up.
4. **Paystack flow (secondary):** keep an eye on `initialize-payment`/`verify-payment` — orders should keep transitioning to `paid`.
5. **Uncommitted working-tree leftovers (pre-existing, decide their fate):** `.env.example`, `.gitignore` (`.gstack/` line), `.firebase/hosting.ZGlzdA.cache`, `DASHBOARD_REPLICATION_GUIDE.md`, `orders_2026-06-23_to_24.csv`, `scripts/inspect_users.js`, `scripts/inspect_campaigns.js`, `supabase/.temp/cli-latest`.
