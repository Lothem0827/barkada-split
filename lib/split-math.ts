import { DAY, activeMembers, memberName, type Expense, type SplitMethod, type Transfer, type Trip } from "@/lib/types"

export type BalanceLineItem = {
  id: string
  title: string
  payerId: string
  payerName: string
  totalBill: number
  myShare: number
  iPaid: number
  netImpact: number
  method: SplitMethod
  isLibreForMe: boolean
  isExcludedForMe: boolean
}

export type MemberMathBreakdown = {
  memberId: string
  memberName: string
  totalPaidByMe: number
  totalMyConsumption: number
  confirmedSentByMe: number
  confirmedReceivedByMe: number
  netBalance: number
  rawPairwiseCount: number
  smartTransferCount: number
  lineItems: BalanceLineItem[]
}

function emptyMap() {
  return Object.create(null) as Record<string, number>
}

export function totalOf(expense: Pick<Expense, "amount" | "sc">) {
  return expense.amount + (expense.sc ? Math.round(expense.amount / 10) : 0)
}

export function distribute(total: number, weights: Record<string, number>) {
  const ids = Object.keys(weights)
  const out = emptyMap()
  const weightSum = ids.reduce((sum, id) => sum + BigInt(weights[id]), BigInt(0))
  ids.forEach((id) => {
    out[id] = 0
  })
  if (weightSum === BigInt(0)) return out
  const T = BigInt(total)
  let used = BigInt(0)
  const remainder: [bigint, number, string][] = []
  ids.forEach((id, index) => {
    const product = T * BigInt(weights[id])
    const share = product / weightSum
    out[id] = Number(share)
    used += share
    remainder.push([product % weightSum, index, id])
  })
  remainder.sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] > b[0] ? -1 : 1))
  const leftover = Number(T - used)
  for (let i = 0; i < leftover; i++) out[remainder[i][2]] += 1
  return out
}

export function weightsOf(trip: Trip, expense: Pick<Expense, "method" | "ex" | "items" | "at">) {
  // Late joiners stay off bills created before they arrived.
  // Departed members stay on bills created before they left.
  const created = expense.at ?? 0
  const present = trip.members
    .filter((member) => {
      if (member.joinedAt && member.joinedAt > created) return false
      if (member.leftAt && member.leftAt <= created) return false
      return true
    })
    .map((member) => member.id)
  const ids = present.length ? present : trip.members.map((member) => member.id)
  const weights = emptyMap()
  if (expense.method === "item") {
    ;(expense.items || []).forEach((item) => {
      let eaters = (item.eaters || []).filter((id) => ids.includes(id))
      if (!eaters.length) eaters = ids
      const even = emptyMap()
      eaters.forEach((id) => {
        even[id] = 1
      })
      const shares = distribute(item.price || 0, even)
      Object.keys(shares).forEach((id) => {
        weights[id] = (weights[id] || 0) + shares[id]
      })
    })
  } else {
    const excluded = expense.method === "exclude" || expense.method === "libre" ? expense.ex || [] : []
    ids.forEach((id) => {
      if (!excluded.includes(id)) weights[id] = 1
    })
  }
  const ordered = emptyMap()
  let sum = 0
  ids.forEach((id) => {
    if (weights[id]) {
      ordered[id] = weights[id]
      sum += weights[id]
    }
  })
  if (!sum) {
    ids.forEach((id) => {
      ordered[id] = 1
    })
  }
  return ordered
}

export function sharesOf(trip: Trip, expense: Expense | (Pick<Expense, "amount" | "sc" | "method" | "ex" | "items">)) {
  return distribute(totalOf(expense), weightsOf(trip, expense))
}

export function balances(trip: Trip) {
  const totals = emptyMap()
  trip.members.forEach((member) => {
    totals[member.id] = 0
  })
  trip.expenses.forEach((expense) => {
    if (expense.status !== "approved" || !(expense.payer in totals)) return
    totals[expense.payer] += totalOf(expense)
    const shares = sharesOf(trip, expense)
    Object.keys(shares).forEach((id) => {
      totals[id] -= shares[id]
    })
  })
  trip.payments.forEach((payment) => {
    if (payment.status !== "confirmed" || !(payment.from in totals) || !(payment.to in totals)) return
    totals[payment.from] += payment.amount
    totals[payment.to] -= payment.amount
  })
  return totals
}

function roundPay(amount: number, roundTo: number) {
  if (!roundTo) return amount
  if (amount < roundTo / 2) return amount
  return Math.round(amount / roundTo) * roundTo
}

