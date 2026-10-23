"use client"

import { useState } from "react"

import { ArmButton } from "@/components/barkada/arm-button"
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
import { canEditExpense, isTreasurer, memberName, type Expense, type Lang, type Trip } from "@/lib/types"

const METHOD_KEY: Record<Expense["method"], CopyKey> = {
  even: "even",
  item: "item",
  exclude: "exclude",
  libre: "libre",
}

const RETURN_REASONS = ["reasonWrong", "reasonSplit", "reasonDuplicate", "reasonCancel"] as const

const thumbClass = "h-auto min-h-[40px] whitespace-normal px-2 text-center leading-tight"

function sameList(left: string[], right: string[]) {
  if (left.length !== right.length) return false
  const a = left.slice().sort()
  const b = right.slice().sort()
  return a.every((id, index) => id === b[index])
}

function sameItems(left: Expense["items"], right: Expense["items"]) {
  if (left.length !== right.length) return false
  return left.every(
    (item, index) =>
      item.name === right[index].name && item.price === right[index].price && sameList(item.eaters, right[index].eaters)
  )
}

function reasonText(lang: Lang, reason?: string) {
  if (!reason) return ""
  if ((RETURN_REASONS as readonly string[]).includes(reason)) return t(lang, reason as (typeof RETURN_REASONS)[number])
  return reason
}

function proposalLines(trip: Trip, expense: Expense, lang: Lang) {
  const next = expense.pendingEdit
  if (!next) return []
  const lines: string[] = []
  if (next.title !== expense.title) {
    lines.push(t(lang, "diffTitle").replace("{from}", expense.title).replace("{to}", next.title))
  }
  if (totalOf(expense) !== totalOf(next)) lines.push(`${peso(totalOf(expense))} → ${peso(totalOf(next))}`)
  if (next.payer !== expense.payer) {
    lines.push(
      t(lang, "diffPayer")
        .replace("{from}", memberName(trip, expense.payer))
        .replace("{to}", memberName(trip, next.payer))
    )
  }
  if (next.method !== expense.method) {
    lines.push(
      t(lang, "diffMethod")
        .replace("{from}", t(lang, METHOD_KEY[expense.method]))
        .replace("{to}", t(lang, METHOD_KEY[next.method]))
    )
  }
  if (!sameList(expense.ex, next.ex)) lines.push(t(lang, "diffPeople"))
  if (!sameItems(expense.items, next.items)) lines.push(t(lang, "diffItems"))
  if (!lines.length) lines.push(t(lang, "diffDetails"))
  return lines
}

