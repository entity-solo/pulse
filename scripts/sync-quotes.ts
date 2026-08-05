import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

async function loadLocalEnv() {
  for (const file of [".vercel/.env.production.local", ".env.production", ".env.local", ".env"]) {
    try {
      const source = await readFile(resolve(process.cwd(), file), "utf8")
      for (const line of source.split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
        if (match) {
          const key = match[1]
          const val = match[2].replace(/^(['"])(.*)\1$/, "$2")
          if (val && val !== "[SENSITIVE]" && (!process.env[key] || process.env[key] === "[SENSITIVE]")) {
            process.env[key] = val
          }
        }
      }
    } catch (error: any) {
      if (error?.code !== "ENOENT") throw error
    }
  }
}

async function main() {
  await loadLocalEnv()
  const { runQuotes } = await import("@/lib/pipeline/ingest")
  console.log("Running Job 1: quotes:sync...")
  const result = await runQuotes({ equities: true, macro: true })
  console.log(JSON.stringify(result, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
