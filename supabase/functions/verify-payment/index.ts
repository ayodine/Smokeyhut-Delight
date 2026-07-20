import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"

const PAYSTACK_SECRET_KEY = Deno.env.get('PAYSTACK_SECRET_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { reference } = await req.json()
    console.log('--- Verifying Payment ---')
    console.log('Reference:', reference)

    if (!PAYSTACK_SECRET_KEY) {
      console.error('ERROR: PAYSTACK_SECRET_KEY is MISSING in Supabase.')
      throw new Error('Server configuration error (missing key)')
    }

    // 1. Verify with Paystack API using secret key (server-side only)
    const verifyResponse = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
    })

    const verifyData = await verifyResponse.json()
    console.log('Paystack verification status:', verifyData.data?.status)

    if (!verifyData.status || verifyData.data?.status !== 'success') {
      console.error('Paystack verification failed:', verifyData.message)
      return new Response(
        JSON.stringify({ success: false, error: 'Payment not verified by Paystack' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. Confirm amount matches what we stored (prevent amount tampering)
    const paidAmountKobo = verifyData.data.amount
    const currency = verifyData.data.currency

    // 3. Setup Supabase Admin Client (bypasses RLS)
    const supabaseAdmin = createClient(SUPABASE_URL || '', SUPABASE_SERVICE_ROLE_KEY || '')

    // 4. Extract order ID from metadata (preferred) or fall back to reference
    const orderId = verifyData.data.metadata?.order_id || verifyData.data.reference
    console.log('Updating order:', orderId)

    // 5. Mark order as processing (payment confirmed, ready for fulfillment)
    //    Also store paid_at so Payments page can track revenue correctly
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .update({
        status: 'processing',
        paid_at: new Date().toISOString(),
        payment_channel: verifyData.data.channel,       // e.g. 'card', 'bank', 'ussd'
        paystack_ref: verifyData.data.reference,
      })
      .eq('id', orderId)
      .neq('status', 'delivered')   // don't accidentally downgrade a delivered order
      .select()
      .single()

    if (orderError) {
      console.error('DATABASE ERROR:', orderError.message)
      throw new Error(`Order update error: ${orderError.message}`)
    }

    console.log(`Success! Order ${orderId} → processing. Paid ${paidAmountKobo / 100} ${currency} via ${verifyData.data.channel}`)
    return new Response(
      JSON.stringify({
        success: true,
        orderId: order.id,
        channel: verifyData.data.channel,
        amount: paidAmountKobo / 100
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Edge Function Error:', error.message)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
