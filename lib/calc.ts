import { DAY, memberOf, uiLang, type EstDraft, type Expense, type ExpenseDraft, type Item, type Lang, type Trip } from "@/lib/types"

export {
  balances,
  daysOwed,
  distribute,
  lvl,
  potOf,
  sharesOf,
  totalOf,
  transfers,
  weightsOf,
  wrappedStats,
} from "@/lib/split-math"

export function peso(cents: number) {
  let value = Math.round(cents || 0)
  const neg = value < 0
  value = Math.abs(value)
  const whole = Math.floor(value / 100).toLocaleString("en-PH")
  return (neg ? "−" : "") + "₱" + whole + "." + String(value % 100).padStart(2, "0")
}

export function plain(cents: number) {
  const value = Math.abs(Math.round(cents || 0))
  const leftover = value % 100
  return String(Math.floor(value / 100)) + (leftover ? "." + String(leftover).padStart(2, "0") : "")
}

export function parsePeso(raw: string) {
  const text = String(raw ?? "").replace(/[,₱\s]/g, "")
  if (!text || text === "." || !/^\d*(\.\d{0,2})?$/.test(text)) return NaN
  const parts = text.split(".")
  return Number(parts[0] || 0) * 100 + Number(((parts[1] || "") + "00").slice(0, 2))
}

export function dayStr(days: number, lang: Lang = "en") {
  if (uiLang(lang) === "tl") return days === 1 ? "1 araw" : days + " araw"
  return days === 1 ? "1 day" : days + " days"
}

export function fmtDays(value: number, lang: Lang = "en") {
  const rounded = Math.round(value * 10) / 10
  return dayStr(rounded, lang)
}

export function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-PH", { month: "short", day: "numeric" })
}

export function fmtAgo(ts: number, now: number, lang: Lang = "en") {
  const days = Math.floor((now - ts) / DAY)
  const tl = uiLang(lang) === "tl"
  if (days <= 0) return tl ? "ngayon" : "today"
  if (days === 1) return tl ? "kahapon" : "yesterday"
  return dayStr(days, lang) + (tl ? " na ang nakalipas" : " ago")
}

export function fmtAgoFine(ts: number, now: number, lang: Lang = "en") {
  const delta = Math.max(0, now - ts)
  const tl = uiLang(lang) === "tl"
  const mins = Math.floor(delta / 60_000)
  if (mins < 1) return tl ? "kaka-send lang" : "just now"
  if (mins < 60) return tl ? mins + "m na ang nakalipas" : mins + "m ago"
  const hours = Math.floor(mins / 60)
  if (hours < 24) return tl ? hours + "h na ang nakalipas" : hours + "h ago"
  return fmtAgo(ts, now, lang)
}

export function estCalc(draft: EstDraft) {
  let total = 0
  draft.rows.forEach((row) => {
    const price = parsePeso(row.price)
    if (price > 0) total += price
  })
  const people = parseInt(draft.people, 10)
  const buf = Math.round((total * draft.buffer) / 100)
  const gross = total + buf
  let per = 0
  if (people > 0 && gross > 0) {
    const step = people * draft.round
    let q = Math.floor(gross / step)
    if (q * step < gross) q += 1
    per = q * draft.round
  }
  const n = people > 0 ? people : 0
  return { total, buf, gross, n, per, collect: per * n, extra: per * n - gross }
}

export type DraftExpense = {
  title: string
  amount: number
  sc: boolean
  payer: string
  method: Expense["method"]
  ex: string[]
  items: Item[]
}

export function draftToExpense(trip: Trip, draft: ExpenseDraft): { e: DraftExpense; errs: string[] } {
  const errs: string[] = []
  const items: Item[] = []
  const ids = trip.members.map((member) => member.id)
  let amount = 0
  if (!draft.title.trim()) errs.push("title")
  if (draft.method === "item") {
    if (!draft.items.length) errs.push("items")
    draft.items.forEach((item, index) => {
      const price = parsePeso(item.price)
      if (!(price > 0)) errs.push("item-price-" + index)
      const eaters = item.eaters.filter((id) => ids.includes(id))
      if (!eaters.length) errs.push("item-eaters-" + index)
      items.push({
        name: item.name.trim().slice(0, 60) || "Item " + (index + 1),
        price: price > 0 ? price : 0,
        eaters,
      })
    })
    amount = items.reduce((sum, item) => sum + item.price, 0)
  } else {
    amount = parsePeso(draft.amount)
    if (!(amount > 0)) errs.push("amount")
  }
  const exMode = draft.method === "exclude" || draft.method === "libre"
  const ex = exMode ? draft.ex.filter((id) => ids.includes(id)) : []
  if (exMode && !ex.length) errs.push("ex")
  if (exMode && ex.length >= ids.length) errs.push("ex-all")
  if (amount > 1e11) errs.push("too-big")
  return {
    e: {
      title: draft.title.trim().slice(0, 80),
      amount: amount > 0 ? amount : 0,
      sc: !!draft.sc,
      payer: draft.payer,
      method: draft.method,
      ex,
      items: draft.method === "item" ? items : [],
    },
    errs,
  }
}

export function draftErrorMessage(errs: string[], lang: Lang) {
  const first = errs[0]
  const tl = uiLang(lang) === "tl"
  if (first === "title") return tl ? "Lagyan ng pangalan ang gastos." : "Give this expense a name."
  if (first === "items") return tl ? "Mag-add ng kahit isang item." : "Add at least one item."
  if (first?.startsWith("item-price-")) {
    return tl
      ? "Item " + (Number(first.slice(11)) + 1) + ": ilagay ang presyo (hal. 250.50)."
      : "Item " + (Number(first.slice(11)) + 1) + ": enter a price (e.g. 250.50)."
  }
  if (first?.startsWith("item-eaters-")) {
    return tl
      ? "Item " + (Number(first.slice(12)) + 1) + ": sino ang kumain?"
      : "Item " + (Number(first.slice(12)) + 1) + ": who ate this?"
  }
  if (first === "amount") return tl ? "Ilagay ang amount (hal. 1250.50)." : "Enter an amount (e.g. 1250.50)."
  if (first === "ex") return tl ? "Sino ang hindi kasama?" : "Who is left out?"
  if (first === "ex-all") return tl ? "Hindi puwedeng lahat excluded." : "Someone has to split this."
  if (first === "too-big") return tl ? "Masyadong malaki ang amount." : "That amount is too large."
  return tl ? "May mali sa form." : "Check the form and try again."
}

export function namesList(trip: Trip, ids: string[]) {
  return ids.map((id) => memberOf(trip, id).name).join(", ")
}
