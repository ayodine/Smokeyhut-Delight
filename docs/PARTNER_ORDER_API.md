# Smokeyhut Delight — Partner Order API (Read Access)

Read / sync orders **out of** Smokeyhut Delight into your own system. You poll one
endpoint on a schedule with a `since` cursor and receive every order that has
changed since your last poll — new orders **and** status changes
(e.g. `pending` → `delivered` → `cancelled`).

This is **read-only**. You cannot create or modify orders through this API.

## Endpoint

```
GET https://<PROJECT-REF>.functions.supabase.co/export-orders
```

Replace `<PROJECT-REF>` with the value we give you.

## Authentication

Send the API key we issue you in the `x-api-key` header. Keep it secret — treat it
like a password. Requests without a valid key get `401`.

```
x-api-key: <YOUR_API_KEY>
```

## Query parameters

| Param | Required | Notes |
|---|---|---|
| `since` | No | ISO 8601 timestamp. Returns only orders with `updated_at` **after** this value. Omit on your very first call to pull everything. |
| `limit` | No | Page size. Default `100`, max `500`. |

## How to sync (polling loop)

1. First call: `GET /export-orders` (no `since`) — you get the oldest page.
2. Read `next_since` from the response and store it.
3. Next call: `GET /export-orders?since=<next_since>`.
4. Repeat until `count` is `0` — then you're caught up. Poll again on your
   schedule (e.g. every 1–5 minutes) starting from the last `next_since`.

Because the cursor is `updated_at`, an order you already synced **reappears** when
its status later changes — so **upsert by `id`** on your side.

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
| `500` | Server error — safe to retry with the same `since`. |

## Example (curl)

```bash
curl "https://<PROJECT-REF>.functions.supabase.co/export-orders?since=2026-07-01T00:00:00Z&limit=200" \
  -H "x-api-key: <YOUR_API_KEY>"
```