export function transfers(trip: Trip): Transfer[] {
  const totals = balances(trip)
  const debt: [string, number][] = []
  const credit: [string, number][] = []
  trip.members.forEach((member) => {
    const value = totals[member.id]
    if (value < 0) debt.push([member.id, -value])
    else if (value > 0) credit.push([member.id, value])
  })
  debt.sort((a, b) => b[1] - a[1])
  credit.sort((a, b) => b[1] - a[1])
  const out: Transfer[] = []
  let i = 0
  let j = 0
  while (i < debt.length && j < credit.length) {
    const amount = Math.min(debt[i][1], credit[j][1])
    const pay = roundPay(amount, trip.roundTo || 0)
    out.push({
      from: debt[i][0],
      to: credit[j][0],
      amount,
      pay,
      exactAmount: amount,
      roundingDiff: pay - amount,
    })
    debt[i][1] -= amount
    credit[j][1] -= amount
    if (!debt[i][1]) i += 1
    if (!credit[j][1]) j += 1
  }
  return out
}

export function explainMemberBalance(trip: Trip, memberId: string): MemberMathBreakdown {
  const onRoster = emptyMap()
  trip.members.forEach((member) => {
    onRoster[member.id] = 1
  })
  const lineItems: BalanceLineItem[] = []
  let totalPaidByMe = 0
  let totalMyConsumption = 0
  let rawPairwiseCount = 0

  trip.expenses
    .filter((expense) => expense.status === "approved" && expense.payer in onRoster)
    .slice()
    .sort((a, b) => a.ts - b.ts)
    .forEach((expense) => {
      const shares = sharesOf(trip, expense)
      const totalBill = totalOf(expense)
      const myShare = shares[memberId] || 0
      const iPaid = expense.payer === memberId ? totalBill : 0
      const ex = expense.ex || []
      const isLibreForMe = expense.method === "libre" && ex.includes(memberId)
      const isExcludedForMe = expense.method === "exclude" && ex.includes(memberId)
      if (expense.payer === memberId) {
        Object.keys(shares).forEach((id) => {
          if (id !== memberId && shares[id] > 0) rawPairwiseCount += 1
        })
      } else if (myShare > 0) {
        rawPairwiseCount += 1
      }
      totalPaidByMe += iPaid
      totalMyConsumption += myShare
      if (!(iPaid > 0 || myShare > 0 || isLibreForMe)) return
      lineItems.push({
        id: expense.id,
        title: expense.title,
        payerId: expense.payer,
        payerName: memberName(trip, expense.payer),
        totalBill,
        myShare,
        iPaid,
        netImpact: iPaid - myShare,
        method: expense.method,
        isLibreForMe,
        isExcludedForMe,
      })
    })

  let confirmedSentByMe = 0
  let confirmedReceivedByMe = 0
  trip.payments.forEach((payment) => {
    if (payment.status !== "confirmed" || !(payment.from in onRoster) || !(payment.to in onRoster)) return
    if (payment.from === memberId) confirmedSentByMe += payment.amount
    if (payment.to === memberId) confirmedReceivedByMe += payment.amount
  })

  return {
    memberId,
    memberName: memberName(trip, memberId),
    totalPaidByMe,
    totalMyConsumption,
    confirmedSentByMe,
    confirmedReceivedByMe,
    netBalance: totalPaidByMe - totalMyConsumption + confirmedSentByMe - confirmedReceivedByMe,
    rawPairwiseCount,
    smartTransferCount: transfers(trip).filter((row) => row.from === memberId || row.to === memberId).length,
    lineItems,
  }
}

export function potOf(list: Transfer[]) {
  return list.reduce((sum, row) => sum + row.pay - row.amount, 0)
}

export function daysOwed(trip: Trip, id: string, now: number) {
  if (!((balances(trip)[id] ?? 0) < 0)) return 0
  let oldest: number | null = null
  let lastPay = 0
  trip.expenses.forEach((expense) => {
    if (expense.status !== "approved") return
    if ((sharesOf(trip, expense)[id] || 0) > 0 && (oldest === null || expense.ts < oldest)) {
      oldest = expense.ts
    }
  })
  if (oldest === null) return 0
  trip.payments.forEach((payment) => {
    if (payment.status === "confirmed" && payment.from === id && payment.ts > lastPay) {
      lastPay = payment.ts
    }
  })
  return Math.max(0, Math.floor((now - Math.max(oldest, lastPay)) / DAY))
}

export function lvl(days: number) {
  return days <= 1 ? 0 : days <= 3 ? 1 : days <= 6 ? 2 : days <= 13 ? 3 : 4
}

type Stat = { id: string; value: number } | null

function topOf(map: Record<string, number>, mode: "max" | "min"): Stat {
  let best: string | null = null
  Object.keys(map).forEach((id) => {
    if (best === null || (mode === "max" ? map[id] > map[best] : map[id] < map[best])) best = id
  })
  return best === null ? null : { id: best, value: map[best] }
}

