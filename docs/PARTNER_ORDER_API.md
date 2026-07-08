# Smokeyhut Delight — Partner Order Sync Integration Guide

This guide details how to sync orders **out of** Smokeyhut Delight into your own system. To guarantee high freshness and 100% data reliability, you should implement both paths **together**:

1. **Real-time Push (Webhook):** We `POST` each order to your server the instant it is created or updated. Latency is ~1–2 seconds.
2. **Polling (`/export-orders`):** A schedule-based fallback cursor loop you run (e.g., every 5–10 minutes) to fetch changes and reconcile any webhook delivery failures (due to network blips, server maintenance, etc.).

Both channels emit **identical order JSON structures** and are keyed by a unique `id`. You should always **upsert by `id`** in your database so that pushed and polled payloads merge cleanly.

---

## 1. Real-time Push (Webhook)

### Setup
1. Provide us with a secure HTTPS endpoint (e.g., `https://your-system.example.com/webhooks/smokey-orders`).
2. We will issue you a shared **Webhook Signing Secret** (e.g., `shd_whsec_...`).

### Request Format
For every order created or changed, our system makes the following call:
```http
POST https://your-system.example.com/webhooks/smokey-orders
Content-Type: application/json
X-Smokey-Event: order.upserted
X-Smokey-Signature: sha256=<hex_encoded_hmac>
```

#### Body Payload
```json
{
  "type": "order.upserted",
  "order": {
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
      {
        "product_id": 7,
        "name": "Full Smokey Guineafowl",
        "price": 12000,
        "qty": 1
      }
    ]
  }
}
```

### Signature Verification (Mandatory)
Before processing a webhook, you **must** verify the signature to confirm the request originated from us.
* Compute the **HMAC-SHA256** of the **raw request body bytes** using your shared Webhook Signing Secret.
* Encode the hash as a hex string.
* Perform a **constant-time string comparison** between your computed signature and the value after `sha256=` in the `X-Smokey-Signature` header.

#### Node.js / Express Example
```js
import crypto from 'node:crypto';

// Use raw-body middleware in Express to preserve the raw request buffer
app.post('/webhooks/smokey-orders', express.raw({ type: 'application/json' }), (req, res) => {
  const secret = process.env.SMOKEY_WEBHOOK_SECRET; // 'shd_whsec_...'
  const signatureHeader = req.headers['x-smokey-signature'] || '';
  
  if (!signatureHeader.startsWith('sha256=')) {
    return res.status(401).send('Invalid signature header format');
  }
  
  const providedSig = signatureHeader.substring(7); // strip 'sha256='
  const computedSig = crypto
    .createHmac('sha256', secret)
    .update(req.body) // req.body must be the raw Buffer
    .digest('hex');

  // Constant-time compare to prevent timing attacks
  const isMatch = crypto.timingSafeEqual(
    Buffer.from(providedSig, 'utf8'),
    Buffer.from(computedSig, 'utf8')
  );

  if (!isMatch) {
    return res.status(401).send('Signature verification failed');
  }

  // Parse the verified JSON body
  const payload = JSON.parse(req.body.toString('utf8'));
  
  // Respond quickly (under 5s) and process asynchronously
  res.status(200).json({ ok: true });

  // Handle payload.order logic async (e.g. queue it)
  processOrderAsync(payload.order);
});
```

### Delivery Expectations
* **Acknowledge quickly:** Respond with a `2xx` success status code within **5 seconds**. Do not block the request for heavy internal business logic; parse, verify, enqueue, and reply.
* **No retries:** We do not retry failed webhook pushes. Any delivery failures will be seamlessly healed by your polling fallback.

---

## 2. Polling Fallback (`/export-orders`)

Use this API to backfill any orders or status updates that might have been missed if your webhook server was temporarily unreachable.

### Endpoint
```http
GET https://itpnfalqjjicesqcjzix.functions.supabase.co/export-orders
```

### Authentication
Send your assigned API key in the `x-api-key` header:
```http
x-api-key: <YOUR_API_KEY>
```

### Query Parameters
| Param | Required | Type | Description |
|---|---|---|---|
| `since` | No | String | ISO 8601 timestamp. Returns only orders updated **after** this time. Omit on first boot to fetch all history. |
| `limit` | No | Number | Page size (Default: `100`, Max: `500`). |

### How to Sync (Polling Loop Pattern)
1. **Initial poll:** Make a request to `GET /export-orders` (no `since` parameter). You will receive the first (oldest) page.
2. **Track cursor:** Save the `next_since` timestamp returned in the JSON response.
3. **Paging:** Request `GET /export-orders?since=<next_since>`.
4. **Repeat:** Continue paging until the returned `count` is `0` (meaning you are caught up).
5. **Interval:** Poll again on a schedule (e.g., every 5–10 minutes) starting from your last saved `next_since`.

### Response Format
```json
{
  "ok": true,
  "count": 1,
  "next_since": "2026-07-01T09:30:00.000Z",
  "orders": [
    {
      /* identical order structure as webhook.order */
    }
  ]
}
```

---

## Order Data Dictionary

### Order Fields
* `id` (string): Unique identifier (e.g., `SHD-01234`).
* `status` (string): State of the order. Possible values:
  * `pending` — Order placed, waiting processing.
  * `pending_payment` — Waiting for payment approval/confirmation.
  * `paid` — Payment confirmed.
  * `delivered` — Fulfilled and delivered.
  * `cancelled` — Cancelled (both cancelled and unpaid/rejected orders will transition to this).
* `channel` (string): Intake channel (e.g. `storefront`, `whatsapp`).
* `created_at` (string): ISO 8601 date.
* `updated_at` (string): ISO 8601 date (changes on any status or item edit).
* `total` (number): Grand total in local currency subunits or major currency (depends on store config).
* `delivery_fee` (number): Delivery charge.
* `payment_method` (string): e.g., `bank_transfer`, `card`, `cash`.
* `notes` (string|null): Special customer instructions.

### Customer Fields
* `name` (string)
* `phone` (string)
* `email` (string|null)
* `address` (string)
* `zone` (string|null): General shipping region/zone (e.g. `Surulere`).

### Item Fields
* `product_id` (number|null): Database product identifier.
* `name` (string): Product name.
* `price` (number): Unit price.
* `qty` (number): Quantity ordered.
