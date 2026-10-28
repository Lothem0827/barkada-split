"use client"

import { useEffect, useRef, useState } from "react"
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
      className="fixed inset-0 z-50 flex flex-col bg-background"
    >
      {shot ? (
        <div className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col items-center justify-center gap-3 px-4 py-4">
          <div
            className={`flex w-full max-w-full flex-col justify-center overflow-hidden bg-muted/40 ${shotRatio === "45" ? "aspect-[4/5] px-[7%] py-[4%]" : "aspect-[9/16] px-[6%] py-[7%]"}`}
          >
            <WrappedCard trip={live} now={now} lang={lang} interactive={false} />
          </div>
          <div className="flex flex-wrap justify-center gap-2">
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
          <header className="flex items-center gap-2 border-b px-3 pt-[max(12px,env(safe-area-inset-top))] pb-2">
            <Button
              size="icon"
              variant="ghost"
              className="size-10 shrink-0"
              aria-label={t(lang, "cancel")}
              onClick={onClose}
            >
              <XIcon />
            </Button>
            <p className="min-w-0 flex-1 truncate font-heading text-sm font-bold">{t(lang, "wrapped")}</p>
            <Button size="sm" className="min-h-[38px]" onClick={() => setShot(true)}>
              <CameraIcon data-icon="inline-start" />
              {t(lang, "screenshot")}
            </Button>
            <Button size="sm" variant="outline" className="min-h-[38px]" onClick={() => void shareWrapped()}>
              <Share2Icon data-icon="inline-start" />
              {t(lang, "shareWrapped")}
            </Button>
          </header>
          <div className="mx-auto flex w-full max-w-[560px] flex-1 flex-col gap-4 overflow-y-auto px-4 py-4 pb-[max(16px,env(safe-area-inset-bottom))]">
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
