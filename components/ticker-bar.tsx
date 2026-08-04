import Link from "next/link"
import { formatChange, formatPrice, type Ticker } from "@/lib/types"

function Quote({ t }: { t: Ticker }) {
  const up = t.direction === "up"
  return (
    <Link
      href={`/stock/${t.symbol}`}
      className="flex shrink-0 items-baseline gap-2 px-5 font-mono text-[11px] tracking-wide hover:underline"
    >
      <span className="font-medium text-foreground">{t.symbol}</span>
      <span className="tnum text-muted-foreground">{formatPrice(t.price)}</span>
      <span className={`tnum ${up ? "text-bull" : "text-bear"}`}>{formatChange(t.change_pct)}</span>
    </Link>
  )
}

export function TickerBar({ tickers }: { tickers: Ticker[] }) {
  if (tickers.length === 0) return null
  const loop = [...tickers, ...tickers]

  return (
    <div className="border-b border-rule bg-card">
      <div className="flex overflow-hidden py-2" aria-label="Market quotes">
        <div className="flex min-w-max animate-marquee">
          {loop.map((t, i) => (
            <Quote key={`${t.symbol}-${i}`} t={t} />
          ))}
        </div>
      </div>
    </div>
  )
}
