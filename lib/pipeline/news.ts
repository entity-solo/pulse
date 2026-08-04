import { INGEST, RSS_FEEDS } from "./config"

export type Article = { headline: string; summary: string; outlet: string; url: string; publishedAt: string; relatedSymbol: string | null }
type RssItem = Omit<Article, "outlet" | "relatedSymbol">

function clean(value: string) {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1").replace(/<[^>]+>/g, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/\s+/g, " ").trim()
}
function tag(block: string, name: string) { return clean(block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"))?.[1] ?? "") }
function link(block: string, atom: boolean) {
  if (!atom) return tag(block, "link")
  for (const match of block.matchAll(/<link\s+([^>]+)>/gi)) { const href = match[1].match(/href=["']([^"']+)["']/i)?.[1]; const rel = match[1].match(/rel=["']([^"']+)["']/i)?.[1]; if (href && (!rel || rel === "alternate")) return href }
  return ""
}
function url(value: string) { try { const result = new URL(clean(value)); for (const key of [...result.searchParams.keys()]) if (/^(utm_|guce_referrer|ncid)/i.test(key)) result.searchParams.delete(key); result.hash = ""; return result.toString() } catch { return "" } }
function date(value: string) { const result = new Date(value); const hours = (Date.now() - result.getTime()) / 3_600_000; return Number.isFinite(result.getTime()) && hours <= INGEST.articleMaxAgeHours && hours >= -1 ? result.toISOString() : null }
function parse(xml: string): RssItem[] {
  return [...xml.matchAll(/<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi)].flatMap((match) => { const atom = match[1].toLowerCase() === "entry"; const headline = tag(match[2], "title"); const publishedAt = date(tag(match[2], "pubDate") || tag(match[2], "published") || tag(match[2], "updated")); const articleUrl = url(link(match[2], atom)); const summary = (tag(match[2], "description") || tag(match[2], "summary") || tag(match[2], "content")).slice(0, 600); return headline && articleUrl && publishedAt ? [{ headline, url: articleUrl, publishedAt, summary }] : [] })
}
async function fetchFeed(feed: (typeof RSS_FEEDS)[number]) { const response = await fetch(feed.url, { cache: "no-store", headers: { Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml", "User-Agent": "Pulse/0.1 news aggregator" }, signal: AbortSignal.timeout(15_000) }); if (!response.ok) throw new Error(`${response.status} ${response.statusText}`); return parse(await response.text()).map((article) => ({ ...article, outlet: feed.outlet, relatedSymbol: null as string | null })) }

/** Pulls major-outlet RSS feeds and returns a de-duplicated, recent batch. */
export async function fetchArticles(knownUrls: Set<string>): Promise<{ articles: Article[]; errors: string[] }> {
  const collected: Article[] = []; const errors: string[] = []; const results = await Promise.allSettled(RSS_FEEDS.map(fetchFeed))
  results.forEach((result, index) => { if (result.status === "fulfilled") collected.push(...result.value); else errors.push(`${RSS_FEEDS[index].outlet}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`) })
  const urls = new Set<string>(), headlines = new Set<string>(), articles: Article[] = []
  for (const article of collected.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))) { const key = article.headline.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 120); if (knownUrls.has(article.url) || urls.has(article.url) || headlines.has(key)) continue; urls.add(article.url); headlines.add(key); articles.push(article); if (articles.length >= INGEST.maxArticlesPerRun) break }
  return { articles, errors }
}