"use client"

import { ReceiptIcon, SparklesIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { t } from "@/lib/i18n"
import { type Lang, type Trip } from "@/lib/types"

const HERO_GLOW =
  "min-h-[38px] shadow-[0_0_18px_color-mix(in_oklch,var(--primary)_55%,transparent)] active:scale-95"

export function WrappedCta({
  trip,
  variant,
  lang,
  onOpen,
}: {
  trip: Trip
  variant: "hero" | "celebrate" | "home"
  lang: Lang
  onOpen: () => void
}) {
  if (variant === "hero" && trip.expenses.length === 0) {
    return <p className="max-w-[12rem] text-right text-xs leading-snug text-muted-foreground">{t(lang, "wrappedLocked")}</p>
  }

  if (variant === "home") {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="min-h-7 px-2 text-xs"
        onClick={(event) => {
          event.stopPropagation()
          onOpen()
        }}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <ReceiptIcon data-icon="inline-start" />
        {t(lang, "homeWrappedPill")}
      </Button>
    )
  }

  if (variant === "celebrate") {
    return (
      <Button size="cta" className="min-h-[46px]" onClick={onOpen}>
        <ReceiptIcon data-icon="inline-start" />
        {t(lang, "wrappedOpenCta")}
      </Button>
    )
  }

  return (
    <Button className={HERO_GLOW} onClick={onOpen}>
      <SparklesIcon data-icon="inline-start" />
      {t(lang, "wrappedReceiptCta")}
    </Button>
  )
}
