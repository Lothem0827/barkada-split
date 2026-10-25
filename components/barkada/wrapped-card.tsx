"use client"

import { useState } from "react"
import { GhostIcon, GiftIcon, LandmarkIcon, SmileIcon, ZapIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { dayStr, fmtDate, fmtDays, peso, wrappedStats } from "@/lib/calc"
import { cycleWrappedRoast, getWrappedVerdict, wrappedRoastSeed } from "@/lib/companion-ai"
import { memoryPhotosOf, type MemoryPhoto } from "@/lib/image-utils"
import { t } from "@/lib/i18n"
import { memberName, type Lang, type Trip } from "@/lib/types"

function Polaroid({ photo, big = false }: { photo: MemoryPhoto; big?: boolean }) {
  return (
    <div className={`bg-white p-1 shadow-sm ${big ? "-rotate-1" : "rotate-2"}`}>
      <img src={photo.url} alt="" className={`w-full object-cover ${big ? "h-28" : "h-12"}`} />
      {photo.caption ? (
        <p className="mt-0.5 truncate px-0.5 text-center text-[9px] text-neutral-700">{photo.caption}</p>
      ) : null}
    </div>
  )
}

function tampoDetail(stats: ReturnType<typeof wrappedStats>, lang: Lang) {
  if (!stats.tampo) return t(lang, "noTampo")
  const delay = (stats.tampoKind === "now" ? t(lang, "counting") : t(lang, "maxLate")).replace(
    "{d}",
    dayStr(stats.tampo.value, lang)
  )
  if (stats.seenZoner && stats.seenZoner.id === stats.tampo.id && stats.seenZoner.value > 0) {
    return delay + " • " + t(lang, "seenZoner").replace("{n}", String(stats.seenZoner.value))
  }
  return delay
}

function Line({
  label,
  value,
  big = false,
}: {
  label: string
  value: string
  big?: boolean
}) {
  return (
    <div className={`flex justify-between gap-2.5 py-0.5 ${big ? "text-base font-semibold" : "text-xs"}`}>
      <span>{label}</span>
      <span className="font-semibold whitespace-nowrap tabular-nums">{value}</span>
    </div>
  )
}

function Award({
  icon: Icon,
  title,
  name,
  detail,
}: {
  icon: typeof LandmarkIcon
  title: string
  name: string
  detail: string
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1 text-[10px] tracking-widest opacity-70">
        <Icon className="size-3" />
        {title}
      </div>
      <div className="font-heading text-lg leading-tight font-semibold wrap-break-word">{name}</div>
      <div className="text-[11px] wrap-break-word">{detail}</div>
    </div>
  )
}

export function WrappedCard({
  trip,
  now,
  lang,
  interactive = true,
}: {
  trip: Trip
  now: number
  lang: Lang
  interactive?: boolean
}) {
  const [seed, setSeed] = useState(() => wrappedRoastSeed(trip.id))
  const stats = wrappedStats(trip, now)
  const range = stats.start
    ? fmtDate(stats.start) + (stats.days > 1 && stats.end ? " – " + fmtDate(stats.end) : "")
    : t(lang, "noLakad")
  const nameOf = (id: string) => memberName(trip, id)
  const verdict = getWrappedVerdict(trip, now, seed)
  const shots = memoryPhotosOf(trip).slice(0, 4)
  const hero = shots[0]
  const rest = shots.slice(1)

  return (
    <article className="receipt relative overflow-hidden bg-paper px-4 pt-6 pb-5 font-mono text-paper-ink shadow-sm">
      <div className="text-center">
        <div className="text-[10px] tracking-[0.12em] opacity-70">★ {t(lang, "presents")} ★</div>
        <div className="font-heading mt-1 text-4xl leading-none font-extrabold tracking-tight">
          LAKAD
          <br />
          WRAPPED
        </div>
        <div className="font-heading mt-2 text-lg leading-tight font-semibold wrap-break-word">{trip.name}</div>
        <div className="mt-0.5 text-[11px] opacity-75">
          {range} · {trip.members.length} {t(lang, "pax")}
        </div>
      </div>
      {hero ? (
        <div className="mt-3">
          {shots.length === 1 ? (
            <Polaroid photo={hero} big />
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              <div className="col-span-2">
                <Polaroid photo={hero} big />
              </div>
              <div className="flex flex-col gap-1.5">
                {rest.map((photo) => (
                  <Polaroid key={photo.url} photo={photo} />
                ))}
              </div>
            </div>
          )}
        </div>
      ) : null}
      <div className="my-3 border-t-2 border-dashed border-paper-line" />
      <Line label={t(lang, "totalLine")} value={peso(stats.total)} big />
      <Line label={t(lang, "daysLine")} value={String(stats.days)} />
      <Line label={t(lang, "perDay")} value={peso(stats.perDay)} />
      <Line label={t(lang, "perHead")} value={peso(stats.perHead)} />
      <Line label={t(lang, "receiptsLine")} value={String(stats.count)} />
      <Line label={t(lang, "confirmedLine")} value={String(stats.confirmed)} />
      <div className="my-3 border-t-2 border-dashed border-paper-line" />
      <div className="grid grid-cols-2 gap-x-3.5 gap-y-2.5">
        <Award
          icon={LandmarkIcon}
          title={t(lang, "financier")}
          name={stats.financier ? nameOf(stats.financier.id) : "—"}
          detail={stats.financier ? peso(stats.financier.value) + " " + t(lang, "inabono") : t(lang, "noAbono")}
        />
        <Award
          icon={GiftIcon}
          title={t(lang, "libreMagnet")}
          name={stats.libreMagnet ? nameOf(stats.libreMagnet.id) : "—"}
          detail={
            stats.libreMagnet ? stats.libreMagnet.value + "× " + t(lang, "nilibre") : t(lang, "noLibre")
          }
        />
        <Award
          icon={ZapIcon}
          title={t(lang, "fastest")}
          name={stats.fastest ? nameOf(stats.fastest.id) : "—"}
          detail={
            stats.fastest
              ? t(lang, "avgPay").replace("{d}", fmtDays(stats.fastest.value, lang))
              : t(lang, "noPay")
          }
        />
        <Award
          icon={stats.tampo ? GhostIcon : SmileIcon}
          title={t(lang, "tampoLegend")}
          name={stats.tampo ? nameOf(stats.tampo.id) : "—"}
          detail={tampoDetail(stats, lang)}
        />
      </div>
      <div className="my-3 border-t-2 border-dashed border-paper-line" />
      <div className="rounded-lg border-2 border-paper-line px-2.5 py-2">
        <div className="text-center text-[10px] font-bold tracking-widest">
          {t(lang, "taliVerdictHeader")}
        </div>
        <p className="mt-1.5 text-center text-[11px] leading-snug wrap-break-word">{verdict}</p>
        {interactive ? (
          <Button
            type="button"
            size="xs"
            variant="outline"
            className="mx-auto mt-2 flex border-paper-line bg-transparent text-paper-ink hover:bg-paper-ink/5"
            onClick={() => setSeed(cycleWrappedRoast(trip.id))}
          >
            {t(lang, "taliRegenerate")}
          </Button>
        ) : null}
      </div>
      <div className="my-3 border-t-2 border-dashed border-paper-line" />
      <div
        className="receipt-bars mx-auto my-1.5 h-8 w-[78%]"
        aria-hidden="true"
      />
      <div className="text-center text-[10px] tracking-wide">{t(lang, "thanks")}</div>
      <div className="font-heading mt-1.5 text-center text-sm font-extrabold opacity-45">
        {t(lang, "watermark")}
      </div>
    </article>
  )
}
