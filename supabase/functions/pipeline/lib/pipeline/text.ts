const STOP_WORDS = new Set([
  "the", "and", "for", "with", "from", "after", "into", "over", "that", "this", "will",
  "stock", "shares", "market", "company", "reports", "quarterly", "earnings", "says",
  "said", "a", "an", "of", "in", "on", "to", "as", "at", "by", "or", "but", "is", "are",
  "was", "were", "be", "been", "its", "it's", "their", "more", "most", "new", "after",
])

export function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

export function words(value: string): Set<string> {
  return new Set(normalize(value).split(" ").filter((word) => word.length > 2 && !STOP_WORDS.has(word)))
}

/** Jaccard-style overlap on the smaller word set (0..1). */
export function overlap(left: string, right: string): number {
  const a = words(left)
  const b = words(right)
  if (!a.size || !b.size) return 0
  let shared = 0
  for (const word of a) if (b.has(word)) shared++
  return shared / Math.max(1, Math.min(a.size, b.size))
}

export function titleSimilarity(left: string, right: string): number {
  return overlap(left, right)
}

export function hash(value: string): string {
  let result = 2_166_136_261
  for (let i = 0; i < value.length; i++) {
    result ^= value.charCodeAt(i)
    result = Math.imul(result, 16_777_619)
  }
  return (result >>> 0).toString(16)
}

export function slug(value: string): string {
  return normalize(value).replace(/\s+/g, "-").slice(0, 80)
}

export function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value
  return `${value.slice(0, maxChars).trimEnd()}…`
}

export function tokenEstimate(value: string): number {
  return Math.ceil(value.length / 4)
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** PostgREST may return a pgvector column as a JSON array or a "[...]" string. */
export function toVector(value: unknown): number[] {
  if (Array.isArray(value)) return value.map(Number).filter((n) => Number.isFinite(n))
  if (typeof value === "string") {
    const parsed: unknown = JSON.parse(value)
    if (Array.isArray(parsed)) return parsed.map(Number).filter((n) => Number.isFinite(n))
  }
  return []
}

export function cosine(left: number[], right: number[]): number {
  if (!left.length || !right.length || left.length !== right.length) return 0
  let dot = 0
  let a = 0
  let b = 0
  for (let i = 0; i < left.length; i++) {
    dot += left[i] * right[i]
    a += left[i] * left[i]
    b += right[i] * right[i]
  }
  const denom = Math.sqrt(a) * Math.sqrt(b)
  return denom === 0 ? 0 : dot / denom
}

export function meanVector(vectors: number[][]): number[] {
  const dim = vectors[0]?.length ?? 0
  if (!dim) return []
  const sum = new Array(dim).fill(0)
  for (const vector of vectors) {
    for (let i = 0; i < dim; i++) sum[i] += vector[i] ?? 0
  }
  return sum.map((v) => v / vectors.length)
}

/** Normalize a vector to unit length so cosine == dot product. */
export function normalizeVector(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((acc, v) => acc + v * v, 0))
  if (!magnitude) return vector
  return vector.map((v) => v / magnitude)
}

/** Run `fn` over `items` with bounded concurrency, preserving order. */
export async function mapLimit<T, R>(items: T[], concurrency: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await fn(items[index], index)
    }
  })
  await Promise.all(workers)
  return results
}
