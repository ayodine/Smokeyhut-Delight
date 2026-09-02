import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

serve(async (req) => {
  try {
    const { Pool } = await import('https://deno.land/x/postgres@v0.17.0/mod.ts');
    const pool = new Pool(Deno.env.get('SUPABASE_DB_URL'), 1, true);
    const conn = await pool.connect();
    let body: any = {};
    try { body = await req.json(); } catch {}
    const sqlToRun = body?.sql;
    if (sqlToRun && typeof sqlToRun === 'string') {
      await conn.queryObject(sqlToRun);
    } else {
      // Default / fallback
      await conn.queryObject(`SELECT 1`);
    }

    conn.release();
    await pool.end();
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});

