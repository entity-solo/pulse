import { defaultRegistry } from "./providers/registry.ts"
import type { INewsProvider } from "./providers/types.ts"

export type Article = { headline: string; summary: string; outlet: string; url: string; publishedAt: string; relatedSymbol: string | null }

export const ALLOWED_DOMAINS = [
  "reuters.com",
  "ft.com",
  "wsj.com",
  "cnbc.com",
  "bloomberg.com",
  "marketwatch.com",
  "investing.com",
  "finance.yahoo.com",
  "seekingalpha.com",
  "apnews.com",
  "barrons.com",
  "benzinga.com",
  "google.com",
] as const

export const FINANCIAL_KEYWORDS = [
  "stock", "share", "market", "price", "earnings", "revenue", "profit", "rate", "bond", "fed",
  "gdp", "inflation", "ipo", "merger", "acquisition", "quarter", "fiscal", "trading", "investor",
  "fund", "equity", "crypto", "rally", "surge", "plunge", "beat", "miss", "guidance", "outlook",
] as const

export function isWhitelistedDomain(url: string): boolean {
  const lower = url.toLowerCase()
  return ALLOWED_DOMAINS.some((domain) => lower.includes(domain))
}

export function hasFinancialKeyword(headline: string, summary: string): boolean {
  const text = ` ${headline} ${summary} `.toLowerCase()
  return FINANCIAL_KEYWORDS.some((kw) => text.includes(kw))
}

export function passesPreFilters(headline: string, summary: string, url: string): boolean {
  return isWhitelistedDomain(url) && hasFinancialKeyword(headline, summary)
}

/** Pulls news articles across all registered INewsProviders (delegated to defaultRegistry). */
export async function fetchArticles(knownUrls: Set<string> = new Set(), limit?: number): Promise<{ articles: Article[]; errors: string[] }> {
  const providers = defaultRegistry.getNewsProviders()
  const collected: Article[] = []
  const errors: string[] = []

  for (const provider of providers) {
    try {
      const res = await provider.fetchArticles(knownUrls, limit)
      collected.push(...res.articles)
      errors.push(...res.errors)
    } catch (err) {
      errors.push(`${provider.name}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const urls = new Set<string>()
  const headlines = new Set<string>()
  const articles: Article[] = []

  for (const article of collected.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))) {
    const key = article.headline.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 120)
    if (knownUrls.has(article.url) || urls.has(article.url) || headlines.has(key)) continue
    urls.add(article.url)
    headlines.add(key)
    articles.push(article)
    if (limit && articles.length >= limit) break
  }

  return { articles, errors }
}