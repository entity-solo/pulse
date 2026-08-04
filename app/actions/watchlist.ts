"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

export async function toggleWatchlist(symbol: string) {
  const ticker = symbol.trim().toUpperCase().slice(0, 12)
  if (!ticker) return { ok: false, error: "Missing ticker." }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "Sign in to use your watchlist." }

  const { data: existing } = await supabase
    .from("watchlist")
    .select("id")
    .eq("user_id", user.id)
    .eq("ticker", ticker)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase.from("watchlist").delete().eq("id", existing.id)
    if (error) return { ok: false, error: "Could not remove that ticker." }
  } else {
    const { error } = await supabase.from("watchlist").insert({ user_id: user.id, ticker })
    if (error) return { ok: false, error: "Could not save that ticker." }
  }

  revalidatePath("/")
  revalidatePath("/watchlist")
  revalidatePath(`/stock/${ticker}`)
  return { ok: true, saved: !existing }
}
