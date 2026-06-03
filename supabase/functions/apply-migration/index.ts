import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

serve(async (req) => {
  try {
    const { Pool } = await import('https://deno.land/x/postgres@v0.17.0/mod.ts');
    const pool = new Pool(Deno.env.get('SUPABASE_DB_URL'), 1, true);
    const conn = await pool.connect();
    // Delete duplicate campaign logs, keeping the latest one
    await conn.queryObject(`
      DELETE FROM campaign_logs a USING campaign_logs b
      WHERE a.id < b.id 
        AND a.campaign_id = b.campaign_id 
        AND a.email = b.email
    `);
    
    // Add unique constraint on (campaign_id, email)
    await conn.queryObject(`
      ALTER TABLE campaign_logs
      DROP CONSTRAINT IF EXISTS unique_campaign_email
    `);
    await conn.queryObject(`
      ALTER TABLE campaign_logs
      ADD CONSTRAINT unique_campaign_email UNIQUE (campaign_id, email)
    `);

    // Add update policy on campaign_logs
    await conn.queryObject(`
      DROP POLICY IF EXISTS "Auth update campaign_logs" ON public.campaign_logs;
      CREATE POLICY "Auth update campaign_logs"
        ON public.campaign_logs FOR UPDATE
        USING (auth.role() = 'authenticated')
        WITH CHECK (auth.role() = 'authenticated')
    `);

    conn.release();
    await pool.end();
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
