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
  const targets = process.argv.slice(2).length ? process.argv.slice(2) : ["ingest", "macro"]
  const { logRun, runIngest, runQuotes } = await import("@/lib/pipeline/ingest")
  const { createAdminClient } = await import("@/lib/supabase/admin")

  for (const target of targets) {
    if (target === "ingest") {
      console.log(JSON.stringify(await runIngest(), null, 2))
      continue
    }
    if (target === "macro") {
      const startedAt = new Date().toISOString()
      const result = await runQuotes({ equities: false, macro: true })
      await logRun(createAdminClient(), result, startedAt)
      console.log(JSON.stringify(result, null, 2))
      continue
    }
    throw new Error(`Unknown job '${target}'. Use ingest or macro.`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})