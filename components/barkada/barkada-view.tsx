"use client"

import { CameraIcon } from "lucide-react"

import { WrappedCard } from "@/components/barkada/wrapped-card"
import { Button } from "@/components/ui/button"
import { t } from "@/lib/i18n"
import { useBarkada } from "@/lib/store"

export function BarkadaView() {
  const { state, trip, now, setScreenshotMode } = useBarkada()

  if (!trip) return null
  const { lang } = state

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-heading text-lg font-semibold">{t(lang, "wrapped")}</h2>
        <span className="text-sm text-muted-foreground">
          {trip.members.length} {t(lang, "members").toLowerCase()}
        </span>
      </div>
      <p className="text-sm text-muted-foreground">{t(lang, "wrappedHint")}</p>
      <WrappedCard trip={trip} now={now} lang={lang} />
      <Button size="touch" className="w-full" onClick={() => setScreenshotMode(true)}>
        <CameraIcon data-icon="inline-start" />
        {t(lang, "screenshot")}
      </Button>
    </div>
  )
}
