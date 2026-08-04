import Link from "next/link"
import { notFound } from "next/navigation"
import { MarketSidebar } from "@/components/market-sidebar"
import { SiteHeader } from "@/components/site-header"
import { StoryCard } from "@/components/story-card"
import { TickerBar } from "@/components/ticker-bar"
import { WatchlistToggle } from "@/components/watchlist-toggle"
import {
  getStoriesForTickers,
  getTicker,
  getTickersBySymbols,
  getWatchlistSymbols,
  TICKER_BAR_SYMBOLS,
} from "@/lib/queries"
import { formatChange, formatPrice } from "@/lib/types"

export default async function StockPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker: raw } = await params
  const symbol = decodeURIComponent(raw).toUpperCase()

  const ticker = await getTicker(symbol)
  if (!ticker) notFound()

  const [stories, bar, { user, symbols }] = await Promise.all([
    getStoriesForTickers([ticker.symbol]),
    getTickersBySymbols(TICKER_BAR_SYMBOLS),
    getWatchlistSymbols(),
  ])

  const up = ticker.direction === "up"

  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <TickerBar tickers={bar} />

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <Link
          href="/"
          className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"
        >
          ← Back to feed
        </Link>

        <div className="mt-4 flex flex-wrap items-end justify-between gap-6 border-b border-foreground pb-6">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              {ticker.exchange} · {ticker.sector}
            </p>
            <h1 className="mt-2 font-serif text-4xl leading-none font-bold tracking-tight">{ticker.symbol}</h1>
            <p className="mt-2 text-muted-foreground">{ticker.name}</p>
          </div>

          <div className="flex flex-col items-start gap-3 sm:items-end">
            <div className="flex items-baseline gap-3">
              <span className="tnum font-mono text-3xl font-medium">{formatPrice(ticker.price)}</span>
              <span className={`tnum font-mono text-lg ${up ? "text-bull" : "text-bear"}`}>
                {formatChange(ticker.change_pct)}
              </span>
            </div>
            <WatchlistToggle symbol={ticker.symbol} saved={symbols.includes(ticker.symbol)} signedIn={Boolean(user)} />
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-10 lg:flex-row lg:gap-12">
          <div className="min-w-0 flex-1">
            <h2 className="border-b border-rule pb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              Coverage
            </h2>
            {stories.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                No stories filed on {ticker.symbol} yet.
              </p>
            ) : (
              <div className="mt-6 flex flex-col gap-5">
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
