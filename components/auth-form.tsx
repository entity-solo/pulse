"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { createClient } from "@/lib/supabase/client"

type Mode = "signin" | "signup"

export function AuthForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>("signin")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setError(null)
    setNotice(null)

    const supabase = createClient()

    if (mode === "signup") {
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo:
            process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL ?? `${window.location.origin}/auth/callback`,
        },
      })
      setPending(false)

      if (signUpError) {
        const message = signUpError.message.toLowerCase()
        if (message.includes("password")) setError("That password is too weak. Use at least six characters.")
        else if (message.includes("rate") || message.includes("limit"))
          setError("Too many attempts. Wait a minute and try again.")
        else if (message.includes("invalid") && message.includes("email"))
          setError("That email address isn't accepted. Use a real mailbox you control.")
        else setError("We couldn't create that account. Please try again.")
        return
      }

      setNotice("Check your inbox to confirm your email, then sign in.")
      setMode("signin")
      return
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    setPending(false)

    if (signInError) {
      const message = signInError.message.toLowerCase()
      if (message.includes("not confirmed")) setError("Confirm your email first — check your inbox for the link.")
      else if (message.includes("rate") || message.includes("limit"))
        setError("Too many attempts. Wait a minute and try again.")
      else setError("Invalid email or password.")
      return
    }

    router.push(redirectTo)
    router.refresh()
  }

  return (
    <div>
      <h1 className="font-serif text-3xl leading-tight font-bold tracking-tight">
        {mode === "signin" ? "Sign in to Pulse" : "Create your account"}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {mode === "signin"
          ? "Track tickers and get a feed limited to your positions."
          : "Email and password. Nothing else required."}
      </p>

      <form onSubmit={onSubmit} className="mt-7 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:border-ring"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={6}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:border-ring"
          />
        </div>

        {error && <p className="text-sm text-bear">{error}</p>}
        {notice && <p className="text-sm text-bull">{notice}</p>}

        <button
          type="submit"
          disabled={pending}
          className="mt-1 border border-foreground bg-foreground px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-primary-foreground transition-opacity hover:opacity-85 disabled:opacity-60"
        >
          {pending ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
        </button>
      </form>

      <button
        type="button"
        onClick={() => {
          setMode((m) => (m === "signin" ? "signup" : "signin"))
          setError(null)
          setNotice(null)
        }}
        className="mt-5 text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
      >
        {mode === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in"}
      </button>
    </div>
  )
}
