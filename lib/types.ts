export const STORAGE_KEY = "barkada-split-v7"
export const PREV_STORAGE_KEY = "barkada-split-v6"
export const LEGACY_STORAGE_KEY = "barkada-split-v5"
export const DAY = 86_400_000
export const AVATARS = ["😎", "🏝️", "🍻", "💅", "🏄‍♂️", "🥟", "👑", "🛵", "🌺", "🦈"] as const
export const SEED_TRIP_IDS = ["t-siargao", "t-baguio"] as const
export const LANGS = ["tl", "en", "ceb"] as const

export type Lang = (typeof LANGS)[number]
export type Tab = "home" | "gastos" | "hatian" | "barkada"
export type SplitMethod = "even" | "item" | "exclude" | "libre"
export type ExpenseStatus = "pending" | "approved" | "rejected"
export type PaymentStatus = "sent" | "confirmed"
export type NudgeStatus = "unread" | "read" | "seen_zoned"
export type Persona = "default" | "conyo" | "tita" | "corporate" | "guilttrip"
export type RoundTo = 0 | 100 | 500
export type ShotRatio = "916" | "45"
export type Avatar = (typeof AVATARS)[number]

export const METHODS: { id: SplitMethod; key: "even" | "item" | "exclude" | "libre" }[] = [
  { id: "even", key: "even" },
  { id: "item", key: "item" },
  { id: "exclude", key: "exclude" },
  { id: "libre", key: "libre" },
]

export const PERSONAS: { id: Persona; key: Persona }[] = [
  { id: "default", key: "default" },
  { id: "conyo", key: "conyo" },
  { id: "tita", key: "tita" },
  { id: "corporate", key: "corporate" },
  { id: "guilttrip", key: "guilttrip" },
]

export const PERSONA_IDS: Persona[] = PERSONAS.map((p) => p.id)
export const NUDGE_STATUSES: NudgeStatus[] = ["unread", "read", "seen_zoned"]
export const NUDGE_COOLDOWN_MS = 12 * 60 * 60 * 1000
export const NUDGE_STATUS_RANK: Record<NudgeStatus, number> = {
  unread: 0,
  read: 1,
  seen_zoned: 2,
}

export const TABS: Tab[] = ["home", "gastos", "hatian", "barkada"]

export type Member = {
  id: string
  name: string
  gcash: string
  claimedByUid?: string | null
}

export type Item = {
  name: string
  price: number
  eaters: string[]
}

export type EditNote = {
  ts: number
  by: string
  note: string
}

export type ExpenseEditProposal = {
  title: string
  amount: number
  sc: boolean
  payer: string
  method: SplitMethod
  ex: string[]
  items: Item[]
  editedBy: string
  ts: number
}

export type Expense = {
  id: string
  title: string
  amount: number
  sc: boolean
  payer: string
  method: SplitMethod
  ex: string[]
  items: Item[]
  addedBy: string
  status: ExpenseStatus
  rejectionReason?: string
  pendingEdit?: ExpenseEditProposal | null
  auditNote?: string
  ts: number
  edits?: EditNote[]
}

export type Payment = {
  id: string
  from: string
  to: string
  amount: number
  status: PaymentStatus
  ts: number
  daysLate: number
}

export type Nudge = {
  id: string
  from: string
  to: string
  amount: number
  persona: Persona
  message: string
  ts: number
  read: boolean
  status: NudgeStatus
}

export type EmergencyAction = "treasurer_takeover" | "lock_reset" | "crown_passed"

export const EMERGENCY_ACTIONS: EmergencyAction[] = ["treasurer_takeover", "lock_reset", "crown_passed"]

export type EmergencyLogEntry = {
  id: string
  action: EmergencyAction
  actorMemberId: string
  actorName: string
  details: string
  ts: number
}

export type Trip = {
  id: string
  joinCode: string
  name: string
  treasurer: string
  gcash: string
  open: boolean
  roundTo: RoundTo
  members: Member[]
  expenses: Expense[]
  payments: Payment[]
  nudges?: Nudge[]
  deletedExpenseIds?: string[]
  deletedPaymentIds?: string[]
  emergencyLog?: EmergencyLogEntry[]
}

export type Profile = {
  name: string
  gcash: string
  avatar: Avatar
  bankNote: string
}

export type AppState = {
  onboarded: boolean
  showTestTools: boolean
  profile: Profile
  lakads: Trip[]
  activeId: string | null
  as: string
  tab: Tab
  offset: number
  persona: Persona
  screenshotMode: boolean
  lang: Lang
  authUid: string
  lastSyncedAt: number
  dirtyIds: string[]
  pinHashes: Record<string, string>
  recoveryPinHash: string
  mockGoogleEmail: string
}

