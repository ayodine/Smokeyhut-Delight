import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// v2 - force redeploy to pick up PAYSTACK_SECRET_KEY secret
const PAYSTACK_SECRET_KEY = Deno.env.get('PAYSTACK_SECRET_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { email, amount, metadata } = body
    
    console.log('--- Initializing Payment ---')
    console.log('Customer Email:', email)
    console.log('Amount:', amount)
    console.log('Order ID:', metadata?.order_id)

    if (!PAYSTACK_SECRET_KEY) {
      console.error('ERROR: PAYSTACK_SECRET_KEY is MISSING in Supabase dashboard.')
      throw new Error('Server configuration error (missing key)')
    }

    const paystackResponse = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        amount: Math.round(amount * 100), 
        callback_url: 'https://smokeyhut-delight.web.app/payment/success',
        metadata,
      }),
    })

    const data = await paystackResponse.json()
    console.log('Paystack API Status:', paystackResponse.status)
    
    if (!data.status) {
      console.error('Paystack Initialization Failed:', data.message)
      throw new Error(data.message || 'Paystack initialization failed')
    }

    console.log('Success! Redirect URL obtained.')
    return new Response(
      JSON.stringify({ authorization_url: data.data.authorization_url, reference: data.data.reference }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error) {
    console.error('Edge Function Error:', error.message)
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
