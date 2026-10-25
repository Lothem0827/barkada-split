import { peso, totalOf, transfers, wrappedStats } from "@/lib/calc"
import { getWrappedVerdict, wrappedRoastSeed } from "@/lib/companion-ai"
import { inviteUrl } from "@/lib/join-code"
import {
  ACTIVITY_LOG_CAP,
  activityLogOf,
  emergencyLogOf,
  logActivity,
  memberName,
  memberOf,
  type ActivityLogItem,
  type EmergencyLogEntry,
  type Expense,
  type Nudge,
  type Payment,
  type RoundTo,
  type Trip,
} from "@/lib/types"

export type BarkadaHub = "roster" | "chismis" | "wrapped"

export function mergeActivityLog(local: ActivityLogItem[], remote: ActivityLogItem[]): ActivityLogItem[] {
  const map = new Map<string, ActivityLogItem>()
  for (const row of [...remote, ...local]) {
    const existing = map.get(row.id)
    if (!existing || row.ts >= existing.ts) map.set(row.id, row)
  }
  return Array.from(map.values())
    .sort((a, b) => b.ts - a.ts)
    .slice(0, ACTIVITY_LOG_CAP)
}

export function synthesizeActivityLog(trip: Trip): ActivityLogItem[] {
  const rows: ActivityLogItem[] = []
  for (const expense of trip.expenses) {
    rows.push(expenseAddedActivity(expense, memberName(trip, expense.addedBy), expense.addedBy))
  }
  for (const payment of trip.payments) {
    rows.push(
      payment.status === "confirmed"
        ? paymentConfirmedActivity(trip, payment, payment.to)
        : paymentSentActivity(trip, payment)
    )
  }
  for (const entry of emergencyLogOf(trip)) {
    rows.push(emergencyActivity(entry))
  }
  return rows
}

export function tripActivityLog(trip: Trip): ActivityLogItem[] {
  return mergeActivityLog(synthesizeActivityLog(trip), activityLogOf(trip))
}

export function activityAgo(ts: number, now: number) {
  const delta = Math.max(0, now - ts)
  const mins = Math.floor(delta / 60_000)
  if (mins < 1) return "Just now"
  if (mins < 60) return mins + "m ago"
  const hours = Math.floor(mins / 60)
  if (hours < 24) return hours + "h ago"
  return Math.floor(hours / 24) + "d ago"
}

export function expenseAddedActivity(expense: Expense, actorName: string, actorId: string): ActivityLogItem {
  const amount = totalOf(expense)
  return {
    id: "al-e-" + expense.id,
    category: "gastos",
    icon: "🧾",
    actorId,
    actorName,
    message:
      actorName +
      " added '" +
      expense.title +
      "' (" +
      peso(amount) +
      ")" +
      (expense.status === "pending" ? " — Pending approval" : ""),
    amount,
    ts: expense.ts,
  }
}

export function expenseApprovedActivity(
  expense: Pick<Expense, "id" | "title" | "amount" | "sc">,
  actorName: string,
  actorId: string,
  ts: number
): ActivityLogItem {
  return {
    id: "al-eok-" + expense.id,
    category: "gastos",
    icon: "✓",
    actorId,
    actorName,
    message: "👑 " + actorName + " approved '" + expense.title + "'",
    amount: totalOf(expense),
    ts,
  }
}

export function expenseRejectedActivity(
  expense: Pick<Expense, "id" | "title" | "amount" | "sc">,
  actorName: string,
  actorId: string,
  reason: string,
  ts: number
): ActivityLogItem {
  return {
    id: "al-eno-" + expense.id,
    category: "gastos",
    icon: "↩️",
    actorId,
    actorName,
    message: "👑 " + actorName + " returned '" + expense.title + "' for revision (" + reason + ")",
    amount: totalOf(expense),
    ts,
  }
}

export function expenseEditedActivity(
  expense: Pick<Expense, "id" | "title">,
  actorName: string,
  actorId: string,
  oldAmount: number,
  newAmount: number,
  ts: number
): ActivityLogItem {
  return {
    id: "al-eed-" + expense.id + "-" + ts,
    category: "gastos",
    icon: "✏️",
    actorId,
    actorName,
    message: actorName + " edited '" + expense.title + "' (" + peso(oldAmount) + " → " + peso(newAmount) + ")",
    amount: newAmount,
    ts,
  }
}