export type ItemDraft = {
  name: string
  price: string
  eaters: string[]
}

export type ExpenseDraft = {
  id?: string
  title: string
  amount: string
  sc: boolean
  payer: string
  method: SplitMethod
  ex: string[]
  items: ItemDraft[]
  receipt: string
  note: string
}

export type Transfer = {
  from: string
  to: string
  amount: number
  pay: number
}

export type EstRow = { name: string; price: string }

export type EstDraft = {
  rows: EstRow[]
  people: string
  buffer: number
  round: number
}

export function uid(prefix = "x") {
  return prefix + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4)
}

export function isAvatar(value: string): value is Avatar {
  return (AVATARS as readonly string[]).includes(value)
}

export function isLang(value: unknown): value is Lang {
  return (LANGS as readonly string[]).includes(String(value))
}

export function isNudgeStatus(value: unknown): value is NudgeStatus {
  return (NUDGE_STATUSES as readonly string[]).includes(String(value))
}

export function isEmergencyAction(value: unknown): value is EmergencyAction {
  return (EMERGENCY_ACTIONS as readonly string[]).includes(String(value))
}

export function emergencyLogOf(trip: Pick<Trip, "emergencyLog">): EmergencyLogEntry[] {
  return trip.emergencyLog ?? []
}

export function appendEmergencyLog(trip: Trip, entry: EmergencyLogEntry): Trip {
  const existing = emergencyLogOf(trip)
  if (existing.some((row) => row.id === entry.id)) {
    return existing === trip.emergencyLog ? trip : { ...trip, emergencyLog: existing }
  }
  return { ...trip, emergencyLog: [...existing, entry] }
}

export function higherNudgeStatus(left: NudgeStatus, right: NudgeStatus): NudgeStatus {
  return NUDGE_STATUS_RANK[left] >= NUDGE_STATUS_RANK[right] ? left : right
}

export function applyNudgeResolution(nudge: Nudge, status: Exclude<NudgeStatus, "unread">): Nudge {
  return {
    ...nudge,
    read: true,
    status: higherNudgeStatus(nudge.status, status),
  }
}

export function nudgeMatchesPair(nudge: Nudge, debtorId: string, creditorId: string, treasurerId: string) {
  return nudge.to === debtorId && (nudge.from === creditorId || nudge.from === treasurerId)
}

export function hasCooldownNudge(
  nudges: Nudge[] | undefined,
  debtorId: string,
  creditorId: string,
  treasurerId: string,
  now: number
) {
  return (nudges || []).some(
    (nudge) =>
      !nudge.read &&
      nudgeMatchesPair(nudge, debtorId, creditorId, treasurerId) &&
      now - nudge.ts < NUDGE_COOLDOWN_MS
  )
}

export function resolvePairNudges(
  nudges: Nudge[] | undefined,
  debtorId: string,
  creditorId: string,
  treasurerId: string
) {
  if (!nudges?.length) return nudges
  let changed = false
  const next = nudges.map((nudge) => {
    if (nudge.read || !nudgeMatchesPair(nudge, debtorId, creditorId, treasurerId)) return nudge
    changed = true
    return applyNudgeResolution(nudge, "read")
  })
  return changed ? next : nudges
}

export function newestPairNudge(
  nudges: Nudge[] | undefined,
  debtorId: string,
  creditorId: string,
  treasurerId: string
) {
  let best: Nudge | null = null
  for (const nudge of nudges || []) {
    if (!nudgeMatchesPair(nudge, debtorId, creditorId, treasurerId)) continue
    if (!best || nudge.ts > best.ts) best = nudge
  }
  return best
}

export function newestUnreadPairNudge(
  nudges: Nudge[] | undefined,
  debtorId: string,
  creditorId: string,
  treasurerId: string
) {
  let best: Nudge | null = null
  for (const nudge of nudges || []) {
    if (nudge.read || !nudgeMatchesPair(nudge, debtorId, creditorId, treasurerId)) continue
    if (!best || nudge.ts > best.ts) best = nudge
  }
  return best
}

export function pairSeenZonedCount(
  nudges: Nudge[] | undefined,
  debtorId: string,
  creditorId: string,
  treasurerId: string
) {
  return (nudges || []).filter(
    (nudge) => nudge.status === "seen_zoned" && nudgeMatchesPair(nudge, debtorId, creditorId, treasurerId)
  ).length
}

