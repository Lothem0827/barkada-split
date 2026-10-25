"use client"

import { useState } from "react"
import {
  CheckIcon,
  ClockIcon,
  EllipsisVerticalIcon,
  PencilIcon,
  ReceiptIcon,
  Share2Icon,
  SparklesIcon,
  TriangleAlertIcon,
  Undo2Icon,
} from "lucide-react"

import { ArmButton } from "@/components/barkada/arm-button"
import { TaliStrip } from "@/components/barkada/tali-strip"
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
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
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
  const [menuOpen, setMenuOpen] = useState(false)
  const [photoOpen, setPhotoOpen] = useState(false)
  const shares = sharesOf(trip, expense)
  const last = expense.edits?.[expense.edits.length - 1]
  const pending = expense.status === "pending"
  const rejected = expense.status === "rejected"
  const mine = expense.addedBy === as
  const hasMenu = !!(onEdit || onDelete)
  return (
    <>
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
        <CardTitle className="flex items-start gap-2">
          {expense.photoUrl ? (
            <button
              type="button"
              className="size-12 shrink-0 overflow-hidden rounded-lg"
              onClick={() => setPhotoOpen(true)}
              aria-label={expense.title}
            >
              <img src={expense.photoUrl} alt="" className="size-full object-cover" />
            </button>
          ) : null}
          <span className="wrap-break-word">{expense.title}</span>
        </CardTitle>
        <CardAction className="flex items-center gap-1">
          <span className="font-mono font-semibold tabular-nums">{peso(totalOf(expense))}</span>
          {hasMenu ? (
            <Button
              size="icon"
              variant="ghost"
              className="size-9"
              aria-label={expense.title}
              onClick={() => setMenuOpen(true)}
            >
              <EllipsisVerticalIcon className="size-4" />
            </Button>
          ) : null}
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
              <ClockIcon className="size-3.5" />
              {t(lang, "waitingTreas").replace("{name}", memberName(trip, trip.treasurer))}
            </Badge>
          ) : (
            <Badge variant="secondary">
              {t(lang, "pending")} · {t(lang, "addedBy")} {memberName(trip, expense.addedBy)}
            </Badge>
          )
        ) : null}
        {rejected ? (
          <Badge variant="secondary" className="h-auto whitespace-normal">
            <TriangleAlertIcon className="size-3.5 shrink-0" />
            {t(lang, "returnedBy")
              .replace("{name}", memberName(trip, trip.treasurer))
              .replace("{reason}", reasonText(lang, expense.rejectionReason))}
          </Badge>
        ) : null}
        {expense.pendingEdit ? (
          <div className="flex flex-col gap-2 rounded-xl border border-amber-500/70 bg-amber-500/10 p-3">
            <Badge variant="secondary" className="h-auto whitespace-normal">
              <PencilIcon className="size-3.5 shrink-0" />
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
              <CheckIcon data-icon="inline-start" />
              {t(lang, "approveEdit")}
            </Button>
            <Button variant="outline" className={thumbClass} onClick={onRejectEdit}>
              <Undo2Icon data-icon="inline-start" />
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
                <Undo2Icon data-icon="inline-start" />
                {t(lang, "returnReject")}
              </Button>
            </div>
          )
        ) : null}
      </CardContent>
    </Card>
      {hasMenu ? (
        <Drawer open={menuOpen} onOpenChange={setMenuOpen} swipeDirection="down" showSwipeHandle>
          <DrawerContent className="mx-auto">
            <DrawerHeader>
              <DrawerTitle>{expense.title}</DrawerTitle>
            </DrawerHeader>
            <div className="flex flex-col gap-2 px-4 py-3 pb-[max(16px,env(safe-area-inset-bottom))]">
              {onEdit ? (
                <Button
                  size="cta"
                  variant="outline"
                  onClick={() => {
                    setMenuOpen(false)
                    onEdit()
                  }}
                >
                  {rejected ? t(lang, "fixResubmit") : t(lang, "edit")}
                </Button>
              ) : null}
              {onDelete ? (
                <ArmButton
                  className="w-full"
                  label={
                    rejected ? t(lang, "deleteBill") : pending && mine ? t(lang, "withdraw") : t(lang, "del")
                  }
                  armedLabel={
                    rejected
                      ? t(lang, "sureDeleteBill")
                      : pending && mine
                        ? t(lang, "sureWithdraw")
                        : t(lang, "sureDel")
                  }
                  cancelLabel={t(lang, "cancel")}
                  onConfirm={() => {
                    setMenuOpen(false)
                    onDelete()
                  }}
                />
              ) : null}
            </div>
          </DrawerContent>
        </Drawer>
      ) : null}
      {photoOpen && expense.photoUrl ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={expense.title}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/92 p-5 text-white"
          onClick={() => setPhotoOpen(false)}
        >
          <img src={expense.photoUrl} alt={expense.title} className="max-h-[75dvh] max-w-full object-contain" />
          <p className="mt-3 text-center text-base font-semibold">{expense.title}</p>
          <p className="text-sm opacity-80">
            {memberName(trip, expense.payer)} · {peso(totalOf(expense))}
          </p>
        </div>
      ) : null}
    </>
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
            {memberName(trip, as)},{" "}
            {net === 0 ? (
              <span className="inline-flex items-center gap-1">
                <SparklesIcon className="size-3.5" />
                {line}
              </span>
            ) : (
              line
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TaliStrip trip={trip} viewerId={as} activeTab="gastos" now={now} lang={lang} />
        </CardContent>
      </Card>

      {showInvite ? (
        <Card>
          <CardContent className="flex items-center gap-3 py-3">
            <p className="min-w-0 flex-1 text-sm font-medium">
              <ClockIcon className="mr-1 inline size-3.5 align-[-2px]" />
              {t(lang, "inviteLeft").replace("{n}", String(waiting.length))}
            </p>
            <Button size="touch" className="min-h-[38px] shrink-0" onClick={onInvite}>
              <Share2Icon data-icon="inline-start" />
              {t(lang, "invitePill").replace("{code}", trip.joinCode)}
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
            <EmptyMedia variant="icon">
              <ReceiptIcon />
            </EmptyMedia>
            <EmptyTitle>{t(lang, "emptyGastos")}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  )
}
