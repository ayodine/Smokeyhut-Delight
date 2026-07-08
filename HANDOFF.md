# Project Handoff: Smokeyhut Delight (React)

## 📋 Project Status
* **Current Status:** Real-time Webhook Push and Polling API are fully implemented, deployed, and verified end-to-end.
* **Tech Stack:** Vite + React, Supabase (DB + Edge Functions), Firebase (Hosting).
* **Hosting URL:** https://smokeyhut-delight.web.app
* **Supabase Project:** `itpnfalqjjicesqcjzix`

---

## 🛠️ What We Built (Partner Order Sync)

To resolve the partner's complaint about data freshness, we migrated from a poll-only API to a **real-time push + polling fallback** architecture:

1. **Shared Order Shaper (`supabase/functions/_shared/order-shape.ts`):** Ensuring both the webhook push and the poll fallback emit byte-identical JSON.
2. **Real-time Webhook Edge Function (`supabase/functions/push-order/index.ts`):** Loads order details, signs them via HMAC-SHA256, and POSTs them to the partner's webhook URL.
3. **Trigger System (`supabase/migrations/20260707_partner_order_push.sql`):** 
   - Uses `pg_net` to asynchronously trigger `push-order` on insert/update of an order.
   - Prevents pushing empty/itemless orders by skipping the push if order items do not exist yet.
   - Leverages statement-level triggers on `order_items` (using transition tables) to touch the parent order's `updated_at` exactly once on batch inserts, guaranteeing exactly one complete push containing all items.
4. **Poll API Refactoring (`supabase/functions/export-orders/index.ts`):** Now outputs using the shared shaper.
5. **Documentation (`docs/PARTNER_ORDER_API.md`):** Comprehensive integration guide for the partner developer, detailing payload structure, node verification code snippet, and polling loops.

---

## 🚀 Verification & Current State
* **End-to-End Success:** We successfully verified the entire chain (DB trigger → pg_net → Edge function → HMAC signature → POST) using `webhook.site`. Payloads land correctly in ~1.2s.
* **Database Cleaned:** The test order `TEST-ORD-99999` and its items have been deleted.
* **Current Config:** `PARTNER_WEBHOOK_URL` is temporarily cleared (`""`) on Supabase. Webhook triggers will safely no-op until the partner provides their endpoint.

---

## 📋 Next Steps (Incoming Developer)

1. **Deliver Integration Guide & Keys:**
   * Send the integration guide [docs/PARTNER_ORDER_API.md](file:///Users/ayobamiolowookere/Documents/Smokey-React/docs/PARTNER_ORDER_API.md) to the partner.
   * Securely share their credentials:
     * **Webhook Signing Secret:** `shd_whsec_975175a8a78ba07f2c5b1a715626f8f994baa79dad704265`
     * **Polling API Key:** `shd_5c34ab8b9f7bcee76453379b1a94dc5237114e36b48ff747`

2. **Activate Webhook:**
   * Once the partner developer shares their HTTPS endpoint, set it in the Supabase secrets:
     ```bash
     supabase secrets set PARTNER_WEBHOOK_URL=https://partner.example.com/their-endpoint
     ```

3. **Monitor Live Deliveries:**
   * Watch the Supabase Edge Function logs for `push-order` to ensure payloads are successfully delivered (`2xx` responses).

4. **Paystack Redirect Verification (Secondary):**
   * Keep an eye on the Paystack checkout flow (`initialize-payment` and `verify-payment`) to ensure payments and orders continue to transition to `paid` status without issues.