export function newestUnreadNudge(nudges: Nudge[] | undefined, memberId: string) {
  let best: Nudge | null = null
  for (const nudge of nudges || []) {
    if (nudge.to !== memberId || nudge.read) continue
    if (!best || nudge.ts > best.ts) best = nudge
  }
  return best
}

export function hatianKeyForNudge(trip: Trip, nudge: Nudge, rows?: Transfer[]) {
  const list = rows || []
  const exact = list.find((row) => row.from === nudge.to && row.to === nudge.from)
  if (exact) return exact.from + ">" + exact.to
  const first = list.find((row) => row.from === nudge.to)
  if (first) return first.from + ">" + first.to
  return nudge.to + ">" + nudge.from
}

export function uiLang(lang: Lang): "en" | "tl" {
  return lang === "en" ? "en" : "tl"
}

export function emptyProfile(): Profile {
  return { name: "", gcash: "", avatar: "😎", bankNote: "" }
}

export function sanitizeProfile(raw: unknown): Profile {
  if (!raw || typeof raw !== "object") return emptyProfile()
  const row = raw as Record<string, unknown>
  return {
    name: typeof row.name === "string" ? row.name.trim().slice(0, 40) : "",
    gcash: typeof row.gcash === "string" ? row.gcash.trim().slice(0, 30) : "",
    avatar: typeof row.avatar === "string" && isAvatar(row.avatar) ? row.avatar : "😎",
    bankNote: typeof row.bankNote === "string" ? row.bankNote.trim().slice(0, 80) : "",
  }
}

export function emptyState(lang: Lang = "tl"): AppState {
  return {
    onboarded: false,
    showTestTools: false,
    profile: emptyProfile(),
    lakads: [],
    activeId: null,
    as: "",
    tab: "home",
    offset: 0,
    persona: "default",
    screenshotMode: false,
    lang,
    authUid: "",
    lastSyncedAt: 0,
    dirtyIds: [],
    pinHashes: {},
    recoveryPinHash: "",
    mockGoogleEmail: "",
  }
}

export function isSeedRoster(lakads: Trip[]) {
  return lakads.length > 0 && lakads.every((trip) => (SEED_TRIP_IDS as readonly string[]).includes(trip.id))
}

export function nameKey(value: string) {
  return value.trim().toLowerCase()
}

export function findTakenName(names: string[], candidate: string, except?: string) {
  const key = nameKey(candidate)
  if (!key) return null
  const skip = except ? nameKey(except) : ""
  for (const name of names) {
    const current = nameKey(name)
    if (!current || current === skip) continue
    if (current === key) return name.trim()
  }
  return null
}

export function findTakenMember<T extends { id: string; name: string }>(
  members: T[],
  candidate: string,
  exceptId?: string
) {
  const key = nameKey(candidate)
  if (!key) return null
  return members.find((member) => member.id !== exceptId && nameKey(member.name) === key) ?? null
}

export function collectUniqueNicknames(you: string, others: string[]) {
  const extra: string[] = []
  const youName = you.trim()
  for (const part of others) {
    const trimmed = part.trim().slice(0, 40)
    if (!trimmed) continue
    const taken = findTakenName([youName, ...extra], trimmed)
    if (taken) {
      return { ok: false as const, existing: taken, vsYou: nameKey(taken) === nameKey(youName) }
    }
    extra.push(trimmed)
  }
  return { ok: true as const, extra }
}

export function isOwnerName(profile: Profile, name: string) {
  const nick = nameKey(profile.name)
  return !!nick && nick === nameKey(name)
}

export function claimedSeatMatch(member: Member, authUid: string, as: string) {
  if (authUid && member.claimedByUid === authUid) return true
  return !!as && member.id === as
}

export function syncProfileToClaimedMembers(
  lakads: Trip[],
  profile: Profile,
  ids: { authUid: string; as: string }
): { lakads: Trip[]; changedIds: string[] } {
  const name = profile.name.trim().slice(0, 40)
  const gcash = profile.gcash.trim().slice(0, 30)
  const changedIds: string[] = []
  const next = lakads.map((trip) => {
    let touched = false
    const members = trip.members.map((member) => {
      if (!claimedSeatMatch(member, ids.authUid, ids.as)) return member
      const colliding = name && nameKey(name) !== nameKey(member.name) ? findTakenMember(trip.members, name, member.id) : null
      const nextName = name && !colliding ? name : member.name
      const nextGcash = gcash || member.gcash
      if (nextName === member.name && nextGcash === member.gcash) return member
      touched = true
      return { ...member, name: nextName, gcash: nextGcash }
    })
    if (!touched) return trip
    changedIds.push(trip.id)
    return { ...trip, members }
  })
  return { lakads: next, changedIds }
}

