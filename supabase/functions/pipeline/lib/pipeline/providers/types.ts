import type { Article } from "../news.ts"
import type { QuoteUpdate } from "../quotes.ts"

export interface IQuoteProvider {
  readonly name: string
  readonly market: string
  fetchQuotes(): Promise<{ quotes: QuoteUpdate[]; errors: string[] }>
}

export interface INewsProvider {
  readonly name: string
  readonly market: string
  fetchArticles(knownUrls?: Set<string>, limit?: number): Promise<{ articles: Article[]; errors: string[] }>
}

export interface ITickerUniverse {
  readonly market: string
  getSymbols(): string[]
  getAliases(): Record<string, readonly string[]>
  getCandidates(headline: string, summary: string): string[]
}
