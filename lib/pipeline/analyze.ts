import { ALL_SYMBOLS, ANALYSIS_MODEL, CLASSIFICATION_MODEL, INGEST } from "./config"
import type { Article } from "./news"
import { defaultRegistry } from "./providers/registry"

const getAllowedSymbols = () => new Set<string>([...ALL_SYMBOLS, ...defaultRegistry.getAllSymbols()])
const sectors = ["tech", "finance", "energy", "macro"] as const
type Sector = (typeof sectors)[number]
type Sentiment = "bull" | "bear" | "neut"
export type Classification =
  | { kind: "ticker"; value: string; confidence: number; evidence: string }
  | { kind: "sector"; value: Sector; confidence: number; evidence: string }
  | { kind: "none" }

export type ClassifiedArticle = { article: Article; classification: Classification }

const sectorTicker: Record<Sector, string> = { tech: "NDX", finance: "SPX", energy: "WTI", macro: "SPX" }
const stopWords = new Set(["the", "and", "for", "with", "from", "after", "into", "over", "that", "this", "will", "stock", "shares", "market", "company", "reports", "quarterly", "earnings", "says", "said"])

export type ClusteredEvent = { event_key: string; event_label: string; ticker: string; is_macro: boolean; sentiment: Sentiment; title: string; summary: string; sources: Array<{ article: Article; angle: Sentiment }>; publishedAt: string }
export type PipelineResult = { events: ClusteredEvent[]; classified: ClassifiedArticle[]; warnings: string[]; tokensUsed: number }

type Budget = { used: number; limit: number }
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const tokenEstimate = (value: string) => Math.ceil(value.length / 4)
function parseJson(text: string) { const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""); const start = trimmed.indexOf("{"); const end = trimmed.lastIndexOf("}"); return JSON.parse(start >= 0 && end >= start ? trimmed.slice(start, end + 1) : trimmed) }
function sentiment(value: unknown): Sentiment { const label = String(value ?? "").toLowerCase(); return ["bull", "bullish", "positive"].includes(label) ? "bull" : ["bear", "bearish", "negative"].includes(label) ? "bear" : "neut" }
function normalize(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() }
function words(value: string) { return new Set(normalize(value).split(" ").filter((word) => word.length > 2 && !stopWords.has(word))) }
function sharedWordsCount(left: string, right: string) { const a = words(left), b = words(right); let shared = 0; for (const word of a) if (b.has(word)) shared++; return shared }
function overlap(left: string, right: string) { const a = words(left), b = words(right); if (!a.size || !b.size) return 0; let shared = 0; for (const w of a) if (b.has(w)) shared++; return shared / Math.max(1, Math.min(a.size, b.size)) }
function isLexicallySimilar(left: string, right: string) {
  return sharedWordsCount(left, right) >= INGEST.clusterMinSharedWords && overlap(left, right) >= INGEST.clusterMinOverlap
}
function titleSimilarity(left: string, right: string) { return overlap(left, right) }
function slug(value: string) { return normalize(value).replace(/\s+/g, "-").slice(0, 80) }
function windowBucket(date: string) { return Math.floor(new Date(date).getTime() / (INGEST.clusterWindowHours * 3_600_000)) }

class TokenRateLimiter {
  private history: Array<{ timestamp: number; tokens: number }> = []

  constructor(private maxWindowTokens = 5500, private windowMs = 60_000) {}

  private pruneHistory(now: number) {
    this.history = this.history.filter((entry) => now - entry.timestamp < this.windowMs)
  }

  getWindowTokens(): number {
    const now = Date.now()
    this.pruneHistory(now)
    return this.history.reduce((sum, entry) => sum + entry.tokens, 0)
  }

  async acquire(estimatedTokens: number): Promise<void> {
    while (true) {
      const now = Date.now()
      this.pruneHistory(now)
      const currentTokens = this.history.reduce((sum, entry) => sum + entry.tokens, 0)
      if (currentTokens + estimatedTokens <= this.maxWindowTokens) {
        break
      }
      const oldest = this.history[0]
      const waitMs = oldest ? Math.max(100, oldest.timestamp + this.windowMs - now + 100) : 1000
      await sleep(waitMs)
    }
  }

  recordUsage(actualTokens: number) {
    this.history.push({ timestamp: Date.now(), tokens: actualTokens })
  }
}

const groqLimiter = new TokenRateLimiter(5500, 60_000)

