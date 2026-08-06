import { ANALYSIS_MODEL, CLUSTER, INGEST, PROMPT } from "./config.ts"
import type { Article } from "./news.ts"
import { defaultRegistry } from "./providers/registry.ts"
import {
  appendToCluster,
  createCluster,
  loadAllowedTickers,
  loadClusterMembers,
  loadStableUnanalyzedClusters,
  loadOpenClusters,
  markArticleDone,
  markClusterAnalyzing,
  markClusterDone,
  markClusterFailed,
  markClusterStable,
  matchExistingStory,
  reclaimStaleAnalyzingClusters,
  setArticleClusterId,
  upsertStorySource,
  type ClusterRow,
  type Db,
  type PipelineArticle,
} from "./db.ts"
import { groqJson, type Budget } from "./groq.ts"
import { cosine, hash, slug, toVector, titleSimilarity, truncate } from "./text.ts"

export type Sentiment = "bull" | "bear" | "neut"

export type StoryEvent = {
  event_key: string
  ticker: string
  is_macro: boolean
  sentiment: Sentiment
  title: string
  summary: string
  publishedAt: string
  sources: Array<{ article: Article; angle: string }>
}

export type ClusterAssignmentResult = {
  matchedExisting: number
  newClusters: number
  assigned: number
}

const TICKER_NORMALIZE: Record<string, string> = { "BRK.B": "BRK-B", "BF.B": "BF-B" }

function normalizeTicker(symbol: string): string {
  return TICKER_NORMALIZE[symbol] ?? symbol
}

function sentiment(value: unknown): Sentiment {
  const label = String(value ?? "").toLowerCase()
  return ["bull", "bullish", "positive"].includes(label) ? "bull" : ["bear", "bearish", "negative"].includes(label) ? "bear" : "neut"
}

export function clusterKeyFor(article: PipelineArticle): string {
  const bucket = Math.floor(new Date(article.publishedAt).getTime() / (CLUSTER.windowHours * 3_600_000))
  return `${slug(article.headline).slice(0, 40)}-${bucket}-${hash(`${article.url}:${article.publishedAt}`)}`
}

function bestMatch(article: PipelineArticle, clusters: ClusterRow[]): ClusterRow | null {
  const now = Date.now()
  const windowMs = CLUSTER.windowHours * 3_600_000
  let best: ClusterRow | null = null
  let bestScore = 0
  const articleText = `${article.headline} ${article.summary}`

  for (const cluster of clusters) {
    if (!article.embedding?.length) continue
    const centroid = toVector(cluster.centroid)
    if (!centroid.length) continue
    const embSim = cosine(article.embedding, centroid)
    const titleSim = titleSimilarity(articleText, cluster.title ?? "")
    const lastActivity = new Date(cluster.last_activity_at).getTime()
    const isRecent = now - lastActivity <= windowMs
    const recentMatch = isRecent && embSim >= CLUSTER.minEmbedSimilarity
    const longEventMatch = titleSim >= CLUSTER.titleMatchThreshold
    if (!recentMatch && !longEventMatch) continue
    const score = embSim + titleSim
    if (score > bestScore) {
      bestScore = score
      best = cluster
    }
  }
  return best
}

/**
 * Step 3 of the analyze job. Every filtered article is assigned to the best
 * open cluster (embedding similarity within the window, or title overlap for
 * long-running events), matched to an already-published story, or used to
 * open a new cluster. Clusters that reached their size/idle thresholds are
 * marked stable for analysis in the same run.
 */
