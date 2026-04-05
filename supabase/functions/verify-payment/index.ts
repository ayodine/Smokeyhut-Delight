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

    // 1. Verify with Paystack
    const verifyResponse = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
    })

    const verifyData = await verifyResponse.json()
    console.log('Paystack API Verification Status:', verifyData.data?.status)

    if (!verifyData.status || verifyData.data.status !== 'success') {
      console.error('Paystack verification failed:', verifyData.message)
      return new Response(JSON.stringify({ success: false, error: 'Payment not verified' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // 2. Setup Supabase Admin Client
    const supabaseAdmin = createClient(SUPABASE_URL || '', SUPABASE_SERVICE_ROLE_KEY || '')

    // 3. Extract order ID and update
    const orderId = verifyData.data.metadata?.order_id || verifyData.data.reference
    console.log('Finalizing order:', orderId)

    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .update({ status: 'paid' })
      .eq('id', orderId)
      .select()
      .single()

    if (orderError) {
      console.error('DATABASE ERROR:', orderError.message)
      throw new Error(`Order update error: ${orderError.message}`)
    }

    console.log('Success! Order marked as paid.')
    return new Response(JSON.stringify({ success: true, orderId: order.id }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error) {
    console.error('Edge Function Error:', error.message)
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