async function groqJson(model: string, system: string, prompt: string, budget: Budget, maxTokens: number, articleCount = 0): Promise<unknown> {
  const estimated = articleCount > 0 ? (articleCount * 300) + 600 : tokenEstimate(system) + tokenEstimate(prompt) + maxTokens
  if (budget.used + estimated > budget.limit) throw new Error(`token budget exhausted (${budget.used}/${budget.limit})`)
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) throw new Error("Missing GROQ_API_KEY")

  const windowBefore = groqLimiter.getWindowTokens()
  console.log(`[Groq Limiter] Current window total: ${windowBefore} tokens. Request estimated: ${estimated} tokens.`)
  await groqLimiter.acquire(estimated)

  const maxRetries = 5
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          temperature: model === CLASSIFICATION_MODEL ? 0 : 0.2,
          response_format: { type: "json_object" },
          max_tokens: maxTokens,
          messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
        }),
        signal: AbortSignal.timeout(15_000),
      })

      if (response.status === 429) {
        if (attempt < maxRetries) {
          const backoff = Math.pow(2, attempt) * 1000 + Math.random() * 1000
          await sleep(backoff)
          continue
        }
        throw new Error(`Groq 429 rate limit reached after ${maxRetries} retries`)
      }

      if (!response.ok) throw new Error(`Groq ${response.status}: ${await response.text()}`)

      const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }>; usage?: { total_tokens?: number } }
      const actualTokens = data.usage?.total_tokens ?? estimated
      budget.used += actualTokens
      groqLimiter.recordUsage(actualTokens)
      console.log(`[Groq Limiter] Request completed. Estimated: ${estimated}, Actual: ${actualTokens}. New 60s window total: ${groqLimiter.getWindowTokens()} tokens.`)
      return parseJson(data.choices?.[0]?.message?.content ?? "{}")
    } catch (err: any) {
      if (err?.name === "AbortError" || err?.message?.includes("aborted")) {
        throw new Error("GROQ_TIMEOUT")
      }
      if (attempt >= maxRetries || !err?.message?.includes("429")) {
        throw err
      }
    }
  }
  throw new Error("Groq rate limit retry budget exhausted")
}

function candidates(article: Article): string[] {
  return defaultRegistry.getCandidates(article.headline, article.summary || "")
}
function catalogue(rows: Article[], candidateSets?: string[][]) { return rows.map((article, index) => `[${index}] candidates=${candidateSets?.[index]?.join(",") || "none"} ${article.headline}${article.summary ? ` — ${article.summary.slice(0, 100)}` : ""}`).join("\n") }

import { TOP100_SYMBOLS } from "./sp500"

const top100SymbolSet = new Set<string>(TOP100_SYMBOLS)

/** Sorts articles so named company tickers come before macro news, ordered by recency. */
export function prioritizeArticles(articles: Article[]): Article[] {
  return [...articles].sort((a, b) => {
    const aCandidates = candidates(a)
    const bCandidates = candidates(b)

    const aIsNamed = aCandidates.some((symbol) => top100SymbolSet.has(symbol)) || (a.relatedSymbol ? top100SymbolSet.has(a.relatedSymbol) : false)
    const bIsNamed = bCandidates.some((symbol) => top100SymbolSet.has(symbol)) || (b.relatedSymbol ? top100SymbolSet.has(b.relatedSymbol) : false)

    if (aIsNamed && !bIsNamed) return -1
    if (!aIsNamed && bIsNamed) return 1

    return b.publishedAt.localeCompare(a.publishedAt)
  })
}

