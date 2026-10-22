"use client"

import { useState } from "react"
import { CopyIcon, Share2Icon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import { t } from "@/lib/i18n"
import { inviteUrl } from "@/lib/join-code"
import { copyText, shareOrCopy } from "@/lib/snapshot"
import { useBarkada } from "@/lib/store"

export function InviteBarkadaSheet({
  open,
  onOpenChange,
  seatId,
  showSkip,
  onSkip,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  seatId?: string | null
  showSkip?: boolean
  onSkip?: () => void
}) {
  const { state, trip } = useBarkada()
  const { lang } = state
  const [copied, setCopied] = useState(false)
  const [codeCopied, setCodeCopied] = useState(false)

  if (!trip) return null
  const live = trip

  const url = inviteUrl(live.joinCode, "", seatId || undefined)
  const message = t(lang, "inviteMsg")
    .replace("{name}", live.name)
    .replace("{url}", url)
    .replace("{code}", live.joinCode)

  async function share() {
    const result = await shareOrCopy(url, live.name, message)
    if (result === "copied") {
      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(15)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2200)
    } else if (result === "manual") {
      await copyText(message)
    }
  }

  async function copyCode() {
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(15)
    const ok = await copyText(live.joinCode)
    if (ok) {
      setCodeCopied(true)
      window.setTimeout(() => setCodeCopied(false), 1500)
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange} swipeDirection="down" showSwipeHandle>
      <DrawerContent className="mx-auto max-w-[560px]">
        <DrawerHeader>
          <DrawerTitle className="wrap-break-word">{t(lang, "inviteSheetTitle").replace("{name}", live.name)}</DrawerTitle>
          <DrawerDescription>{t(lang, "inviteHint")}</DrawerDescription>
        </DrawerHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-3">
          <div className="rounded-2xl border bg-muted/40 p-4">
            <p className="text-center font-mono text-4xl font-extrabold tracking-[0.18em]">{live.joinCode}</p>
            <div className="mt-3 flex justify-center">
              <Button size="touch" variant="outline" className="min-h-[40px] rounded-full" onClick={() => void copyCode()}>
                <CopyIcon data-icon="inline-start" />
                {codeCopied ? t(lang, "copyDone") : t(lang, "copyJoinCode")}
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {live.members.map((member) => (
                <Badge key={member.id} variant={member.claimedByUid ? "default" : "secondary"}>
                  {member.id === live.treasurer ? "👑 " : member.claimedByUid ? "🟢 " : "⏳ "}
                  {member.name}
                </Badge>
              ))}
            </div>
          </div>
          <div className="rounded-xl border bg-card p-3 text-sm wrap-break-word">{message}</div>
        </div>
        <DrawerFooter>
          <Button size="cta" className="min-h-[50px]" onClick={() => void share()}>
            <Share2Icon data-icon="inline-start" />
            {copied ? t(lang, "inviteCopiedGc") : t(lang, "shareInvite")}
          </Button>
          {showSkip ? (
            <Button
              size="cta"
              variant="ghost"
              className="min-h-[50px]"
              onClick={() => {
                onOpenChange(false)
                onSkip?.()
              }}
            >
              {t(lang, "skipLog")}
            </Button>
          ) : null}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