export async function assignArticlesToClusters(
  db: Db,
  articles: PipelineArticle[],
  warnings: string[]
): Promise<ClusterAssignmentResult> {
  const result: ClusterAssignmentResult = { matchedExisting: 0, newClusters: 0, assigned: 0 }
  let openClusters = await loadOpenClusters(db)
  const now = new Date()
  const windowMs = CLUSTER.windowHours * 3_600_000

  const sorted = [...articles].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
  for (const article of sorted) {
    if (!article.embedding?.length) continue
    const match = bestMatch(article, openClusters)
    if (match) {
      await appendToCluster(db, match, article)
      await markArticleDone(db, article.url)
      match.article_count += 1
      match.last_activity_at = now.toISOString()
      match.title = article.headline
      result.assigned++
      continue
    }

    const storyId = await matchExistingStory(db, article.embedding, CLUSTER.existingStoryMaxDistance, CLUSTER.windowHours).catch(() => null)
    if (storyId) {
      await setArticleClusterId(db, [article.url], storyId)
      await upsertStorySource(db, storyId, article, "neut", 99).catch(() => undefined)
      result.matchedExisting++
      continue
    }

    const clusterId = await createCluster(db, clusterKeyFor(article), article)
    await markArticleDone(db, article.url)
    const fresh: ClusterRow = {
      id: clusterId,
      key: clusterKeyFor(article),
      status: "open",
      title: article.headline,
      member_urls: [article.url],
      centroid: article.embedding,
      article_count: 1,
      first_seen_at: now.toISOString(),
      last_activity_at: now.toISOString(),
      last_analysis_at: null,
      retry_count: 0,
      last_error: null,
      story_id: null,
    }
    openClusters.push(fresh)
    result.newClusters++
  }

  for (const cluster of openClusters) {
    const idle = now.getTime() - new Date(cluster.last_activity_at).getTime()
    const stable = cluster.article_count >= CLUSTER.minArticlesPerCluster || idle >= CLUSTER.stableIdleMinutes * 60_000
    if (stable && cluster.status === "open") {
      await markClusterStable(db, cluster.id)
      cluster.status = "stable"
    }
  }
  return result
}

function resolveTicker(articles: PipelineArticle[], allowedTickers: Set<string>): { ticker: string; is_macro: boolean } {
  const votes = new Map<string, number>()
  for (const article of articles) {
    for (const symbol of defaultRegistry.getCandidates(article.headline, article.summary || "")) {
      const normalized = normalizeTicker(symbol.toUpperCase())
      if (allowedTickers.has(normalized)) votes.set(normalized, (votes.get(normalized) ?? 0) + 1)
    }
  }
  const top = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]
  if (top) return { ticker: top[0], is_macro: false }
  return { ticker: "SPX", is_macro: true }
}

function formatArticle(article: PipelineArticle): string {
  return `[${article.outlet}] ${article.headline}${article.summary ? ` — ${article.summary}` : ""}`
}

