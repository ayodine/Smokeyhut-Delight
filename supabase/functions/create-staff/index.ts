import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Use service role client — has full auth admin access
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const body = await req.json()
    const { action } = body

    // ── CREATE STAFF ─────────────────────────────────────────────
    if (action === 'create') {
      const { email, password, name, role, phone } = body

      if (!email || !password || !name || !role) {
        return new Response(
          JSON.stringify({ error: 'Missing required fields: email, password, name, role' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )
      }

      // 1. Create auth user (email confirmed immediately, no verification email)
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: name },
      })

      if (authError) {
        return new Response(
          JSON.stringify({ error: authError.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )
      }

      const userId = authData.user!.id

      // 2. Upsert profile row linked by same UUID
      const { error: profileError } = await supabaseAdmin.from('profiles').upsert({
        id: userId,
        full_name: name,
        email,
        role,
        phone: phone || null,
      })

      if (profileError) {
        // Rollback: delete the auth user we just created
        await supabaseAdmin.auth.admin.deleteUser(userId)
        return new Response(
          JSON.stringify({ error: `Profile insert failed: ${profileError.message}` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )
      }

      return new Response(
        JSON.stringify({ success: true, userId }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // ── DELETE STAFF ─────────────────────────────────────────────
    if (action === 'delete') {
      const { userId } = body
      if (!userId) {
        return new Response(
          JSON.stringify({ error: 'Missing userId' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )
      }

      // Nullify foreign key references before deleting the auth user.
      // Without this, any table with user_id → auth.users(id) (no CASCADE) blocks deletion.
      await supabaseAdmin.from('orders').update({ user_id: null }).eq('user_id', userId)
      await supabaseAdmin.from('profiles').delete().eq('id', userId)

      // Now safe to delete the auth user
      const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId)
      if (authError) {
        return new Response(
          JSON.stringify({ error: authError.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action — must be "create" or "delete"' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error) {
    console.error('create-staff error:', error.message)
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  }
})
