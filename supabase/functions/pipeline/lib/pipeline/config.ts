import type { Sector } from "../types.ts"
import { US_EQUITIES_SYMBOLS } from "./markets/us-equities.ts"

/**
 * The ticker universe is owned by the `tickers` table, not by this file.
 * These maps only describe HOW to price each symbol, because no single free
 * provider covers equities, indices, FX, rates, metals and crypto at once.
 */

/** Symbols Finnhub quotes directly (US equities). Refreshed every 15 min. */
export const EQUITY_SYMBOLS = US_EQUITIES_SYMBOLS

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

/** Fast Groq model used to resolve uncertain filter decisions. */
export const CLASSIFICATION_MODEL = "llama-3.1-8b-instant"

/** Groq model used for final market-impact analysis of confirmed clusters. */
export const ANALYSIS_MODEL = "llama-3.1-8b-instant"

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
  { outlet: "Seeking Alpha", url: "https://news.google.com/rss/search?q=site%3Aseekingalpha.com%2Fnews%20when%3A1d&hl=en-US&gl=US&ceid=US%3Aen" },
  { outlet: "Barron's", url: "https://news.google.com/rss/search?q=site%3Abarrons.com%20when%3A1d&hl=en-US&gl=US&ceid=US%3Aen" },
  { outlet: "Benzinga", url: "https://news.google.com/rss/search?q=site%3Abenzinga.com%2Fnews%20when%3A1d&hl=en-US&gl=US&ceid=US%3Aen" },
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
  /** Similarity threshold tuning for multi-source event clustering. */
  clusterMinSharedWords: 2,
  clusterMinOverlap: 0.25,
  /**
   * Per-run Groq guardrails (estimated plus returned usage). Filter and
   * analysis hold INDEPENDENT pools: sharing one ceiling let a busy filter
   * pass consume the whole budget and starve analysis, so no stories were
   * ever produced on high-volume runs.
   */
  classificationTokenBudget: Number(Deno.env.get("CLASSIFICATION_TOKEN_BUDGET")) || 60_000,
  analysisTokenBudget: Number(Deno.env.get("ANALYSIS_TOKEN_BUDGET")) || 35_000,
  /** Output ceiling per uncertain-filter batch decision. */
  classificationMaxTokens: 2_000,
  /** Output ceiling for a single cluster analysis. */
  analysisMaxTokens: 650,
  minimumClassificationConfidence: 0.60,
  /** Articles older than this are ignored. Always covers full cluster window with 6h margin. */
  articleMaxAgeHours: 36 + 6,
  /** Minimum articles required to form a story. */
  minSourcesPerStory: 1,
  /** Sources persisted per story (UI shows a handful). */
  maxSourcesPerStory: 4,
  /** Outlets whose feeds are mostly aggregation spam. */
  blockedOutlets: new Set(["MarketWatch Automated", "Zacks Investment Research"]),
} as const

/**
 * Step 2 of the analyze job — relevance filter against financial anchors.
 *
 * An article's embedding is compared (cosine) against every anchor embedding.
 *   - best score >= relevantThreshold  -> relevant, skip Groq
 *   - best score <  irrelevantThreshold -> irrelevant, log + delete
 *   - otherwise                         -> uncertain, let Groq decide (call #1)
 * This is the ONLY per-article Groq call; the second (analysis) happens once
 * per stable cluster, so no article can exceed two Groq calls.
 */
export const FILTER = {
  /** Cosine >= this: clearly financial, keep without asking Groq. */
  relevantThreshold: 0.70,
  /** Cosine < this: clearly non-financial, reject without asking Groq. */
  irrelevantThreshold: 0.50,
  /** Articles scored between the two thresholds go to Groq. */
  uncertainUsesGroq: true,
  /** Max articles filtered per analyze run. */
  maxPerRun: 100,
  /** A rejected article is retried as 'failed' only after this backoff. */
  failedRetryMinutes: 60,
} as const

/**
 * Anchor topics for the relevance filter. Each string is embedded with the
 * same gte-small model and held for the lifetime of the run. Tuning note:
 * the 0.7 / 0.5 thresholds can be re-derived from `article_rejections` once
 * enough rejection history exists (see gap analysis).
 */
