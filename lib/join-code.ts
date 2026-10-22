const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ"

export function normalizeJoinCode(raw: string) {
  const compact = String(raw || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
  if (compact.length < 6) return compact
  return compact.slice(0, 4) + "-" + compact.slice(4, 6)
}

export function isJoinCode(value: string) {
  return /^[A-Z]{4}-\d{2}$/.test(normalizeJoinCode(value))
}

export function parseJoinCodeFromInput(value: string) {
  const text = String(value || "").trim()
  const urlMatch = text.match(/\/join\/([A-Za-z0-9-]{4,16})/i)
  const raw = urlMatch ? urlMatch[1] : text
  const code = normalizeJoinCode(raw)
  return isJoinCode(code) ? code : null
}

export function joinCodeFromId(id: string, name = "") {
  const fromName = name.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4)
  const fromId = id.toUpperCase().replace(/[^A-Z]/g, "")
  let prefix = (fromName + fromId + "LAKD").slice(0, 4)
  while (prefix.length < 4) prefix += "X"
  let digits = id.replace(/\D/g, "").slice(-2)
  if (digits.length < 2) {
    let sum = 0
    for (let i = 0; i < id.length; i++) sum += id.charCodeAt(i)
    digits = String(10 + (sum % 90))
  }
  return prefix + "-" + digits
}

export function makeJoinCode(name: string, taken: Iterable<string>) {
  const used = new Set(Array.from(taken).map((code) => normalizeJoinCode(code)))
  const fromName = name.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4)
  const year = String(new Date().getFullYear()).slice(-2)
  const pad = (base: string) => {
    let out = base
    while (out.length < 4) out += LETTERS[Math.floor(Math.random() * LETTERS.length)]
    return out.slice(0, 4)
  }
  const preferred = pad(fromName) + "-" + year
  if (!used.has(preferred)) return preferred
  for (let i = 0; i < 48; i++) {
    const stem = fromName.slice(0, 3)
    const code = pad(stem) + "-" + year
    if (!used.has(code)) return code
  }
  return pad("") + "-" + String(10 + Math.floor(Math.random() * 90))
}

export function inviteUrl(joinCode: string, origin = "", seatId?: string) {
  const base = origin || (typeof window !== "undefined" ? window.location.origin : "")
  const url = `${base}/join/${normalizeJoinCode(joinCode)}`
  return seatId ? `${url}?seat=${encodeURIComponent(seatId)}` : url
}

const JUST_CREATED_KEY = "barkada-just-created"

export function markJustCreated(tripId: string) {
  if (typeof sessionStorage === "undefined") return
  sessionStorage.setItem(JUST_CREATED_KEY, tripId)
}

export function consumeJustCreated(tripId: string) {
  if (typeof sessionStorage === "undefined") return false
  if (sessionStorage.getItem(JUST_CREATED_KEY) !== tripId) return false
  sessionStorage.removeItem(JUST_CREATED_KEY)
  return true
}
