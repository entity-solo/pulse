import Link from "next/link"
import { getTickersBySymbols, getTopMovers, getWatchlistSymbols, SNAPSHOT_SYMBOLS } from "@/lib/queries"
import { formatChange, formatPrice, type Ticker } from "@/lib/types"

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-foreground pt-3">
      <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  )
}

function Row({ t, showPrice = true }: { t: Ticker; showPrice?: boolean }) {
  const up = t.direction === "up"
  return (
    <li>
      <Link
        href={`/stock/${t.symbol}`}
        className="flex items-baseline gap-2 border-b border-border py-1.5 hover:bg-muted"
      >
        <span className="w-16 shrink-0 font-mono text-xs font-medium">{t.symbol}</span>
        {showPrice && <span className="tnum font-mono text-xs text-muted-foreground">{formatPrice(t.price)}</span>}
        <span className={`tnum ml-auto font-mono text-xs ${up ? "text-bull" : "text-bear"}`}>
          {formatChange(t.change_pct)}
        </span>
      </Link>
    </li>
  )
}

export async function MarketSidebar() {
  const [{ user, symbols }, movers, snapshot] = await Promise.all([
    getWatchlistSymbols(),
    getTopMovers(5),
    getTickersBySymbols(SNAPSHOT_SYMBOLS),
  ])
  const watched = await getTickersBySymbols(symbols)

  return (
    <aside className="flex flex-col gap-7">
      <Panel title="Watchlist">
        {!user ? (
          <p className="text-sm leading-relaxed text-muted-foreground">
            <Link href="/login" className="text-bull underline underline-offset-2">
              Sign in
            </Link>{" "}
            to track tickers and get a feed limited to what you own.
          </p>
        ) : watched.length === 0 ? (
          <p className="text-sm leading-relaxed text-muted-foreground">
            Nothing saved yet. Open any ticker page and add it to your watchlist.
          </p>
        ) : (
          <ul>
            {watched.map((t) => (
              <Row key={t.symbol} t={t} />
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Top Movers">
        <ul>
          {movers.map((t) => (
            <Row key={t.symbol} t={t} showPrice={false} />
          ))}
        </ul>
      </Panel>

      <Panel title="Market Snapshot">
        <ul>
          {snapshot.map((t) => (
            <Row key={t.symbol} t={t} />
          ))}
        </ul>
      </Panel>
    </aside>
  )
}
