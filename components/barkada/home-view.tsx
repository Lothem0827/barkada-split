"use client"

import { useRouter } from "next/navigation"
import { CalculatorIcon, PlusIcon, UserPlusIcon } from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { peso, wrappedStats } from "@/lib/calc"
import { barkadaCountLabel, t } from "@/lib/i18n"
import { useBarkada } from "@/lib/store"
import { initial, memberName } from "@/lib/types"

/** Flip this to bring Ambagan Estimator back on the lakads screen. */
const SHOW_ESTIMATOR = false

export function HomeView({
  onNewTrip,
  onJoin,
  onEstimator,
}: {
  onNewTrip: () => void
  onJoin: () => void
  onEstimator: () => void
}) {
  const router = useRouter()
  const { state, now } = useBarkada()
  const { lang, lakads } = state

  function open(id: string) {
    router.push("/lakad/" + id)
  }

  return (
    <div className="flex flex-col gap-4">
      {SHOW_ESTIMATOR ? (
        <Button size="touch" className="w-full" variant="ghost" onClick={onEstimator}>
          <CalculatorIcon data-icon="inline-start" />
          {t(lang, "estimator")}
        </Button>
      ) : null}

      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-heading text-lg font-semibold">{t(lang, "home")}</h2>
        <span className="text-sm text-muted-foreground">{lakads.length}</span>
      </div>

      {lakads.length ? (
        <div className="flex flex-col gap-3">
          {lakads.map((trip) => {
            const stats = wrappedStats(trip, now)
            const pending = trip.expenses.filter((expense) => {
              if (expense.status === "pending" || expense.status === "rejected") return true
              return state.as === trip.treasurer && !!expense.pendingEdit
            }).length
            return (
              <Card
                key={trip.id}
                role="button"
                tabIndex={0}
                className="cursor-pointer text-left"
                onClick={() => open(trip.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault()
                    open(trip.id)
                  }
                }}
              >
                <CardHeader>
                  <CardTitle className="wrap-break-word">{trip.name}</CardTitle>
                  <CardAction>
                    <span className="font-mono text-sm font-semibold tabular-nums">{peso(stats.total)}</span>
                  </CardAction>
                  <CardDescription>
                    {barkadaCountLabel(lang, trip.members)} · {t(lang, "treas")}:{" "}
                    {memberName(trip, trip.treasurer)}
                    {trip.open ? " · " + t(lang, "openModeOn") : ""}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <div className="flex px-1">
                    {trip.members.slice(0, 7).map((member, index) => (
                      <Avatar key={member.id} size="sm" className={index ? "-ml-1.5" : undefined}>
                        <AvatarFallback>{initial(member.name)}</AvatarFallback>
                      </Avatar>
                    ))}
                  </div>
                  {pending ? (
                    <Badge variant="secondary">
                      {pending} {t(lang, "pendingCount")}
                    </Badge>
                  ) : null}
                </CardContent>
              </Card>
            )
          })}
        </div>
      ) : (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>{t(lang, "emptyHome")}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      )}

      <p className="text-sm text-muted-foreground">{t(lang, "noMoney")}</p>

      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(3.5rem+max(12px,env(safe-area-inset-bottom)))] z-20 flex justify-center">
        <div className="pointer-events-auto flex w-full max-w-[560px] gap-2 border-t bg-background px-4 py-3">
          <Button className="min-h-[50px] flex-1 rounded-xl px-4 text-base font-bold" onClick={onNewTrip}>
            <PlusIcon data-icon="inline-start" />
            {t(lang, "newTrip")}
          </Button>
          <Button size="touch" variant="outline" className="min-h-[50px] flex-1" onClick={onJoin}>
            <UserPlusIcon data-icon="inline-start" />
            {t(lang, "joinViaCode")}
          </Button>
        </div>
      </div>
    </div>
  )
}
