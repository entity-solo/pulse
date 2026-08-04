import Link from "next/link"

export default function AuthErrorPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-4 py-16">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-bear">Authentication</p>
      <h1 className="mt-2 font-serif text-3xl leading-tight font-bold tracking-tight">That link didn&apos;t work</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        The confirmation link may have expired or already been used. Try signing in again.
      </p>
      <Link
        href="/login"
        className="mt-6 w-fit border border-foreground bg-foreground px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-primary-foreground transition-opacity hover:opacity-85"
      >
        Back to sign in
      </Link>
    </main>
  )
}
