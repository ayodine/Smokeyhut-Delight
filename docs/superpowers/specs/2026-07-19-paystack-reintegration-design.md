# Paystack Re-integration (Webhook-First) — Design

**Date:** 2026-07-19
**Status:** Approved (pending owner review)
**Surfaces:** `src/pages/storefront/Checkout.jsx`, `src/pages/storefront/MenuPage.jsx`, new `src/pages/storefront/PaymentSuccess.jsx`, edge functions `initialize-payment` / `verify-payment` / `paystack-webhook` (rebuilds) + new `reconcile-payments`, dashboard Settings, five stats RPCs, partner sync guards.

## Context: why it failed before (root causes, from code + git archaeology)

1. **Callback URL hardcoded to the ISP-blocked domain** (`initialize-payment/index.ts:39` → `smokeyhut-delight.web.app/payment/success`). Nigerian customers paid, the redirect died on a blocked domain, client-side verification never ran, orders looked unpaid.
2. **Payment truth depended on the customer's browser.** The primary paid-marking ran client-side on the success page; the webhook only rescued the popup-closed→cancelled edge case (`ff3f836`). Any redirect/network failure = stuck order.
3. **Silent stale `SUPABASE_SERVICE_ROLE_KEY`** killed `verify-payment`'s DB writes (April 2026 incident, 3 orders affected). The project's JWT secret has rotated at least once since.
4. Success page crash (missing import), COEP/popup wars with the inline SDK (`c50df9f`, `66ee04e`), duplicate-order bug (`82dc468`).
5. **Status vocabulary drift:** old `verify-payment` set `processing`, a status nothing else uses; dashboards treat `pending → shipped → delivered` (+ `cancelled`) as the lifecycle.

## Decisions (locked with owner)

| Decision | Choice |
|---|---|
| Method strategy | **Both side by side**: Paystack (card/bank/USSD/transfer) AND the current Moniepoint manual transfer, customer picks at checkout |
| Scope | **Both checkouts now**: `Checkout.jsx` and `MenuPage.jsx` (duplicated twins — keep in sync) |
| Unpaid orders | **Hidden until paid**: created as `pending_payment` (invisible to staff/stats/partner), auto-cancelled after **2 hours** unpaid, with re-verification against Paystack before any cancellation |
| Charge amount | **Same as transfer flow**: `amountToPayNow` = products − coupon + VAT; delivery fee stays rider-cash (unchanged policy) |
| Architecture | **Approach A — webhook-first**: server-to-server webhook is the only writer of payment truth; hosted redirect page (no JS SDK); reconciliation sweeper for stragglers |
| Kill switch | `app_settings.paystack_enabled` toggle (delivery-promo pattern) — hide Paystack at checkout instantly, no deploy |

## Architecture

### 1. Checkout flow (both pages)

