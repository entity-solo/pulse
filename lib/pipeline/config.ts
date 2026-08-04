import type { Sector } from "@/lib/types"

/**
 * The ticker universe is owned by the `tickers` table, not by this file.
 * These maps only describe HOW to price each symbol, because no single free
 * provider covers equities, indices, FX, rates, metals and crypto at once.
 */

/** Symbols Finnhub quotes directly (US equities). Refreshed every 15 min. */
export const EQUITY_SYMBOLS = [
  "NVDA",
  "AAPL",
  "MSFT",
  "TSLA",
  "AMZN",
  "GOOGL",
  "META",
  "JPM",
  "GS",
  "BAC",
  "WFC",
  "XOM",
  "CVX",
  "COP",
  "SLB",
] as const

/**
 * Non-equity symbols mapped to their Yahoo Finance chart symbol.
 * These return the true index / rate / spot level (not an ETF proxy), so the
 * stored price is the real quoted value. Refreshed hourly.
 */
export const MACRO_SYMBOL_MAP: Record<string, string> = {
  SPX: "^GSPC",
  NDX: "^NDX",
  DJI: "^DJI",
  VIX: "^VIX",
  BTC: "BTC-USD",
  XAU: "GC=F",
  DXY: "DX-Y.NYB",
  US10Y: "^TNX",
  EURUSD: "EURUSD=X",
  WTI: "CL=F",
}

/** Tickers the news clusterer is allowed to attach stories to. */
export const ALL_SYMBOLS = [...EQUITY_SYMBOLS, ...Object.keys(MACRO_SYMBOL_MAP)]

/** Symbols treated as macro context rather than single-name news. */
export const MACRO_SECTORS: Sector[] = ["macro", "index", "commodity"]

/** The Groq model used to cluster and analyze RSS coverage. */
export const ANALYSIS_MODEL = "llama3-70b-8192"

/** Public RSS feeds; an unavailable publisher only degrades that one source. */
export const RSS_FEEDS = [
  { outlet: "CNBC", url: "https://www.cnbc.com/id/10000664/device/rss/rss.xml" },
  { outlet: "Financial Times", url: "https://www.ft.com/markets?format=rss" },
  { outlet: "MarketWatch", url: "https://feeds.content.dowjones.io/public/rss/mw_topstories" },
  { outlet: "Reuters", url: "https://feeds.reuters.com/reuters/businessNews" },
  { outlet: "Yahoo Finance", url: "https://finance.yahoo.com/news/rssindex" },
] as const

/** Ingest tuning. Kept small enough to stay inside free-tier rate limits. */
export const INGEST = {
  /** Company-news symbols polled per 15-min run (rotates across runs). */
  companySymbolsPerRun: 6,
  /** Max articles handed to the model in one clustering pass. */
  maxArticlesPerRun: 40,
  /** Articles older than this are ignored. */
  articleMaxAgeHours: 24,
  /** Minimum articles required to form a story. */
  minSourcesPerStory: 2,
  /** Sources persisted per story (UI shows a handful). */
  maxSourcesPerStory: 4,
  /** Outlets whose feeds are mostly aggregation spam. */
  blockedOutlets: new Set(["MarketWatch Automated", "Zacks Investment Research"]),
} as const
