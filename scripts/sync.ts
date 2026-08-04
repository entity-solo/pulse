import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

async function main() {
  try { for (const line of (await readFile(resolve(process.cwd(), ".env.local"), "utf8")).split(/\r?\n/)) { const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2") } } catch (error: any) { if (error?.code !== "ENOENT") throw error }
  const secret = process.env.CRON_SECRET
  if (!secret) throw new Error("Missing CRON_SECRET (set it in .env.local or your shell)")
  const baseUrl = (process.env.PULSE_URL ?? "http://localhost:3000").replace(/\/$/, "")
  const targets = process.argv.slice(2).length ? process.argv.slice(2) : ["ingest", "macro"]
  for (const target of targets) { if (target !== "ingest" && target !== "macro") throw new Error(`Unknown job '${target}'. Use ingest or macro.`); const response = await fetch(`${baseUrl}/api/cron/${target}`, { headers: { Authorization: `Bearer ${secret}` } }); console.log(`${target}: ${response.status} ${await response.text()}`); if (!response.ok) process.exitCode = 1 }
}

main().catch((error) => { console.error(error); process.exitCode = 1 })