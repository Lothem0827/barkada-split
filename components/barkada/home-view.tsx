"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { CalculatorIcon, PalmtreeIcon, PlusIcon, UserPlusIcon, UsersIcon } from "lucide-react"

import { lastSeenOf } from "@/components/barkada/barkada-view"
import { WrappedCta } from "@/components/barkada/wrapped-cta"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { unreadActivityCount } from "@/lib/activity"
import { balances, peso, wrappedStats } from "@/lib/calc"
import { tripCoverUrl } from "@/lib/image-utils"
import { getHomeMoodLine, getMascotAvatar } from "@/lib/companion-ai"
import {
  homeAttention,
  homeMood,
  homeSeat,
  homeTotals,
  isActiveTrip,
  isSettledTrip,
} from "@/lib/home-dashboard"
import { t } from "@/lib/i18n"
import { useBarkada } from "@/lib/store"
import { activeMembers, initial, memberName } from "@/lib/types"

export function HomeView({
  onNewTrip,
  onJoin,
  onEstimator,
  onOpenWrapped,
}: {
  onNewTrip: () => void
  onJoin: () => void
  onEstimator: () => void
  onOpenWrapped: (tripId: string) => void
}) {
  const router = useRouter()
  const { state, now, openTrip } = useBarkada()
  const { lang, lakads, profile, authUid, as } = state
  const [bucket, setBucket] = useState<"active" | "settled">("active")
  const ids = { authUid, profileName: profile.name, as }

  const totals = useMemo(() => homeTotals(lakads, ids), [lakads, authUid, profile.name, as])
  const mood = homeMood(totals)
  const attention = useMemo(() => homeAttention(lakads, ids), [lakads, authUid, profile.name, as])
  const active = lakads.filter(isActiveTrip)
  const settled = lakads.filter(isSettledTrip)
  const shown = bucket === "active" ? active : settled

  function open(id: string, tab?: "gastos" | "hatian") {
    openTrip(id, tab)
    router.push("/lakad/" + id)
  }

  const netClass =
    totals.overallNet > 0 ? "text-emerald-600" : totals.overallNet < 0 ? "text-destructive" : "text-foreground"

  return (
    <div className="flex flex-col gap-4">
      <Card className="overflow-hidden">
        <CardContent className="flex items-start gap-3 pt-4">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
              {t(lang, "homeOverall")}
            </p>
            <p className={`mt-1 font-heading text-3xl font-extrabold tracking-tight tabular-nums ${netClass}`}>
              {totals.overallNet === 0
                ? peso(0) + " · " + t(lang, "homeAllSquare")
                : (totals.overallNet > 0 ? "+" : "") + peso(totals.overallNet)}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge variant="secondary">
                {t(lang, "homeCollecting")} {peso(totals.totalOwedToMe)}
              </Badge>
              <Badge variant="outline">
                {t(lang, "homeYouOwe")} {peso(totals.totalIOwe)}
              </Badge>
            </div>
          </div>
          <div className="flex w-[88px] shrink-0 flex-col items-center gap-1 text-center">
            <span className="text-4xl leading-none" aria-hidden>
              {getMascotAvatar(mood)}
            </span>
            <p className="text-[11px] leading-snug text-muted-foreground wrap-break-word">{getHomeMoodLine(mood)}</p>
          </div>
        </CardContent>
      </Card>

      {attention.length ? (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">
            {t(lang, "homeAttention").replace("{n}", String(attention.length))}
          </h2>
          {attention.map((item, index) => {
            const trip = lakads.find((row) => row.id === item.tripId)
            const from = trip && item.fromId ? memberName(trip, item.fromId) : ""
            const label =
              item.kind === "nudge"
                ? t(lang, "homeNudgeRow")
                    .replace("{name}", from)
                    .replace("{amt}", peso(item.amount || 0))
                    .replace("{trip}", item.tripName)
                : item.kind === "confirm"
                  ? t(lang, "homePayRow")
                      .replace("{name}", from)
                      .replace("{amt}", peso(item.amount || 0))
                      .replace("{trip}", item.tripName)
                  : t(lang, "homeReviewRow")
                      .replace("{n}", String(item.count || 0))
                      .replace("{trip}", item.tripName)
            return (
              <button
                key={item.kind + item.tripId + index}
                type="button"
                className="flex min-h-[52px] items-center gap-2 rounded-xl border bg-card px-3 py-2 text-left"
                onClick={() => open(item.tripId, item.tab)}
              >
                <p className="min-w-0 flex-1 text-sm leading-snug wrap-break-word">{label}</p>
                <span className="shrink-0 text-xs font-bold">
                  {t(
                    lang,
                    item.kind === "nudge" ? "homeSettleCta" : item.kind === "confirm" ? "homeConfirmCta" : "homeReviewCta"
                  )}
                </span>
              </button>
            )
          })}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <h2 className="font-heading text-lg font-semibold">{t(lang, "homeYourTrips")}</h2>
        <div className="flex shrink-0 gap-1">
          <Button
            size="sm"
            variant={bucket === "active" ? "default" : "outline"}
            className="min-h-8 px-2.5"
            onClick={() => setBucket("active")}
          >
            {t(lang, "homeActive").replace("{n}", String(active.length))}
          </Button>
          <Button
            size="sm"
            variant={bucket === "settled" ? "default" : "outline"}
            className="min-h-8 px-2.5"
            onClick={() => setBucket("settled")}
          >
            {t(lang, "homeSettled").replace("{n}", String(settled.length))}
          </Button>
        </div>
      </div>

      {shown.length ? (
        <div className="flex flex-col gap-3">
          {shown.map((trip) => {
            const seat = homeSeat(trip, ids)
            const myNet = seat ? balances(trip)[seat.id] || 0 : 0
            const stats = wrappedStats(trip, now)
            const unread = unreadActivityCount(trip, lastSeenOf(trip.id)) > 0
            const cover = tripCoverUrl(trip)
            const pill =
              trip.expenses.length === 0
                ? t(lang, "homeNewPill")
                : myNet > 0
                  ? t(lang, "homeOwedPill").replace("{amt}", peso(myNet))
                  : myNet < 0
                    ? t(lang, "homeOwePill").replace("{amt}", peso(-myNet))
                    : t(lang, "homeSettledPill")
            return (
              <Card
                key={trip.id}
                role="button"
                tabIndex={0}
                className="min-h-[84px] cursor-pointer text-left"
                onClick={() => open(trip.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault()
                    open(trip.id)
                  }
                }}
              >
                <CardContent className="flex flex-col gap-2 pt-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-2">
                      {cover ? (
                        <img src={cover} alt="" className="size-12 shrink-0 rounded-lg object-cover" />
                      ) : null}
                      <div className="min-w-0">
                        <p className="truncate text-base font-extrabold">{trip.name}</p>
                        <p className="font-mono text-xs text-muted-foreground">{trip.joinCode}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Badge variant={myNet < 0 ? "outline" : "secondary"}>{pill}</Badge>
                      {isSettledTrip(trip) ? (
                        <WrappedCta
                          trip={trip}
                          variant="home"
                          lang={lang}
                          onOpen={() => onOpenWrapped(trip.id)}
                        />
                      ) : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex px-1">
                      {activeMembers(trip).slice(0, 5).map((member, index) => (
                        <Avatar key={member.id} size="sm" className={index ? "-ml-1.5" : undefined}>
                          <AvatarFallback>{initial(member.name)}</AvatarFallback>
                        </Avatar>
                      ))}
                    </div>
                    <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                      <UsersIcon className="mr-0.5 inline size-3 align-[-2px]" />
                      {t(lang, "homeTripPeople")
                        .replace("{n}", String(activeMembers(trip).length))
                        .replace("{name}", memberName(trip, trip.treasurer))}
                    </p>
                    <span className="shrink-0 text-xs font-semibold tabular-nums">
                      {t(lang, "homeTripTotal").replace("{amt}", peso(stats.total))}
                    </span>
                    {unread ? <span className="size-2 shrink-0 rounded-full bg-destructive" aria-hidden /> : null}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      ) : (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PalmtreeIcon />
            </EmptyMedia>
            <EmptyTitle>{t(lang, "emptyHome")}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      )}

      <p className="text-sm text-muted-foreground">{t(lang, "noMoney")}</p>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20">
        <div className="pointer-events-auto flex flex-col gap-1.5 border-t bg-background px-4 pt-2 pb-[max(12px,env(safe-area-inset-bottom))]">
          <Button size="sm" variant="ghost" className="self-start text-xs" onClick={onEstimator}>
            <CalculatorIcon data-icon="inline-start" />
            {t(lang, "estimator")}
          </Button>
          <div className="flex gap-2">
            <Button size="touch" variant="outline" className="min-h-[50px] flex-1" onClick={onJoin}>
              <UserPlusIcon data-icon="inline-start" />
              {t(lang, "homeJoin")}
            </Button>
            <Button className="min-h-[50px] flex-[1.4] rounded-xl px-4 text-base font-extrabold" onClick={onNewTrip}>
              <PlusIcon data-icon="inline-start" />
              {t(lang, "newTrip")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