async function analyzeCluster(
  db: Db,
  cluster: ClusterRow,
  budget: Budget,
  allowedTickers: Set<string>,
  tickerContext: Map<string, { price: number; change_pct: number; direction: string }>
): Promise<StoryEvent | null> {
  await markClusterAnalyzing(db, cluster.id)
  const members = await loadClusterMembers(db, cluster)
  const centroid = toVector(cluster.centroid)
  const ranked = members
    .filter((member) => member.embedding?.length)
    .sort((a, b) => cosine(b.embedding!, centroid) - cosine(a.embedding!, centroid))
    .slice(0, CLUSTER.analysisTopN)
  if (!ranked.length) {
    await markClusterFailed(db, cluster.id, "no live members")
    return null
  }

  const { ticker, is_macro } = resolveTicker(ranked, allowedTickers)
  const tickerInfo = tickerContext.get(ticker)
  const tickerStr = tickerInfo
    ? `Ticker context for ${ticker}: Price $${tickerInfo.price}, Change ${tickerInfo.change_pct > 0 ? "+" : ""}${tickerInfo.change_pct}%.`
    : ""

  const catalogue = ranked
    .map((article) => formatArticle(article).slice(0, PROMPT.maxCharsPerArticle))
    .join("\n")
    .slice(0, PROMPT.clusterPromptMaxChars)

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

  const prompt = `${tickerStr} Outlets covering this cluster: ${Array.from(new Set(ranked.map((a) => a.outlet))).join(", ")}.\nSupplied articles:\n${catalogue}`

  const result = (await groqJson({
    model: ANALYSIS_MODEL,
    system,
    prompt,
    budget,
    maxTokens: INGEST.analysisMaxTokens,
    temperature: 0.2,
  })) as Record<string, unknown>

  const label = String(result.event_label ?? "").trim()
  const title = String(result.title ?? "").trim()
  const summary = String(result.summary ?? "").trim()
  const impact = String(result.impact_reason ?? "").trim()
  if (!label || label.toLowerCase() === "none" || !title || !summary || !impact) {
    throw new Error("analysis rejected or incomplete")
  }

  const angles = Array.isArray(result.source_angles) ? result.source_angles.map((value) => sentiment(value)) : []
  const sources = ranked.slice(0, INGEST.maxSourcesPerStory).map((article, index) => ({
    article,
    angle: angles[index] ?? "neut",
  }))
  const publishedAt = ranked.reduce((latest, source) => (source.publishedAt > latest ? source.publishedAt : latest), ranked[0].publishedAt)

  return {
    event_key: `${slug(ticker)}-${hash(cluster.key)}`,
    ticker,
    is_macro,
    sentiment: sentiment(result.sentiment),
    title,
    summary: `${summary} Market impact: ${impact}`,
    publishedAt,
    sources,
  }
}

async function upsertStory(db: Db, event: StoryEvent): Promise<string> {
  const { data: story, error } = await db
    .from("stories")
    .upsert(
      {
        event_key: event.event_key,
        ticker: event.ticker,
        is_macro: event.is_macro,
        sentiment: event.sentiment,
        title: event.title,
        summary: event.summary,
        published_at: event.publishedAt,
      },
      { onConflict: "event_key" }
    )
    .select("id")
    .single()
  if (error) throw new Error(`story upsert ${event.event_key}: ${error.message}`)

  for (let i = 0; i < event.sources.length; i++) {
    await upsertStorySource(db, story.id, event.sources[i].article, event.sources[i].angle, i + 1)
  }
  return story.id
}

export type AnalysisResult = {
  storiesUpserted: number
  sourcesUpserted: number
  tokensUsed: number
  warnings: string[]
}

/**
 * Step 4 of the analyze job. Every stable cluster is analyzed exactly once
 * (top `analysisTopN` articles by centroid proximity). Groq failures mark the
 * cluster 'failed' for a retry on the next run; upserts are idempotent via the
 * deterministic event_key, so a partial write is overwritten by the retry.
 */
export async function analyzeStableClusters(
  db: Db,
  budget: Budget,
  tickerContext: Map<string, { price: number; change_pct: number; direction: string }>
): Promise<AnalysisResult> {
  const warnings: string[] = []
  const allowedTickers = await loadAllowedTickers(db)
  await reclaimStaleAnalyzingClusters(db, CLUSTER.analysisRetryMinutes)
  const clusters = await loadStableUnanalyzedClusters(db)
  const result: AnalysisResult = { storiesUpserted: 0, sourcesUpserted: 0, tokensUsed: 0, warnings }

  for (const cluster of clusters) {
    try {
      const event = await analyzeCluster(db, cluster, budget, allowedTickers, tickerContext)
      if (!event) continue
      const storyId = await upsertStory(db, event)
      const memberUrls = Array.isArray(cluster.member_urls) ? cluster.member_urls.map(String) : []
      await setArticleClusterId(db, memberUrls, storyId)
      await markClusterDone(db, cluster.id, storyId)
      result.storiesUpserted++
      result.sourcesUpserted += event.sources.length
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      warnings.push(`cluster analysis failed ${cluster.id}: ${message}`)
      await markClusterFailed(db, cluster.id, message).catch(() => undefined)
    }
  }
  result.tokensUsed = budget.used
  return result
}
