import { sleep, tokenEstimate } from "./text.ts"

export type Budget = { used: number; limit: number }

type GroqOptions = {
  model: string
  system: string
  prompt: string
  budget: Budget
  maxTokens: number
  /** When set, request size is estimated per article instead of by char count. */
  articleCount?: number
  temperature?: number
}

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
      if (currentTokens + estimatedTokens <= this.maxWindowTokens) break
      const oldest = this.history[0]
      const waitMs = oldest ? Math.max(100, oldest.timestamp + this.windowMs - now + 100) : 1000
      await sleep(waitMs)
    }
  }

  recordUsage(actualTokens: number) {
    this.history.push({ timestamp: Date.now(), tokens: actualTokens })
  }
}

const limiters = new Map<string, TokenRateLimiter>()
function limiterFor(model: string): TokenRateLimiter {
  let limiter = limiters.get(model)
  if (!limiter) {
    limiter = new TokenRateLimiter(5500, 60_000)
    limiters.set(model, limiter)
  }
  return limiter
}

function parseJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
  const start = trimmed.indexOf("{")
  const end = trimmed.lastIndexOf("}")
  return JSON.parse(start >= 0 && end >= start ? trimmed.slice(start, end + 1) : trimmed)
}

export async function groqJson({ model, system, prompt, budget, maxTokens, articleCount, temperature = 0 }: GroqOptions): Promise<unknown> {
  const estimated = articleCount && articleCount > 0 ? articleCount * 300 + 600 : tokenEstimate(system) + tokenEstimate(prompt) + maxTokens
  if (budget.used + estimated > budget.limit) throw new Error(`token budget exhausted (${budget.used}/${budget.limit})`)

  const apiKey = Deno.env.get("GROQ_API_KEY")
  if (!apiKey) throw new Error("Missing GROQ_API_KEY")

  const limiter = limiterFor(model)
  await limiter.acquire(estimated)

  const maxRetries = 5
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          temperature,
          response_format: { type: "json_object" },
          max_tokens: maxTokens,
          messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
        }),
        signal: AbortSignal.timeout(20_000),
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

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>
        usage?: { total_tokens?: number }
      }
      const actualTokens = data.usage?.total_tokens ?? estimated
      budget.used += actualTokens
      limiter.recordUsage(actualTokens)
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