export const FINANCIAL_ANCHORS = [
  { label: "equity", text: "A report on stock prices, equity markets, and the shares of publicly traded companies." },
  { label: "earnings", text: "A company quarterly earnings report, revenue, profit, guidance, or financial results." },
  { label: "macro", text: "Macroeconomic news about GDP, inflation, unemployment, monetary policy, or the Federal Reserve." },
  { label: "rates", text: "Government bond yields, central bank interest rate decisions, and fixed income markets." },
  { label: "mergers", text: "Mergers, acquisitions, takeovers, dealmaking, and corporate restructuring." },
  { label: "ipo", text: "Initial public offerings, stock listings, and new share sales by companies." },
  { label: "commodities", text: "Oil, gas, gold, metals, and other commodity prices and futures markets." },
  { label: "crypto", text: "Bitcoin, ether, and cryptocurrency prices and digital asset markets." },
  { label: "forex", text: "Currency exchange rates, foreign exchange markets, and the US dollar index." },
  { label: "banks", text: "Banking sector news, financial institutions, lending, and credit markets." },
  { label: "regulation", text: "Financial regulation, securities law, antitrust action, and government oversight of companies and markets." },
  { label: "tech", text: "Technology industry news, semiconductor companies, and the technology sector." },
  { label: "consumer", text: "Retail sales, consumer spending, and consumer goods companies." },
  { label: "energy", text: "Energy sector news, oil and gas producers, and energy markets." },
  { label: "healthcare", text: "Healthcare and pharmaceutical company news, drug approvals, and biotechnology." },
  { label: "trade", text: "International trade, tariffs, and trade policy." },
  { label: "analyst", text: "Analyst ratings, price target changes, and stock investment recommendations." },
  { label: "geopolitics", text: "Geopolitical events, sanctions, and government actions that affect financial markets." },
] as const

/**
 * Step 3 of the analyze job — event clustering (NOT ticker/topic clustering).
 *
 * Open clusters persist in `pipeline_clusters` so a single event can grow
 * across the 15-minute runs. A new article joins an open cluster when its
 * embedding is similar to the centroid (recent window) OR its title overlaps
 * with the cluster headline (long-running events that outlive the window).
 * A cluster is stable when it reaches >= minArticlesPerCluster articles or
 * has been idle for stableIdleMinutes; stable clusters are analyzed once.
 */
export const CLUSTER = {
  /** Rolling window in hours during which embeddings may cluster. */
  windowHours: 48,
  /** Cosine similarity to the centroid required to join a recent cluster. */
  minEmbedSimilarity: 0.82,
  /** Lexical title overlap that lets a >48h event keep absorbing coverage. */
  titleMatchThreshold: 0.55,
  /** Cluster becomes stable once it has this many member articles. */
  minArticlesPerCluster: 2,
  /** Cluster becomes stable after this much inactivity (even with 1 article). */
  stableIdleMinutes: 30,
  /** Articles fed to Groq per cluster, nearest to the centroid first. */
  analysisTopN: 5,
  /** Max distance (<=>) to accept when matching an already-published story. */
  existingStoryMaxDistance: 0.15,
  /** Groq analysis for a cluster is retried as 'failed' only after this backoff. */
  analysisRetryMinutes: 30,
  /** Max articles processed through cluster assignment per run. */
  maxPerRun: 120,
} as const

/** Step 1 of the analyze job — embeddings (gte-small via Edge Function). */
export const EMBED = {
  /** Max articles embedded per analyze run. */
  maxPerRun: 60,
  /** Concurrent Edge Function invocations. */
  concurrency: 4,
  /** A 'claiming' row older than this is reclaimed by the next run. */
  staleClaimMinutes: 30,
} as const

/** Prompt construction limits (keep Groq contexts within free-tier windows). */
export const PROMPT = {
  /** Per-article char budget fed into the cluster analysis prompt. */
  maxCharsPerArticle: 600,
  /** Total char budget for one cluster analysis prompt. */
  clusterPromptMaxChars: 9_000,
  /** Total char budget for one uncertain-filter decision prompt. */
  filterPromptMaxChars: 4_000,
} as const

/** Single-flight run locks so overlapping cron invocations cannot double-process. */
export const LOCK = {
  /** pipeline:analyze holds the lock for up to 5 minutes. */
  analyzeSeconds: 5 * 60,
  /** news:ingest lock. */
  ingestSeconds: 10 * 60,
  /** quotes:sync lock. */
  quotesSeconds: 10 * 60,
} as const

/** Nightly housekeeping (runs at the start of every analyze run, idempotent). */
export const GC = {
  /** Clusters finished/merged/failed are dropped after this many days. */
  clusterRetentionDays: 7,
  /** article_rejections kept this long so filter thresholds can be tuned. */
  rejectionRetentionDays: 30,
  /** ingest_runs kept this long. */
  runRetentionDays: 14,
} as const
