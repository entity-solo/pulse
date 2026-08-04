"use client"

import { Check, Plus } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toggleWatchlist } from "@/app/actions/watchlist"

export function WatchlistToggle({
  symbol,
  saved,
  signedIn,
}: {
  symbol: string
  saved: boolean
  signedIn: boolean
}) {
  const router = useRouter()
  const [isSaved, setIsSaved] = useState(saved)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  if (!signedIn) {
    return (
      <button
        type="button"
        onClick={() => router.push(`/login?next=/stock/${symbol}`)}
        className="border border-border bg-card px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-foreground"
      >
        Sign in to track
      </button>
    )
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null)
            const result = await toggleWatchlist(symbol)
            if (!result.ok) {
              setError(result.error ?? "Something went wrong.")
              return
            }
            setIsSaved(Boolean(result.saved))
            router.refresh()
          })
        }
        className={`flex items-center gap-1.5 border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors disabled:opacity-60 ${
          isSaved
            ? "border-bull text-bull"
            : "border-foreground bg-foreground text-primary-foreground hover:opacity-85"
        }`}
      >
        {isSaved ? <Check className="size-3.5" aria-hidden="true" /> : <Plus className="size-3.5" aria-hidden="true" />}
        {isSaved ? "On watchlist" : "Add to watchlist"}
      </button>
      {error && <p className="text-xs text-bear">{error}</p>}
    </div>
  )
}
