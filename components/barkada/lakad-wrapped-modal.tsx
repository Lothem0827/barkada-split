"use client"

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { CameraIcon, ImagePlusIcon, Share2Icon, XIcon } from "lucide-react"

import { WrappedCard } from "@/components/barkada/wrapped-card"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/toast"
import { wrappedShareText } from "@/lib/activity"
import { compressImage } from "@/lib/image-utils"
import { t } from "@/lib/i18n"
import { inviteUrl } from "@/lib/join-code"
import { shareOrCopy } from "@/lib/snapshot"
import { useBarkada } from "@/lib/store"
import { type ShotRatio, type Trip } from "@/lib/types"

function containBox(pw: number, ph: number, rw: number, rh: number) {
  if (pw / ph > rw / rh) {
    const h = ph
    return { w: (h * rw) / rh, h }
  }
  const w = pw
  return { w, h: (w * rh) / rw }
}

function ShotStage({ ratio, children }: { ratio: ShotRatio; children: ReactNode }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0, scale: 1 })
  const landscape = ratio === "45"
  const rw = landscape ? 4 : 9
  const rh = landscape ? 5 : 16
  const padX = landscape ? 0.07 : 0.06
  const padY = landscape ? 0.04 : 0.07

  useLayoutEffect(() => {
    const host = hostRef.current
    const card = cardRef.current
    if (!host || !card) return

    function measure() {
      const pw = host.clientWidth
      const ph = host.clientHeight
      if (!pw || !ph) return
      const { w, h } = containBox(pw, ph, rw, rh)
      const innerW = w * (1 - padX * 2)
      const innerH = h * (1 - padY * 2)
      const naturalW = card.scrollWidth || innerW
      const naturalH = card.scrollHeight || innerH
      const scale = Math.min(1, innerW / naturalW, innerH / Math.max(naturalH, 1))
      const next = {
        w: Math.round(w),
        h: Math.round(h),
        scale: Math.round(scale * 1000) / 1000,
      }
      setBox((prev) =>
        prev.w === next.w && prev.h === next.h && prev.scale === next.scale ? prev : next
      )
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(host)
    ro.observe(card)
    return () => ro.disconnect()
  }, [padX, padY, rh, rw])

  return (
    <div ref={hostRef} className="flex min-h-0 w-full flex-1 items-center justify-center">
      <div
        className="relative overflow-hidden bg-muted/40"
        style={{
          width: box.w ? box.w : "100%",
          height: box.h ? box.h : "100%",
        }}
      >
        <div
          className="absolute overflow-hidden"
          style={{
            left: `${padX * 100}%`,
            right: `${padX * 100}%`,
            top: `${padY * 100}%`,
            bottom: `${padY * 100}%`,
          }}
        >
          <div
            ref={cardRef}
            className="w-full origin-top"
            style={{ transform: `scale(${box.scale})` }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

export function LakadWrappedModal({
  trip,
  open,
  onClose,
  onCopy,
}: {
  trip: Trip | null
  open: boolean
  onClose: () => void
  onCopy: (text: string, label: string) => boolean | void | Promise<boolean | void>
}) {
  const { state, now, setTripPhotos } = useBarkada()
  const { lang } = state
  const [shot, setShot] = useState(false)
  const [shotRatio, setShotRatio] = useState<ShotRatio>("916")
  const photoRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) {
      setShot(false)
      return
    }
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return
      if (shot) setShot(false)
      else onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener("keydown", onKey)
    }
  }, [open, shot, onClose])

  if (!open || !trip) return null
  const live = trip

  function notify(message: string) {
    toast.add({ title: message, timeout: 1800 })
  }

  async function shareWrapped() {
    const url = inviteUrl(live.joinCode)
    const message = wrappedShareText(live, now)
    const result = await shareOrCopy(url, live.name + " Wrapped", message)
    if (result === "copied" || result === "shared") notify(t(lang, "wrappedShared"))
    else if (result === "manual") await onCopy(message, t(lang, "wrappedShared"))
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t(lang, "wrapped")}
      className="fixed inset-0 z-50 flex min-h-0 flex-col bg-background"
    >
      {shot ? (
        <div className="mx-auto flex h-dvh min-h-0 w-full max-w-[560px] flex-col items-center gap-3 px-4 pt-[max(12px,env(safe-area-inset-top))] pb-[max(12px,env(safe-area-inset-bottom))]">
          <ShotStage ratio={shotRatio}>
            <WrappedCard trip={live} now={now} lang={lang} interactive={false} />
          </ShotStage>
          <div className="flex shrink-0 flex-wrap justify-center gap-2">
            <Button
              className="h-11"
              variant={shotRatio === "916" ? "default" : "outline"}
              onClick={() => setShotRatio("916")}
            >
              {t(lang, "story")}
            </Button>
            <Button
              className="h-11"
              variant={shotRatio === "45" ? "default" : "outline"}
              onClick={() => setShotRatio("45")}
            >
              {t(lang, "post")}
            </Button>
            <Button className="h-11" variant="ghost" onClick={() => setShot(false)}>
              {t(lang, "exitShot")}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <header className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 pt-[max(12px,env(safe-area-inset-top))] pb-2">
            <Button
              size="icon"
              variant="ghost"
              className="size-10 shrink-0"
              aria-label={t(lang, "cancel")}
              onClick={onClose}
            >
              <XIcon />
            </Button>
            <p className="min-w-[8rem] flex-1 truncate font-heading text-sm font-bold">
              {t(lang, "wrapped")}
            </p>
            <div className="flex shrink-0 gap-2">
              <Button size="sm" className="min-h-[38px] shrink-0" onClick={() => setShot(true)}>
                <CameraIcon data-icon="inline-start" />
                {t(lang, "screenshot")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="min-h-[38px] shrink-0"
                onClick={() => void shareWrapped()}
              >
                <Share2Icon data-icon="inline-start" />
                {t(lang, "shareWrapped")}
              </Button>
            </div>
          </header>
          <div className="mx-auto flex min-h-0 w-full max-w-[560px] flex-1 flex-col gap-4 overflow-y-auto px-4 py-4 pb-[max(16px,env(safe-area-inset-bottom))]">
            <p className="text-sm text-muted-foreground">{t(lang, "wrappedHint")}</p>
            <input
              ref={photoRef}
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              onChange={(event) => {
                const files = [...(event.target.files || [])]
                event.target.value = ""
                void (async () => {
                  const urls = [...(live.wrappedPhotos || [])]
                  for (const file of files) {
                    if (urls.length >= 4) break
                    try {
                      urls.push(await compressImage(file))
                    } catch {
                      toast.add({ title: t(lang, "photoFailed"), timeout: 1800 })
                    }
                  }
                  setTripPhotos(
                    {
                      wrappedPhotos: urls.slice(0, 4),
                      coverPhotoUrl: live.coverPhotoUrl || urls[0] || null,
                    },
                    live.id
                  )
                })()
              }}
            />
            <Button
              type="button"
              size="touch"
              variant="outline"
              className="min-h-[40px] w-full"
              onClick={() => photoRef.current?.click()}
            >
              <ImagePlusIcon data-icon="inline-start" />
              {t(lang, "customizeWrapped")}
            </Button>
            <WrappedCard trip={live} now={now} lang={lang} />
          </div>
        </>
      )}
    </div>
  )
}
