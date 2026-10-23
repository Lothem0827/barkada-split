"use client"

import { BanknoteIcon, EyeOffIcon, MegaphoneIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { daysOwed, fmtAgoFine, lvl, transfers } from "@/lib/calc"
import { t } from "@/lib/i18n"
import { useBarkada } from "@/lib/store"
import { hatianKeyForNudge, memberName, newestUnreadNudge } from "@/lib/types"

const ACCENT = [
  "border-l0 bg-l0/15",
  "border-l1 bg-l1/15",
  "border-l2 bg-l2/15",
  "border-l3 bg-l3/15",
  "border-l4 bg-l4/15",
] as const

export function IncomingNudge({
  onPay,
  onDismiss,
}: {
  onPay: (focusKey: string) => void
  onDismiss: () => void
}) {
  const { state, trip, now, resolveNudge } = useBarkada()
  if (!trip) return null
  const nudge = newestUnreadNudge(trip.nudges, state.as)
  if (!nudge) return null
  const { lang, as } = state
  const level = lvl(daysOwed(trip, as, now))

  return (
    <div className="px-4 pt-4">
      <Card className={`border-l-4 ${ACCENT[level] ?? ACCENT[0]}`}>
        <CardContent className="flex flex-col gap-3">
          <div>
            <p className="font-heading inline-flex items-start gap-1.5 text-base font-bold wrap-break-word">
              <MegaphoneIcon className="mt-0.5 size-4 shrink-0" />
              <span>{t(lang, "incomingNudgeTitle").replace("{name}", memberName(trip, as))}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              {t(lang, "incomingNudgeFrom")
                .replace("{name}", memberName(trip, nudge.from))
                .replace("{ago}", fmtAgoFine(nudge.ts, now, lang))}
            </p>
          </div>
          <p className="rounded-2xl rounded-tl-md border bg-background p-3 text-sm whitespace-pre-wrap wrap-break-word">
            {nudge.message}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              className="min-h-[44px]"
              onClick={() => {
                resolveNudge(nudge.id, "read")
                onPay(hatianKeyForNudge(trip, nudge, transfers(trip)))
              }}
            >
              <BanknoteIcon data-icon="inline-start" />
              {t(lang, "payNow")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="min-h-[44px]"
              onClick={() => {
                resolveNudge(nudge.id, "seen_zoned")
                onDismiss()
              }}
            >
              <EyeOffIcon data-icon="inline-start" />
              {t(lang, "seenZone")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
