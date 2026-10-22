import { dayStr, fmtDate, fmtDays, peso, wrappedStats } from "@/lib/calc"
import { t } from "@/lib/i18n"
import { memberName, type Lang, type Trip } from "@/lib/types"

function tampoDetail(stats: ReturnType<typeof wrappedStats>, lang: Lang) {
  if (!stats.tampo) return t(lang, "noTampo") + " 😇"
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
  title,
  name,
  detail,
}: {
  title: string
  name: string
  detail: string
}) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] tracking-widest opacity-70">{title}</div>
      <div className="font-heading text-lg leading-tight font-semibold wrap-break-word">{name}</div>
      <div className="text-[11px] wrap-break-word">{detail}</div>
    </div>
  )
}

export function WrappedCard({ trip, now, lang }: { trip: Trip; now: number; lang: Lang }) {
  const stats = wrappedStats(trip, now)
  const range = stats.start
    ? fmtDate(stats.start) + (stats.days > 1 && stats.end ? " – " + fmtDate(stats.end) : "")
    : t(lang, "noLakad")
  const nameOf = (id: string) => memberName(trip, id)

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
          title={"🏦 " + t(lang, "financier")}
          name={stats.financier ? nameOf(stats.financier.id) : "—"}
          detail={stats.financier ? peso(stats.financier.value) + " " + t(lang, "inabono") : t(lang, "noAbono")}
        />
        <Award
          title={"🎁 " + t(lang, "libreMagnet")}
          name={stats.libreMagnet ? nameOf(stats.libreMagnet.id) : "—"}
          detail={
            stats.libreMagnet ? stats.libreMagnet.value + "× " + t(lang, "nilibre") : t(lang, "noLibre")
          }
        />
        <Award
          title={"⚡ " + t(lang, "fastest")}
          name={stats.fastest ? nameOf(stats.fastest.id) : "—"}
          detail={
            stats.fastest
              ? t(lang, "avgPay").replace("{d}", fmtDays(stats.fastest.value, lang))
              : t(lang, "noPay")
          }
        />
        <Award
          title={"👻 " + t(lang, "tampoLegend")}
          name={stats.tampo ? nameOf(stats.tampo.id) : "—"}
          detail={tampoDetail(stats, lang)}
        />
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
