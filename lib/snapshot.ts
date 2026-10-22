import { joinCodeFromId, normalizeJoinCode } from "@/lib/join-code"
import {
  isEmergencyAction,
  isNudgeStatus,
  PERSONA_IDS,
  uiLang,
  type EmergencyLogEntry,
  type Expense,
  type Item,
  type Lang,
  type Member,
  type Nudge,
  type Payment,
  type Persona,
  type RoundTo,
  type SplitMethod,
  type Trip,
} from "@/lib/types"

function b64e(text: string) {
  if (typeof btoa === "function") return btoa(text)
  return Buffer.from(text, "binary").toString("base64")
}

function b64d(text: string) {
  if (typeof atob === "function") return atob(text)
  return Buffer.from(text, "base64").toString("binary")
}

export function exportTrip(trip: Trip) {
  return b64e(encodeURIComponent(JSON.stringify(trip)))
}

export function importTrip(code: string) {
  const tokens = String(code || "").replace(/\s+/g, "").match(/[A-Za-z0-9+/=]{16,}/g)
  if (!tokens) throw new Error("NO_CODE")
  const token = tokens.sort((a, b) => b.length - a.length)[0]
  let obj: unknown
  try {
    obj = JSON.parse(decodeURIComponent(b64d(token)))
  } catch {
    throw new Error("BAD_CODE")
  }
  return sanitizeTrip(obj)
}

export function importErrorMessage(error: unknown, lang: Lang) {
  const code = error instanceof Error ? error.message : ""
  const tl = uiLang(lang) === "tl"
  if (code === "NO_CODE") {
    return tl
      ? "Walang trip code na nakita. I-paste ang buong code."
      : "No trip code found. Paste the whole code."
  }
  if (code === "BAD_CODE") {
    return tl
      ? "Sira o putol ang code. Kopyahin ulit ang buong code."
      : "That code is broken or cut off. Copy the whole thing again."
  }
  const detail = code.startsWith("Invalid trip code: ") ? code.slice("Invalid trip code: ".length) : code
  return tl ? "Invalid trip code: " + detail : "Invalid trip code: " + detail
}

function bad(field: string): never {
  throw new Error("Invalid trip code: " + field + ".")
}

function str(value: unknown, max: number, field: string, optional = false) {
  if (value == null && optional) return ""
  if (typeof value !== "string") bad(field)
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, max)
}

function int(value: unknown, field: string, fallback?: number) {
  if (value == null && fallback != null) return fallback
  if (!Number.isSafeInteger(value) || (value as number) < 0) bad(field)
  return value as number
}

function idOf(value: unknown, field: string) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,40}$/.test(value)) bad(field)
  return value
}

function list(value: unknown, field: string, max: number) {
  if (!Array.isArray(value)) bad(field)
  if (value.length > max) bad("too many " + field)
  return value as unknown[]
}

function idList(value: unknown, max: number) {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  const seen = Object.create(null) as Record<string, 1>
  for (const row of value.slice(0, max)) {
    if (typeof row !== "string" || !/^[A-Za-z0-9_-]{1,40}$/.test(row) || seen[row]) continue
    seen[row] = 1
    out.push(row)
  }
  return out
}

