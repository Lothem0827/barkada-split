import { balances, daysOwed, peso, transfers, wrappedStats } from "@/lib/calc"
import { memberName, type Persona, type SplitMethod, type Trip } from "@/lib/types"

export type MascotMood = "chill" | "detective" | "conyo" | "tita" | "tampo" | "fiesta"

export const TALI_NUDGE_SIGNATURE = "— Tali (Official Barkada Tagasingil)"

const AVATARS: Record<MascotMood, string> = {
  chill: "🦦🕶️",
  detective: "🦦🔍",
  conyo: "🦦💅",
  tita: "🦦🥺",
  tampo: "🦦🥺",
  fiesta: "🦦🎉",
}

const roastSeeds = new Map<string, number>()

export function getMascotAvatar(mood: MascotMood) {
  return AVATARS[mood]
}

export function getHomeMoodLine(mood: MascotMood) {
  if (mood === "tampo") return "Bayad muna tayo bago mag-seen zone!"
  if (mood === "detective") return "May mga kailangan pang singilin sa barkada!"
  return "Chill floating mode — walang utang!"
}

export function personaMood(persona: Persona): MascotMood {
  if (persona === "conyo") return "conyo"
  if (persona === "tita") return "tita"
  if (persona === "guilttrip") return "tampo"
  if (persona === "corporate") return "detective"
  return "chill"
}

export function signTaliNudge(body: string) {
  const text = String(body ?? "").trimEnd()
  if (!text) return TALI_NUDGE_SIGNATURE
  if (text.includes(TALI_NUDGE_SIGNATURE)) return text
  return text + "\n\n" + TALI_NUDGE_SIGNATURE
}

export function wrappedRoastSeed(tripId: string) {
  return roastSeeds.get(tripId) ?? 0
}

export function cycleWrappedRoast(tripId: string) {
  const next = wrappedRoastSeed(tripId) + 1
  roastSeeds.set(tripId, next)
  return next
}

export function pendingQueueCount(trip: Trip, viewerId: string) {
  const pending = trip.expenses.filter((expense) => expense.status === "pending").length
  if (viewerId !== trip.treasurer) return pending
  const proposals = trip.expenses.filter((expense) => expense.status === "approved" && expense.pendingEdit).length
  return pending + proposals
}

function newestSeenZonedByViewer(trip: Trip, viewerId: string) {
  let latest: NonNullable<Trip["nudges"]>[number] | null = null
  for (const nudge of trip.nudges || []) {
    if (nudge.from !== viewerId || nudge.status !== "seen_zoned") continue
    if (!latest || nudge.ts > latest.ts) latest = nudge
  }
  return latest
}

function viewerDebt(trip: Trip, viewerId: string) {
  const rows = transfers(trip).filter((row) => row.from === viewerId)
  if (!rows.length) return null
  return rows.reduce((best, row) => (row.amount > best.amount ? row : best), rows[0])
}

function joinNames(names: string[]) {
  return names.filter(Boolean).join(", ")
}

