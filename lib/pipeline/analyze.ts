import { generateObject } from "ai"
import { createGroq } from "@ai-sdk/groq"
import { z } from "zod"
import { ALL_SYMBOLS, ANALYSIS_MODEL, INGEST } from "./config"
import type { Article } from "./news"

const groq = createGroq({ apiKey: process.env.GROQ_API_KEY })

const sentiment = z.enum(["bull", "bear", "neut"])

/**
 * The model returns article INDEXES rather than copied text, so headlines,
 * outlets and URLs are always the verbatim provider values. This removes any
 * chance of the model inventing a source or fabricating a link.
 */
const clusterSchema = z.object({
  events: z
    .array(
      z.object({
        event_key: z
          .string()
          .describe("Stable lowercase slug identifying this real-world event, e.g. 'nvda-q3-datacenter-beat'. Must stay identical if the same event is seen again in a later run."),
        ticker: z.string().describe("The single most affected symbol. Must be one of the allowed symbols."),
        is_macro: z.boolean().describe("True when the event is economy-wide rather than company-specific."),
        sentiment: sentiment.describe("Net market impact for that ticker."),
        title: z.string().describe("One neutral, specific sentence describing the event. No outlet names, no hype."),
        summary: z.string().describe("Two sentences explaining what happened and why it moves the ticker."),
        source_indexes: z
          .array(z.number().int())
          .describe("Indexes of the provided articles that report THIS event."),
        source_angles: z
          .array(sentiment)
          .describe("Editorial angle of each article in source_indexes, in the same order."),
      }),
    )
    .describe("Distinct real-world events. Omit anything not supported by the articles."),
})

export type ClusteredEvent = {
  event_key: string
  ticker: string
  is_macro: boolean
  sentiment: "bull" | "bear" | "neut"
  title: string
  summary: string
  sources: Array<{ article: Article; angle: "bull" | "bear" | "neut" }>
  publishedAt: string
}

/**
 * Groups raw articles into deduplicated events and labels market impact.
 * Returns [] when the batch yields nothing usable — callers must treat an
 * empty result as "no new stories", never as an error.
 */
export async function clusterArticles(articles: Article[]): Promise<{ events: ClusteredEvent[]; warnings: string[] }> {
  const warnings: string[] = []
  if (articles.length === 0) return { events: [], warnings }

  const catalogue = articles
    .map((a, i) => `[${i}] (${a.outlet}${a.relatedSymbol ? `, re: ${a.relatedSymbol}` : ""}) ${a.headline}${a.summary ? ` — ${a.summary.slice(0, 220)}` : ""}`)
    .join("\n")

  const { object } = await generateObject({
    model: groq(ANALYSIS_MODEL),
    schema: clusterSchema,
    // Deterministic-ish so the same batch produces the same event_keys.
    temperature: 0.2,
    system: [
      "You are a financial news editor building an event-clustered feed.",
      "Group articles that describe the SAME underlying real-world event.",
      `Only emit an event when at least ${INGEST.minSourcesPerStory} distinct articles cover it.`,
      "Never invent facts, tickers, outlets, or URLs. Use only the supplied articles.",
      "Assign sentiment from the perspective of the affected ticker, not the tone of the writing.",
      "Prefer specific, falsifiable titles over vague ones.",
      `The ticker MUST be exactly one of: ${ALL_SYMBOLS.join(", ")}.`,
      "For economy-wide events (rates, inflation, jobs, oil supply, dollar), set is_macro true and pick the closest macro symbol (SPX, US10Y, DXY, WTI, XAU, VIX).",
    ].join("\n"),
    prompt: `Cluster these ${articles.length} articles into distinct market events.\n\n${catalogue}`,
  })

  const allowed = new Set(ALL_SYMBOLS)
  const events: ClusteredEvent[] = []
  const usedKeys = new Set<string>()

  for (const raw of object.events) {
    const ticker = raw.ticker.trim().toUpperCase()
    if (!allowed.has(ticker)) {
      // stories.ticker has a NOT NULL FK to tickers.symbol — an unknown symbol
      // would fail the insert, so drop the event rather than corrupt the batch.
      warnings.push(`dropped event '${raw.event_key}': unknown ticker ${ticker}`)
      continue
    }

    // Resolve indexes back to the real articles; ignore out-of-range hallucinations.
    const seen = new Set<string>()
    const sources = raw.source_indexes
      .map((idx, position) => {
        const article = articles[idx]
        if (!article || seen.has(article.url)) return null
        seen.add(article.url)
        return { article, angle: raw.source_angles[position] ?? "neut" }
      })
      .filter((s): s is NonNullable<typeof s> => s !== null)
      .slice(0, INGEST.maxSourcesPerStory)

    if (sources.length < INGEST.minSourcesPerStory) {
      warnings.push(`dropped event '${raw.event_key}': only ${sources.length} resolvable source(s)`)
      continue
    }

    const key = raw.event_key
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 120)
    if (!key || usedKeys.has(key)) {
      warnings.push(`dropped event with duplicate/empty key '${raw.event_key}'`)
      continue
    }
    usedKeys.add(key)

    events.push({
      event_key: key,
      ticker,
      is_macro: raw.is_macro,
      sentiment: raw.sentiment,
      title: raw.title.trim(),
      summary: raw.summary.trim(),
      sources,
      // Story timestamp = earliest article in the cluster (when it broke).
      publishedAt: sources.reduce(
        (earliest, s) => (s.article.publishedAt < earliest ? s.article.publishedAt : earliest),
        sources[0].article.publishedAt,
      ),
    })
  }

  return { events, warnings }
}
