"use client"

import { useEffect, useMemo, useState } from "react"
import { CameraIcon, ClockIcon, CopyIcon, SearchIcon, Share2Icon, TargetIcon, UsersIcon } from "lucide-react"
import { encode } from "uqr"

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
import { activeMembers } from "@/lib/types"

function QrSvg({ value, size, label }: { value: string; size: number; label: string }) {
  const qr = useMemo(() => (value ? encode(value, { ecc: "M", border: 2 }) : null), [value])
  const d = useMemo(() => {
    if (!qr) return ""
    const parts: string[] = []
    for (let y = 0; y < qr.size; y++) {
      const row = qr.data[y]
      for (let x = 0; x < qr.size; x++) {
        if (row[x]) parts.push(`M${x} ${y}h1v1h-1z`)
      }
    }
    return parts.join("")
  }, [qr])

  return (
    <svg
      width={size}
      height={size}
      viewBox={qr ? `0 0 ${qr.size} ${qr.size}` : "0 0 1 1"}
      shapeRendering="crispEdges"
      role="img"
      aria-label={label}
      className="block"
    >
      <rect width="100%" height="100%" fill="#fff" />
      {d ? <path fill="#111" d={d} /> : null}
    </svg>
  )
}

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
  const [msgCopied, setMsgCopied] = useState(false)
  const [selectedSeat, setSelectedSeat] = useState<string | null>(seatId ?? null)
  const [isQrZoomed, setIsQrZoomed] = useState(false)
  const [origin, setOrigin] = useState("")

  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  useEffect(() => {
    if (!open) return
    setSelectedSeat(seatId ?? null)
    setIsQrZoomed(false)
    setCopied(false)
    setCodeCopied(false)
    setMsgCopied(false)
  }, [open, seatId])

  if (!trip) return null
  const live = trip
  const roster = activeMembers(live)
  const waiting = roster.filter((member) => !member.claimedByUid)
  const joined = roster.length - waiting.length
  const activeSeat = selectedSeat && waiting.some((member) => member.id === selectedSeat) ? selectedSeat : null
  const target = activeSeat ? live.members.find((member) => member.id === activeSeat) : null
  const url = origin ? inviteUrl(live.joinCode, origin, activeSeat || undefined) : ""
  const message = t(lang, "inviteMsg")
    .replace("{name}", live.name)
    .replace("{url}", url)
    .replace("{code}", live.joinCode)
  const qrSize = isQrZoomed ? 240 : 128

  async function share() {
    const result = await shareOrCopy(url, live.name, message)
    if (result === "copied") {
      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(15)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
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

  async function copyMessage() {
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(15)
    const ok = await copyText(message)
    if (ok) {
      setMsgCopied(true)
      window.setTimeout(() => setMsgCopied(false), 1500)
    }
  }

  const qrBlock = (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        aria-pressed={isQrZoomed}
        aria-label={t(lang, "enlargeQr")}
        className="bg-white rounded-2xl p-3 shadow-sm transition-[width,height] duration-300"
        onClick={() => setIsQrZoomed((on) => !on)}
      >
        <QrSvg value={url} size={qrSize} label={t(lang, "enlargeQr")} />
      </button>
      <Button
        size="xs"
        variant="secondary"
        className="min-h-[28px] rounded-full px-3"
        aria-pressed={isQrZoomed}
        onClick={() => setIsQrZoomed((on) => !on)}
      >
        <SearchIcon data-icon="inline-start" />
        {t(lang, "enlargeQr")}
      </Button>
    </div>
  )

  return (
    <Drawer open={open} onOpenChange={onOpenChange} swipeDirection="down" showSwipeHandle>
      <DrawerContent className="mx-auto">
        <DrawerHeader>
          <DrawerTitle className="wrap-break-word">{t(lang, "inviteSheetTitle").replace("{name}", live.name)}</DrawerTitle>
          <DrawerDescription>{t(lang, "inviteHint")}</DrawerDescription>
        </DrawerHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-3">
          <div className="rounded-2xl border bg-muted/40 p-4">
            {isQrZoomed ? (
              <div className="flex flex-col items-center gap-3">
                {qrBlock}
                <p className="text-center text-sm font-semibold text-foreground">
                  <CameraIcon className="mr-1 inline size-3.5 align-[-2px]" />
                  {t(lang, "qrPoint").replace("{name}", live.name)}
                </p>
                {target ? (
                  <p className="inline-flex items-center justify-center gap-1 text-center text-sm font-medium">
                    <TargetIcon className="size-3.5" />
                    {t(lang, "qrScanAs").replace("{name}", target.name)}
                  </p>
                ) : null}
                <p className="text-[11px] font-bold tracking-[0.18em] text-muted-foreground">{t(lang, "roomCode")}</p>
                <p className="font-mono text-3xl font-extrabold tracking-[0.18em]">{live.joinCode}</p>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                {qrBlock}
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-bold tracking-[0.18em] text-muted-foreground">{t(lang, "roomCode")}</p>
                  <p className="mt-1 font-mono text-3xl font-extrabold tracking-[0.18em] wrap-break-word">{live.joinCode}</p>
                  <Button
                    size="xs"
                    variant="outline"
                    className="mt-2 min-h-[32px] rounded-full"
                    onClick={() => void copyCode()}
                  >
                    <CopyIcon data-icon="inline-start" />
                    {codeCopied ? t(lang, "copyDone") : t(lang, "copyJoinCode")}
                  </Button>
                  <p className="mt-3 inline-flex items-center gap-1 text-sm font-semibold">
                    <UsersIcon className="size-3.5" />
                    {t(lang, "joinedOf").replace("{joined}", String(joined)).replace("{total}", String(roster.length))}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1" aria-hidden>
                    {roster.map((member) =>
                      member.claimedByUid ? (
                        <span key={member.id} title={member.name} className="size-2 rounded-full bg-emerald-500" />
                      ) : (
                        <span key={member.id} title={member.name}>
                          <ClockIcon className="size-3 text-muted-foreground" />
                        </span>
                      )
                    )}
                  </div>
                </div>
              </div>
            )}
            {target ? (
              <Badge variant="secondary" className="mt-3 h-auto max-w-full whitespace-normal px-3 py-2 text-left text-xs">
                {t(lang, "inviteTapFor").replaceAll("{name}", target.name)}
              </Badge>
            ) : null}
          </div>

          {waiting.length > 0 ? (
            <div className="flex flex-col gap-2">
              <p className="inline-flex items-center gap-1.5 text-sm font-semibold">
                <TargetIcon className="size-3.5" />
                {t(lang, "inviteWho")}
              </p>
              <div className="no-scrollbar flex gap-2 overflow-x-auto">
                <Button
                  type="button"
                  size="touch"
                  variant={activeSeat ? "outline" : "default"}
                  aria-pressed={!activeSeat}
                  className="min-h-[38px] shrink-0 px-3.5"
                  onClick={() => {
                    setSelectedSeat(null)
                    setIsQrZoomed(false)
                  }}
                >
                  <UsersIcon data-icon="inline-start" />
                  {t(lang, "inviteEveryone")}
                </Button>
                {waiting.map((member) => (
                  <Button
                    key={member.id}
                    type="button"
                    size="touch"
                    variant={activeSeat === member.id ? "default" : "outline"}
                    aria-pressed={activeSeat === member.id}
                    className="min-h-[38px] shrink-0 px-3.5"
                    onClick={() => {
                      setSelectedSeat(member.id)
                      setIsQrZoomed(false)
                    }}
                  >
                    <ClockIcon data-icon="inline-start" />
                    {member.name}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="rounded-xl bg-card p-3 text-sm wrap-break-word">{message}</div>
        </div>
        <DrawerFooter>
          <Button size="cta" className="min-h-[52px] font-extrabold" onClick={() => void share()} disabled={!url}>
            <Share2Icon data-icon="inline-start" />
            {copied
              ? t(lang, "inviteCopiedGc")
              : target
                ? t(lang, "shareInvitePersonal").replace("{name}", target.name)
                : t(lang, "shareInvite")}
          </Button>
          <Button size="cta" variant="secondary" className="min-h-[44px]" onClick={() => void copyMessage()} disabled={!url}>
            <CopyIcon data-icon="inline-start" />
            {msgCopied ? t(lang, "inviteCopiedGc") : t(lang, "copyInviteGc")}
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
