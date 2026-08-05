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

/** Fast Groq model used to classify articles and confirm event clusters. */
export const CLASSIFICATION_MODEL = "openai/gpt-oss-20b"

/** Groq model used for final market-impact analysis of confirmed clusters. */
export const ANALYSIS_MODEL = "openai/gpt-oss-120b"

/** Public RSS feeds; an unavailable publisher only degrades that one source. */
export const RSS_FEEDS = [
  { outlet: "CNBC (Google News)", url: "https://news.google.com/rss/search?q=site%3Acnbc.com%2Ffinance%20when%3A1d&hl=en-US&gl=US&ceid=US%3Aen" },
  { outlet: "Financial Times", url: "https://www.ft.com/markets?format=rss" },
  { outlet: "MarketWatch", url: "https://feeds.content.dowjones.io/public/rss/mw_topstories" },
  { outlet: "Reuters (Google News)", url: "https://news.google.com/rss/search?q=site%3Areuters.com%2Fmarkets%20when%3A1d&hl=en-US&gl=US&ceid=US%3Aen" },
  { outlet: "Yahoo Finance", url: "https://finance.yahoo.com/news/rssindex" },
  { outlet: "Wall Street Journal", url: "https://news.google.com/rss/search?q=site%3Awsj.com%2Ffinance%20when%3A1d&hl=en-US&gl=US&ceid=US%3Aen" },
  { outlet: "Investing.com", url: "https://news.google.com/rss/search?q=site%3Ainvesting.com%2Fnews%20when%3A1d&hl=en-US&gl=US&ceid=US%3Aen" },
  { outlet: "AP Business", url: "https://news.google.com/rss/search?q=site%3Aapnews.com%2Fbusiness%20when%3A1d&hl=en-US&gl=US&ceid=US%3Aen" },
] as const

/** Ingest tuning. Kept small enough to stay inside free-tier rate limits. */
export const INGEST = {
  /** Company-news symbols polled per 15-min run (rotates across runs). */
  companySymbolsPerRun: 6,
  /** Maximum fresh RSS articles considered per run. */
  maxArticlesPerRun: 60,
  /** Classification batches stay below free-tier token pressure. */
  classificationBatchSize: 5,
  /** Cache every RSS article/classification for this long. */
  articleCacheDays: 7,
  /** Candidate articles can cluster across this rolling window. */
  clusterWindowHours: 36,
  /**
   * Per-run Groq guardrails (estimated plus returned usage). Classification
   * and analysis hold INDEPENDENT pools: sharing one ceiling let a busy
   * classification pass consume the whole budget and starve analysis, so no
   * stories were ever produced on high-volume runs.
   */
  classificationTokenBudget: 60_000,
  analysisTokenBudget: 35_000,
  /** Output ceiling per classification batch; must fit every batch item. */
  classificationMaxTokens: 2_000,
  /** Output ceiling for a single cluster analysis. */
  analysisMaxTokens: 650,
  minimumClassificationConfidence: 0.78,
  /** Articles older than this are ignored. */
  articleMaxAgeHours: 24,
  /** Minimum articles required to form a story. */
  minSourcesPerStory: 1,
  /** Sources persisted per story (UI shows a handful). */
  maxSourcesPerStory: 4,
  /** Outlets whose feeds are mostly aggregation spam. */
  blockedOutlets: new Set(["MarketWatch Automated", "Zacks Investment Research"]),
} as const
