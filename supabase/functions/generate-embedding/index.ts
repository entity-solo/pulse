import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// Supabase.ai Session with 'gte-small' model (384 dimensions)
const session = new Supabase.ai.Session("gte-small")

serve(async (req: Request) => {
  try {
    const { text } = await req.json()
    if (!text || typeof text !== "string") {
      return new Response(JSON.stringify({ error: "Missing text input parameter" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    const embedding = await session.run(text, { mean_pool: true, normalize: true })
    return new Response(JSON.stringify({ embedding: Array.from(embedding) }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
})
