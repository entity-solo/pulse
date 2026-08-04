import Link from "next/link"

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-4 py-16">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">404</p>
      <h1 className="mt-2 font-serif text-3xl leading-tight font-bold tracking-tight">No coverage here</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        That ticker or page isn&apos;t in the wire. Try a search from the feed.
      </p>
      <Link
        href="/"
        className="mt-6 w-fit border border-foreground bg-foreground px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-primary-foreground transition-opacity hover:opacity-85"
      >
        Back to feed
      </Link>
    </main>
  )
}
