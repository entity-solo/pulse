import Link from "next/link"
import { SearchCommand } from "@/components/search-command"
import { signOut } from "@/app/actions/auth"
import { createClient } from "@/lib/supabase/server"

export async function SiteHeader() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <header className="border-b border-foreground bg-background">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-4 sm:px-6">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="font-serif text-2xl leading-none font-bold tracking-tight">Pulse</span>
          <span className="hidden font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground sm:inline">
            Market Wire
          </span>
        </Link>

        <nav aria-label="Primary" className="flex items-center gap-5 text-sm">
          <Link href="/" className="text-muted-foreground transition-colors hover:text-foreground">
            Feed
          </Link>
          <Link href="/watchlist" className="text-muted-foreground transition-colors hover:text-foreground">
            Watchlist
          </Link>
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <SearchCommand />
          {user ? (
            <form action={signOut}>
              <button
                type="submit"
                className="border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                Sign out
              </button>
            </form>
          ) : (
            <Link
              href="/login"
              className="border border-foreground bg-foreground px-3 py-1.5 text-xs text-primary-foreground transition-opacity hover:opacity-85"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
