import { readFile, writeFile, mkdir } from "fs/promises"
import { resolve } from "path"

async function loadEnv() {
  try {
    const envPath = resolve(process.cwd(), ".env.local")
    const envText = await readFile(envPath, "utf8")
    for (const line of envText.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2")
      }
    }
  } catch {
    // Fall back to process.env
  }
}

function normalizeSector(rawSector: string): string {
  const s = (rawSector || "").toLowerCase()
  if (s.includes("tech") || s.includes("software") || s.includes("semiconductor")) return "tech"
  if (s.includes("health") || s.includes("pharma") || s.includes("biotech")) return "healthcare"
  if (s.includes("financial") || s.includes("bank") || s.includes("insurance")) return "finance"
  if (s.includes("energy") || s.includes("oil") || s.includes("gas")) return "energy"
  if (s.includes("consumer") || s.includes("retail")) return "consumer"
  if (s.includes("industrial")) return "industrials"
  if (s.includes("material")) return "materials"
  if (s.includes("real estate")) return "realestate"
  if (s.includes("telecom") || s.includes("communication")) return "telecom"
  if (s.includes("utility") || s.includes("utilities")) return "utilities"
  return "tech"
}

function generateAliases(symbol: string, name: string): string[] {
  const aliases = new Set<string>()
  aliases.add(symbol)
  const cleanName = name.replace(/\s+(Inc\.|Corp\.|Corporation|Co\.|Ltd\.|LLC|plc|Group|Holdings|Company)\b/gi, "").trim()
  if (cleanName && cleanName.length > 2) aliases.add(cleanName)
  if (name && name !== cleanName) aliases.add(name)
  return Array.from(aliases)
}

