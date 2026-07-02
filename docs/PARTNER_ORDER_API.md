# Smokeyhut Delight — Partner Order API

Submit an order to Smokeyhut Delight on a customer's behalf. One endpoint, one
shared API key. Orders arrive in the Smokeyhut dashboard tagged as `partner`
orders with status `pending`.

## Endpoint

```
POST https://<PROJECT-REF>.functions.supabase.co/receive-order
```

Replace `<PROJECT-REF>` with the value we give you.

## Authentication

Send the API key we issue you in the `x-api-key` header. Keep it secret — treat
it like a password. Requests without a valid key get `401`.

```
x-api-key: <YOUR_API_KEY>
Content-Type: application/json
```

## Request body

```json
{
  "customer_name": "Ada Nwosu",
  "customer_phone": "08030000000",
  "customer_email": "ada@example.com",
  "delivery_address": "12 Bode Thomas, Surulere, Lagos",
  "delivery_zone": "Surulere",
  "payment_method": "bank_transfer",
  "delivery_fee": 1000,
  "total": 13000,
  "notes": "No pepper",
  "items": [
    { "product_id": 7, "name": "Full Smokey Guineafowl", "price": 12000, "qty": 1 }
  ]
}
```

| Field | Required | Notes |
|---|---|---|
| `customer_phone` | **Yes** | The customer's phone number. |
| `items` | **Yes** | Array, at least one. Each item needs `name` and `qty` (> 0). `product_id` and `price` are recommended. |
| `customer_name` | No | Customer's full name. |
| `customer_email` | No | Used for the order confirmation email if present. |
| `delivery_address` | No | Full delivery address. |
| `delivery_zone` | No | Delivery area/zone, if known. |
| `payment_method` | No | Defaults to `bank_transfer`. |
| `delivery_fee` | No | Defaults to `0`. |
| `total` | No | The order total **you** charged, in Naira. We store this as-is. |
| `notes` | No | Free-text notes for the kitchen/driver. |

> **Note:** This is a pass-through API — we store the `price`, `delivery_fee`, and
> `total` exactly as you send them. Make sure they're correct on your side.

## Response

**Success — `200`**
```json
{ "ok": true, "order_id": "SHD-01234" }
```
Store `order_id` — it's the Smokeyhut reference for this order.

**Errors**
| Status | Meaning |
|---|---|
| `400` | Bad/missing fields (e.g. no `customer_phone`, empty `items`, item missing `name`/`qty`). The `error` field explains. |
| `401` | Missing or invalid `x-api-key`. |
| `405` | Wrong HTTP method (must be `POST`). |
| `500` | Server error — retry; if it persists, contact us. |

## Example (curl)

```bash
curl -X POST "https://<PROJECT-REF>.functions.supabase.co/receive-order" \
  -H "x-api-key: <YOUR_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_name": "Ada Nwosu",
    "customer_phone": "08030000000",
    "delivery_address": "12 Bode Thomas, Surulere, Lagos",
    "total": 13000,
    "delivery_fee": 1000,
    "items": [
      { "product_id": 7, "name": "Full Smokey Guineafowl", "price": 12000, "qty": 1 }
    ]
  }'
```

## Product list

We'll share the current `product_id` / name / price list separately, and update
you when it changes. If you don't have a `product_id`, sending the correct `name`
and `price` is still fine.

---

# Reading Orders (Order Export API)

Pull orders **out of** Smokeyhut Delight into your software. You poll on a schedule
with a `since` cursor and receive every order changed since your last poll —
including status changes (e.g. `pending` → `delivered` → `cancelled`).

## Endpoint

```
GET https://<PROJECT-REF>.functions.supabase.co/export-orders
```

Same `x-api-key` header as above.

## Query parameters

| Param | Required | Notes |
|---|---|---|
| `since` | No | ISO 8601 timestamp. Returns only orders with `updated_at` **after** this value. Omit on your very first call to get everything. |
| `limit` | No | Page size. Default `100`, max `500`. |

## How to sync (polling loop)

1. First call: `GET /export-orders` (no `since`) — you get the oldest page.
2. Read `next_since` from the response and store it.
3. Next call: `GET /export-orders?since=<next_since>`.
4. Repeat on your schedule (e.g. every 1–5 minutes). Keep calling with the latest
   `next_since` until `count` is `0` — then you're caught up.

Because the cursor is `updated_at`, an order you already synced will re-appear if
its status later changes, so **upsert by `id`** on your side.

## Response

```json
{
  "ok": true,
  "count": 1,
  "next_since": "2026-07-01T09:30:00.000Z",
  "orders": [
    {
      "id": "SHD-01234",
      "status": "delivered",
      "channel": "storefront",
      "created_at": "2026-07-01T08:00:00.000Z",
      "updated_at": "2026-07-01T09:30:00.000Z",
      "total": 13000,
      "delivery_fee": 1000,
      "payment_method": "bank_transfer",
      "notes": "No pepper",
      "customer": {
        "name": "Ada Nwosu",
        "phone": "08030000000",
        "email": "ada@example.com",
        "address": "12 Bode Thomas, Surulere, Lagos",
        "zone": "Surulere"
      },
      "items": [
        { "product_id": 7, "name": "Full Smokey Guineafowl", "price": 12000, "qty": 1 }
      ]
    }
  ]
}
```

Notes:
- Orders are ordered oldest-changed first (`updated_at` ascending).
- **Cancelled orders are included** (`status: "cancelled"`) so you can reflect
  cancellations; permanently removed (soft-deleted) orders are excluded.
- `status` values: `pending`, `pending_payment`, `paid`, `delivered`, `cancelled`.

## Errors

| Status | Meaning |
|---|---|
| `400` | `since` is not a valid ISO 8601 timestamp. |
| `401` | Missing or invalid `x-api-key`. |
| `405` | Wrong method (must be `GET`). |
| `500` | Server error — retry with the same `since`; it's safe to repeat. |

## Example (curl)

```bash
curl "https://<PROJECT-REF>.functions.supabase.co/export-orders?since=2026-07-01T00:00:00Z&limit=200" \
  -H "x-api-key: <YOUR_API_KEY>"
```
