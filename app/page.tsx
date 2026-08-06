import { FilterTabs } from "@/components/filter-tabs"
import { MarketSidebar } from "@/components/market-sidebar"
import { SiteHeader } from "@/components/site-header"
import { StoryCard } from "@/components/story-card"
import { TickerBar } from "@/components/ticker-bar"
import { getStories, getTickersBySymbols, TICKER_BAR_SYMBOLS } from "@/lib/queries"
import type { Sector } from "@/lib/types"

export const dynamic = "force-dynamic"

const SECTORS = ["tech", "finance", "energy", "macro"] as const

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ sector?: string }>
}) {
  const { sector } = await searchParams
  const active = SECTORS.includes(sector as (typeof SECTORS)[number]) ? (sector as Sector) : undefined

  const [stories, bar] = await Promise.all([getStories(active), getTickersBySymbols(TICKER_BAR_SYMBOLS)])

  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <TickerBar tickers={bar} />

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="border-b border-foreground pb-6">
          <h1 className="font-serif text-4xl leading-tight font-bold tracking-tight text-balance sm:text-5xl">
            Every headline, both sides of the trade
          </h1>
          <p className="mt-3 max-w-2xl leading-relaxed text-muted-foreground text-pretty">
            Pulse groups coverage of the same market event across outlets, then labels each outlet&apos;s angle so you
            can see where the disagreement actually is.
          </p>
        </div>

        <div className="mt-8 flex flex-col gap-10 lg:flex-row lg:gap-12">
          <div className="min-w-0 flex-1">
            <FilterTabs active={active} />

            {stories.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                No stories in this sector right now. Try another filter.
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

      <footer className="border-t border-rule">
        <div className="mx-auto max-w-6xl px-4 py-6 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground sm:px-6">
          Pulse — market wire · seed data for demonstration
        </div>
      </footer>
    </div>
  )
}
