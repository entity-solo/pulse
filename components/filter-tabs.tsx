import Link from "next/link"

const tabs = [
  { label: "All", value: undefined },
  { label: "Tech", value: "tech" },
  { label: "Finance", value: "finance" },
  { label: "Energy", value: "energy" },
  { label: "Macro", value: "macro" },
] as const

export function FilterTabs({ active }: { active?: string }) {
  return (
    <nav aria-label="Filter stories by sector" className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-rule">
      {tabs.map((tab) => {
        const isActive = active === tab.value || (!active && !tab.value)
        return (
          <Link
            key={tab.label}
            href={tab.value ? `/?sector=${tab.value}` : "/"}
            aria-current={isActive ? "page" : undefined}
            className={`-mb-px border-b-2 pb-2 font-mono text-[11px] uppercase tracking-[0.14em] transition-colors ${
              isActive
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