export function expenseDeletedActivity(
  expense: Expense,
  actorName: string,
  actorId: string,
  ts: number
): ActivityLogItem {
  const amount = totalOf(expense)
  return {
    id: "al-edel-" + expense.id,
    category: "gastos",
    icon: "🗑️",
    actorId,
    actorName,
    message: actorName + " deleted '" + expense.title + "' (" + peso(amount) + ")",
    amount,
    ts,
  }
}

export function paymentSentActivity(trip: Trip, payment: Payment): ActivityLogItem {
  const from = memberName(trip, payment.from)
  const to = memberName(trip, payment.to)
  return {
    id: "al-p-" + payment.id,
    category: "bayad",
    icon: "🙋‍♂️",
    actorId: payment.from,
    actorName: from,
    message: from + " marked " + peso(payment.amount) + " as paid to " + to,
    amount: payment.amount,
    ts: payment.ts,
  }
}

export function paymentConfirmedActivity(trip: Trip, payment: Payment, actorId: string): ActivityLogItem {
  const actor = memberName(trip, actorId)
  const from = memberName(trip, payment.from)
  const to = memberName(trip, payment.to)
  return {
    id: "al-pok-" + payment.id,
    category: "bayad",
    icon: "✅",
    actorId,
    actorName: actor,
    message: actor + " confirmed " + peso(payment.amount) + " from " + from + " to " + to,
    amount: payment.amount,
    ts: payment.ts,
  }
}

export function seenZonedActivity(trip: Trip, nudge: Nudge): ActivityLogItem {
  const debtor = memberName(trip, nudge.to)
  const creditor = memberName(trip, nudge.from)
  return {
    id: "al-sz-" + nudge.id,
    category: "bayad",
    icon: "👀",
    actorId: nudge.to,
    actorName: debtor,
    message: debtor + " seen-zoned " + creditor + "'s reminder for " + peso(nudge.amount),
    amount: nudge.amount,
    ts: nudge.ts,
  }
}

export function membersAddedActivity(
  actorName: string,
  actorId: string,
  names: string[],
  memberId: string,
  ts: number
): ActivityLogItem {
  return {
    id: "al-madd-" + memberId,
    category: "admin",
    icon: "➕",
    actorId,
    actorName,
    message: actorName + " added " + names.join(", ") + " to the group",
    ts,
  }
}

export function memberRemovedActivity(
  actorName: string,
  actorId: string,
  name: string,
  memberId: string,
  ts: number
): ActivityLogItem {
  return {
    id: "al-mrm-" + memberId,
    category: "admin",
    icon: "🗑️",
    actorId,
    actorName,
    message: actorName + " removed " + name + " from the roster",
    ts,
  }
}

export function memberRenamedActivity(
  actorName: string,
  actorId: string,
  oldName: string,
  newName: string,
  memberId: string,
  ts: number
): ActivityLogItem {
  return {
    id: "al-mren-" + memberId + "-" + ts,
    category: "admin",
    icon: "✏️",
    actorId,
    actorName,
    message: actorName + " renamed " + oldName + " to " + newName,
    ts,
  }
}

export function seatClaimedActivity(trip: Trip, memberId: string, ts: number): ActivityLogItem {
  const member = memberOf(trip, memberId)
  return {
    id: "al-join-" + memberId,
    category: "admin",
    icon: "👋",
    actorId: memberId,
    actorName: member.name,
    message: member.name + " joined the trip and claimed their seat",
    ts,
  }
}

export function logSeatClaimed(trip: Trip, memberId: string, ts: number): Trip {
  return logActivity(trip, seatClaimedActivity(trip, memberId, ts))
}

export function openModeActivity(actorName: string, actorId: string, open: boolean, ts: number): ActivityLogItem {
  return {
    id: "al-open-" + ts,
    category: "admin",
    icon: open ? "🔓" : "🔒",
    actorId,
    actorName,
    message: open
      ? actorName + " switched the trip to Open Mode (Auto-Approve)"
      : actorName + " switched the trip to Treasurer Approval Mode",
    ts,
  }
}