export function getHeroCommentary(
  trip: Trip,
  viewerId: string,
  activeTab: string,
  now: number
): { mood: MascotMood; lines: string[] } {
  const pendingCount = pendingQueueCount(trip, viewerId)
  if (viewerId === trip.treasurer && pendingCount > 0) {
    const n = String(pendingCount)
    return {
      mood: "detective",
      lines: [
        `Psst Ingat-Yaman, may ${n} pending gastos sa pouch ko na kailangan ng approval mo!`,
        `${n} resibo sa pouch — approve mo na Ingat-Yaman, para walang tampo.`,
        `Naka-pending pa ang ${n} gastos. Ikaw ang huling hadlang, treasurer.`,
      ],
    }
  }

  const seen = newestSeenZonedByViewer(trip, viewerId)
  if (seen) {
    const debtor = memberName(trip, seen.to)
    return {
      mood: "tampo",
      lines: [
        `Huli! Na-SEEN ZONE ni ${debtor} yung parinig mo. Gusto mo kulitin ko ulit?`,
        `Si ${debtor} seen-zone artist. I-send ko ulit yung parinig?`,
        `Read na, bayad wala. ${debtor} chill na chill. Kulitin ulit?`,
      ],
    }
  }

  const net = balances(trip)[viewerId] ?? 0
  const days = daysOwed(trip, viewerId, now)
  const debt = viewerDebt(trip, viewerId)
  if (net < 0 && days >= 3 && debt) {
    const name = memberName(trip, viewerId)
    const creditor = memberName(trip, debt.to)
    const amount = peso(debt.pay != null ? debt.pay : debt.amount)
    return {
      mood: "tita",
      lines: [
        `Huy ${name}, ${days} days na yung ${amount} mo kay ${creditor}. Baka ma-FO tayo niyan, magbayad ka na!`,
        `${days} days na, ${name}. ${amount} kay ${creditor} — GCash mo, let's go.`,
        `Tita mode ON. ${amount} mo kay ${creditor} hindi magbabayad nang kusa.`,
      ],
    }
  }

  const stats = wrappedStats(trip, now)
  if (transfers(trip).length === 0 && stats.count > 0) {
    return {
      mood: "fiesta",
      lines: [
        "Quits na lahat! Nakakapit na ulit tayo sa isa't isa. Ready na ang Lakad Wrapped!",
        "Walang utang, walang tampo. Screenshot na 'yang Wrapped!",
        "Quits. Tali's pouch is empty of drama. Share the receipt.",
      ],
    }
  }

  if (stats.count > 0 && stats.financier) {
    const top = memberName(trip, stats.financier.id)
    const topAmount = peso(stats.financier.value)
    const tabHint = activeTab === "hatian" ? "Hatian na, bayaran na." : "Resibo complete, isda next."
    return {
      mood: "chill",
      lines: [
        `Grabe si ${top}, nag-abono na ng ${topAmount}! Bigyan niyo naman ng isda 'yan!`,
        `Wallet carrier: ${top} (${topAmount}). Ibalik niyo yung isda, guys.`,
        `Si ${top} ang ATM ng barkada. ${topAmount} inabono. ${tabHint}`,
      ],
    }
  }

  const emptyHint =
    activeTab === "hatian"
      ? "Wala pang singilin sa hatian. First gastos, go!"
      : "Ready na ang pouch ko. Magdagdag na kayo ng first gastos!"
  return {
    mood: "chill",
    lines: [emptyHint, "Wala pang resibo. First unli on me? Joke. Log niyo na."],
  }
}

export function getExpenseReaction({
  amount,
  method,
  excludedNames,
  head,
  payingCount,
}: {
  amount: number
  method: SplitMethod
  excludedNames: string[]
  head: number
  payingCount: number
}): { mood: MascotMood; message: string } | null {
  if (!(amount > 0)) return null
  const perHead = peso(head)
  if (amount >= 500000) {
    return { mood: "chill", message: `Uy big time! ${perHead}/head — pang-rich kid!` }
  }
  const names = joinNames(excludedNames)
  if (method === "libre" && names) {
    return { mood: "fiesta", message: `Wow manlilibre si ${names}! ${perHead}/head sa natira!` }
  }
  if (method === "exclude" && names) {
    return {
      mood: "detective",
      message: `Pwera si ${names} — ${perHead}/head sa ${payingCount} kumain.`,
    }
  }
  return null
}

function roastPick<T>(list: T[], seed: number) {
  return list[Math.abs(seed) % list.length]
}

export function getWrappedVerdict(trip: Trip, now: number, seed: number) {
  const stats = wrappedStats(trip, now)
  const nameOf = (id: string) => memberName(trip, id)
  const financier = stats.financier ? nameOf(stats.financier.id) : null
  const financierAmt = stats.financier ? peso(stats.financier.value) : null
  const libre = stats.libreMagnet ? nameOf(stats.libreMagnet.id) : null
  const tampo = stats.tampo ? nameOf(stats.tampo.id) : null
  const seen = stats.seenZoner ? nameOf(stats.seenZoner.id) : null
  const total = peso(stats.total)
  const perHead = peso(stats.perHead)

  const openers = [
    financier && financierAmt
      ? `Si ${financier} ang otter-in-chief ng wallet — ${financierAmt} inabono.`
      : `${trip.name}: ${total} all-in, ${perHead} per head.`,
    stats.count
      ? `${stats.count} resibo, ${total} ang laman ng pouch ni Tali.`
      : `Walang resibo, pero may chismis pa rin.`,
    financier
      ? `ATM ng barkada: ${financier}. Ibalik niyo na yung isda.`
      : `Walang financier — pantay-pantay ang gutom.`,
  ]

  const closers = [
    tampo
      ? `Longest tampo: ${tampo}. Hold hands ulit, wag drift.`
      : `Walang tampo legend. Nakakapit pa tayo.`,
    libre
      ? `Libre magnet: ${libre}. Next round, iba naman.`
      : `Walang libre magnet — next unli, split na.`,
    seen
      ? `${seen} seen-zone champion. Tali will remember that.`
      : `Zero seen-zone. Ang husay ninyo mag-reply.`,
    `Lakad Wrapped ready. Screenshot, post, then mag-isda.`,
  ]

  return roastPick(openers, seed) + " " + roastPick(closers, seed + 1)
}
