import { TOP100_ALIASES, TOP100_SYMBOLS } from "../sp500"
import type { ITickerUniverse } from "./types"

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

export class Sp500TickerUniverse implements ITickerUniverse {
  readonly market = "us_sp500"

  getSymbols(): string[] {
    return [...TOP100_SYMBOLS]
  }

  getAliases(): Record<string, readonly string[]> {
    return TOP100_ALIASES
  }

  getCandidates(headline: string, summary: string): string[] {
    const text = ` ${normalize(`${headline} ${summary}`)} `
    return Object.entries(TOP100_ALIASES).flatMap(([ticker, names]) =>
      names.some((name) => text.includes(` ${normalize(name)} `)) ? [ticker] : []
    )
  }
}
