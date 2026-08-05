import { US_EQUITIES_ALIASES, US_EQUITIES_SYMBOLS } from "../markets/us-equities"
import type { ITickerUniverse } from "./types"

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

export class Sp500TickerUniverse implements ITickerUniverse {
  readonly market = "us_sp500"

  getSymbols(): string[] {
    return [...US_EQUITIES_SYMBOLS]
  }

  getAliases(): Record<string, readonly string[]> {
    return US_EQUITIES_ALIASES
  }

  getCandidates(headline: string, summary: string): string[] {
    const text = ` ${normalize(`${headline} ${summary}`)} `
    return Object.entries(US_EQUITIES_ALIASES).flatMap(([ticker, names]) =>
      names.some((name) => text.includes(` ${normalize(name)} `)) ? [ticker] : []
    )
  }
}
