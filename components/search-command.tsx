"use client"

import { Search } from "lucide-react"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import { formatChange, type Ticker } from "@/lib/types"

export function SearchCommand() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<Ticker[]>([])
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((v) => !v)
      }
      if (e.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  useEffect(() => {
    if (open) inputRef.current?.focus()
    else {
      setQuery("")
      setResults([])
      setActive(0)
    }
  }, [open])

  useEffect(() => {
    const term = query.trim()
    if (!term) {
      setResults([])
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`, {
          signal: controller.signal,
        })
        if (!res.ok) return
        const json = (await res.json()) as { tickers: Ticker[] }
        setResults(json.tickers)
        setActive(0)
      } catch {
        // aborted or offline — leave previous results in place
      }
    }, 140)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query])

  const go = useCallback(
    (symbol: string) => {
      setOpen(false)
      router.push(`/stock/${symbol}`)
    },
    [router],
  )

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 border border-border bg-card px-3 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:border-rule sm:w-56"
      >
        <Search className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="hidden sm:inline">Search tickers</span>
        <kbd className="ml-auto hidden font-mono text-[10px] text-muted-foreground sm:inline">⌘K</kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-foreground/25 px-4 pt-[12vh]"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false)
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Search tickers"
            className="w-full max-w-lg border border-rule bg-card shadow-[0_24px_60px_-24px_rgba(26,22,18,0.45)]"
          >
            <div className="flex items-center gap-3 border-b border-border px-4">
              <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing || e.keyCode === 229) return
                  if (e.key === "ArrowDown") {
                    e.preventDefault()
                    setActive((i) => Math.min(i + 1, results.length - 1))
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault()
                    setActive((i) => Math.max(i - 1, 0))
                  } else if (e.key === "Enter" && results[active]) {
                    e.preventDefault()
                    go(results[active].symbol)
                  }
                }}
                placeholder="Ticker or company name…"
                className="w-full bg-transparent py-3.5 font-mono text-sm outline-none placeholder:font-sans placeholder:text-muted-foreground"
                aria-label="Ticker or company name"
              />
            </div>

            <ul className="max-h-72 overflow-y-auto">
              {results.map((t, i) => (
                <li key={t.symbol}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(t.symbol)}
                    className={`flex w-full items-baseline gap-3 px-4 py-2.5 text-left ${
                      i === active ? "bg-muted" : ""
                    }`}
                  >
                    <span className="w-16 shrink-0 font-mono text-xs font-medium">{t.symbol}</span>
                    <span className="truncate text-sm text-muted-foreground">{t.name}</span>
                    <span
                      className={`tnum ml-auto shrink-0 font-mono text-xs ${
                        t.direction === "up" ? "text-bull" : "text-bear"
                      }`}
                    >
                      {formatChange(t.change_pct)}
                    </span>
                  </button>
                </li>
              ))}
              {query.trim() && results.length === 0 && (
                <li className="px-4 py-6 text-center text-sm text-muted-foreground">No tickers match that search.</li>
              )}
              {!query.trim() && (
                <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                  Start typing to find a company or symbol.
                </li>
              )}
            </ul>
          </div>
        </div>
      )}
    </>
  )
}
