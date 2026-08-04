"use client"

import { ArrowUpRight, ChevronDown } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { formatChange, relativeTime, sentimentLabel, type Sentiment, type Story } from "@/lib/types"

const accent: Record<Sentiment, string> = {
  bull: "border-l-bull",
  bear: "border-l-bear",
  neut: "border-l-rule",
}

const label: Record<Sentiment, string> = {
  bull: "text-bull",
  bear: "text-bear",
  neut: "text-muted-foreground",
}

export function StoryCard({ story }: { story: Story }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const sources = story.story_sources
  const company = story.tickers?.name ?? story.ticker

  return (
    <article className={`border-l-[3px] bg-card ${accent[story.sentiment]}`}>
      <div
        role="link"
        tabIndex={0}
        onClick={() => router.push(`/stock/${story.ticker}`)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            router.push(`/stock/${story.ticker}`)
          }
        }}
        aria-label={`${story.title} — view ${story.ticker}`}
        className="cursor-pointer px-5 py-5 outline-none focus-visible:bg-muted"
      >
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 font-mono text-[11px] tracking-wide">
          <span className="font-medium">{story.is_macro ? "MACRO" : story.ticker}</span>
          {story.tickers && !story.is_macro && (
            <span className={`tnum ${story.tickers.direction === "up" ? "text-bull" : "text-bear"}`}>
              {formatChange(story.tickers.change_pct)}
            </span>
          )}
          <span className={`uppercase tracking-[0.14em] ${label[story.sentiment]}`}>
            {sentimentLabel(story.sentiment)}
          </span>
          <span className="ml-auto text-muted-foreground">{relativeTime(story.published_at)}</span>
        </div>

        <h2 className="mt-3 font-serif text-xl leading-snug font-bold text-pretty">{story.title}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground text-pretty">{story.summary}</p>
        <p className="mt-3 text-xs text-muted-foreground">{company}</p>
      </div>

      <div className="flex items-center gap-4 border-t border-border px-5 py-2.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
          {sources.length} {sources.length === 1 ? "source" : "sources"}
        </button>
        <Link
          href={`/stock/${story.ticker}`}
          className="ml-auto font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-foreground"
        >
          {story.ticker} page
        </Link>
      </div>

      {open && (
        <ul className="border-t border-border bg-muted/50">
          {sources.map((source) => (
            <li key={source.id} className="border-b border-border last:border-b-0">
              <div className="px-5 py-4">
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <span className="font-mono text-[11px] font-medium uppercase tracking-[0.12em]">{source.outlet}</span>
                  <span className={`font-mono text-[10px] uppercase tracking-[0.14em] ${label[source.angle]}`}>
                    {sentimentLabel(source.angle)}
                  </span>
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Read
                    <ArrowUpRight className="size-3" aria-hidden="true" />
                  </a>
                </div>
                <p className="mt-2 text-sm leading-snug font-medium">{source.headline}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{source.excerpt}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}