export function claimMember(
  trip: Trip,
  profile: Profile,
  memberId: string | "new"
): { trip: Trip; as: string; profile: Profile } {
  const nick = profile.name.trim().slice(0, 40)
  const match = trip.members.find((member) => nameKey(member.name) === nameKey(nick))
  const targetId = memberId === "new" && match ? match.id : memberId

  if (targetId === "new") {
    const id = uid("m")
    return {
      trip: {
        ...trip,
        members: [...trip.members, { id, name: nick || "?", gcash: profile.gcash.trim().slice(0, 30), claimedByUid: null }],
      },
      as: id,
      profile,
    }
  }

  const member = trip.members.find((item) => item.id === targetId)
  if (!member) return { trip, as: trip.treasurer, profile }

  let nextTrip = trip
  let nextProfile = profile
  if (!member.gcash && profile.gcash) {
    nextTrip = {
      ...trip,
      members: trip.members.map((item) =>
        item.id === targetId ? { ...item, gcash: profile.gcash.trim().slice(0, 30) } : item
      ),
    }
  } else if (member.gcash && !profile.gcash) {
    nextProfile = { ...profile, gcash: member.gcash }
  }
  return { trip: nextTrip, as: targetId, profile: nextProfile }
}

export function memberOf(trip: Trip, id: string): Member {
  return trip.members.find((member) => member.id === id) ?? { id, name: "?", gcash: "" }
}

export function memberName(trip: Trip, id: string) {
  return memberOf(trip, id).name
}

export function gcashOf(trip: Trip, id: string) {
  return memberOf(trip, id).gcash || trip.gcash || ""
}

export function isTreasurer(state: AppState, trip: Trip) {
  return state.as === trip.treasurer
}

export function memberCanRemove(trip: Trip, memberId: string) {
  if (memberId === trip.treasurer) return false
  if (trip.members.length <= 1) return false
  if (!trip.members.some((member) => member.id === memberId)) return false
  for (const expense of trip.expenses) {
    if (expense.payer === memberId || expense.addedBy === memberId) return false
    if (expense.ex.includes(memberId)) return false
    if (expense.method !== "item") return false
    for (const item of expense.items) {
      const eaters = (item.eaters || []).filter((id) => trip.members.some((member) => member.id === id))
      if (!eaters.length || eaters.includes(memberId)) return false
    }
  }
  return !trip.payments.some((payment) => payment.from === memberId || payment.to === memberId)
}

export function canEditExpense(state: AppState, trip: Trip, expense: Expense) {
  return isTreasurer(state, trip) || expense.addedBy === state.as
}

export function activeTrip(state: AppState) {
  return state.lakads.find((trip) => trip.id === state.activeId) ?? null
}

export function initial(name: string) {
  return (Array.from(String(name || "?").trim())[0] || "?").toUpperCase()
}

export function digits(value: string) {
  return String(value || "").replace(/[^\d+]/g, "")
}

export function newItemDraft(trip: Trip): ItemDraft {
  return { name: "", price: "", eaters: trip.members.map((member) => member.id) }
}

export function newExpenseDraft(trip: Trip, payer: string): ExpenseDraft {
  return {
    title: "",
    amount: "",
    sc: false,
    payer,
    method: "even",
    ex: [],
    items: [newItemDraft(trip)],
    receipt: "",
    note: "",
  }
}

export function editExpenseDraft(trip: Trip, expense: Expense, viewerId?: string): ExpenseDraft {
  const proposal = expense.pendingEdit
  const source =
    expense.status === "approved" && proposal && viewerId && proposal.editedBy === viewerId ? proposal : expense
  return {
    id: expense.id,
    title: source.title,
    amount: source.method === "item" ? "" : plainFromCents(source.amount),
    sc: source.sc,
    payer: source.payer,
    method: source.method,
    ex: source.ex.slice(),
    items:
      source.method === "item"
        ? source.items.map((item) => ({
            name: item.name,
            price: plainFromCents(item.price),
            eaters: item.eaters.slice(),
          }))
        : [newItemDraft(trip)],
    receipt: "",
    note: "",
  }
}

function plainFromCents(cents: number) {
  const value = Math.abs(Math.round(cents || 0))
  const leftover = value % 100
  return String(Math.floor(value / 100)) + (leftover ? "." + String(leftover).padStart(2, "0") : "")
}