export function roundToActivity(actorName: string, actorId: string, roundTo: RoundTo, ts: number): ActivityLogItem {
  const label = roundTo === 0 ? "₱0.01" : peso(roundTo)
  return {
    id: "al-rnd-" + ts,
    category: "admin",
    icon: "🔢",
    actorId,
    actorName,
    message: actorName + " set rounding to " + label,
    ts,
  }
}

export function emergencyActivity(entry: EmergencyLogEntry): ActivityLogItem {
  if (entry.action === "crown_passed") {
    const incoming = entry.details.replace(/^Passed crown to /, "")
    return {
      id: "al-em-" + entry.id,
      category: "admin",
      icon: "👑",
      actorId: entry.actorMemberId,
      actorName: entry.actorName,
      message: entry.actorName + " passed the Treasurer crown to " + incoming,
      ts: entry.ts,
    }
  }
  if (entry.action === "treasurer_takeover") {
    const dash = entry.details.indexOf("— ")
    const reason = dash >= 0 ? entry.details.slice(dash + 2) : entry.details
    return {
      id: "al-em-" + entry.id,
      category: "admin",
      icon: "🚨",
      actorId: entry.actorMemberId,
      actorName: entry.actorName,
      message: entry.actorName + " claimed Emergency Treasurer Takeover (" + reason + ")",
      ts: entry.ts,
    }
  }
  const target = entry.details.replace(/^Reset device lock for /, "")
  return {
    id: "al-em-" + entry.id,
    category: "admin",
    icon: "🔓",
    actorId: entry.actorMemberId,
    actorName: entry.actorName,
    message: entry.actorName + " reset " + target + "'s seat lock",
    ts: entry.ts,
  }
}

export function latestActivityTs(trip: Trip) {
  return tripActivityLog(trip)[0]?.ts ?? 0
}

export function unreadActivityCount(trip: Trip, lastSeenTs: number) {
  if (lastSeenTs <= 0) return 0
  return tripActivityLog(trip).filter((item) => item.ts > lastSeenTs).length
}

export function defaultBarkadaHub(trip: Trip, lastSeenTs: number): BarkadaHub {
  if (unreadActivityCount(trip, lastSeenTs) > 0) return "chismis"
  const unclaimed = trip.members.filter((member) => !member.claimedByUid).length
  if (trip.expenses.length === 0 || unclaimed > 0) return "roster"
  if (transfers(trip).length === 0) return "wrapped"
  return "roster"
}

export function isDramaticActivity(item: ActivityLogItem) {
  return item.icon === "👀" || item.icon === "✅" || (item.icon === "👑" && item.id.startsWith("al-em-"))
}

export function activityResiboWhen(ts: number, now: number) {
  const stamp = new Date(ts)
  const time = stamp.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  if (new Date(now).toDateString() === stamp.toDateString()) return "Today at " + time
  return stamp.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " at " + time
}

export function activityResiboText(item: ActivityLogItem, trip: Trip, now: number, origin = "") {
  const body =
    item.icon === "👀" ? item.icon + " " + item.message.replace(/seen-zoned/gi, "SEEN ZONED") : item.icon + " " + item.message
  return (
    "📜 RECEIPT ALERT (Tally): " +
    body +
    " (" +
    activityResiboWhen(item.ts, now) +
    ") — " +
    inviteUrl(trip.joinCode, origin)
  )
}

export function wrappedShareText(trip: Trip, now: number) {
  const stats = wrappedStats(trip, now)
  const nameOf = (id: string) => memberName(trip, id)
  return [
    "🧾 TRIP WRAPPED — " + trip.name,
    "Total " + peso(stats.total) + " · " + trip.members.length + " pax · " + stats.days + " days",
    "🏦 The Financier: " + (stats.financier ? nameOf(stats.financier.id) : "—"),
    "🎁 Treat magnet: " + (stats.libreMagnet ? nameOf(stats.libreMagnet.id) : "—"),
    "⚡ Fastest Hands: " + (stats.fastest ? nameOf(stats.fastest.id) : "—"),
    "👻 Sulk legend: " + (stats.tampo ? nameOf(stats.tampo.id) : "—"),
    "🐾 TALLY: " + getWrappedVerdict(trip, now, wrappedRoastSeed(trip.id)),
    inviteUrl(trip.joinCode),
  ].join("\n")
}
