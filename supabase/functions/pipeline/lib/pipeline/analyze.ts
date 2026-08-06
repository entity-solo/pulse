import { analyzeStableClusters, assignArticlesToClusters } from "./clusters.ts"
import { EMBED, FILTER, INGEST } from "./config.ts"
import {
  claimForEmbedding,
  claimForFilter,
  loadActiveClusters,
  logRejection,
  markArticleDone,
  markEmbedded,
  markEmbedFailed,
  markFilterRetry,
  removeArticle,
  runGc,
  setEmbedding,
  type Db,
  type PipelineArticle,
} from "./db.ts"
import { embedMany } from "./embedding.ts"
import { buildAnchors, filterArticle } from "./filter.ts"
import type { Budget } from "./groq.ts"

export type AnalyzeRunStats = {
  embedded: number
  kept: number
  rejected: number
  filterRetry: number
  clusterAssigned: number
  matchedExisting: number
  newClusters: number
  storiesUpserted: number
  sourcesUpserted: number
  tokensUsed: number
  warnings: string[]
  errors: string[]
}

/**
 * The analyze pipeline (embed -> filter -> cluster -> analyze). Runs under a
 * single-flight lock acquired by the caller, so claim/process is safe.
 */
export async function runAnalyzeSteps(db: Db): Promise<AnalyzeRunStats> {
  const stats: AnalyzeRunStats = {
    embedded: 0,
    kept: 0,
    rejected: 0,
    filterRetry: 0,
    clusterAssigned: 0,
    matchedExisting: 0,
    newClusters: 0,
    storiesUpserted: 0,
    sourcesUpserted: 0,
    tokensUsed: 0,
    warnings: [],
    errors: [],
  }

  try {
    await runGc(db, stats.warnings)
  } catch (error) {
    stats.warnings.push(`gc: ${error instanceof Error ? error.message : String(error)}`)
  }

  let anchors
  try {
    anchors = await buildAnchors(db)
  } catch (error) {
    stats.errors.push(`anchor embeddings: ${error instanceof Error ? error.message : String(error)}`)
    return stats
  }

  // Step 1: embed. Failures stay 'pending' so the next run retries them.
  try {
    const pending = await claimForEmbedding(db, EMBED.maxPerRun)
    let embeddings: Map<string, number[]> = new Map()
    try {
      embeddings = await embedMany(
        db,
        pending.map((article) => ({ url: article.url, text: `${article.headline}. ${article.summary}` })),
      )
    } catch (error) {
      for (const article of pending) await markEmbedFailed(db, article.url).catch(() => undefined)
      stats.warnings.push(`embed step failed for ${pending.length} articles: ${error instanceof Error ? error.message : String(error)}`)
    }
    for (const [url, embedding] of embeddings) {
      try {
        await setEmbedding(db, url, embedding)
        await markEmbedded(db, url)
        stats.embedded++
      } catch (error) {
        await markEmbedFailed(db, url).catch(() => undefined)
        stats.warnings.push(`embed failed ${url}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  } catch (error) {
    stats.errors.push(`embed step: ${error instanceof Error ? error.message : String(error)}`)
  }

  // Step 2: filter against financial anchors. Irrelevant articles are logged
  // to article_rejections and deleted; the rest proceed to clustering.
  let kept: PipelineArticle[] = []
  const filterBudget: Budget = { used: 0, limit: INGEST.classificationTokenBudget }
  try {
    const activeClusters = await loadActiveClusters(db)
    const memberUrls = new Set<string>()
    for (const cluster of activeClusters) {
      if (Array.isArray(cluster.member_urls)) for (const url of cluster.member_urls) memberUrls.add(String(url))
    }
    const claimed = await claimForFilter(db, FILTER.maxPerRun, memberUrls)
    for (const article of claimed) {
      try {
        const decision = await filterArticle(db, article, anchors, filterBudget)
        if (decision.action === "keep") {
          await markArticleDone(db, article.url)
          kept.push(article)
          stats.kept++
        } else if (decision.action === "reject") {
          await logRejection(db, {
            url: article.url,
            headline: article.headline,
            outlet: article.outlet,
            publishedAt: article.publishedAt,
            reason: decision.reason,
            score: decision.score,
            anchor: decision.anchor,
          })
          await removeArticle(db, article.url)
          stats.rejected++
        } else {
          await markFilterRetry(db, article.url, decision.reason)
          stats.filterRetry++
        }
      } catch (error) {
        await markFilterRetry(db, article.url, error instanceof Error ? error.message : String(error)).catch(() => undefined)
        stats.filterRetry++
        stats.warnings.push(`filter failed ${article.url}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  } catch (error) {
    stats.errors.push(`filter step: ${error instanceof Error ? error.message : String(error)}`)
  }

  // Step 3: cluster (event-based, ticker assigned after clustering).
  try {
    const assignment = await assignArticlesToClusters(db, kept, stats.warnings)
    stats.clusterAssigned = assignment.assigned
    stats.matchedExisting = assignment.matchedExisting
    stats.newClusters = assignment.newClusters
  } catch (error) {
    stats.errors.push(`cluster step: ${error instanceof Error ? error.message : String(error)}`)
  }

  // Step 4: analyze stable clusters once, top-5 by centroid proximity.
  try {
    const { data: tickerRows, error: tickerError } = await db.from("tickers").select("symbol, price, change_pct, direction")
    if (tickerError) throw new Error(tickerError.message)
    const tickerContext = new Map<string, { price: number; change_pct: number; direction: string }>(
      (tickerRows ?? []).map((row) => [
        String(row.symbol),
        { price: Number(row.price), change_pct: Number(row.change_pct), direction: String(row.direction) },
      ])
    )
    const analysisBudget: Budget = { used: 0, limit: INGEST.analysisTokenBudget }
    const analysis = await analyzeStableClusters(db, analysisBudget, tickerContext)
    stats.storiesUpserted = analysis.storiesUpserted
    stats.sourcesUpserted = analysis.sourcesUpserted
    stats.warnings.push(...analysis.warnings)
    stats.tokensUsed = filterBudget.used + analysisBudget.used
  } catch (error) {
    stats.errors.push(`analyze step: ${error instanceof Error ? error.message : String(error)}`)
  }

  return stats
}
