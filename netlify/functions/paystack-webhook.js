const crypto = require('crypto');

// Inline Supabase client for serverless (no bundler needed)
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

async function supabaseRequest(path, method = 'GET', body = null) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const headers = {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Prefer': 'return=representation',
  };
  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase ${method} ${path} failed: ${res.status} — ${text}`);
  }
  return res.json();
}

exports.handler = async (event) => {
  // Only accept POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // --- 1. Verify Paystack signature ---
  const signature = event.headers['x-paystack-signature'];
  if (!signature || !PAYSTACK_SECRET) {
    console.error('Missing signature or PAYSTACK_SECRET_KEY');
    return { statusCode: 401, body: 'Unauthorized' };
  }

  const hash = crypto
    .createHmac('sha512', PAYSTACK_SECRET)
    .update(event.body)
    .digest('hex');

  if (hash !== signature) {
    console.error('Invalid Paystack signature');
    return { statusCode: 401, body: 'Invalid signature' };
  }

  // --- 2. Parse & filter event ---
  const payload = JSON.parse(event.body);
  const { event: eventType, data } = payload;

  // We only care about successful charges
  if (eventType !== 'charge.success') {
    return { statusCode: 200, body: JSON.stringify({ message: `Ignored event: ${eventType}` }) };
  }

  console.log(`Processing charge.success for ref: ${data.reference}`);

  try {
    // --- 3. Extract metadata ---
    const meta = data.metadata || {};
    const customFields = meta.custom_fields || [];

    const getField = (name) => customFields.find(f => f.variable_name === name)?.value || '';

    const customerName = getField('customer') || data.customer?.email || 'Unknown';
    const customerPhone = getField('phone') || '';
    const deliveryMethod = getField('delivery') || 'Delivery';
    const deliveryAddress = getField('address') || '';
    const cartItems = meta.cart_items || [];

    const amountNaira = data.amount / 100; // Paystack sends in kobo
    const orderId = `ORD-${Date.now().toString(36).toUpperCase()}`;
    const paymentId = `PAY-${data.reference}`;

    // --- 4. Insert order ---
    await supabaseRequest('orders', 'POST', {
      id: orderId,
      customer_name: customerName,
      customer_phone: customerPhone,
      delivery_address: deliveryAddress,
      total: amountNaira,
      status: 'pending',
      payment_method: data.channel || 'card',
    });

    // --- 5. Insert order items ---
    if (cartItems.length > 0) {
      const orderItems = cartItems.map(item => ({
        order_id: orderId,
        product_id: item.id || null,
        name: item.name,
        qty: item.qty,
        price: item.price,
      }));
      await supabaseRequest('order_items', 'POST', orderItems);
    }

    // --- 6. Insert payment record ---
    await supabaseRequest('payments', 'POST', {
      id: paymentId,
      order_id: orderId,
      customer_name: customerName,
      amount: amountNaira,
      method: data.channel || 'card',
      paystack_ref: data.reference,
      status: 'success',
    });

    console.log(`✅ Order ${orderId} created successfully from Paystack ref ${data.reference}`);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Order created', orderId }),
    };
  } catch (err) {
    console.error('❌ Webhook processing error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
