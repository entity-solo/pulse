import { MACRO_SYMBOL_MAP } from "../config"
import { US_EQUITIES_ALIASES, US_EQUITIES_SYMBOLS, US_EQUITIES_TICKERS } from "../markets/us-equities"
import { FinnhubQuoteProvider } from "./finnhub-quotes"
import { RssNewsProvider } from "./rss-news"
import { Sp500TickerUniverse } from "./sp500-universe"
import type { INewsProvider, IQuoteProvider, ITickerUniverse } from "./types"
import { YahooMacroQuoteProvider } from "./yahoo-macro-quotes"

export const MARKETS = {
  US_EQUITIES: {
    id: "us_equities",
    name: "US S&P 500 Equities (Finnhub)",
    symbols: US_EQUITIES_SYMBOLS,
    aliases: US_EQUITIES_ALIASES,
    tickers: US_EQUITIES_TICKERS,
  },
  MACRO: {
    id: "macro",
    name: "Global Macro Indices & Spot Rates",
    symbolMap: MACRO_SYMBOL_MAP,
    symbols: Object.keys(MACRO_SYMBOL_MAP),
  },
} as const

export class ProviderRegistry {
  private quoteProviders: IQuoteProvider[] = []
  private newsProviders: INewsProvider[] = []
  private tickerUniverses: ITickerUniverse[] = []

  registerQuoteProvider(provider: IQuoteProvider): this {
    this.quoteProviders.push(provider)
    return this
  }

  registerNewsProvider(provider: INewsProvider): this {
    this.newsProviders.push(provider)
    return this
  }

  registerTickerUniverse(universe: ITickerUniverse): this {
    this.tickerUniverses.push(universe)
    return this
  }

  getQuoteProviders(): readonly IQuoteProvider[] {
    return this.quoteProviders
  }

  getNewsProviders(): readonly INewsProvider[] {
    return this.newsProviders
  }

  getTickerUniverses(): readonly ITickerUniverse[] {
    return this.tickerUniverses
  }

  getAllSymbols(): string[] {
    return Array.from(new Set(this.tickerUniverses.flatMap((u) => u.getSymbols())))
  }

  getAllAliases(): Record<string, readonly string[]> {
    const combined: Record<string, readonly string[]> = {}
    for (const universe of this.tickerUniverses) {
      Object.assign(combined, universe.getAliases())
    }
    return combined
  }

  getCandidates(headline: string, summary: string): string[] {
    const candidateSet = new Set<string>()
    for (const universe of this.tickerUniverses) {
      for (const ticker of universe.getCandidates(headline, summary)) {
        candidateSet.add(ticker)
      }
    }

    const text = `${headline} ${summary}`
    const EXCLUDED_TERMS = new Set(["US", "AI", "CEO", "CFO", "CTO", "COO", "EBITDA", "EBIT", "GDP", "FDA", "SEC", "IPO", "RSS", "WSJ", "FT", "UK", "EU", "Q1", "Q2", "Q3", "Q4", "FY", "EST", "EDT", "UTC", "PST", "PDT", "ESG", "PR", "REUTERS", "AP", "BLOOMBERG", "CNBC", "BMO", "AMC", "EPS"])

    // Match (NYSE:TICKER), (NASDAQ:TICKER), (NYSE: TICKER), NYSE:TICKER, NASDAQ:TICKER
    const exchangeMatches = text.matchAll(/\b(?:NYSE|NASDAQ|AMEX|OTC|LON|TSX):\s*([A-Z]{1,5})\b/gi)
    for (const match of exchangeMatches) {
      const sym = match[1].toUpperCase()
      if (!EXCLUDED_TERMS.has(sym)) candidateSet.add(sym)
    }

    // Match (TICKER) in parentheses e.g. (NYSE:PAYC) or (PAYC)
    const parenMatches = text.matchAll(/\(([A-Z]{1,5})\)/g)
    for (const match of parenMatches) {
      const sym = match[1].toUpperCase()
      if (!EXCLUDED_TERMS.has(sym)) candidateSet.add(sym)
    }

    // Match $TICKER cashtags
    const cashtagMatches = text.matchAll(/\$([A-Z]{1,5})\b/g)
    for (const match of cashtagMatches) {
      const sym = match[1].toUpperCase()
      if (!EXCLUDED_TERMS.has(sym)) candidateSet.add(sym)
    }

    return Array.from(candidateSet)
  }
}

/** Default singleton instance containing built-in S&P 500, Finnhub, Yahoo, and RSS providers */
export const defaultRegistry = new ProviderRegistry()

// Register default providers
defaultRegistry
  .registerTickerUniverse(new Sp500TickerUniverse())
  .registerQuoteProvider(new FinnhubQuoteProvider())
  .registerQuoteProvider(new YahooMacroQuoteProvider())
  .registerNewsProvider(new RssNewsProvider())