function ExpenseCard({
  trip,
  expense,
  proposalActions,
  onApprove,
  onReject,
  onApproveEdit,
  onRejectEdit,
  onEdit,
  onDelete,
}: {
  trip: Trip
  expense: Expense
  proposalActions?: boolean
  onApprove?: () => void
  onReject?: (reason: string) => void
  onApproveEdit?: () => void
  onRejectEdit?: () => void
  onEdit?: () => void
  onDelete?: () => void
}) {
  const { state } = useBarkada()
  const { lang, as } = state
  const [returning, setReturning] = useState(false)
  const shares = sharesOf(trip, expense)
  const last = expense.edits?.[expense.edits.length - 1]
  const pending = expense.status === "pending"
  const rejected = expense.status === "rejected"
  const mine = expense.addedBy === as
  return (
    <Card
      className={
        rejected
          ? "border-amber-600 bg-amber-50 ring-2 ring-amber-500/80 dark:bg-amber-500/10"
          : pending
            ? "ring-2 ring-dashed ring-amber-500/80"
            : undefined
      }
    >
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
        {rejected ? (
          <Badge variant="secondary" className="h-auto whitespace-normal">
            {t(lang, "returnedBy")
              .replace("{name}", memberName(trip, trip.treasurer))
              .replace("{reason}", reasonText(lang, expense.rejectionReason))}
          </Badge>
        ) : null}
        {expense.pendingEdit ? (
          <div className="flex flex-col gap-2 rounded-xl border border-amber-500/70 bg-amber-500/10 p-3">
            <Badge variant="secondary" className="h-auto whitespace-normal">
              {proposalActions
                ? t(lang, "editProposed").replace("{name}", memberName(trip, expense.pendingEdit.editedBy))
                : t(lang, "editWaiting").replace("{name}", memberName(trip, trip.treasurer))}
            </Badge>
            <ul className="flex flex-col gap-1 text-sm">
              {proposalLines(trip, expense, lang).map((line, index) => (
                <li key={index} className="wrap-break-word">
                  {line}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-1.5">
          {trip.members
            .filter((member) => (shares[member.id] || 0) > 0)
            .map((member) => (
              <Badge key={member.id} variant={member.id === as ? "default" : "outline"} className="max-w-[140px]">
                <span className="truncate">
                  {member.name} {peso(shares[member.id])}
                </span>
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
        {proposalActions && onApproveEdit && onRejectEdit ? (
          <div className="grid grid-cols-2 gap-2">
            <Button className={thumbClass} onClick={onApproveEdit}>
              {t(lang, "approveEdit")}
            </Button>
            <Button variant="outline" className={thumbClass} onClick={onRejectEdit}>
              {t(lang, "rejectEdit")}
            </Button>
          </div>
        ) : null}
        {pending && onApprove && onReject ? (
          returning ? (
            <div className="flex flex-wrap gap-2">
              {RETURN_REASONS.map((reason) => (
                <Button
                  key={reason}
                  variant="outline"
                  className={thumbClass}
                  onClick={() => {
                    setReturning(false)
                    onReject(reason)
                  }}
                >
                  {t(lang, reason)}
                </Button>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Button className={thumbClass} onClick={onApprove}>
                {t(lang, "approve")}
              </Button>
              <Button variant="outline" className={thumbClass} onClick={() => setReturning(true)}>
                {t(lang, "returnReject")}
              </Button>
            </div>
          )
        ) : null}
        {rejected && (onEdit || onDelete) ? (
          <div className="grid grid-cols-2 gap-2">
            {onEdit ? (
              <Button className={thumbClass} onClick={onEdit}>
                {t(lang, "fixResubmit")}
              </Button>
            ) : null}
            {onDelete ? (
              <ArmButton
                variant="ghost"
                className="w-full whitespace-normal"
                label={t(lang, "deleteBill")}
                armedLabel={t(lang, "sureDeleteBill")}
                cancelLabel={t(lang, "cancel")}
                onConfirm={onDelete}
              />
            ) : null}
          </div>
        ) : null}
        {!rejected && !proposalActions && (onEdit || onDelete) ? (
          <div className="flex flex-wrap items-center gap-2">
            {onEdit ? (
              <Button size="touch" variant="outline" className="min-h-[40px] flex-1" onClick={onEdit}>
                {t(lang, "edit")}
              </Button>
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
      </CardContent>
    </Card>
  )
}

export function GastosView({
  onEdit,
  onApprove,
  onApproveAll,
  onReject,
  onApproveEdit,
  onRejectEdit,
  onDelete,
  onInvite,
  hiddenExpenseId,
}: {
  onEdit: (id: string) => void
  onApprove: (id: string) => void
  onApproveAll: () => void
  onReject: (id: string, reason: string) => void
  onApproveEdit: (id: string) => void
  onRejectEdit: (id: string) => void
  onDelete: (id: string) => void
  onInvite: () => void
  hiddenExpenseId?: string | null
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
  const newest = (a: Expense, b: Expense) => b.ts - a.ts
  const visible = trip.expenses.filter((expense) => expense.id !== hiddenExpenseId)
  const pending = visible.filter((expense) => expense.status === "pending").slice().sort(newest)
  const proposals = treasurer
    ? visible.filter((expense) => expense.status === "approved" && expense.pendingEdit).slice().sort(newest)
    : []
  const rejected = visible.filter((expense) => expense.status === "rejected").slice().sort(newest)
  const proposalIds = new Set(proposals.map((expense) => expense.id))
  const approved = visible
    .filter((expense) => expense.status === "approved" && !proposalIds.has(expense.id))
    .slice()
    .sort(newest)
  const review = treasurer ? [...pending, ...proposals, ...rejected] : [...pending, ...rejected]
  const queueCount = pending.length + proposals.length
  const waiting = trip.members.filter((member) => !member.claimedByUid)
  const showInvite = waiting.length > 0 && !isSeedTripId(trip.id)

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
            <p className="min-w-0 flex-1 text-sm font-medium">
              ⏳ {t(lang, "inviteLeft").replace("{n}", String(waiting.length))}
            </p>
            <Button size="touch" className="min-h-[38px] shrink-0" onClick={onInvite}>
              📲 {t(lang, "invitePill").replace("{code}", trip.joinCode)}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {queueCount && treasurer ? (
        <Card>
          <CardHeader>
            <CardTitle>{t(lang, "pendingQueue").replace("{n}", String(queueCount))}</CardTitle>
            {pending.length ? (
              <CardAction>
                <Button size="touch" className="min-h-[40px]" onClick={onApproveAll}>
                  {t(lang, "approveAll").replace("{n}", String(pending.length))}
                </Button>
              </CardAction>
            ) : null}
          </CardHeader>
        </Card>
      ) : null}

      {review.length ? (
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-heading text-lg font-semibold">{t(lang, "pending")}</h2>
            <Badge variant="secondary">{review.length}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {treasurer
              ? t(lang, "treasApprove")
              : t(lang, "pendingFor").replace("{name}", memberName(trip, trip.treasurer))}
          </p>
          {review.map((expense) => {
            const mine = expense.addedBy === as
            const proposal = expense.status === "approved" && !!expense.pendingEdit
            const recoverable = expense.status === "rejected" && (mine || treasurer)
            return (
              <ExpenseCard
                key={expense.id}
                trip={trip}
                expense={expense}
                proposalActions={proposal && treasurer}
                onApprove={expense.status === "pending" && treasurer ? () => onApprove(expense.id) : undefined}
                onReject={
                  expense.status === "pending" && treasurer ? (reason) => onReject(expense.id, reason) : undefined
                }
                onApproveEdit={proposal && treasurer ? () => onApproveEdit(expense.id) : undefined}
                onRejectEdit={proposal && treasurer ? () => onRejectEdit(expense.id) : undefined}
                onEdit={
                  proposal ? undefined : canEditExpense(state, trip, expense) ? () => onEdit(expense.id) : undefined
                }
                onDelete={
                  proposal
                    ? undefined
                    : expense.status === "rejected"
                      ? recoverable
                        ? () => onDelete(expense.id)
                        : undefined
                      : mine || treasurer
                        ? () => onDelete(expense.id)
                        : undefined
                }
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
