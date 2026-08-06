import { EMBED } from "./config.ts"
import type { Db } from "./db.ts"
import { mapLimit, toVector } from "./text.ts"

export async function embedText(db: Db, text: string): Promise<number[]> {
  const { data, error } = await db.functions.invoke("generate-embedding", { body: { text } })
  if (error) throw new Error(`embedding error: ${error.message}`)
  const embedding = toVector((data as { embedding?: unknown } | null)?.embedding)
  if (!embedding.length) throw new Error(`embedding returned empty vector for "${text.slice(0, 60)}"`)
  return embedding
}

/** Embed each text with bounded concurrency, returning url -> vector pairs. */
export async function embedMany(db: Db, items: Array<{ url: string; text: string }>): Promise<Map<string, number[]>> {
  const results = new Map<string, number[]>()
  await mapLimit(items, EMBED.concurrency, async (item) => {
    const embedding = await embedText(db, item.text)
    results.set(item.url, embedding)
  })
  return results
}
