# Frictionless Product Restocking — Design

**Date:** 2026-07-25
**Status:** Approved (design)

## Problem

Products on the storefront show as **"Out of Stock"** when they are physically
available. This is a **counter-drift** problem, not a display bug:

- Every order — from *any* channel (main storefront, `/menu`, WhatsApp, cash,
  partner) — fires the auto-deduct trigger
  ([20260504_auto_deduct_stock_trigger.sql](../../../supabase/migrations/20260504_auto_deduct_stock_trigger.sql)):
  `stock = GREATEST(0, stock - qty)`.
- `ProductCard` treats `stock === 0` as out of stock and disables "Add to Cart"
  ([ProductCard.jsx:36](../../../src/components/ProductCard.jsx#L36)); Checkout
  re-blocks it.
- Cancellations restore stock, but a **physical restock only counts if someone
  types the new number into the dashboard.** The **only** way to do that today is
  to open a product's full edit modal, change the number, and Save. That friction
  is why restocks lag — so the number grinds down to 0 while the kitchen is
  stocked, and the storefront silently blocks fulfillable sales.

There are two *separate* inventory systems in the codebase; only one is involved:

- **`products.stock`** — a stored integer per product, auto-decremented by orders.
  **This is what gates the storefront and drifts.** This feature targets it.
- **`inventory_items` + `inventory_movements`** (Finance → Inventory) — a
  ledger-based **consumables/ingredients** inventory, stock *derived* from
  IN/OUT/ADJUSTMENT movements. A different feature; **untouched** here.

## Goal

Kill the drift by removing the friction that stops restocks from being entered.
Keep real stock tracking and the current storefront behavior; just make the number
trivial to keep honest.

## Decisions (locked with the user)

- **Approach:** "fix restocking" — keep stock tracking (chosen over making stock
  unlimited / per-product tracking flags).
- **Restock workflow:** **both** reactive (one item at a time) **and** batch
  (sit-down session) — so both UI entry points are built.
- **Atomicity:** restock is an **atomic DB increment via an RPC**, never a
  client-side read-modify-write (which would race the auto-deduct trigger and
  clobber a sale arriving mid-restock).
- **No audit trail in v1 (YAGNI):** no `product_stock_movements` ledger. Can be
  added later as a clean follow-up if accountability/history is needed.
- **No storefront behavior change:** `stock === 0` still means out of stock and
  still hard-blocks. A restocked product (0 → N) becomes buyable again through the
  **existing** storefront logic — no storefront code changes.
- **Permission:** restock actions require the existing `canManage` permission
  (same gate as editing a product).

## Data model

**No schema changes.** Restocking only mutates the existing `products.stock`
column. `products.id` is `int`.

## Core: one atomic restock RPC

A single Postgres function is the shared, race-safe write path used by every UI
entry point:

```sql
create or replace function restock_product(p_id int, p_add int)
returns int              -- the new stock level
language plpgsql
security definer
set search_path = public
as $$
declare v_new int;
begin
  if p_add is null or p_add <= 0 then
    raise exception 'restock amount must be positive';
  end if;
  if auth.role() not in ('authenticated', 'service_role') then
    raise exception 'not authorized';   -- blocks the public anon key
  end if;
  update products
     set stock = stock + p_add
   where id = p_id and deleted_at is null
   returning stock into v_new;
  if v_new is null then
    raise exception 'product not found';
  end if;
  return v_new;
end;
$$;
```

- **Atomic:** `stock = stock + p_add` is evaluated in the database, so concurrent
  auto-deduct decrements and other admins' restocks cannot clobber each other.
- **Guarded:** rejects non-positive amounts, the public **anon** role, and
  missing/deleted products. `security definer` is paired with an explicit
  role check (`authenticated` = dashboard staff, `service_role` = tooling) so it
  grants no more than the existing product-edit path and is not callable with the
  public anon key baked into the storefront bundle. `canManage` remains the
  UI-level gate, consistent with the rest of the Products page.
- **Returns the new stock** so the client can update its row optimistically with
  the authoritative value (no refetch needed, no drift between UI and DB).
- Migration is applied to prod with `supabase db query --linked -f` (this project
  **never** uses `supabase db push` — remote migration history is out of sync).

## UX surfaces (all call `restock_product`)

All three live in `src/pages/dashboard/Products.jsx`, gated on `canManage`.

**1. Inline quick-restock (reactive) — per table row**
- Each product row gets a compact control: a small number input + **Add** button
  (e.g. `[ +12 ] Add`).
- On submit: call `restock_product(id, n)`; on success, set that row's `stock` to
  the returned value and toast `"Restocked <name>: +N → <new> units"`; clear the
  input. On error, toast the message and leave the row unchanged.
- Empty/zero/negative input is a no-op (button disabled).

**2. Actionable "Stock alert" strip**
- The existing alert strip already *names* out-of-stock and low (≤5) items
  ([Products.jsx:349-356](../../../src/pages/dashboard/Products.jsx#L349-L356)).
  Each named item there gets the same quick-add control inline, so the warning and
  the fix are in one place.

**3. Batch "Restock session" modal (sit-down)**
- A **Restock** button on the Products toolbar opens a modal listing every product
  that is **out (0)** or **low (≤5)**, each with an "add" number input and its
  current stock shown.
- **Apply all** submits each filled-in row via `restock_product` (skipping blank
  rows), then reports a summary toast (`"Restocked 4 products"`), updates the
  affected rows in place, and closes. Rows that error are reported and left for
  retry; successful ones still apply (partial success is fine and surfaced).

## Error handling

- All writes go through the RPC; the client treats any thrown message as a
  user-facing toast and does not optimistically apply a failed row.
- Optimistic UI uses the RPC's **returned** stock value, so the displayed number
  always matches the database even if a sale decremented between load and restock.

## Testing

- **Unit / DB tests** for `restock_product`: positive increment returns new value;
  `p_add <= 0` raises; unknown/deleted id raises; two sequential increments sum
  correctly (atomic-increment behavior).
- **Manual smoke:**
  1. Take a product to `stock = 0`; confirm storefront shows "Out of Stock".
  2. Inline-restock it by N on the Products page → row shows N, toast fires.
  3. Reload the storefront → product is buyable again (existing logic, no
     storefront change).
  4. Batch modal lists low/out items; Apply all bumps them in one submit.
  5. Confirm a staff account **without** `canManage` sees no restock controls.

## Out of scope

- Any storefront behavior change (0 still blocks; no "unlimited"/always-available).
- Per-product stock-tracking flags.
- `product_stock_movements` audit ledger (who/when/how-much history) — deferred.
- Configurable low-stock thresholds (stays hardcoded ≤5).
- The separate consumables `inventory_items` / `inventory_movements` system.
- Cart abandonment (tracked as its own separate feature, next).
