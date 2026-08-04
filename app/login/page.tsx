import Link from "next/link"
import { AuthForm } from "@/components/auth-form"

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams
  const redirectTo = next?.startsWith("/") ? next : "/"

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-foreground">
        <div className="mx-auto flex max-w-6xl items-baseline gap-2 px-4 py-4 sm:px-6">
          <Link href="/" className="font-serif text-2xl leading-none font-bold tracking-tight">
            Pulse
          </Link>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Market Wire</span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-16">
        <AuthForm redirectTo={redirectTo} />
      </main>
    </div>
  )
}