export async function classifyArticles(articles: Article[]): Promise<{ classified: ClassifiedArticle[]; warnings: string[]; tokensUsed: number }> {
  const warnings: string[] = []; const classifiedMap = new Map<string, ClassifiedArticle>()
  articles.forEach((a) => classifiedMap.set(a.url, { article: a, classification: { kind: "none" } }))
  const budget: Budget = { used: 0, limit: INGEST.classificationTokenBudget }
  for (let start = 0; start < articles.length; start += INGEST.classificationBatchSize) {
    const batch = articles.slice(start, start + INGEST.classificationBatchSize); const candidateSets = batch.map(candidates)
    const tBatchStart = Date.now()
    try {
      const result = await groqJson(CLASSIFICATION_MODEL, `Return only JSON: {"articles":[{"index":0,"kind":"ticker|sector|none","value":"allowed value or none","confidence":0.0,"evidence":"exact short excerpt"}]}. For ticker, choose only from the article's candidate list; if it is empty, ticker is forbidden. Allowed sectors are tech, finance, energy, macro. Return none for ambiguity, unrelated coverage, or confidence below 0.78. Evidence must be a verbatim article excerpt supporting the decision.`, catalogue(batch, candidateSets), budget, INGEST.classificationMaxTokens, batch.length) as { articles?: unknown[] }
      const batchMs = Date.now() - tBatchStart
      console.log(`[timing] Groq classification batch (size ${batch.length}): ${batchMs}ms`)
      for (const item of Array.isArray(result.articles) ? result.articles : []) {
        if (!item || typeof item !== "object") continue; const row = item as Record<string, unknown>; const index = Number(row.index); if (!Number.isInteger(index) || !batch[index]) continue
        const kind = String(row.kind ?? "none").toLowerCase(), value = String(row.value ?? "").trim(), confidence = Number(row.confidence), evidence = String(row.evidence ?? "").trim(); const body = `${batch[index].headline} ${batch[index].summary}`.toLowerCase()
        if (!Number.isFinite(confidence) || confidence < INGEST.minimumClassificationConfidence || !evidence || !body.includes(evidence.toLowerCase())) { warnings.push(`discarded low-confidence/unsupported classification for ${batch[index].url}`); continue }
        if (kind === "ticker" && candidateSets[index].includes(value.toUpperCase()) && getAllowedSymbols().has(value.toUpperCase())) classifiedMap.set(batch[index].url, { article: batch[index], classification: { kind: "ticker", value: value.toUpperCase(), confidence, evidence } })
        else if (kind === "sector" && (sectors as readonly string[]).includes(value.toLowerCase())) classifiedMap.set(batch[index].url, { article: batch[index], classification: { kind: "sector", value: value.toLowerCase() as Sector, confidence, evidence } })
      }
    } catch (error) {
      const batchMs = Date.now() - tBatchStart
      console.warn(`[Groq Fallback] Classification batch (size ${batch.length}) failed after ${batchMs}ms due to saturated rate limit or error: ${error instanceof Error ? error.message : String(error)}`)
      warnings.push(`classification batch fallback: ${error instanceof Error ? error.message : String(error)}`)
      for (const article of batch) {
        console.warn(`[Groq Fallback] Skipped article (labeled Neutral fallback): ${article.url}`)
      }
    }
  }
  return { classified: Array.from(classifiedMap.values()), warnings, tokensUsed: budget.used }
}

function getCanonicalClassification(cluster: ClassifiedArticle[]): Exclude<Classification, { kind: "none" }> {
  const tickers = cluster.filter((item) => item.classification.kind === "ticker")
  if (tickers.length) {
    tickers.sort((a, b) => ((b.classification as any).confidence ?? 0) - ((a.classification as any).confidence ?? 0))
    return tickers[0].classification as Exclude<Classification, { kind: "none" }>
  }
  const sectors = cluster.filter((item) => item.classification.kind === "sector")
  sectors.sort((a, b) => ((b.classification as any).confidence ?? 0) - ((a.classification as any).confidence ?? 0))
  return (sectors[0]?.classification ?? { kind: "sector", value: "macro", confidence: 1, evidence: "default" }) as Exclude<Classification, { kind: "none" }>
}

function lexicalClusters(items: ClassifiedArticle[]) {
  const sorted = [...items].sort((a, b) => a.article.publishedAt.localeCompare(b.article.publishedAt)); const clusters: ClassifiedArticle[][] = []
  for (const item of sorted) {
    if (item.classification.kind === "none") continue
    const text = `${item.article.headline} ${item.article.summary}`; let match: ClassifiedArticle[] | undefined
    for (const cluster of clusters) {
      const first = cluster[0]
      if (first.classification.kind === "none") continue
      const withinWindow = Math.abs(new Date(first.article.publishedAt).getTime() - new Date(item.article.publishedAt).getTime()) <= INGEST.clusterWindowHours * 3_600_000
      if (!withinWindow) continue
      const similar = cluster.some((member) => isLexicallySimilar(text, `${member.article.headline} ${member.article.summary}`))
      if (similar) { match = cluster; break }
    }
    ;(match ?? clusters[clusters.push([]) - 1]).push(item)
  }
  return clusters.filter((cluster) => new Set(cluster.map((item) => item.article.outlet)).size >= INGEST.minSourcesPerStory)
}

export type TickerContextMap = Map<string, { price: number; change_pct: number; direction: string }>

