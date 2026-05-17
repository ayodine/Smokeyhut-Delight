import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
};

const API_KEY        = (Deno.env.get('WHATSAPP_ORDER_API_KEY') ?? '').trim();
const SUPABASE_URL   = (Deno.env.get('SUPABASE_URL') ?? '').trim();
const SUPABASE_KEY   = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();

const cleanNum = (val: any): number => {
  if (val == null || val === '') return 0;
  if (typeof val === 'number') return val;
  // Remove anything that's not a digit, a dot, or a minus sign
  const cleaned = String(val).replace(/[^0-9.-]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // Instantly reject all orders from the old smokeyhutdelight.shop integration
  console.log('Rejected order from old storefront integration.');
  return new Response(JSON.stringify({ 
    ok: false, 
    error: 'This ordering method has been disabled. Please order from the official Smokeyhut Delight website.' 
  }), {
    status: 403,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});

