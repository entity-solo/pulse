/**
 * Cron endpoints write with the service role, so they must never be publicly
 * invocable. Vercel Cron sends `Authorization: Bearer $CRON_SECRET`.
 */
export function isAuthorizedCron(request: Request): boolean {
  const secret = Deno.env.get("CRON_SECRET")
  // Fail closed: with no secret configured, refuse rather than run open.
  if (!secret) return false

  const header = request.headers.get("authorization")
  if (header === `Bearer ${secret}`) return true

  // Allows manual triggering with ?secret=… during local development only.
  // Fail closed: Supabase does not set NODE_ENV, so require it to be explicitly
  // "development" before honoring the query-param bypass.
  if (Deno.env.get("NODE_ENV") === "development") {
    const url = new URL(request.url)
    if (url.searchParams.get("secret") === secret) return true
  }

  return false
}

export function unauthorized() {
  return Response.json({ error: "unauthorized" }, { status: 401 })
}
