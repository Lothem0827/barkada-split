"use client"

import { Button } from "@/components/ui/button"
import { parsePeso, plain } from "@/lib/calc"
import { t } from "@/lib/i18n"
import type { Lang } from "@/lib/types"

const BUMPS = [
  { pesos: 50, label: "+₱50" },
  { pesos: 100, label: "+₱100" },
  { pesos: 500, label: "+₱500" },
  { pesos: 1000, label: "+₱1,000" },
] as const

export function bumpAmount(current: string, pesos: number) {
  const cents = parsePeso(current)
  const base = Number.isFinite(cents) ? cents : 0
  return plain(base + pesos * 100)
}

export function AmountBumpers({
  value,
  onChange,
  lang,
}: {
  value: string
  onChange: (next: string) => void
  lang: Lang
}) {
  return (
    <div className="no-scrollbar flex gap-2 overflow-x-auto overscroll-x-contain">
      {BUMPS.map((item) => (
        <Button
          key={item.pesos}
          type="button"
          variant="outline"
          className="min-h-[40px] shrink-0 px-3.5"
          onClick={() => onChange(bumpAmount(value, item.pesos))}
        >
          {item.label}
        </Button>
      ))}
      <Button
        type="button"
        variant="ghost"
        className="min-h-[40px] shrink-0 px-3.5"
        onClick={() => onChange("")}
      >
        {t(lang, "clear")}
      </Button>
    </div>
  )
}
