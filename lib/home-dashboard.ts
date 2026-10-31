import { balances, transfers } from "@/lib/calc"
import { pendingQueueCount, type MascotMood } from "@/lib/companion-ai"
import { activeMembers, nameKey, newestUnreadNudge, type Member, type Tab, type Trip } from "@/lib/types"

export type HomeIds = { authUid: string; profileName: string; as?: string }

export type AttentionItem = {
  kind: "nudge" | "confirm" | "review"
  tripId: string
  tripName: string
  tab: Extract<Tab, "gastos" | "hatian">
  fromId?: string
  amount?: number
  count?: number
}

export function homeSeat(trip: Trip, ids: HomeIds): Member | null {
  const roster = activeMembers(trip)
  if (ids.authUid) {
    const claimed = roster.find((member) => member.claimedByUid === ids.authUid)
    if (claimed) return claimed
  }
  const nick = nameKey(ids.profileName)
  if (nick) {
    const named = roster.find((member) => nameKey(member.name) === nick)
    if (named) return named
  }
  if (ids.as) return roster.find((member) => member.id === ids.as) ?? null
  return null
}

export function pendingCountOf(trip: Trip) {
  return trip.expenses.filter((expense) => {
    if (expense.status === "pending" || expense.status === "rejected") return true
    return !!expense.pendingEdit
  }).length
}

export function isSettledTrip(trip: Trip) {
  return trip.expenses.length > 0 && transfers(trip).length === 0 && pendingCountOf(trip) === 0
}

export function isActiveTrip(trip: Trip) {
  return !isSettledTrip(trip)
}

export function homeTotals(lakads: Trip[], ids: HomeIds) {
  let totalOwedToMe = 0
  let totalIOwe = 0
  for (const trip of lakads) {
    const seat = homeSeat(trip, ids)
    if (!seat) continue
    const net = balances(trip)[seat.id] || 0
    if (net > 0) totalOwedToMe += net
    else if (net < 0) totalIOwe += -net
  }
  return { totalOwedToMe, totalIOwe, overallNet: totalOwedToMe - totalIOwe }
}

export function homeMood(totals: { totalOwedToMe: number; totalIOwe: number }): MascotMood {
  if (totals.totalIOwe > 0) return "tampo"
  if (totals.totalOwedToMe > 0) return "detective"
  return "fiesta"
}

export function homeAttention(lakads: Trip[], ids: HomeIds): AttentionItem[] {
  const items: AttentionItem[] = []
  for (const trip of lakads) {
    const seat = homeSeat(trip, ids)
    if (!seat) continue
    const nudge = newestUnreadNudge(trip.nudges, seat.id)
    if (nudge) {
      items.push({
        kind: "nudge",
        tripId: trip.id,
        tripName: trip.name,
        tab: "hatian",
        fromId: nudge.from,
        amount: nudge.amount,
      })
    }
    for (const payment of trip.payments) {
      if (payment.status !== "sent" || payment.to !== seat.id) continue
      items.push({
        kind: "confirm",
        tripId: trip.id,
        tripName: trip.name,
        tab: "hatian",
        fromId: payment.from,
        amount: payment.amount,
      })
    }
    if (seat.id !== trip.treasurer) continue
    const count = pendingQueueCount(trip, seat.id)
    if (count > 0) {
      items.push({ kind: "review", tripId: trip.id, tripName: trip.name, tab: "gastos", count })
    }
  }
  return items
}
