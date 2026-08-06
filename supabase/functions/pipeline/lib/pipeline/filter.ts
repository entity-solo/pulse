import { CLASSIFICATION_MODEL, FILTER, FINANCIAL_ANCHORS, PROMPT } from "./config.ts"
import type { Db, PipelineArticle } from "./db.ts"
import { embedText } from "./embedding.ts"
import { groqJson, type Budget } from "./groq.ts"
import { cosine, mapLimit, truncate } from "./text.ts"

export type AnchorEmbedding = { label: string; embedding: number[] }

export type FilterDecision =
  | { action: "keep"; score: number; anchor: string | null; reason: string }
  | { action: "reject"; score: number; anchor: string | null; reason: string }
  | { action: "retry"; reason: string }

const anchorCache = new Map<string, number[]>()

/** Embed every financial anchor once per run (module state resets per invocation). */
export async function buildAnchors(db: Db): Promise<AnchorEmbedding[]> {
  const missing = FINANCIAL_ANCHORS.filter((anchor) => !anchorCache.has(anchor.text))
  await mapLimit(missing, 4, async (anchor) => {
    anchorCache.set(anchor.text, await embedText(db, anchor.text))
  })
  return FINANCIAL_ANCHORS.map((anchor) => ({ label: anchor.label, embedding: anchorCache.get(anchor.text)! }))
}

async function decideUncertain(article: PipelineArticle, score: number, anchor: string | null, budget: Budget): Promise<FilterDecision> {
  const headline = truncate(article.headline, 300)
  const summary = truncate(article.summary, PROMPT.filterPromptMaxChars)
  const system = `You are a news relevance judge for a financial markets dashboard.
Return ONLY valid JSON matching this schema: {"relevant": true, "reason": "one short sentence"}.
An article is relevant only if it describes a market-moving event: company earnings, M&A, macro data, rates, commodities, crypto, FX, or analyst/regulatory news with trading implications.
Generic tech, sports, politics, or lifestyle coverage is NOT relevant.`
  const prompt = `Closest financial topic: ${anchor ?? "unknown"} (cosine similarity ${score.toFixed(3)}).
Headline: ${headline}
Summary: ${summary}`
  const result = (await groqJson({
    model: CLASSIFICATION_MODEL,
    system,
    prompt,
    budget,
    maxTokens: 300,
    articleCount: 1,
  })) as { relevant?: unknown; reason?: unknown }
  const relevant = result.relevant === true || String(result.relevant).toLowerCase() === "true"
  const reason = String(result.reason ?? (relevant ? "relevant via uncertain band" : "irrelevant via uncertain band")).slice(0, 200)
  return relevant
    ? { action: "keep", score, anchor, reason }
    : { action: "reject", score, anchor, reason }
}

/**
 * Step 2 of the analyze job. Embedding-vs-anchor cosine decides relevance:
 * >= relevantThreshold keep, < irrelevantThreshold reject, else Groq decides.
 * Groq failure returns "retry" so the article is re-attempted next run.
 */
export async function filterArticle(
  db: Db,
  article: PipelineArticle,
  anchors: AnchorEmbedding[],
  budget: Budget
): Promise<FilterDecision> {
  if (!article.embedding?.length) return { action: "retry", reason: "missing embedding" }

  let best = 0
  let bestAnchor: string | null = null
  for (const anchor of anchors) {
    const score = cosine(article.embedding, anchor.embedding)
    if (score > best) {
      best = score
      bestAnchor = anchor.label
    }
  }

  if (best >= FILTER.relevantThreshold) {
    return { action: "keep", score: best, anchor: bestAnchor, reason: `relevant (${best.toFixed(3)} vs ${bestAnchor})` }
  }
  if (best < FILTER.irrelevantThreshold) {
    return { action: "reject", score: best, anchor: bestAnchor, reason: `irrelevant (${best.toFixed(3)} vs ${bestAnchor})` }
  }
  try {
    return await decideUncertain(article, best, bestAnchor, budget)
  } catch (error) {
    return { action: "retry", reason: error instanceof Error ? error.message : String(error) }
  }
}
