# Smokeyhut Delight — WhatsApp Order Integration Guide

**For:** smokeyhutdelight.shop developer  
**Contact:** eridotdev@gmail.com

---

## What This Does

When a customer places an order on your site, you call this API to record it in the Smokeyhut admin dashboard. That's it. The WhatsApp message still works exactly as before — this is just an extra call that runs alongside it.

---

## Before You Start

You need one thing from the Smokeyhut team: the **API key**. Ask for it via WhatsApp or email. It looks like a long random string. Keep it secret — do not commit it to your repository.

---

## The Endpoint

```
POST https://itpnfalqjjicesqcjzix.supabase.co/functions/v1/receive-order
```

---

## Step 1 — Store the API Key

Store the key as an environment variable in your project. How you do this depends on your stack:

- **Next.js / Vite:** Add to your `.env` file:
  ```
  VITE_SMOKEYHUT_API_KEY=the_key_you_received
  ```
  or
  ```
  NEXT_PUBLIC_SMOKEYHUT_API_KEY=the_key_you_received
  ```

- **Plain HTML / no build tool:** Store it in a config file or JS constant that is not committed to git.

---

## Step 2 — Build the Payload

Collect the following from your checkout form before submitting:

| Field | Type | Required | Notes |
|---|---|---|---|
| `customer_name` | string | yes | Full name |
| `customer_phone` | string | yes | e.g. `08012345678` |
| `customer_email` | string | no | |
| `delivery_address` | string | yes | The location the customer selected |
| `delivery_fee` | number | no | Delivery fee in NGN, e.g. `2000`. Send `0` for pickup. |
| `notes` | string | no | Any delivery instructions |
| `total` | number | yes | Grand total in NGN including delivery fee, e.g. `7500` |
| `items` | array | yes | At least one item (see below) |

Each item in `items`:

| Field | Type | Required |
|---|---|---|
| `name` | string | yes |
| `price` | number | yes — unit price in NGN |
| `qty` | integer | yes |

---

## Step 3 — The Integration Function

Copy this function into your checkout code:

```javascript
async function recordOrderInDashboard(orderData) {
  try {
    const response = await fetch(
      'https://itpnfalqjjicesqcjzix.supabase.co/functions/v1/receive-order',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': YOUR_API_KEY_HERE, // replace with your env variable
        },
        body: JSON.stringify(orderData),
      }
    );
    const result = await response.json();
    if (result.ok) {
      return result.order_id; // e.g. "SHD-00042"
    }
  } catch (err) {
    // Non-blocking — do not stop the WhatsApp flow if this fails
    console.error('Dashboard sync failed:', err);
  }
  return null;
}
```

---

## Step 4 — Wire It Into Your Checkout Button

This is the most important part. The button **must be disabled** while the order is being submitted to prevent duplicate orders.

```javascript
let isSubmitting = false;

async function handleCheckout() {
  if (isSubmitting) return; // block double-clicks
  isSubmitting = true;
  submitButton.disabled = true;
  submitButton.textContent = 'Placing order...';

  // Build your order payload from the form
  const orderData = {
    customer_name:    customerNameInput.value,
    customer_phone:   customerPhoneInput.value,
    customer_email:   customerEmailInput.value || undefined,
    delivery_address: selectedLocation,       // the area the customer picked
    delivery_fee:     deliveryFeeAmount,       // number, e.g. 2000
    notes:            notesInput.value || undefined,
    total:            grandTotal,              // number, e.g. 7500
    items: cartItems.map(item => ({
      name:  item.name,
      price: item.price,
      qty:   item.quantity,
    })),
  };

  // Call the dashboard API (non-blocking — don't await before WhatsApp)
  const orderId = await recordOrderInDashboard(orderData);

  // Build your WhatsApp message as usual
  const whatsappMessage = buildWhatsAppMessage(orderData, orderId);

  // Use api.whatsapp.com/send — avoids the "download WhatsApp" landing page
  // Phone must be in international format without + or spaces: 2348XXXXXXXXX
  const whatsappUrl = `https://api.whatsapp.com/send?phone=2348XXXXXXXXX&text=${encodeURIComponent(whatsappMessage)}`;

  // Open WhatsApp
  window.location.href = whatsappUrl; // use location.href, not window.open — open() gets blocked as a popup

  // Reset button after a short delay
  setTimeout(() => {
    isSubmitting = false;
    submitButton.disabled = false;
    submitButton.textContent = 'Place Order';
  }, 3000);
}

submitButton.addEventListener('click', handleCheckout);
```

---

## Step 5 — Test It

Send a test order and check that it appears in the Smokeyhut dashboard at `smokeyhutdelight.com/admin` under **Orders → WhatsApp** filter.

You can also test the API directly with curl:

```bash
curl -X POST https://itpnfalqjjicesqcjzix.supabase.co/functions/v1/receive-order \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_KEY_HERE" \
  -d '{
    "customer_name": "Test Customer",
    "customer_phone": "08000000000",
    "delivery_address": "Lekki Phase 1",
    "delivery_fee": 2000,
    "total": 7500,
    "items": [
      { "name": "Smokey Ribs", "price": 5500, "qty": 1 }
    ]
  }'
```

A successful response looks like:

```json
{ "ok": true, "order_id": "SHD-00042" }
```

---

## Common Mistakes

**WhatsApp link asks customers to download the app**  
Change `wa.me/...` to `api.whatsapp.com/send?phone=...&text=...` and use `window.location.href` instead of `window.open`. Also confirm the phone number is in international format with no `+` or spaces: `2348012345678` not `+234 801 234 5678`.

**Orders appearing multiple times**  
The customer clicked the button more than once. Fix: disable the button immediately on first click (see Step 4).

**Getting 401 Unauthorized**  
The `x-api-key` header is missing or the wrong key was used. Double-check the key and that the header name is exactly `x-api-key`.

**Getting 400 Bad Request**  
A required field is missing. The response will tell you which one, e.g. `"Missing required field: total"`. Check that `customer_name`, `customer_phone`, `delivery_address`, `total`, and `items` are all present and non-empty.

**`total` is wrong**  
`total` should be the final amount the customer pays — items subtotal + delivery fee. Do not send item subtotal alone.

**Orders not showing in the dashboard**  
Check the WhatsApp filter on the Orders page. All orders from your site arrive with the WhatsApp label.

---

*Questions or issues: eridotdev@gmail.com*