async function main() {
  await loadEnv()
  const apiKey = process.env.FINNHUB_API_KEY
  if (!apiKey) throw new Error("Missing FINNHUB_API_KEY in environment")

  console.log("[fetch-tickers] 1. Calling Finnhub /stock/symbol?exchange=US endpoint...")
  const res = await fetch(`https://finnhub.io/api/v1/stock/symbol?exchange=US&token=${apiKey}`)
  if (!res.ok) throw new Error(`Finnhub API error ${res.status}: ${await res.text()}`)

  const rawSymbols = (await res.json()) as Array<{
    symbol: string
    description: string
    type: string
    mic: string
  }>

  console.log(`\n=== STEP 1: RAW FINNHUB SYMBOLS ===`)
  console.log(`Total raw symbols: ${rawSymbols.length}`)
  console.log(`First 5:`, rawSymbols.slice(0, 5).map((s) => s.symbol))
  console.log(`Last 5:`, rawSymbols.slice(-5).map((s) => s.symbol))

  // Step 2: Filter by MIC (XNYS, XNAS)
  const micFiltered = rawSymbols.filter((s) => s.mic === "XNYS" || s.mic === "XNAS")
  console.log(`\n=== STEP 2: AFTER MIC FILTER (XNYS, XNAS) ===`)
  console.log(`Count: ${micFiltered.length}`)
  console.log(`First 5:`, micFiltered.slice(0, 5).map((s) => s.symbol))
  console.log(`Last 5:`, micFiltered.slice(-5).map((s) => s.symbol))

  // Step 3: Filter by Type ('Common Stock')
  const typeFiltered = micFiltered.filter((s) => s.type === "Common Stock")
  console.log(`\n=== STEP 3: AFTER TYPE FILTER ('Common Stock') ===`)
  console.log(`Count: ${typeFiltered.length}`)
  console.log(`First 5:`, typeFiltered.slice(0, 5).map((s) => `${s.symbol} (${s.description})`))
  console.log(`Last 5:`, typeFiltered.slice(-5).map((s) => `${s.symbol} (${s.description})`))

  const finnhubMap = new Map<string, { description: string; mic: string }>()
  typeFiltered.forEach((item) => {
    finnhubMap.set(item.symbol, { description: item.description, mic: item.mic })
    // Also map hyphenated / dotted ticker variants (e.g., BRK.B / BRK-B)
    finnhubMap.set(item.symbol.replace("-", "."), { description: item.description, mic: item.mic })
  })

  // Step 4: Fetch S&P 500 Index Constituents dataset
  console.log(`\n=== STEP 4: FETCHING S&P 500 CONSTITUENTS ===`)
  let constituents: Array<{ symbol: string; name: string; sector: string }> = []

  // Try Finnhub index constituents endpoint first
  try {
    const idxRes = await fetch(`https://finnhub.io/api/v1/index/constituents?symbol=^GSPC&token=${apiKey}`)
    if (idxRes.ok) {
      const idxData = await idxRes.json()
      if (Array.isArray(idxData.constituents)) {
        const symbolsList: string[] = idxData.constituents
        constituents = symbolsList.map((sym) => ({ symbol: sym, name: sym, sector: "tech" }))
        console.log(`Fetched S&P 500 constituents from Finnhub API: ${constituents.length} symbols`)
      }
    }
  } catch (err) {
    console.log(`Finnhub index/constituents endpoint unavailable or restricted: ${err}`)
  }

  // Fallback to S&P 500 constituents raw dataset if Finnhub premium endpoint is restricted
  if (constituents.length < 400) {
    const csvUrl = "https://raw.githubusercontent.com/datasets/s-and-p-500-companies/master/data/constituents.csv"
    console.log(`Fetching S&P 500 constituents dataset from: ${csvUrl}`)
    const csvRes = await fetch(csvUrl)
    if (csvRes.ok) {
      const csvText = await csvRes.text()
      const lines = csvText.split(/\r?\n/).filter(Boolean)
      const parsed = lines.slice(1).map((line) => {
        const parts = line.split(",")
        const sym = parts[0]?.trim().replace(/^"|"$/g, "") || ""
        const name = parts[1]?.trim().replace(/^"|"$/g, "") || ""
        const sec = parts[2]?.trim().replace(/^"|"$/g, "") || ""
        return { symbol: sym, name, sector: normalizeSector(sec) }
      }).filter((item) => Boolean(item.symbol))
      constituents = parsed
      console.log(`Fetched S&P 500 constituents from dataset: ${constituents.length} symbols`)
    }
  }

  console.log(`Total S&P 500 constituents fetched: ${constituents.length}`)
  console.log(`First 5 constituents:`, constituents.slice(0, 5).map((c) => c.symbol))
  console.log(`Last 5 constituents:`, constituents.slice(-5).map((c) => c.symbol))

  // Step 5: Enrich constituents with Finnhub official symbol/name metadata
  const finalTickers = constituents.map((item) => {
    const finnhubInfo = finnhubMap.get(item.symbol) || finnhubMap.get(item.symbol.replace(".", "-"))
    const officialName = finnhubInfo?.description || item.name
    const aliases = generateAliases(item.symbol, officialName)
    return {
      symbol: item.symbol,
      name: officialName,
      sector: item.sector || "tech",
      aliases,
    }
  })

  console.log(`\n=== STEP 5: FINAL ENRICHED S&P 500 TICKERS ===`)
  console.log(`Final output count: ${finalTickers.length} tickers`)
  console.log(`First 5 enriched:`, finalTickers.slice(0, 5))
  console.log(`Last 5 enriched:`, finalTickers.slice(-5))

  const fileContent = `/**
 * AUTO-GENERATED FILE — DO NOT EDIT DIRECTLY.
 * Generated by scripts/fetch-tickers.ts via Finnhub API + S&P 500 constituents.
 * Timestamp: ${new Date().toISOString()}
 */

export type EquityTicker = {
  symbol: string
  name: string
  sector: string
  aliases: readonly string[]
}

export const US_EQUITIES_TICKERS: readonly EquityTicker[] = ${JSON.stringify(finalTickers, null, 2)} as const

export const US_EQUITIES_SYMBOLS: readonly string[] = US_EQUITIES_TICKERS.map((t) => t.symbol)

export const US_EQUITIES_ALIASES: Record<string, readonly string[]> = Object.fromEntries(
  US_EQUITIES_TICKERS.map((t) => [t.symbol, t.aliases])
)
`

  const targetDir = resolve(process.cwd(), "supabase/functions/pipeline/lib/pipeline/markets")
  await mkdir(targetDir, { recursive: true })

  const targetFile = resolve(targetDir, "us-equities.ts")
  await writeFile(targetFile, fileContent, "utf8")
  console.log(`\n[fetch-tickers] Successfully wrote ${finalTickers.length} tickers to ${targetFile}`)
}

main().catch(console.error)