- Payment-method selector: **Paystack** | **Manual transfer**. Transfer path is byte-for-byte today's flow. Paystack option renders only when `app_settings.paystack_enabled` is true (via `SettingsContext`, key `paystack`).
- Paystack path:
  1. Create order via existing `create_storefront_order` RPC with `status: 'pending_payment'`, `payment_method: 'paystack'` (extend the RPC only if it doesn't already accept these; keep sequential SHD-ID + dedup behavior untouched).
  2. Insert `order_items` (existing client-side pattern).
  3. Call `initialize-payment` with `{ order_id, email, amount: amountToPayNow, origin: window.location.origin }`.
  4. Redirect (same tab) to the returned Paystack hosted `authorization_url`.
- **No `notify()` call and no cart clear at creation.** The confirmation email fires server-side on payment (§3); the cart clears on the success page once payment is confirmed. Abandoned payment = cart intact, stale order swept (§4).

### 2. `initialize-payment` (rebuild)

- Validates `PAYSTACK_SECRET_KEY` at startup — a missing/invalid key returns an explicit 500 `configuration_error`, never a silent fallback.
- `callback_url` = `<origin>/payment/success` where `origin` is validated against an allowlist: `https://smokeyhutdelight.com`, `https://www.smokeyhutdelight.com`, `https://smokeyhut-delight.web.app`, `http://localhost:*` (dev). Anything else → default `https://smokeyhutdelight.com`. The blocked web.app domain is never the default again; it stays allowlisted only because some users may still browse it directly.
- Sends `metadata: { order_id }`; converts amount to kobo (`Math.round(amount * 100)`).
- **Stores the Paystack `reference` on the order row** (`paystack_ref`) immediately on successful init, so webhook, sweeper, and success page can all find the order by reference.
- If init fails: order remains `pending_payment` (sweeper will cancel it), frontend shows the error and offers the manual-transfer path; cart untouched.

### 3. `paystack-webhook` (rebuild) — the single source of payment truth

- Keeps the existing HMAC-SHA512 signature verification. Deployed `--no-verify-jwt` (Paystack calls it unauthenticated).
- On `charge.success`:
  1. Locate order by `metadata.order_id` (fallback: `paystack_ref` = reference). Not found → 200 no-op (log).
  2. **Amount tamper check:** `event.data.amount` (kobo) must equal the order's stored total ×100; mismatch → log loudly, do NOT promote, return 200 (Paystack shouldn't retry), flag order note `[PAYMENT AMOUNT MISMATCH]`.
  3. Promote idempotently: only if current status is `pending_payment` (or `cancelled` within the 48h window — late-webhook rescue), set `status='pending'`, `paid_at=now()`, `payment_channel`, `paystack_ref`. Already promoted → 200 no-op.
  4. Send the `order_confirmed` notification **server-side** by invoking the existing `notify` function. Notification failure never fails the webhook (log + proceed) — the payment state write is the critical section.
- The promotion `pending_payment → pending` is an UPDATE, so the existing partner-push trigger fires then — the partner first sees the order at payment time (§5).

### 4. Success page + `verify-payment` (rebuilds)

- New route `/payment/success` → new `src/pages/storefront/PaymentSuccess.jsx`. Reads `reference` (and `trxref`) from the query string.
- **Read-only UX:** polls a new minimal SECURITY DEFINER RPC `get_payment_status(p_ref text)` → `{ order_id, status, paid: boolean }` (exposes nothing else; storefront RLS on `orders` stays closed) every 2s for up to 30s.
  - `paid` → show confirmation (order ID, "we've emailed you"), clear the cart.
  - Timeout → call `verify-payment` once as backup (covers webhook delay), then resume polling 10s more; still unpaid → honest "payment is processing — you'll get an email; keep this order ID" state. Never claims failure (the webhook/sweeper may still land it).
- `verify-payment` (rebuild): same idempotent promotion path as the webhook (verify reference with Paystack API server-side → tamper check → promote → notify). It is a *backup entry point* to the same transition, not a second implementation — shared promotion logic lives in `supabase/functions/_shared/paystack.ts` used by webhook, verify, and sweeper.

### 5. Phantom-order guards

`pending_payment` rows must be invisible everywhere until paid:

**Unified partner-guard rule** (one predicate, both sync paths): a Paystack order is invisible to the partner until paid — skip any row with `payment_method = 'paystack' AND paid_at IS NULL`. This covers both `pending_payment` rows AND expired-unpaid ones the sweeper cancels (the partner never learns about orders that were never paid). Paid-then-cancelled orders (staff refunds) still sync normally because `paid_at` is set.

| Surface | Guard |
|---|---|
| Partner real-time push | `notify_partner_order()` trigger: skip rows matching the unified rule (migration). The promotion UPDATE (sets `paid_at`) delivers the order to the partner at payment time |
| Partner poll (`export-orders`) | Same unified-rule filter added to the query |
| Stats (five RPCs from the status-filter feature) | Base predicate becomes `status NOT IN ('cancelled','pending_payment')` (migration; `p_status` param unchanged — `pending_payment` is also not a pill) |
| Orders admin page | `pending_payment` rows appear ONLY under a dedicated "Awaiting payment" filter; excluded from the default views staff act on |
| Emails | `notify()` not called at creation for Paystack orders; fired by webhook on payment |