export function wrappedStats(trip: Trip, now: number) {
  const approved = trip.expenses.filter((expense) => expense.status === "approved")
  const total = approved.reduce((sum, expense) => sum + totalOf(expense), 0)
  const stamps = approved.map((expense) => expense.ts)
  const start = stamps.length ? Math.min(...stamps) : null
  const end = stamps.length ? Math.max(...stamps) : null
  const days = stamps.length && start !== null && end !== null ? Math.floor((end - start) / DAY) + 1 : 0
  const isMember = (id: string) => !!trip.members.find((member) => member.id === id)

  const paid = emptyMap()
  approved.forEach((expense) => {
    if (isMember(expense.payer)) paid[expense.payer] = (paid[expense.payer] || 0) + totalOf(expense)
  })

  const libre = emptyMap()
  approved.forEach((expense) => {
    if (expense.method === "libre") {
      ;(expense.ex || []).forEach((id) => {
        if (isMember(id)) libre[id] = (libre[id] || 0) + 1
      })
    }
  })

  const confirmed = trip.payments.filter((payment) => payment.status === "confirmed" && isMember(payment.from))
  const lates: Record<string, number[]> = Object.create(null)
  confirmed.forEach((payment) => {
    ;(lates[payment.from] ??= []).push(payment.daysLate || 0)
  })
  const avg = emptyMap()
  Object.keys(lates).forEach((id) => {
    avg[id] = lates[id].reduce((sum, value) => sum + value, 0) / lates[id].length
  })

  const owe = emptyMap()
  trip.members.forEach((member) => {
    const daysLate = daysOwed(trip, member.id, now)
    if (daysLate > 0) owe[member.id] = daysLate
  })
  let tampo = topOf(owe, "max")
  let tampoKind: "now" | "past" = "now"
  if (!tampo) {
    const maxLate = emptyMap()
    confirmed.forEach((payment) => {
      if (payment.daysLate > 0) maxLate[payment.from] = Math.max(maxLate[payment.from] || 0, payment.daysLate)
    })
    tampo = topOf(maxLate, "max")
    tampoKind = "past"
  }

  const seen = emptyMap()
  ;(trip.nudges || []).forEach((nudge) => {
    if (nudge.status === "seen_zoned" && isMember(nudge.to)) {
      seen[nudge.to] = (seen[nudge.to] || 0) + 1
    }
  })
  const livingCount = activeMembers(trip).length

  return {
    total,
    count: approved.length,
    days,
    start,
    end,
    perDay: days ? Math.round(total / days) : 0,
    perHead: livingCount ? Math.round(total / livingCount) : 0,
    confirmed: confirmed.length,
    financier: topOf(paid, "max"),
    libreMagnet: topOf(libre, "max"),
    fastest: topOf(avg, "min"),
    tampo,
    tampoKind,
    seenZoner: topOf(seen, "max"),
  }
}

export type TripDeleteStatus = {
  canDelete: boolean
  isEmptyTrip: boolean
  unsettledTransferCount: number
  unsettledTotalAmount: number
  pendingExpenseCount: number
  unconfirmedPaymentCount: number
}

export function getTripDeleteStatus(trip: Trip): TripDeleteStatus {
  const isEmptyTrip = trip.expenses.length === 0
  const activeTransfers = transfers(trip)
  const unsettledTransferCount = activeTransfers.length
  const unsettledTotalAmount = activeTransfers.reduce((sum, transfer) => sum + transfer.amount, 0)
  const pendingExpenseCount = trip.expenses.filter(
    (expense) => expense.status === "pending" || Boolean(expense.pendingEdit)
  ).length
  const unconfirmedPaymentCount = trip.payments.filter((payment) => payment.status === "sent").length
  const canDelete =
    isEmptyTrip ||
    (unsettledTransferCount === 0 && pendingExpenseCount === 0 && unconfirmedPaymentCount === 0)
  return {
    canDelete,
    isEmptyTrip,
    unsettledTransferCount,
    unsettledTotalAmount,
    pendingExpenseCount,
    unconfirmedPaymentCount,
  }
}

export function canMemberLeaveTrip(trip: Trip, memberId: string) {
  if (!trip.members.some((member) => member.id === memberId)) {
    return { canLeave: false, myNetBalance: 0, hasPendingItems: false }
  }
  const myNetBalance = balances(trip)[memberId] ?? 0
  const hasPendingItems =
    trip.expenses.some(
      (expense) =>
        (expense.payer === memberId || expense.addedBy === memberId) &&
        (expense.status === "pending" || Boolean(expense.pendingEdit))
    ) ||
    trip.payments.some(
      (payment) => (payment.from === memberId || payment.to === memberId) && payment.status === "sent"
    )
  return {
    canLeave: myNetBalance === 0 && !hasPendingItems,
    myNetBalance,
    hasPendingItems,
  }
}

export function memberCanRemove(trip: Trip, memberId: string) {
  if (memberId === trip.treasurer) return false
  const living = activeMembers(trip)
  if (living.length <= 1) return false
  if (!living.some((member) => member.id === memberId)) return false
  return canMemberLeaveTrip(trip, memberId).canLeave
}
