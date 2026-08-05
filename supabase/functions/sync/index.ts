import { createClient } from "npm:@supabase/supabase-js@2"

const EQUITIES = [
  "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "BRK.B", "LLY", "AVGO",
  "JPM", "WMT", "UNH", "V", "XOM", "MA", "ORCL", "COST", "HD", "PG",
  "JNJ", "NFLX", "BAC", "ABBV", "CRM", "CVX", "WFC", "KO", "TMUS", "CSCO",
  "PEP", "IBM", "MS", "ACN", "LIN", "MCD", "DIS", "ABT", "PM", "GE",
  "INTU", "QCOM", "DHR", "CAT", "AMD", "VRTX", "TXN", "BKNG", "AMAT", "PFE",
  "T", "NOW", "LOW", "AMGN", "C", "SPGI", "ISRG", "UNP", "GS", "COP",
  "HON", "CMCSA", "RTX", "PGR", "TJX", "EOG", "SCHW", "SYK", "BA", "ELV",
  "DE", "ADP", "VZ", "NKE", "BSX", "MMC", "LRCX", "ADBE", "BX", "PLTR",
  "GILD", "LMT", "MDLZ", "MU", "FI", "SBUX", "PANW", "REGN", "CB", "CI",
  "UPS", "PH", "KMI", "AMT", "SHW", "MO", "SLB", "CVS", "CDNS", "KKR"
] as const