async function analyzeCluster(cluster: ClassifiedArticle[], budget: Budget, tickerContext?: TickerContextMap): Promise<ClusteredEvent> {
  const classification = getCanonicalClassification(cluster)
  const isMacro = classification.kind === "sector"
  const ticker = isMacro ? sectorTicker[classification.value] : classification.value
  const tickerInfo = tickerContext?.get(ticker)
  const tickerStr = tickerInfo ? `Ticker context for ${ticker}: Price $${tickerInfo.price}, Change ${tickerInfo.change_pct > 0 ? "+" : ""}${tickerInfo.change_pct}%.` : ""
  const outletsList = Array.from(new Set(cluster.map((c) => c.article.outlet))).join(", ")

  const system = `You are a senior financial analyst at a tier-1 quantitative fund.
Return ONLY valid JSON matching this schema:
{
  "event_label": "concise canonical event label (3-5 words)",
  "title": "neutral factual title",
  "summary": "1-2 sentences with at least one specific number, percentage, financial figure, or named entity from the articles",
  "sentiment": "bull|bear|neut",
  "impact_reason": "explanation of market transmission mechanism (e.g. yield impact, earnings revision, valuation multiple expansion)",
  "source_angles": ["bull|bear|neut"]
}

STRICT CONSTRAINTS:
1. Forbid generic boilerplate: DO NOT use phrases like "investor confidence", "market sentiment", "could lead to", "remains to be seen", "investors are watching", "positive development".
2. Summary MUST include at least one concrete figure (e.g., revenue %, price target $, rate basis points, or specific deal valuation) or specific named catalyst extracted directly from the articles.
3. impact_reason MUST state the exact fundamental or valuation transmission mechanism (e.g., "rate-sensitive equities compress margins as 10Y yield rises"), NOT a tautology like "this could impact markets".`

  const prompt = `${tickerStr} Outlets covering this cluster: ${outletsList}.\nSupplied articles:\n${catalogue(cluster.map((item) => item.article))}`

  const tAnalysisStart = Date.now()
  try {
    const result = await groqJson(ANALYSIS_MODEL, system, prompt, budget, INGEST.analysisMaxTokens) as Record<string, unknown>
    const analysisMs = Date.now() - tAnalysisStart
    const label = String(result.event_label ?? "").trim()
    const title = String(result.title ?? "").trim()
    const summary = String(result.summary ?? "").trim()
    const impact = String(result.impact_reason ?? "").trim()
    if (!label || label.toLowerCase() === "none" || !title || !summary || !impact) throw new Error("analysis rejected or incomplete")
    console.log(`[timing] Groq analysis call (${classification.value} [${cluster.length} sources] - "${label}"): ${analysisMs}ms`)
    const bucket = windowBucket(cluster[0].article.publishedAt)
    const sources = cluster.slice(0, INGEST.maxSourcesPerStory).map((item, index) => ({ article: item.article, angle: Array.isArray(result.source_angles) ? sentiment(result.source_angles[index]) : "neut" as Sentiment }))
    return { event_key: slug(`${ticker}-${bucket}-${label}`), event_label: label, ticker, is_macro: isMacro, sentiment: sentiment(result.sentiment), title, summary: `${summary} Market impact: ${impact}`, sources, publishedAt: sources.reduce((earliest, source) => source.article.publishedAt < earliest ? source.article.publishedAt : earliest, sources[0].article.publishedAt) }
  } catch (error) {
    const analysisMs = Date.now() - tAnalysisStart
    console.log(`[timing] Groq analysis call (${classification.value}): failed/skipped after ${analysisMs}ms`)
    throw error
  }
}

export async function clusterClassifiedArticles(items: ClassifiedArticle[], tickerContext?: TickerContextMap): Promise<{ events: ClusteredEvent[]; warnings: string[]; tokensUsed: number }> {
  const warnings: string[] = []; const rawEvents: ClusteredEvent[] = []; const budget: Budget = { used: 0, limit: INGEST.analysisTokenBudget }
  const tClusterStart = Date.now()
  const clusters = lexicalClusters(items)
  const clusterMs = Date.now() - tClusterStart
  console.log(`[timing] Clustering step: ${clusterMs}ms (formed ${clusters.length} clusters from ${items.length} classified items)`)

  for (const cluster of clusters) { try { const event = await analyzeCluster(cluster, budget, tickerContext); rawEvents.push(event) } catch (error) { warnings.push(`cluster skipped: ${error instanceof Error ? error.message : String(error)}`) } }
  const events: ClusteredEvent[] = []
  for (const event of rawEvents) {
    const existing = events.find((e) =>
      (e.ticker === event.ticker || e.is_macro || event.is_macro) &&
      (e.event_key === event.event_key || titleSimilarity(e.title, event.title) >= 0.60)
    )
    if (existing) {
      const urlSeen = new Set<string>(existing.sources.map((s) => s.article.url))
      const additional = event.sources.filter((s) => !urlSeen.has(s.article.url))
      existing.sources = [...existing.sources, ...additional].slice(0, INGEST.maxSourcesPerStory)
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
