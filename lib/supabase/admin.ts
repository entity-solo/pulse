import { createClient as createSupabaseClient } from "@supabase/supabase-js"

/**
 * Service-role client for the ingest pipeline ONLY.
 *
 * The public tables (tickers, stories, story_sources) intentionally expose
 * read-only RLS policies, so no anon/authenticated role can write to them.
 * The pipeline therefore needs the service role, which bypasses RLS.
 *
 * Never import this from a Client Component, a Server Component that renders
 * user-facing data, or any route reachable without the cron secret. Read paths
 * must keep using `lib/supabase/server.ts` so RLS stays in force.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url) throw new Error("Missing SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL")
  if (!serviceKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY")

  // Created per invocation rather than hoisted to a module global, matching the
  // existing server client convention (safe under Fluid compute).
  return createSupabaseClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-pulse-pipeline": "ingest" } },
  })
}