const MACRO_SYMBOL_MAP: Record<string, string> = {
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

const ALLOWED_SYMBOLS = new Set([...EQUITIES, ...Object.keys(MACRO_SYMBOL_MAP)])
const SECTORS = ["tech", "finance", "energy", "macro"] as const
type Sector = (typeof SECTORS)[number]

const SECTOR_TICKER: Record<string, string> = {
  tech: "NDX",
  finance: "SPX",
  energy: "WTI",
  macro: "SPX",
}

const ALIASES: Record<string, string[]> = {
  AAPL: ["apple", "iphone", "mac", "ipad", "aapl", "tim cook"],
  MSFT: ["microsoft", "azure", "windows", "office", "msft", "satya nadella"],
  NVDA: ["nvidia", "geforce", "cuda", "nvda", "jensen huang"],
  AMZN: ["amazon", "aws", "prime", "amzn", "andy jassy"],
  GOOGL: ["alphabet", "google", "youtube", "deepmind", "googl", "goog", "sundar pichai"],
  META: ["meta", "facebook", "instagram", "whatsapp", "meta", "mark zuckerberg"],
  TSLA: ["tesla", "elon musk", "tsla", "cybertruck"],
  "BRK.B": ["berkshire hathaway", "berkshire", "warren buffett", "brk.b", "brk-b", "buffett"],
  LLY: ["eli lilly", "lilly", "lly", "zepbound", "mounjaro"],
  AVGO: ["broadcom", "avgo", "hock tan"],
  JPM: ["jpmorgan", "jpmorgan chase", "jpm", "jamie dimon"],
  WMT: ["walmart", "wmt", "doug mcmillon"],
  UNH: ["unitedhealth", "united health", "unh"],
  V: ["visa", "v"],
  XOM: ["exxon mobil", "exxon", "xom", "darren woods"],
  MA: ["mastercard", "ma"],
  ORCL: ["oracle", "orcl", "larry ellison"],
  COST: ["costco", "cost"],
  HD: ["home depot", "hd"],
  PG: ["procter & gamble", "p&g", "pg"],
  JNJ: ["johnson & johnson", "j&j", "jnj"],
  NFLX: ["netflix", "nflx"],
  BAC: ["bank of america", "bofa", "bac", "brian moynihan"],
  ABBV: ["abbvie", "abbv", "humira"],
  CRM: ["salesforce", "crm", "marc benioff"],
  CVX: ["chevron", "cvx", "mike wirth"],
  WFC: ["wells fargo", "wfc", "charlie scharf"],
  KO: ["coca-cola", "coke", "ko"],
  TMUS: ["t-mobile", "tmus"],
  CSCO: ["cisco", "cisco systems", "csco"],
  PEP: ["pepsico", "pepsi", "pep"],
  IBM: ["ibm", "arvind krishna"],
  MS: ["morgan stanley", "ms", "ted pick"],
  ACN: ["accenture", "acn"],
  LIN: ["linde", "lin"],
  MCD: ["mcdonald's", "mcdonalds", "mcd"],
  DIS: ["disney", "walt disney", "dis", "bob iger"],
  ABT: ["abbott", "abbott laboratories", "abt"],
  PM: ["philip morris", "pm"],
  GE: ["general electric", "ge", "ge aerospace"],
  INTU: ["intuit", "turbotax", "quickbooks", "intu"],
  QCOM: ["qualcomm", "snapdragon", "qcom"],
  DHR: ["danaher", "dhr"],
  CAT: ["caterpillar", "cat"],
  AMD: ["amd", "advanced micro devices", "radeon", "ryzen", "lisa su"],
  VRTX: ["vertex", "vertex pharmaceuticals", "vrtx"],
  TXN: ["texas instruments", "txn"],
  BKNG: ["booking holdings", "booking.com", "bkng", "priceline"],
  AMAT: ["applied materials", "amat"],
  PFE: ["pfizer", "pfe", "albert bourla"],
  T: ["at&t", "t"],
  NOW: ["servicenow", "now", "bill mcdermott"],
  LOW: ["lowe's", "lowes", "low"],
  AMGN: ["amgen", "amgn"],
  C: ["citigroup", "citi", "c", "jane fraser"],
  SPGI: ["s&p global", "spgi"],
  ISRG: ["intuitive surgical", "isrg", "da vinci"],
  UNP: ["union pacific", "unp"],
  GS: ["goldman sachs", "goldman", "gs", "david solomon"],
  COP: ["conocophillips", "cop"],
  HON: ["honeywell", "hon"],
  CMCSA: ["comcast", "cmcsa", "xfinity"],
  RTX: ["rtx", "raytheon", "pratt & whitney"],
  PGR: ["progressive", "pgr"],
  TJX: ["tjx", "tj maxx", "marshalls"],
  EOG: ["eog resources", "eog"],
  SCHW: ["charles schwab", "schwab", "schw"],
  SYK: ["stryker", "syk"],
  BA: ["boeing", "ba", "737 max", "kelly ortberg"],
  ELV: ["elevance health", "anthem", "elv"],
  DE: ["deere", "john deere", "de"],
  ADP: ["adp"],
  VZ: ["verizon", "vz"],
  NKE: ["nike", "nke", "air jordan"],
  BSX: ["boston scientific", "bsx"],
  MMC: ["marsh mclennan", "marsh & mclennan", "mmc"],
  LRCX: ["lam research", "lrcx"],
  ADBE: ["adobe", "photoshop", "adbe", "shantanu narayen"],
  BX: ["blackstone", "bx", "stephen schwarzman"],
  PLTR: ["palantir", "pltr", "palantir technologies", "alex karp"],
  GILD: ["gilead", "gilead sciences", "gild"],
  LMT: ["lockheed martin", "lockheed", "lmt"],
  MDLZ: ["mondelez", "mdlz", "oreo"],
  MU: ["micron", "micron technology", "mu"],
  FI: ["fiserv", "fi", "fisv"],
  SBUX: ["starbucks", "sbux", "brian niccol"],
  PANW: ["palo alto networks", "panw", "nikesh arora"],
  REGN: ["regeneron", "regn", "dupixent"],
  CB: ["chubb", "cb"],
  CI: ["cigna", "ci"],
  UPS: ["ups", "united parcel service", "carol tomé"],
  PH: ["parker hannifin", "ph"],
  KMI: ["kinder morgan", "kmi"],
  AMT: ["american tower", "amt"],
  SHW: ["sherwin-williams", "shw"],
  MO: ["altria", "mo", "marlboro"],
  SLB: ["schlumberger", "slb"],
  CVS: ["cvs", "cvs health"],
  CDNS: ["cadence", "cdns"],
  KKR: ["kkr"],
}

const STOP_WORDS = new Set([
  "a", "about", "above", "after", "again", "against", "all", "am", "an", "and", "any", "are", "aren't", "as", "at",
  "be", "because", "been", "before", "being", "below", "between", "both", "but", "by", "can't", "cannot", "could",
  "couldn't", "did", "didn't", "do", "does", "doesn't", "doing", "don't", "down", "during", "each", "few", "for",
  "from", "further", "had", "hadn't", "has", "hasn't", "have", "haven't", "having", "he", "he'd", "he'll", "he's",
  "her", "here", "here's", "hers", "herself", "him", "himself", "his", "how", "how's", "i", "i'd", "i'll", "i'm",
  "i've", "if", "in", "into", "is", "isn't", "it", "it's", "its", "itself", "let's", "me", "more", "most", "mustn't",
  "my", "myself", "no", "nor", "not", "of", "off", "on", "once", "only", "or", "other", "ought", "our", "ours",
  "ourselves", "out", "over", "own", "same", "shan't", "she", "she'd", "she'll", "she's", "should", "shouldn't",
  "so", "some", "such", "than", "that", "that's", "the", "their", "theirs", "them", "themselves", "then", "there",
  "there's", "these", "they", "they'd", "they'll", "they're", "they've", "this", "those", "through", "to", "too",
  "under", "until", "up", "very", "was", "wasn't", "we", "we'd", "we'll", "we're", "we've", "were", "weren't",
  "what", "what's", "when", "when's", "where", "where's", "which", "while", "who", "who's", "whom", "why", "why's",
  "with", "won't", "would", "wouldn't", "you", "you'd", "you'll", "you're", "you've", "your", "yours", "yourself",
  "yourselves", "stock", "shares", "market", "company", "reports", "earnings"
])

const FEEDS = [
  { outlet: "CNBC (Google News)", url: "https://news.google.com/rss/search?q=site%3Acnbc.com%2Ffinance%20when%3A1d&hl=en-US&gl=US&ceid=US%3Aen" },
  { outlet: "Financial Times", url: "https://www.ft.com/markets?format=rss" },
  { outlet: "MarketWatch", url: "https://feeds.content.dowjones.io/public/rss/mw_topstories" },
  { outlet: "Reuters (Google News)", url: "https://news.google.com/rss/search?q=site%3Areuters.com%2Fmarkets%20when%3A1d&hl=en-US&gl=US&ceid=US%3Aen" },
  { outlet: "Yahoo Finance", url: "https://finance.yahoo.com/news/rssindex" },
  { outlet: "Wall Street Journal", url: "https://news.google.com/rss/search?q=site%3Awsj.com%2Ffinance%20when%3A1d&hl=en-US&gl=US&ceid=US%3Aen" },
  { outlet: "Investing.com", url: "https://news.google.com/rss/search?q=site%3Ainvesting.com%2Fnews%20when%3A1d&hl=en-US&gl=US&ceid=US%3Aen" },
  { outlet: "AP Business", url: "https://news.google.com/rss/search?q=site%3Aapnews.com%2Fbusiness%20when%3A1d&hl=en-US&gl=US&ceid=US%3Aen" },
] as const

const ALLOWED_DOMAINS = [
  "reuters.com", "ft.com", "wsj.com", "cnbc.com", "bloomberg.com", "marketwatch.com",
  "investing.com", "finance.yahoo.com", "seekingalpha.com", "apnews.com", "barrons.com"
] as const

const FINANCIAL_KEYWORDS = [
  "stock", "share", "market", "price", "earnings", "revenue", "profit", "rate", "bond", "fed",
  "gdp", "inflation", "ipo", "merger", "acquisition", "quarter", "fiscal", "trading", "investor",
  "fund", "equity", "crypto", "rally", "surge", "plunge", "beat", "miss", "guidance", "outlook"
] as const

function passesPreFilters(headline: string, summary: string, url: string): boolean {
  const lowerUrl = url.toLowerCase()
  const whitelisted = ALLOWED_DOMAINS.some((domain) => lowerUrl.includes(domain))
  if (!whitelisted) return false
  const text = ` ${headline} ${summary} `.toLowerCase()
  return FINANCIAL_KEYWORDS.some((kw) => text.includes(kw))
}

const CONFIG = {
  maxArticlesPerRun: 15,
  classificationBatchSize: 5,
  classificationTokenBudget: 25_000,
  analysisTokenBudget: 15_000,
  classificationMaxTokens: 2_000,
  analysisMaxTokens: 650,
  minimumClassificationConfidence: 0.78,
  articleMaxAgeHours: 24,
  clusterWindowHours: 36,
  clusterMinSharedWords: 2,
  clusterMinOverlap: 0.25,
  minSourcesPerStory: 1,
  maxSourcesPerStory: 4,
} as const

type Article = { headline: string; summary: string; outlet: string; url: string; publishedAt: string; relatedSymbol: string | null }
type Sentiment = "bull" | "bear" | "neut"
type ClassifiedArticle = { article: Article; classification: { kind: "ticker" | "sector" | "none"; value?: string; confidence?: number; evidence?: string } }
type ClusteredEvent = { event_key: string; event_label: string; ticker: string; is_macro: boolean; sentiment: Sentiment; title: string; summary: string; sources: Array<{ article: Article; angle: Sentiment }>; publishedAt: string }
type Budget = { used: number; limit: number }
type Result = { job: string; status: "ok" | "partial" | "error"; quotesUpdated: number; articlesSeen: number; storiesUpserted: number; sourcesUpserted: number; tokensUsed: number; errors: string[]; warnings: string[] }

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

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

function normalize(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() }
function words(value: string) { return new Set(normalize(value).split(" ").filter((w) => w.length > 2 && !STOP_WORDS.has(w))) }
function sharedWordsCount(left: string, right: string) { const a = words(left), b = words(right); let shared = 0; for (const w of a) if (b.has(w)) shared++; return shared }
function overlap(left: string, right: string) { const a = words(left), b = words(right); if (!a.size || !b.size) return 0; let shared = 0; for (const w of a) if (b.has(w)) shared++; return shared / Math.max(1, Math.min(a.size, b.size)) }
function isLexicallySimilar(left: string, right: string) { return sharedWordsCount(left, right) >= CONFIG.clusterMinSharedWords && overlap(left, right) >= CONFIG.clusterMinOverlap }
function titleSimilarity(left: string, right: string) { return overlap(left, right) }
function hash(value: string) { let h = 2_166_136_261; for (let i = 0; i < value.length; i++) { h ^= value.charCodeAt(i); h = Math.imul(h, 16_777_619) } return (h >>> 0).toString(16) }
function articleHash(a: Article) { return hash(`${a.url}\n${a.headline}\n${a.summary}`) }
function windowBucket(d: string) { return Math.floor(new Date(d).getTime() / (CONFIG.clusterWindowHours * 3_600_000)) }

function deriveDeterministicEventKey(ticker: string, sourceUrls: string[]): string {
  const sortedUrls = [...sourceUrls].sort().join("|")
  const keyHash = hash(`${ticker}:${sortedUrls}`)
  const cleanTicker = ticker.toLowerCase().replace(/[^a-z0-9]+/g, "-")
  return `${cleanTicker}-${keyHash}`
}

function parseJson(text: string) { const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""); const start = trimmed.indexOf("{"); const end = trimmed.lastIndexOf("}"); return JSON.parse(start >= 0 && end >= start ? trimmed.slice(start, end + 1) : trimmed) }