export function sanitizeTrip(raw: unknown): Trip {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) bad("not a trip")
  const o = raw as Record<string, unknown>
  const seen = Object.create(null) as Record<string, 1>
  const has = (id: string) => seen[id] === 1
  const methods: SplitMethod[] = ["even", "item", "exclude", "libre"]

  const members: Member[] = list(o.members, "members", 60).map((row) => {
    if (!row || typeof row !== "object") bad("member")
    const member = row as Record<string, unknown>
    const id = idOf(member.id, "member id")
    if (has(id)) bad("duplicate member")
    seen[id] = 1
    const claimedByUid =
      typeof member.claimedByUid === "string" && member.claimedByUid
        ? member.claimedByUid.slice(0, 64)
        : null
    return {
      id,
      name: str(member.name, 40, "member name") || "?",
      gcash: str(member.gcash, 30, "gcash", true),
      ...(claimedByUid ? { claimedByUid } : {}),
    }
  })
  if (!members.length) bad("no members")
  const treasurer = idOf(o.treasurer, "treasurer")
  if (!has(treasurer)) bad("treasurer is not a member")

  const deletedExpenseIds = idList(o.deletedExpenseIds, 2000)
  const deletedPaymentIds = idList(o.deletedPaymentIds, 2000)
  const goneExpense = Object.create(null) as Record<string, 1>
  deletedExpenseIds.forEach((id) => {
    goneExpense[id] = 1
  })
  const gonePayment = Object.create(null) as Record<string, 1>
  deletedPaymentIds.forEach((id) => {
    gonePayment[id] = 1
  })

  const expenses: Expense[] = list(o.expenses, "expenses", 1000).flatMap((row) => {
    if (!row || typeof row !== "object") bad("expense")
    const expense = row as Record<string, unknown>
    if (!methods.includes(expense.method as SplitMethod)) bad("split method")
    const payer = idOf(expense.payer, "payer")
    if (!has(payer)) bad("payer is not a member")
    const items: Item[] = (Array.isArray(expense.items) ? expense.items : []).slice(0, 200).map((item) => {
      if (!item || typeof item !== "object") bad("item")
      const it = item as Record<string, unknown>
      return {
        name: str(it.name, 60, "item name"),
        price: int(it.price, "item price"),
        eaters: (Array.isArray(it.eaters) ? it.eaters : []).filter(
          (id): id is string => typeof id === "string" && has(id)
        ),
      }
    })
    const out: Expense = {
      id: idOf(expense.id, "expense id"),
      title: str(expense.title, 80, "expense title"),
      amount: int(expense.amount, "amount"),
      sc: !!expense.sc,
      payer,
      method: expense.method as SplitMethod,
      ex: (Array.isArray(expense.ex) ? expense.ex : []).filter(
        (id): id is string => typeof id === "string" && has(id)
      ),
      items,
      addedBy: typeof expense.addedBy === "string" && has(expense.addedBy) ? expense.addedBy : treasurer,
      status: expense.status === "pending" ? "pending" : "approved",
      ts: int(expense.ts, "expense time"),
    }
    if (out.amount > 1e11) bad("amount too large")
    if (Array.isArray(expense.edits)) {
      out.edits = expense.edits.slice(0, 50).map((note) => {
        if (!note || typeof note !== "object") bad("edit note")
        const edit = note as Record<string, unknown>
        return {
          ts: int(edit.ts, "edit time"),
          by: str(edit.by, 40, "edit author"),
          note: str(edit.note, 140, "edit note", true),
        }
      })
    }
    return goneExpense[out.id] ? [] : [out]
  })

  const payments: Payment[] = list(o.payments, "payments", 2000).flatMap((row) => {
    if (!row || typeof row !== "object") bad("payment")
    const payment = row as Record<string, unknown>
    const from = idOf(payment.from, "payment from")
    const to = idOf(payment.to, "payment to")
    if (!has(from) || !has(to) || from === to) bad("payment members")
    const out: Payment = {
      id: idOf(payment.id, "payment id"),
      from,
      to,
      amount: int(payment.amount, "payment amount"),
      status: payment.status === "confirmed" ? "confirmed" : "sent",
      ts: int(payment.ts, "payment time"),
      daysLate: int(payment.daysLate, "days late", 0),
    }
    return gonePayment[out.id] ? [] : [out]
  })

  const seenNudge = Object.create(null) as Record<string, 1>
  const rawNudges = Array.isArray(o.nudges) ? o.nudges : []
  if (rawNudges.length > 500) bad("too many nudges")
  const nudges: Nudge[] = rawNudges.flatMap((row) => {
    if (!row || typeof row !== "object") bad("nudge")
    const nudge = row as Record<string, unknown>
    const from = idOf(nudge.from, "nudge from")
    const to = idOf(nudge.to, "nudge to")
    if (!has(from) || !has(to) || from === to) bad("nudge members")
    const id = idOf(nudge.id, "nudge id")
    if (seenNudge[id]) bad("duplicate nudge")
    seenNudge[id] = 1
    const status = isNudgeStatus(nudge.status)
      ? nudge.status
      : nudge.read
        ? "read"
        : "unread"
    const persona: Persona = PERSONA_IDS.includes(nudge.persona as Persona) ? (nudge.persona as Persona) : "default"
    return [
      {
        id,
        from,
        to,
        amount: int(nudge.amount, "nudge amount"),
        persona,
        message: str(nudge.message, 800, "nudge message", true),
        ts: int(nudge.ts, "nudge time"),
        read: status !== "unread",
        status,
      },
    ]
  })

  const roundTo = ([0, 100, 500] as RoundTo[]).includes(o.roundTo as RoundTo) ? (o.roundTo as RoundTo) : 0

  const seenLog = Object.create(null) as Record<string, 1>
  const rawLog = Array.isArray(o.emergencyLog) ? o.emergencyLog : []
  if (rawLog.length > 200) bad("too many emergency log entries")
  const emergencyLog: EmergencyLogEntry[] = rawLog.flatMap((row) => {
    if (!row || typeof row !== "object") return []
    const entry = row as Record<string, unknown>
    if (!isEmergencyAction(entry.action)) return []
    if (typeof entry.id !== "string" || !/^[A-Za-z0-9_-]{1,40}$/.test(entry.id) || seenLog[entry.id]) return []
    if (!Number.isSafeInteger(entry.ts) || (entry.ts as number) < 0) return []
    const actorMemberId =
      typeof entry.actorMemberId === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(entry.actorMemberId)
        ? entry.actorMemberId
        : treasurer
    seenLog[entry.id] = 1
    return [
      {
        id: entry.id,
        action: entry.action,
        actorMemberId,
        actorName: str(entry.actorName, 40, "emergency actor", true) || "?",
        details: str(entry.details, 280, "emergency details", true),
        ts: entry.ts as number,
      },
    ]
  })

  const id = idOf(o.id, "trip id")
  const name = str(o.name, 60, "trip name") || "Lakad"
  const rawCode = typeof o.joinCode === "string" ? normalizeJoinCode(o.joinCode) : ""
  const joinCode = /^[A-Z]{4}-\d{2}$/.test(rawCode) ? rawCode : joinCodeFromId(id, name)

  return {
    id,
    joinCode,
    name,
    treasurer,
    gcash: str(o.gcash, 30, "trip gcash", true),
    open: !!o.open,
    roundTo,
    members,
    expenses,
    payments,
    ...(nudges.length ? { nudges } : {}),
    ...(deletedExpenseIds.length ? { deletedExpenseIds } : {}),
    ...(deletedPaymentIds.length ? { deletedPaymentIds } : {}),
    ...(emergencyLog.length ? { emergencyLog } : {}),
  }
}

export async function shareOrCopy(url: string, title: string, text: string) {
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title, text, url })
      return "shared" as const
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return "aborted" as const
    }
  }
  const ok = await copyText(text || url)
  return ok ? ("copied" as const) : ("manual" as const)
}

export async function copyText(text: string) {
  try {
    const area = document.createElement("textarea")
    area.value = text
    area.setAttribute("readonly", "")
    area.style.position = "fixed"
    area.style.top = "0"
    area.style.opacity = "0"
    document.body.appendChild(area)
    area.select()
    area.setSelectionRange(0, text.length)
    const ok = document.execCommand("copy")
    document.body.removeChild(area)
    if (ok) return true
  } catch {
    // Fall through to the clipboard API, then to a manual copy drawer.
  }
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      return false
    }
  }
  return false
}
