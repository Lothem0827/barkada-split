"use client"

import { ArmButton } from "@/components/barkada/arm-button"
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
import { balances, fmtDate, namesList, peso, sharesOf, totalOf, wrappedStats } from "@/lib/calc"
import { t, type CopyKey } from "@/lib/i18n"
import { isSeedTripId } from "@/lib/merge-trip"
import { useBarkada } from "@/lib/store"
import { canEditExpense, initial, isTreasurer, memberName, type Expense, type Trip } from "@/lib/types"
import { cn } from "cn"

const METHOD_KEY: Record<Expense["method"], CopyKey> = {
  even: "even",
  item: "item",
  exclude: "exclude",
  libre: "libre",
}

function ExpenseCard({
  trip,
  expense,
  onApprove,
  onReject,
  onEdit,
  onDelete,
}: {
  trip: Trip
  expense: Expense
  onApprove?: () => void
  onReject?: () => void
  onEdit?: () => void
  onDelete?: () => void
}) {
  const { state } = useBarkada()
  const { lang, as } = state
  const shares = sharesOf(trip, expense)
  const last = expense.edits?.[expense.edits.length - 1]
  const pending = expense.status === "pending"
  const mine = expense.addedBy === as
  return (
    <Card className={pending ? "ring-2 ring-dashed ring-amber-500/80" : undefined}>
      <CardHeader>
        <CardTitle className="wrap-break-word">{expense.title}</CardTitle>
        <CardAction>
          <span className="font-mono font-semibold tabular-nums">{peso(totalOf(expense))}</span>
        </CardAction>
        <CardDescription>
          {memberName(trip, expense.payer)} {t(lang, "paidBy")} · {fmtDate(expense.ts)} ·{" "}
          {t(lang, METHOD_KEY[expense.method])}
          {expense.sc ? " · " + t(lang, "scTag") : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {pending ? (
          mine ? (
            <Badge variant="secondary">
              ⏳ {t(lang, "waitingTreas").replace("{name}", memberName(trip, trip.treasurer))}
            </Badge>
          ) : (
            <Badge variant="secondary">
              {t(lang, "pending")} · {t(lang, "addedBy")} {memberName(trip, expense.addedBy)}
            </Badge>
          )
        ) : null}
        <div className="flex flex-wrap gap-1.5">
          {trip.members
            .filter((member) => (shares[member.id] || 0) > 0)
            .map((member) => (
              <Badge key={member.id} variant={member.id === as ? "default" : "outline"}>
                {member.name} {peso(shares[member.id])}
              </Badge>
            ))}
          {expense.method === "libre" && expense.ex.length ? (
            <Badge variant="secondary">
              {t(lang, "freeFor")} {namesList(trip, expense.ex)}
            </Badge>
          ) : null}
          {expense.method === "exclude" && expense.ex.length ? (
            <Badge variant="secondary">
              {t(lang, "notIn")}: {namesList(trip, expense.ex)}
            </Badge>
          ) : null}
        </div>
        {expense.method === "item" && expense.items.length ? (
          <details>
            <summary className="min-h-11 cursor-pointer text-sm font-medium text-muted-foreground">
              {expense.items.length} {t(lang, "itemCount")}
            </summary>
            <ul className="mt-2 flex flex-col gap-1 pl-4 text-sm">
              {expense.items.map((item, index) => (
                <li key={index} className="wrap-break-word">
                  {item.name} · {peso(item.price)} · {namesList(trip, item.eaters) || t(lang, "everyone")}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        {last ? (
          <p className="border-l-2 border-border pl-2 text-xs text-muted-foreground wrap-break-word">
            {t(lang, "editedBy")} {memberName(trip, last.by) !== "?" ? memberName(trip, last.by) : last.by} ·{" "}
            {fmtDate(last.ts)}
            {last.note ? `: “${last.note}”` : ""}
            {expense.edits && expense.edits.length > 1 ? ` (${expense.edits.length} ${t(lang, "edits")})` : ""}
          </p>
        ) : null}
        {onApprove || onReject || onEdit || onDelete ? (
          <div className="flex flex-col gap-2">
            {onApprove ? (
              <Button size="touch" className="w-full min-h-[40px]" onClick={onApprove}>
                {t(lang, "approve")}
              </Button>
            ) : null}
            {onEdit || onReject || onDelete ? (
              <div className="flex flex-wrap items-center gap-2">
                {onEdit ? (
                  <Button size="touch" variant="outline" className="min-h-[40px] flex-1" onClick={onEdit}>
                    {t(lang, "edit")}
                  </Button>
                ) : null}
                {onReject ? (
                  <ArmButton
                    label={t(lang, "reject")}
                    armedLabel={t(lang, "sureReject")}
                    cancelLabel={t(lang, "cancel")}
                    onConfirm={onReject}
                  />
                ) : null}
                {onDelete ? (
                  <ArmButton
                    label={pending && mine ? t(lang, "withdraw") : t(lang, "del")}
                    armedLabel={pending && mine ? t(lang, "sureWithdraw") : t(lang, "sureDel")}
                    cancelLabel={t(lang, "cancel")}
                    onConfirm={onDelete}
                  />
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

export function GastosView({
  onEdit,
  onApprove,
  onApproveAll,
  onReject,
  onDelete,
  onInvite,
}: {
  onEdit: (id: string) => void
  onApprove: (id: string) => void
  onApproveAll: () => void
  onReject: (id: string) => void
  onDelete: (id: string) => void
  onInvite: () => void
}) {
  const { state, trip, now } = useBarkada()
  if (!trip) return null
  const { lang, as } = state
  const treasurer = isTreasurer(state, trip)
  const stats = wrappedStats(trip, now)
  const net = balances(trip)[as] || 0
  const line =
    net < 0
      ? `${t(lang, "youOwe")}: ${peso(-net)}`
      : net > 0
        ? `${t(lang, "youAreOwed")}: ${peso(net)}`
        : t(lang, "youEven")
  const pending = trip.expenses
    .filter((expense) => expense.status === "pending")
    .slice()
    .sort((a, b) => b.ts - a.ts)
  const approved = trip.expenses
    .filter((expense) => expense.status === "approved")
    .slice()
    .sort((a, b) => b.ts - a.ts)
  const waiting = trip.members.filter((member) => !member.claimedByUid)
  const claimed = trip.members.filter((member) => member.claimedByUid)
  const showInvite = waiting.length > 0 && !isSeedTripId(trip.id)
  const waitingLabel =
    waiting
      .slice(0, 2)
      .map((member) => member.name)
      .join(", ") +
    (waiting.length > 2 ? ` +${waiting.length - 2} ${t(lang, "waitingJoin")}` : waiting.length ? ` ${t(lang, "waitingJoin")}` : "")

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardDescription>{t(lang, "totalGastos")}</CardDescription>
          <CardTitle className="font-mono text-3xl font-extrabold tabular-nums">{peso(stats.total)}</CardTitle>
          <CardDescription>
            {memberName(trip, as)}, {line}
          </CardDescription>
        </CardHeader>
      </Card>

      {showInvite ? (
        <Card>
          <CardContent className="flex items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center">
                {claimed.slice(0, 4).map((member, index) => (
                  <Avatar key={member.id} size="sm" className={cn(index ? "-ml-1.5" : undefined, "ring-2 ring-background")}>
                    <AvatarFallback>🟢 {initial(member.name)}</AvatarFallback>
                  </Avatar>
                ))}
                {waiting.slice(0, 3).map((member, index) => (
                  <Avatar
                    key={member.id}
                    size="sm"
                    className={cn(claimed.length || index ? "-ml-1.5" : undefined, "ring-2 ring-background opacity-70")}
                  >
                    <AvatarFallback>⚪ {initial(member.name)}</AvatarFallback>
                  </Avatar>
                ))}
              </div>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {claimed.length ? claimed.map((member) => member.name).slice(0, 2).join(", ") : ""}
                {claimed.length && waiting.length ? " · " : ""}
                {waitingLabel}
              </p>
            </div>
            <Button size="touch" className="min-h-[40px] shrink-0" onClick={onInvite}>
              {t(lang, "inviteLeft").replace("{n}", String(waiting.length))}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {pending.length && treasurer ? (
        <Card>
          <CardHeader>
            <CardTitle>{t(lang, "pendingQueue").replace("{n}", String(pending.length))}</CardTitle>
            <CardAction>
              <Button size="touch" className="min-h-[40px]" onClick={onApproveAll}>
                {t(lang, "approveAll").replace("{n}", String(pending.length))}
              </Button>
            </CardAction>
          </CardHeader>
        </Card>
      ) : null}

      {pending.length ? (
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-heading text-lg font-semibold">{t(lang, "pending")}</h2>
            <Badge variant="secondary">{pending.length}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {treasurer
              ? t(lang, "treasApprove")
              : t(lang, "pendingFor").replace("{name}", memberName(trip, trip.treasurer))}
          </p>
          {pending.map((expense) => {
            const mine = expense.addedBy === as
            return (
              <ExpenseCard
                key={expense.id}
                trip={trip}
                expense={expense}
                onApprove={treasurer ? () => onApprove(expense.id) : undefined}
                onReject={treasurer ? () => onReject(expense.id) : undefined}
                onEdit={canEditExpense(state, trip, expense) ? () => onEdit(expense.id) : undefined}
                onDelete={mine || treasurer ? () => onDelete(expense.id) : undefined}
              />
            )
          })}
        </section>
      ) : null}

      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-heading text-lg font-semibold">{t(lang, "gastos")}</h2>
        <span className="text-sm text-muted-foreground">
          {approved.length} {t(lang, "resibo")}
        </span>
      </div>
      {approved.length ? (
        approved.map((expense) => (
          <ExpenseCard
            key={expense.id}
            trip={trip}
            expense={expense}
            onEdit={canEditExpense(state, trip, expense) ? () => onEdit(expense.id) : undefined}
            onDelete={treasurer ? () => onDelete(expense.id) : undefined}
          />
        ))
      ) : (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>{t(lang, "emptyGastos")}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  )
}