function candidates(article: Article) {
  const text = ` ${normalize(`${article.headline} ${article.summary}`)} `
  return Object.entries(ALIASES).flatMap(([ticker, names]) => names.some((name) => text.includes(` ${normalize(name)} `)) ? [ticker] : [])
}

function catalogue(rows: Article[], candidateSets?: string[][]) { return rows.map((article, index) => `[${index}] candidates=${candidateSets?.[index]?.join(",") || "none"} ${article.headline}${article.summary ? ` — ${article.summary.slice(0, 350)}` : ""}`).join("\n") }

async function groqJson(apiKey: string, model: string, system: string, prompt: string, budget: Budget, maxTokens: number): Promise<unknown> {
  const estimated = Math.ceil((system.length + prompt.length) / 4) + maxTokens
  if (budget.used + estimated > budget.limit) throw new Error(`token budget exhausted (${budget.used}/${budget.limit})`)
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: model === "openai/gpt-oss-20b" ? 0 : 0.2,
      response_format: { type: "json_object" },
      max_tokens: maxTokens,
      messages: [{ role: "system", content: system }, { role: "user", content: prompt }]
    }),
    signal: AbortSignal.timeout(10_000)
  })
  if (response.status === 429) throw new Error("Groq 429 rate limit reached (will retry on next run)")
  if (!response.ok) throw new Error(`Groq ${response.status}: ${await response.text()}`)
  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }>; usage?: { total_tokens?: number } }
  budget.used += data.usage?.total_tokens ?? estimated
  return parseJson(data.choices?.[0]?.message?.content ?? "{}")
}

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
  let cleaned = headline.replace(/\s+By\s+Investing\.com.*$/i, "")
  cleaned = cleaned.replace(/\s+[-|]\s+(?:Investing\.com|WSJ|MarketWatch|Reuters|CNBC|FT|AP|Bloomberg).*/i, "")
  cleaned = cleaned.replace(/\s+[-|]\s+[A-Za-z0-9.\s]+$/, "")
  return cleaned.trim() || headline
}

