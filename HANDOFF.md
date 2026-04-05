# Project Handoff: Smokeyhut Delight (React)

## 📋 Project Status
- **Current Goal:** Complete the Paystack Standard Checkout (Redirect) migration.
- **Tech Stack:** Vite + React, Supabase (DB + Edge Functions), Firebase (Hosting).
- **Hosting URL:** https://smokeyhut-delight.web.app

---

## 🛠️ Infrastructure Overview
- **Database:** Supabase Project `itpnfalqjjicesqcjzix`.
- **Edge Functions:** Located in `supabase/functions/`. 
  - `initialize-payment`: Generates the Paystack checkout URL.
  - `verify-payment`: Confirms transaction status and updates orders to 'paid'.
- **Frontend State:** `Checkout.jsx` and `PaymentSuccess.jsx` are fully implemented with the redirect flow.

---

## 🔴 Critical Path: Fix "no-2xx" Error
The checkout is currently failing with a generic 400 error from the Edge Function.

**Required Debugging:**
1. Check **Supabase Logs** (Functions -> initialize-payment -> Logs).
2. Look for error messages like "Missing PAYSTACK_SECRET_KEY" or "Paystack API Failed".
3. **Important:** Ensure the `orders` table has all columns from `supabase-setup.sql` (recently added `customer_email`, `notes`, `payment_method`, etc.).

---

## 🚀 Deployment Commands
- **Backend:** `npx supabase functions deploy initialize-payment`
- **Frontend:** `npm run build && firebase deploy`

---

## 🔗 Key Files
- `supabase-setup.sql`: Database schema.
- `src/pages/storefront/Checkout.jsx`: Order initialization.
- `supabase/functions/initialize-payment/index.ts`: Backend logic.
- `src/pages/storefront/PaymentSuccess.jsx`: Verification.
