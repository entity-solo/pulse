import Link from "next/link"
import { redirect } from "next/navigation"
import { MarketSidebar } from "@/components/market-sidebar"
import { SiteHeader } from "@/components/site-header"
import { StoryCard } from "@/components/story-card"
import { TickerBar } from "@/components/ticker-bar"
import { getStoriesForTickers, getTickersBySymbols, getWatchlistSymbols, TICKER_BAR_SYMBOLS } from "@/lib/queries"

export default async function WatchlistPage() {
  const { user, symbols } = await getWatchlistSymbols()
  if (!user) redirect("/login?next=/watchlist")

  const [stories, bar] = await Promise.all([
    getStoriesForTickers(symbols),
    getTickersBySymbols(TICKER_BAR_SYMBOLS),
  ])

  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <TickerBar tickers={bar} />

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="border-b border-foreground pb-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Your tickers</p>
          <h1 className="mt-2 font-serif text-4xl leading-tight font-bold tracking-tight">Watchlist</h1>
          <p className="mt-3 max-w-2xl leading-relaxed text-muted-foreground text-pretty">
            {symbols.length > 0
              ? `Coverage filed on ${symbols.join(", ")}.`
              : "Add tickers from any stock page and their coverage collects here."}
          </p>
        </div>

        <div className="mt-8 flex flex-col gap-10 lg:flex-row lg:gap-12">
          <div className="min-w-0 flex-1">
            {stories.length === 0 ? (
              <div className="border-l-[3px] border-l-rule bg-card px-5 py-10 text-center">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Nothing here yet.{" "}
                  <Link href="/" className="text-bull underline underline-offset-2">
                    Browse the feed
                  </Link>{" "}
                  and add a ticker to start tracking it.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-5">
                {stories.map((story) => (
                  <StoryCard key={story.id} story={story} />
                ))}
              </div>
            )}
          </div>

          <div className="w-full shrink-0 lg:w-64">
            <MarketSidebar />
          </div>
        </div>
      </main>
    </div>
  )
}