function link(block: string, atom: boolean) {
  if (!atom) return tag(block, "link")
  for (const match of block.matchAll(/<link\s+([^>]+)>/gi)) { const href = match[1].match(/href=["']([^"']+)["']/i)?.[1]; const rel = match[1].match(/rel=["']([^"']+)["']/i)?.[1]; if (href && (!rel || rel === "alternate")) return href }
  return ""
}

function cleanUrl(value: string) { try { const result = new URL(clean(value)); for (const key of [...result.searchParams.keys()]) if (/^(utm_|guce_referrer|ncid)/i.test(key)) result.searchParams.delete(key); result.hash = ""; return result.toString() } catch { return "" } }

function cleanDate(value: string) { const result = new Date(value); const hours = (Date.now() - result.getTime()) / 3_600_000; return Number.isFinite(result.getTime()) && hours <= CONFIG.articleMaxAgeHours && hours >= -1 ? result.toISOString() : null }

function parseFeed(xml: string, defaultOutlet: string): Article[] {
  return [...xml.matchAll(/<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi)].flatMap((match) => {
    const atom = match[1].toLowerCase() === "entry"
    const block = match[2]
    const rawTitle = tag(block, "title")
    const headline = cleanHeadline(rawTitle)
    const publishedAt = cleanDate(tag(block, "pubDate") || tag(block, "published") || tag(block, "updated"))
    const articleUrl = cleanUrl(link(block, atom))
    const summary = clean(tag(block, "description") || tag(block, "summary") || tag(block, "content")).slice(0, 600)
    const sourceOutlet = tag(block, "source")
    const outlet = normalizeOutlet(defaultOutlet, sourceOutlet)
    return headline && articleUrl && publishedAt ? [{ headline, summary, outlet, url: articleUrl, publishedAt, relatedSymbol: null }] : []
  })
}

async function fetchArticles(): Promise<{ articles: Article[]; errors: string[] }> {
  const collected: Article[] = []; const errors: string[] = []
  const results = await Promise.allSettled(FEEDS.map(async (feed) => {
    const response = await fetch(feed.url, {
      cache: "no-store",
      headers: {
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
        "User-Agent": "Pulse/0.1 news aggregator",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
      },
      signal: AbortSignal.timeout(15_000)
    })
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
    return parseFeed(await response.text(), feed.outlet)
  }))

  results.forEach((result, index) => {
    if (result.status === "fulfilled") collected.push(...result.value)
    else errors.push(`${FEEDS[index].outlet}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`)
  })

  const urls = new Set<string>(), headlines = new Set<string>(), articles: Article[] = []
  for (const article of collected.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))) {
    const key = article.headline.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 120)
    if (urls.has(article.url) || headlines.has(key)) continue
    urls.add(article.url)
    headlines.add(key)
    articles.push(article)
  }

  return { articles, errors }
}

