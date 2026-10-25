"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import { getHeroCommentary } from "@/lib/companion-ai"
import { t } from "@/lib/i18n"
import type { Lang, Trip } from "@/lib/types"

export function MascotAvatar() {
  return <span aria-hidden="true" className="h-9 w-9 shrink-0 rounded-lg bg-emerald-500" />
}

export function TaliStrip({
  trip,
  viewerId,
  activeTab,
  now,
  lang,
}: {
  trip: Trip
  viewerId: string
  activeTab: string
  now: number
  lang: Lang
}) {
  const [cycle, setCycle] = useState(0)
  const { lines } = getHeroCommentary(trip, viewerId, activeTab, now)
  const message = lines[cycle % lines.length]
  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-card/80 p-2.5 backdrop-blur-sm">
      <MascotAvatar />
      <p key={message} className="min-w-0 flex-1 text-sm leading-snug wrap-break-word animate-in fade-in-0">
        {message}
      </p>
      <Button
        type="button"
        size="icon-xs"
        variant="ghost"
        aria-label={t(lang, "taliCycle")}
        onClick={() => setCycle((value) => value + 1)}
      >
        {t(lang, "taliCycle")}
      </Button>
    </div>
  )
}
