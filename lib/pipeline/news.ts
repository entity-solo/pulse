import { INGEST, RSS_FEEDS } from "./config"

export type Article = { headline: string; summary: string; outlet: string; url: string; publishedAt: string; relatedSymbol: string | null }
type RssItem = Omit<Article, "relatedSymbol">

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

function unescapeHtml(text: string): string {
  return text
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
}

function clean(value: string): string {
  if (!value) return ""
  let result = value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
  while (/<[^>]+>/.test(result)) {
    result = result.replace(/<[^>]+>/g, " ")
  }
  result = unescapeHtml(result)
  result = unescapeHtml(result)
  return result.replace(/\s+/g, " ").trim()
}

function tag(block: string, name: string) { return clean(block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"))?.[1] ?? "") }

function link(block: string, atom: boolean) {
  if (!atom) return tag(block, "link")
  for (const match of block.matchAll(/<link\s+([^>]+)>/gi)) { const href = match[1].match(/href=["']([^"']+)["']/i)?.[1]; const rel = match[1].match(/rel=["']([^"']+)["']/i)?.[1]; if (href && (!rel || rel === "alternate")) return href }
  return ""
}

function url(value: string) { try { const result = new URL(clean(value)); for (const key of [...result.searchParams.keys()]) if (/^(utm_|guce_referrer|ncid)/i.test(key)) result.searchParams.delete(key); result.hash = ""; return result.toString() } catch { return "" } }

function date(value: string) { const result = new Date(value); const hours = (Date.now() - result.getTime()) / 3_600_000; return Number.isFinite(result.getTime()) && hours <= INGEST.articleMaxAgeHours && hours >= -1 ? result.toISOString() : null }

function normalizeOutlet(defaultOutlet: string, sourceTag?: string): string {
  const name = (sourceTag || defaultOutlet).trim()
  if (/cnbc/i.test(name)) return "CNBC"
  if (/reuters/i.test(name)) return "Reuters"
  if (/wall street journal|wsj/i.test(name)) return "Wall Street Journal"
  if (/financial times|\bft\b/i.test(name)) return "Financial Times"
  if (/marketwatch/i.test(name)) return "MarketWatch"
  if (/yahoo/i.test(name)) return "Yahoo Finance"
  if (/investing\.com/i.test(name)) return "Investing.com"
  if (/ap news|associated press|ap business/i.test(name)) return "Associated Press"
  if (/bloomberg/i.test(name)) return "Bloomberg"
  return name.replace(/\s*\([^)]*\)\s*/g, "").trim() || defaultOutlet
}

function cleanHeadline(headline: string): string {
  return headline.replace(/\s+[-|]\s+[A-Za-z0-9.\s]+$/, "").trim() || headline
}

function parse(xml: string, defaultOutlet: string): RssItem[] {
  return [...xml.matchAll(/<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi)].flatMap((match) => {
    const atom = match[1].toLowerCase() === "entry"
    const block = match[2]
    const rawTitle = tag(block, "title")
    const headline = cleanHeadline(rawTitle)
    const publishedAt = date(tag(block, "pubDate") || tag(block, "published") || tag(block, "updated"))
    const articleUrl = url(link(block, atom))
    const summary = clean(tag(block, "description") || tag(block, "summary") || tag(block, "content")).slice(0, 600)
    const sourceOutlet = tag(block, "source")
    const outlet = normalizeOutlet(defaultOutlet, sourceOutlet)
    return headline && articleUrl && publishedAt ? [{ headline, summary, outlet, url: articleUrl, publishedAt }] : []
  })
}

async function fetchFeed(feed: (typeof RSS_FEEDS)[number]) {
  const response = await fetch(feed.url, {
    cache: "no-store",
    headers: {
      Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
      "User-Agent": "Pulse/0.1 news aggregator",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Pragma": "no-cache",
    },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
  return parse(await response.text(), feed.outlet).map((article) => ({ ...article, relatedSymbol: null as string | null }))
}

/** Pulls major-outlet RSS feeds and returns a de-duplicated, recent batch. */
export async function fetchArticles(knownUrls: Set<string> = new Set(), limit?: number): Promise<{ articles: Article[]; errors: string[] }> {
  const collected: Article[] = []; const errors: string[] = []; const results = await Promise.allSettled(RSS_FEEDS.map(fetchFeed))
  results.forEach((result, index) => { if (result.status === "fulfilled") collected.push(...result.value); else errors.push(`${RSS_FEEDS[index].outlet}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`) })
  const urls = new Set<string>(), headlines = new Set<string>(), articles: Article[] = []
  for (const article of collected.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))) {
    const key = article.headline.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 120)
    if (knownUrls.has(article.url) || urls.has(article.url) || headlines.has(key)) continue
    urls.add(article.url)
    headlines.add(key)
    articles.push(article)
    if (limit && articles.length >= limit) break
  }

  const newest5 = articles.slice(0, 5).map((a) => `${a.publishedAt} | [${a.outlet}] ${a.headline}`)
  console.log(`[news] Top 5 newest RSS articles fetched (${articles.length} total):\n` + newest5.map((line) => `  - ${line}`).join("\n"))

  return { articles, errors }
}