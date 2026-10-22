import { cn } from "@/lib/utils"
import { dayStr } from "@/lib/calc"
import { sulkMeta } from "@/lib/i18n"
import type { Lang } from "@/lib/types"

const FILL = ["bg-l0", "bg-l1", "bg-l2", "bg-l3", "bg-l4"] as const

export function SulkMeter({ days, lang }: { days: number; lang: Lang }) {
  const meta = sulkMeta(lang, days)
  return (
    <div
      className="flex flex-wrap items-center gap-2"
      role="img"
      aria-label={`${meta.name}, ${dayStr(days, lang)}`}
    >
      <span className="flex gap-0.5">
        {FILL.map((fill, index) => (
          <span
            key={fill}
            className={cn(
              "h-2 w-4 rounded-sm border",
              index <= meta.level ? fill : "bg-muted"
            )}
          />
        ))}
      </span>
      <span className="text-xs font-medium">
        {meta.emoji} {meta.name} · {dayStr(days, lang)}
      </span>
    </div>
  )
}
