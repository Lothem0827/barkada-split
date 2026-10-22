import { peso } from "@/lib/calc"
import { omitPayment } from "@/lib/merge-trip"
import { fakeNewsReminder } from "@/lib/reminders"
import {
  memberName,
  uid,
  type Lang,
  type Nudge,
  type Payment,
  type Persona,
  type Trip,
} from "@/lib/types"

export function canCancelSent(as: string, trip: Trip, payment: Payment) {
  return payment.status === "sent" && (as === payment.from || as === trip.treasurer)
}

export function canRevertConfirmed(as: string, trip: Trip, payment: Payment) {
  return payment.status === "confirmed" && (as === payment.to || as === trip.treasurer)
}

export function canUndoPayment(as: string, trip: Trip, payment: Payment) {
  return canCancelSent(as, trip, payment) || canRevertConfirmed(as, trip, payment)
}

export function canConfirmPayment(as: string, trip: Trip, payment: Payment) {
  return payment.status === "sent" && (as === payment.to || as === trip.treasurer)
}

export type HatianViewerRole = "debtor" | "creditor" | "treasurer_overseeing" | "uninvolved"

export function hatianViewerRole(as: string, treasurerId: string, from: string, to: string): HatianViewerRole {
  if (as === from) return "debtor"
  if (as === to) return "creditor"
  if (as === treasurerId) return "treasurer_overseeing"
  return "uninvolved"
}

export function canCopyTransfer(as: string, treasurerId: string, from: string, to: string) {
  return hatianViewerRole(as, treasurerId, from, to) === "debtor"
}

export function canNudgeTransfer(as: string, treasurerId: string, from: string, to: string) {
  const role = hatianViewerRole(as, treasurerId, from, to)
  return role === "creditor" || role === "treasurer_overseeing"
}

export function canMarkTransferSent(as: string, treasurerId: string, from: string, to: string) {
  const role = hatianViewerRole(as, treasurerId, from, to)
  return role === "debtor" || role === "creditor" || role === "treasurer_overseeing"
}

export function canConfirmTransfer(as: string, treasurerId: string, from: string, to: string) {
  const role = hatianViewerRole(as, treasurerId, from, to)
  return role === "creditor" || role === "treasurer_overseeing"
}

export function cancelSentPayment(trip: Trip, id: string): Trip {
  return omitPayment(trip, id)
}

export function revertConfirmedPayment(trip: Trip, payment: Payment, now: number): Trip {
  return {
    ...trip,
    payments: trip.payments.map((item) =>
      item.id === payment.id ? { ...item, status: "sent" as const, ts: now } : item
    ),
  }
}

export function makeFakeNewsNudge(
  trip: Trip,
  payment: Payment,
  actorId: string,
  persona: Persona,
  lang: Lang,
  now: number
): Nudge {
  return {
    id: uid("n"),
    from: actorId,
    to: payment.from,
    amount: payment.amount,
    persona,
    message: fakeNewsReminder(persona, lang, {
      from: memberName(trip, payment.from),
      to: memberName(trip, actorId),
      amt: peso(payment.amount),
      trip: trip.name,
    }).slice(0, 800),
    ts: now,
    read: false,
    status: "unread",
  }
}

export function applyUndoPayment(
  trip: Trip,
  payment: Payment,
  actorId: string,
  now: number,
  fakeNews?: Nudge
): { ok: false } | { ok: true; trip: Trip; kind: "cancel" | "revert" } {
  if (canCancelSent(actorId, trip, payment)) {
    return { ok: true, trip: cancelSentPayment(trip, payment.id), kind: "cancel" }
  }
  if (canRevertConfirmed(actorId, trip, payment)) {
    const reverted = revertConfirmedPayment(trip, payment, now)
    return {
      ok: true,
      trip: fakeNews ? { ...reverted, nudges: [...(reverted.nudges || []), fakeNews] } : reverted,
      kind: "revert",
    }
  }
  return { ok: false }
}