async function fetchQuotes(finnhubKey: string) {
  const errors: string[] = []; const rows: any[] = []
  const update = (symbol: string, p: number, prev: number) => Number.isFinite(p) && p > 0 ? { symbol, price: Number(p.toFixed(4)), change_pct: Number(((Number.isFinite(prev) && prev > 0 ? (p - prev) / prev * 100 : 0)).toFixed(3)), direction: p < prev ? "dn" : "up" } : null

  for (let i = 0; i < EQUITIES.length; i += 5) {
    if (i > 0) await sleep(2000)
    const batch = EQUITIES.slice(i, i + 5)
    const equityResults = await Promise.allSettled(
      batch.map(async (s) => {
        const fs = s === "BRK.B" ? "BRK-B" : s === "FI" ? "FISV" : s
        for (let attempt = 0; attempt <= 2; attempt++) {
          try {
            const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(fs)}&token=${finnhubKey}`)
            if (r.status === 429 && attempt < 2) {
              await sleep(3000 * (attempt + 1))
              continue
            }
            const q = await r.json(), x = update(s, Number(q.c), Number(q.pc))
            if (!x) throw new Error("no price")
            x.change_pct = Number.isFinite(Number(q.dp)) ? Number(Number(q.dp).toFixed(3)) : x.change_pct
            x.direction = x.change_pct < 0 ? "dn" : "up"
            return x
          } catch (e: any) {
            if (attempt === 2) throw e
          }
        }
        throw new Error("no price")
      })
    )
    equityResults.forEach((r, idx) => r.status === "fulfilled" ? rows.push(r.value) : errors.push(`${batch[idx]}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`))
  }

  for (const [s, remote] of Object.entries(MACRO_SYMBOL_MAP)) {
    try {
      const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(remote)}?interval=1d&range=5d`, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", Accept: "application/json" },
        signal: AbortSignal.timeout(10_000)
      })
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
      const q = await r.json(), m = q?.chart?.result?.[0]?.meta
      const x = update(s, Number(m?.regularMarketPrice), Number(m?.previousClose ?? m?.chartPreviousClose))
      if (!x) throw new Error("no price")
      rows.push(x)
    } catch (err) {
      errors.push(`${s}: ${err instanceof Error ? err.message : String(err)}`)
    }
    await sleep(300)
  }

  return { rows, errors }
}

async function classify(groqKey: string, rows: Article[], budget: Budget, warnings: string[]) {
  const classifiedMap = new Map<string, ClassifiedArticle>()
  rows.forEach((a) => classifiedMap.set(a.url, { article: a, classification: { kind: "none" } }))
  for (let start = 0; start < rows.length; start += CONFIG.classificationBatchSize) {
    const batch = rows.slice(start, start + CONFIG.classificationBatchSize)
    const candidateSets = batch.map(candidates)
    try {
      const result = await groqJson(groqKey, "openai/gpt-oss-20b", `Return only JSON: {"articles":[{"index":0,"kind":"ticker|sector|none","value":"allowed value or none","confidence":0.0,"evidence":"exact short excerpt"}]}. For ticker, choose only from the article's candidate list; if it is empty, ticker is forbidden. Allowed sectors are tech, finance, energy, macro. Return none for ambiguity, unrelated coverage, or confidence below 0.78. Evidence must be a verbatim article excerpt supporting the decision.`, catalogue(batch, candidateSets), budget, CONFIG.classificationMaxTokens) as { articles?: unknown[] }
      for (const item of Array.isArray(result.articles) ? result.articles : []) {
        if (!item || typeof item !== "object") continue
        const row = item as Record<string, unknown>
        const index = Number(row.index)
        if (!Number.isInteger(index) || !batch[index]) continue
        const kind = String(row.kind ?? "none").toLowerCase(), value = String(row.value ?? "").trim(), conf = Number(row.confidence), evidence = String(row.evidence ?? "").trim()
        const body = `${batch[index].headline} ${batch[index].summary}`.toLowerCase()
        if (!Number.isFinite(conf) || conf < CONFIG.minimumClassificationConfidence || !evidence || !body.includes(evidence.toLowerCase())) {
          warnings.push(`discarded low-confidence/unsupported classification for ${batch[index].url}`)
          continue
        }
        if (kind === "ticker" && candidateSets[index].includes(value.toUpperCase()) && ALLOWED_SYMBOLS.has(value.toUpperCase())) classifiedMap.set(batch[index].url, { article: batch[index], classification: { kind: "ticker", value: value.toUpperCase(), confidence: conf, evidence } })
        else if (kind === "sector" && (SECTORS as readonly string[]).includes(value.toLowerCase())) classifiedMap.set(batch[index].url, { article: batch[index], classification: { kind: "sector", value: value.toLowerCase() as Sector, confidence: conf, evidence } })
      }
    } catch (e) {
      warnings.push(`classification batch failed: ${e}`)
    }
  }
  return Array.from(classifiedMap.values())
}

function getCanonicalClassification(cluster: ClassifiedArticle[]): Classification {
  const tickers = cluster.filter((item) => item.classification.kind === "ticker")
  if (tickers.length) {
    tickers.sort((a, b) => (b.classification.confidence ?? 0) - (a.classification.confidence ?? 0))
    return tickers[0].classification
  }
  const sectors = cluster.filter((item) => item.classification.kind === "sector")
  sectors.sort((a, b) => (b.classification.confidence ?? 0) - (a.classification.confidence ?? 0))
  return sectors[0]?.classification ?? { kind: "sector", value: "macro", confidence: 1, evidence: "default" }
}

function lexicalClusters(items: ClassifiedArticle[]) {
  const sorted = [...items].sort((a, b) => a.article.publishedAt.localeCompare(b.article.publishedAt))
  const clusters: ClassifiedArticle[][] = []
  for (const item of sorted) {
    if (item.classification.kind === "none") continue
    const text = `${item.article.headline} ${item.article.summary}`
    let match: ClassifiedArticle[] | undefined
    for (const cluster of clusters) {
      const first = cluster[0]
      if (first.classification.kind === "none") continue
      const withinWindow = Math.abs(new Date(first.article.publishedAt).getTime() - new Date(item.article.publishedAt).getTime()) <= CONFIG.clusterWindowHours * 3_600_000
      if (!withinWindow) continue
      const similar = cluster.some((member) => isLexicallySimilar(text, `${member.article.headline} ${member.article.summary}`))
      if (similar) { match = cluster; break }
    }
    ;(match ?? clusters[clusters.push([]) - 1]).push(item)
  }
  return clusters.filter((cluster) => new Set(cluster.map((item) => item.article.outlet)).size >= CONFIG.minSourcesPerStory)
}

function sentiment(value: unknown): Sentiment { const label = String(value ?? "").toLowerCase(); return ["bull", "bullish", "positive"].includes(label) ? "bull" : ["bear", "bearish", "negative"].includes(label) ? "bear" : "neut" }

async function analyzeCluster(groqKey: string, cluster: ClassifiedArticle[], budget: Budget): Promise<ClusteredEvent> {
  const classification = getCanonicalClassification(cluster)
  const result = await groqJson(groqKey, "llama-3.3-70b-versatile", `Return only JSON: {"event_label":"concise canonical event label","title":"neutral factual title","summary":"one or two sentences","sentiment":"bull|bear|neut","impact_reason":"why it matters to markets","source_angles":["bull|bear|neut"]}. All articles are already lexically pre-clustered, but reject any mismatch by returning event_label="none". Use only supplied sources.`, catalogue(cluster.map((item) => item.article)), budget, CONFIG.analysisMaxTokens) as Record<string, unknown>
  const label = String(result.event_label ?? "").trim(), title = String(result.title ?? "").trim(), summary = String(result.summary ?? "").trim(), impact = String(result.impact_reason ?? "").trim()
  if (!label || label.toLowerCase() === "none" || !title || !summary || !impact) throw new Error("analysis rejected or incomplete")
  const isMacro = classification.kind === "sector"
  const ticker = isMacro ? SECTOR_TICKER[classification.value!] : classification.value!
  const sources = cluster.slice(0, CONFIG.maxSourcesPerStory).map((item, index) => ({ article: item.article, angle: Array.isArray(result.source_angles) ? sentiment(result.source_angles[index]) : "neut" as Sentiment }))
  const event_key = deriveDeterministicEventKey(ticker, sources.map((s) => s.article.url))
  return { event_key, event_label: label, ticker, is_macro: isMacro, sentiment: sentiment(result.sentiment), title, summary: `${summary} Market impact: ${impact}`, sources, publishedAt: sources.reduce((earliest, source) => source.article.publishedAt < earliest ? source.article.publishedAt : earliest, sources[0].article.publishedAt) }
}

async function clusterClassifiedArticles(groqKey: string, items: ClassifiedArticle[]): Promise<{ events: ClusteredEvent[]; warnings: string[]; tokensUsed: number }> {
  const warnings: string[] = []; const rawEvents: ClusteredEvent[] = []; const budget: Budget = { used: 0, limit: CONFIG.analysisTokenBudget }
  for (const cluster of lexicalClusters(items)) {
    try {
      const event = await analyzeCluster(groqKey, cluster, budget)
      rawEvents.push(event)
    } catch (error) {
      warnings.push(`cluster skipped: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  const events: ClusteredEvent[] = []
  for (const event of rawEvents) {
    const existing = events.find((e) =>
      (e.ticker === event.ticker || e.is_macro || event.is_macro) &&
      (e.event_key === event.event_key || titleSimilarity(e.title, event.title) >= 0.60)
    )
    if (existing) {
      const urlSeen = new Set<string>(existing.sources.map((s) => s.article.url))
      const additional = event.sources.filter((s) => !urlSeen.has(s.article.url))
      existing.sources = [...existing.sources, ...additional].slice(0, CONFIG.maxSourcesPerStory)
      if (existing.is_macro && !event.is_macro) {
        existing.ticker = event.ticker
        existing.is_macro = false
      }
    } else {
      events.push(event)
    }
  }
  return { events, warnings, tokensUsed: budget.used }
}

Deno.serve(async (req) => {
  if (req.headers.get("x-pulse-cron") !== Deno.env.get("CRON_SECRET")) {
    return Response.json({ error: "unauthorized" }, { status: 401 })
  }

  const url = new URL(req.url)
  let requestedJob = url.searchParams.get("job") || ""
  if (!requestedJob && req.method === "POST") {
    try {
      const body = await req.json()
      if (body?.job) requestedJob = String(body.job)
    } catch {}
  }

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } })
  const startedAt = new Date().toISOString()
  const groqKey = Deno.env.get("GROQ_API_KEY")!

  // JOB 1: quotes:sync
  if (requestedJob === "quotes" || requestedJob === "quotes:sync") {
    const result: Result = { job: "quotes:sync", status: "ok", quotesUpdated: 0, articlesSeen: 0, storiesUpserted: 0, sourcesUpserted: 0, tokensUsed: 0, errors: [], warnings: [] }
    try {
      const q = await fetchQuotes(Deno.env.get("FINNHUB_API_KEY")!)
      result.errors.push(...q.errors)
      const writes = await Promise.all(q.rows.map((r: any) => db.from("tickers").update({ price: r.price, change_pct: r.change_pct, direction: r.direction, updated_at: new Date().toISOString() }, { count: "exact" }).eq("symbol", r.symbol)))
      writes.forEach((w: any) => w.error ? result.errors.push(w.error.message) : result.quotesUpdated += w.count ?? 0)
    } catch (e) {
      result.errors.push(e instanceof Error ? e.message : String(e))
    }
    result.status = result.errors.length ? (result.quotesUpdated ? "partial" : "error") : "ok"
    await db.from("ingest_runs").insert({ job: result.job, status: result.status, started_at: startedAt, finished_at: new Date().toISOString(), quotes_updated: result.quotesUpdated, articles_seen: 0, stories_upserted: 0, sources_upserted: 0, detail: { errors: result.errors.slice(0, 25), warnings: result.warnings.slice(0, 25), tokens_used: 0 } })
    return Response.json(result, { status: result.status === "error" ? 500 : 200 })
  }

  // JOB 2: news:ingest
  if (requestedJob === "ingest" || requestedJob === "news:ingest") {
    const result: Result = { job: "news:ingest", status: "ok", quotesUpdated: 0, articlesSeen: 0, storiesUpserted: 0, sourcesUpserted: 0, tokensUsed: 0, errors: [], warnings: [] }
    try {
      const feed = await fetchArticles()
      result.errors.push(...feed.errors)
      result.articlesSeen = feed.articles.length

      const now = new Date(), expiresAt = new Date(now.getTime() + 7 * 86_400_000).toISOString()
      const { data: cached } = await db.from("article_cache").select("url, content_hash, expires_at").in("url", feed.articles.map((a) => a.url))
      const cachedMap = new Map((cached ?? []).map((r: any) => [r.url, r]))
      const fresh = feed.articles.filter((a) => {
        const r: any = cachedMap.get(a.url)
        return !r || r.content_hash !== articleHash(a) || new Date(r.expires_at) <= now
      })

      if (fresh.length) {
        const records = fresh.map((a) => {
          const passes = passesPreFilters(a.headline, a.summary, a.url)
          return {
            url: a.url,
            content_hash: articleHash(a),
            headline: a.headline,
            summary: a.summary,
            outlet: a.outlet,
            published_at: a.publishedAt,
            fetched_at: now.toISOString(),
            expires_at: expiresAt,
            classification: passes ? null : { kind: "none" },
            classified_at: passes ? null : now.toISOString(),
            classification_attempted_at: passes ? null : now.toISOString(),
            updated_at: now.toISOString(),
          }
        })
        await db.from("article_cache").upsert(records, { onConflict: "url" })
      }
    } catch (e) {
      result.errors.push(e instanceof Error ? e.message : String(e))
    }
    result.status = result.errors.length ? "partial" : "ok"
    await db.from("ingest_runs").insert({ job: result.job, status: result.status, started_at: startedAt, finished_at: new Date().toISOString(), quotes_updated: 0, articles_seen: result.articlesSeen, stories_upserted: 0, sources_upserted: 0, detail: { errors: result.errors.slice(0, 25), warnings: result.warnings.slice(0, 25), tokens_used: 0 } })
    return Response.json(result, { status: result.status === "error" ? 500 : 200 })
  }

  // JOB 3: pipeline:analyze
  if (requestedJob === "analyze" || requestedJob === "pipeline:analyze") {
    const result: Result = { job: "pipeline:analyze", status: "ok", quotesUpdated: 0, articlesSeen: 0, storiesUpserted: 0, sourcesUpserted: 0, tokensUsed: 0, errors: [], warnings: [] }
    const budget: Budget = { used: 0, limit: CONFIG.classificationTokenBudget }
    try {
      const since = new Date(Date.now() - CONFIG.clusterWindowHours * 3_600_000).toISOString()
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 3_600_000).toISOString()
      const { data: unclassifiedRows } = await db.from("article_cache").select("url, headline, summary, outlet, published_at").is("classified_at", null).or(`classification_attempted_at.is.null,classification_attempted_at.lt.${twentyFourHoursAgo}`).gte("published_at", since).gte("expires_at", new Date().toISOString()).order("published_at", { ascending: false }).limit(60)

      const toClassify: Article[] = ((unclassifiedRows ?? []) as any[]).flatMap((row) => passesPreFilters(row.headline, row.summary || "", row.url) ? [{ url: row.url, headline: row.headline, summary: row.summary, outlet: row.outlet, publishedAt: row.published_at, relatedSymbol: null }] : [])

      if (toClassify.length) {
        for (let start = 0; start < toClassify.length; start += CONFIG.classificationBatchSize) {
          const batch = toClassify.slice(start, start + CONFIG.classificationBatchSize)
          const attemptNow = new Date().toISOString()
          await db.from("article_cache").update({ classification_attempted_at: attemptNow, updated_at: attemptNow }).in("url", batch.map((a) => a.url))
          const classifiedFresh = await classify(groqKey, batch, budget, result.warnings)
          result.tokensUsed += budget.used
          await Promise.all(classifiedFresh.map((x) => db.from("article_cache").update({ classification: x.classification, classified_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("url", x.article.url)))
        }
      }

      const { data: rows } = await db.from("article_cache").select("url, headline, summary, outlet, published_at, classification").not("classification", "is", null).not("classified_at", "is", null).gte("published_at", since).gte("expires_at", new Date().toISOString()).order("published_at", { ascending: false }).limit(500)
      const items: ClassifiedArticle[] = (rows ?? []).flatMap((r: any) => {
        const c = r.classification
        if (!c || typeof c !== "object" || c.kind === "none") return []
        return [{ article: { url: r.url, headline: r.headline, summary: r.summary, outlet: r.outlet, publishedAt: r.published_at, relatedSymbol: null }, classification: c }]
      })

      const clustered = await clusterClassifiedArticles(groqKey, items)
      result.tokensUsed += clustered.tokensUsed
      result.warnings.push(...clustered.warnings)

      for (const event of clustered.events) try {
        const { data: recent } = await db.from("stories").select("event_key, title").eq("ticker", event.ticker).gte("published_at", new Date(Date.now() - 7 * 86_400_000).toISOString()).limit(100)
        const existing = (recent ?? []).find((r: any) => r.event_key === event.event_key || titleSimilarity(event.title, String(r.title ?? "")) >= 0.75)
        if (existing) event.event_key = existing.event_key

        const story = await db.from("stories").upsert({ event_key: event.event_key, ticker: event.ticker, is_macro: event.is_macro, sentiment: event.sentiment, title: event.title, summary: event.summary, published_at: event.publishedAt }, { onConflict: "event_key" }).select("id").single()
        if (story.error) throw story.error
        result.storiesUpserted++

        const src = await db.from("story_sources").upsert(event.sources.map((s: any, i: number) => ({ story_id: story.data.id, outlet: s.article.outlet, headline: s.article.headline, excerpt: s.article.summary || s.article.headline, angle: s.angle, url: s.article.url, display_order: i + 1 })), { onConflict: "story_id,url", count: "exact" })
        if (src.error) throw src.error
        result.sourcesUpserted += src.count ?? event.sources.length
      } catch (e) {
        result.warnings.push(`cluster skipped: ${e}`)
      }
    } catch (e) {
      result.errors.push(e instanceof Error ? e.message : String(e))
    }

    result.status = result.errors.length ? (result.storiesUpserted ? "partial" : "error") : "ok"
    await db.from("ingest_runs").insert({ job: result.job, status: result.status, started_at: startedAt, finished_at: new Date().toISOString(), quotes_updated: 0, articles_seen: 0, stories_upserted: result.storiesUpserted, sources_upserted: result.sourcesUpserted, detail: { errors: result.errors.slice(0, 25), warnings: result.warnings.slice(0, 25), tokens_used: result.tokensUsed } })
    return Response.json(result, { status: result.status === "error" ? 500 : 200 })
  }

  // DEFAULT: run all 3 sequentially
  const result: Result = { job: "ingest", status: "ok", quotesUpdated: 0, articlesSeen: 0, storiesUpserted: 0, sourcesUpserted: 0, tokensUsed: 0, errors: [], warnings: [] }
  const budget: Budget = { used: 0, limit: CONFIG.classificationTokenBudget }

  try {
    const q = await fetchQuotes(Deno.env.get("FINNHUB_API_KEY")!)
    result.errors.push(...q.errors)
    const writes = await Promise.all(q.rows.map((r: any) => db.from("tickers").update({ price: r.price, change_pct: r.change_pct, direction: r.direction, updated_at: new Date().toISOString() }, { count: "exact" }).eq("symbol", r.symbol)))
    writes.forEach((w: any) => w.error ? result.errors.push(w.error.message) : result.quotesUpdated += w.count ?? 0)

    const feed = await fetchArticles()
    result.errors.push(...feed.errors)
    result.articlesSeen = feed.articles.length

    const now = new Date(), expiresAt = new Date(now.getTime() + 7 * 86_400_000).toISOString()
    const { data: cached } = await db.from("article_cache").select("url, content_hash, expires_at").in("url", feed.articles.map((a) => a.url))
    const cachedMap = new Map((cached ?? []).map((r: any) => [r.url, r]))
    const fresh = feed.articles.filter((a) => {
      const r: any = cachedMap.get(a.url)
      return !r || r.content_hash !== articleHash(a) || new Date(r.expires_at) <= now
    })

    if (fresh.length) {
      const records = fresh.map((a) => {
        const passes = passesPreFilters(a.headline, a.summary, a.url)
        return {
          url: a.url,
          content_hash: articleHash(a),
          headline: a.headline,
          summary: a.summary,
          outlet: a.outlet,
          published_at: a.publishedAt,
          fetched_at: now.toISOString(),
          expires_at: expiresAt,
          classification: passes ? null : { kind: "none" },
          classified_at: passes ? null : now.toISOString(),
          classification_attempted_at: passes ? null : now.toISOString(),
          updated_at: now.toISOString(),
        }
      })
      await db.from("article_cache").upsert(records, { onConflict: "url" })
    }

    const since = new Date(Date.now() - CONFIG.clusterWindowHours * 3_600_000).toISOString()
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 3_600_000).toISOString()
    const { data: unclassifiedRows } = await db.from("article_cache").select("url, headline, summary, outlet, published_at").is("classified_at", null).or(`classification_attempted_at.is.null,classification_attempted_at.lt.${twentyFourHoursAgo}`).gte("published_at", since).gte("expires_at", new Date().toISOString()).order("published_at", { ascending: false }).limit(60)

    const freshPassing = fresh.filter((a) => passesPreFilters(a.headline, a.summary, a.url))
    const toClassifyMap = new Map<string, Article>(freshPassing.map((a) => [a.url, a]))
    for (const row of (unclassifiedRows ?? []) as any[]) {
      if (!toClassifyMap.has(row.url) && passesPreFilters(row.headline, row.summary || "", row.url)) {
        toClassifyMap.set(row.url, { url: row.url, headline: row.headline, summary: row.summary, outlet: row.outlet, publishedAt: row.published_at, relatedSymbol: null })
      }
    }
    const toClassify = Array.from(toClassifyMap.values()).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))

    if (toClassify.length) {
      const attemptNow = new Date().toISOString()
      await db.from("article_cache").update({ classification_attempted_at: attemptNow, updated_at: attemptNow }).in("url", toClassify.map((a) => a.url))
      const classifiedFresh = await classify(groqKey, toClassify, budget, result.warnings)
      result.tokensUsed += budget.used
      await Promise.all(classifiedFresh.map((x) => db.from("article_cache").update({ classification: x.classification, classified_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("url", x.article.url)))
    }

    const { data: rows } = await db.from("article_cache").select("url, headline, summary, outlet, published_at, classification").not("classification", "is", null).not("classified_at", "is", null).gte("published_at", since).gte("expires_at", new Date().toISOString()).order("published_at", { ascending: false }).limit(500)
    const items: ClassifiedArticle[] = (rows ?? []).flatMap((r: any) => {
      const c = r.classification
      if (!c || typeof c !== "object" || c.kind === "none") return []
      return [{ article: { url: r.url, headline: r.headline, summary: r.summary, outlet: r.outlet, publishedAt: r.published_at, relatedSymbol: null }, classification: c }]
    })

    const clustered = await clusterClassifiedArticles(groqKey, items)
    result.tokensUsed += clustered.tokensUsed
    result.warnings.push(...clustered.warnings)

    for (const event of clustered.events) try {
      const { data: recent } = await db.from("stories").select("event_key, title").eq("ticker", event.ticker).gte("published_at", new Date(Date.now() - 7 * 86_400_000).toISOString()).limit(100)
      const existing = (recent ?? []).find((r: any) => r.event_key === event.event_key || titleSimilarity(event.title, String(r.title ?? "")) >= 0.75)
      if (existing) event.event_key = existing.event_key

      const story = await db.from("stories").upsert({ event_key: event.event_key, ticker: event.ticker, is_macro: event.is_macro, sentiment: event.sentiment, title: event.title, summary: event.summary, published_at: event.publishedAt }, { onConflict: "event_key" }).select("id").single()
      if (story.error) throw story.error
      result.storiesUpserted++

      const src = await db.from("story_sources").upsert(event.sources.map((s: any, i: number) => ({ story_id: story.data.id, outlet: s.article.outlet, headline: s.article.headline, excerpt: s.article.summary || s.article.headline, angle: s.angle, url: s.article.url, display_order: i + 1 })), { onConflict: "story_id,url", count: "exact" })
      if (src.error) throw src.error
      result.sourcesUpserted += src.count ?? event.sources.length
    } catch (e) {
      result.warnings.push(`cluster skipped: ${e}`)
    }
  } catch (e) {
    result.errors.push(e instanceof Error ? e.message : String(e))
  }

  result.status = result.errors.length ? (result.quotesUpdated || result.storiesUpserted ? "partial" : "error") : "ok"
  await db.from("ingest_runs").insert({ job: result.job, status: result.status, started_at: startedAt, finished_at: new Date().toISOString(), quotes_updated: result.quotesUpdated, articles_seen: result.articlesSeen, stories_upserted: result.storiesUpserted, sources_upserted: result.sourcesUpserted, detail: { errors: result.errors.slice(0, 25), warnings: result.warnings.slice(0, 25), tokens_used: result.tokensUsed } })
  return Response.json(result, { status: result.status === "error" ? 500 : 200 })
})