### 6. Reconciliation sweeper — new `reconcile-payments` edge function

- Schedule: `pg_cron` every 15 min → `pg_net` POST (Vault-stored hook secret, same proven pattern as the partner push trigger).
- For each `pending_payment` order aged **30min–48h**:
  - Has `paystack_ref` → GET `transaction/verify/:ref`: paid → promote via the shared path (idempotent, sends email); unpaid and older than **2h** → `status='cancelled'`, note `[Payment expired]`.
  - No `paystack_ref` (init never completed) and older than 2h → cancel likewise.
- **Invariant: nothing is ever cancelled without a same-run Paystack re-verification** (except no-ref orders, which cannot have been charged). A missed webhook can never cause a paid order to be cancelled.
- Sweeper cancellations never reach the partner: the unified partner-guard rule (§5) matches these rows (`payment_method='paystack'`, `paid_at IS NULL`) on both sync paths.

### 7. Admin + settings

- `app_settings` key `paystack` → `{ enabled: boolean }`. New small card in dashboard Settings (toggle only), plumbed through `SettingsContext` — exact delivery-promo pattern.
- Payments admin page: no changes needed (keys off `paid_at`/`payment_channel`, which the new flow populates).

### 8. Status model (final)

- `pending_payment` → (paid) → `pending` → `shipped` → `delivered`; or → `cancelled` (expired/abandoned).
- Old `processing` and `paid` statuses remain dead; no dashboard pill changes.

### 9. Ops rollout & hardening

1. **Secrets first:** re-set `PAYSTACK_SECRET_KEY` on Supabase from the current Paystack dashboard value; confirm the platform-injected service-role key works via a health probe on each rebuilt function (`GET /health` returning key-presence booleans, no values). This is the April silent-killer check.
2. Deploy edge functions (webhook with `--no-verify-jwt`) + apply migrations (`supabase db query --linked -f …`, never `db push`) — all inert while the toggle is off and no frontend calls exist.
3. Configure the Paystack dashboard: webhook URL → `https://itpnfalqjjicesqcjzix.functions.supabase.co/paystack-webhook`; confirm the domain allowlist includes `smokeyhutdelight.com`.
4. **Test-mode end-to-end** with Paystack test keys: pay, abandon, webhook-delayed (kill webhook temporarily and let the success-page backup path promote), sweeper expiry.
5. Deploy frontend; flip `paystack_enabled` on. Watch the first real transactions via the Payments page + `net._http_response`.
- Owner supplies: live Paystack secret/public keys, access to the Paystack dashboard for webhook config.

### 10. Verification

- **Unit (vitest):** origin-allowlist logic; kobo conversion; promotion idempotency rules (pure function in `_shared/paystack.ts` — statuses in × event → expected transition).
- **Integration (test keys):** the four end-to-end scenarios in §9.4, plus signature-rejection (bad HMAC → 401) and amount-tamper (mismatched kobo → no promotion).
- **Guards:** SQL checks that a `pending_payment` row is absent from stats RPC output, export-orders output, and triggers no partner push; present after promotion.
- **Regression:** manual-transfer flow unchanged (place a test transfer order); status-filter pills unaffected.

## Out of scope

- Customer accounts / authentication (sign-in, sign-up, order-history views) — explicitly dropped by owner 2026-07-23; guest checkout is the only flow.
- Delivery-fee prepayment via Paystack (rider-cash policy unchanged).
- Refunds/disputes handling.
- Paystack links for admin manual orders.
- Saved cards / recurring billing.
- Porting the old cancelled-rescue popup hack (dies with the redesign).
