import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const SCHEMA_PROMPT = `You are the Smokeyhut Admin AI Assistant.
Your job is to answer questions about the dashboard data, sales, customers, inventory, and expenses.
You have access to a PostgreSQL database via the run_sql_query tool. 
ALWAYS use the run_sql_query tool to fetch real data before answering, unless it's a general greeting.
When writing SQL, ONLY use SELECT queries. Never use INSERT/UPDATE/DELETE. 

Database Schema:
- orders (id, customer_name, customer_phone, customer_email, delivery_address, delivery_zone, store_id, payment_method, total, delivery_fee, coupon_code, coupon_discount, status, channel, notes, created_at, deleted_at)
  (Note: status can be 'pending', 'processing', 'shipped', 'delivered', 'cancelled'. DO NOT count 'cancelled' orders in revenue unless asked.)
- order_items (id, order_id, product_id, name, price, qty)
- products (id, name, price, stock, category_id, image_url)
- expenses (id, description, amount, date, category)
- stores (id, name, location, is_active)
- delivery_zones (id, name, price)

Return clean, concise, human-readable answers. Format numbers as ₦1,234.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Missing Authorization header');
    
    // Verify user is Admin
    const authClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: { user }, error: authErr } = await authClient.auth.getUser();
    if (authErr || !user) throw new Error('Unauthorized');
    
    const { data: profile } = await authClient.from('profiles').select('role').eq('id', user.id).single();
    if (!profile || profile.role !== 'Admin') {
      throw new Error('Forbidden: Only Admins can use the AI Assistant');
    }

    const { messages } = await req.json();
    if (!messages || !Array.isArray(messages)) throw new Error('Invalid messages format');

    // Convert OpenAI-style messages to Gemini contents
    const contents = messages.map((m: any) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    const tools = [{
      functionDeclarations: [{
        name: "run_sql_query",
        description: "Executes a read-only SELECT query against the PostgreSQL database and returns the result as JSON.",
        parameters: {
          type: "OBJECT",
          properties: {
            query: { type: "STRING", description: "The raw SQL SELECT query to execute." }
          },
          required: ["query"]
        }
      }]
    }];

    const callGemini = async (currentContents: any[]) => {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SCHEMA_PROMPT }] },
          contents: currentContents,
          tools: tools,
          generationConfig: { temperature: 0.2 }
        })
      });
      if (!response.ok) {
        const errTxt = await response.text();
        throw new Error(`Gemini API Error: ${errTxt}`);
      }
      return response.json();
    };

    let geminiData = await callGemini(contents);
    const candidate = geminiData.candidates?.[0];

    // If Gemini wants to call a tool (run_sql_query)
    if (candidate?.content?.parts?.[0]?.functionCall) {
      const functionCall = candidate.content.parts[0].functionCall;
      if (functionCall.name === 'run_sql_query') {
        const sqlQuery = functionCall.args.query;
        console.log('AI SQL Query:', sqlQuery);

        // Execute via Supabase RPC securely
        const adminClient = createClient(SUPABASE_URL, SUPABASE_KEY);
        const { data: sqlResult, error: sqlError } = await adminClient.rpc('exec_read_only_sql', { q: sqlQuery });
        
        let resultStr = '';
        if (sqlError) {
          console.error('SQL Error:', sqlError);
          resultStr = `Error executing query: ${sqlError.message}`;
        } else {
          resultStr = JSON.stringify(sqlResult);
          // Limit length to avoid blowing up context window
          if (resultStr.length > 15000) resultStr = resultStr.substring(0, 15000) + '... (truncated)';
        }

        // Append the tool call and response to the conversation and call Gemini again
        const newContents = [
          ...contents,
          candidate.content, // Append the assistant's functionCall
          {
            role: 'function',
            parts: [{
              functionResponse: {
                name: "run_sql_query",
                response: { result: resultStr }
              }
            }]
          }
        ];

        geminiData = await callGemini(newContents);
      }
    }

    const finalAnswer = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "I'm sorry, I couldn't process that.";

    return new Response(JSON.stringify({ reply: finalAnswer }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
