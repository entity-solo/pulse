/**
 * Cron endpoints write with the service role, so they must never be publicly
 * invocable. Vercel Cron sends `Authorization: Bearer $CRON_SECRET`.
 */
export function isAuthorizedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  // Fail closed: with no secret configured, refuse rather than run open.
  if (!secret) return false

  const header = request.headers.get("authorization")
  if (header === `Bearer ${secret}`) return true

  // Allows manual triggering with ?secret=… during local development only.
  if (process.env.NODE_ENV !== "production") {
    const url = new URL(request.url)
    if (url.searchParams.get("secret") === secret) return true
  }

  return false
}

export function unauthorized() {
  return Response.json({ error: "unauthorized" }, { status: 401 })
}
