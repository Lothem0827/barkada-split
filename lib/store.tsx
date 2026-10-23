"use client"

import { useMemo } from "react"
import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

import {
  emergencyActivity,
  expenseAddedActivity,
  expenseApprovedActivity,
  expenseDeletedActivity,
  expenseEditedActivity,
  expenseRejectedActivity,
  logSeatClaimed,
  memberRemovedActivity,
  memberRenamedActivity,
  membersAddedActivity,
  openModeActivity,
  paymentConfirmedActivity,
  paymentSentActivity,
  roundToActivity,
  seenZonedActivity,
} from "@/lib/activity"
import { daysOwed, draftErrorMessage, draftToExpense, totalOf } from "@/lib/calc"
import { isValidGcash, sanitizeGcash } from "@/lib/gcash"
import { bindSeat, excludeFromPastBills, matchesGcashLast4, resetMemberLock, seatStatus } from "@/lib/claim"
import { hydrateState } from "@/lib/hydrate"
import { t, takenNicknameMessage } from "@/lib/i18n"
import { makeJoinCode } from "@/lib/join-code"
import { isSeedTripId, mergeTrip, omitExpense, shouldClearDirty } from "@/lib/merge-trip"
import {
  applyUndoPayment,
  canMarkTransferSent,
  canNudgeTransfer,
  canRevertConfirmed,
  makeFakeNewsNudge,
} from "@/lib/payments"
import { hashPin, isPin, pinKey, pinsMatch } from "@/lib/pin"
import { seed } from "@/lib/seed"
import { importErrorMessage, importTrip as parseTrip } from "@/lib/snapshot"
import {
  broadcastEmergencyTakeover,
  claimSeatRemote,
  resetSeatLockRemote,
  verifySeatPinRemote,
} from "@/lib/supabase"
import {
  applyNudgeResolution,
  ackEmergencyLog,
  appendEmergencyLog,
  DAY,
  hasCooldownNudge,
  LEGACY_STORAGE_KEY,
  PERSONA_IDS,
  PREV_STORAGE_KEY,
  resolvePairNudges,
  STORAGE_KEY,
  activeTrip,
  canEditExpense,
  claimMember,
  collectUniqueNicknames,
  LANGS,
  emptyState,
  findTakenMember,
  isLang,
  isTreasurer,
  logActivity,
  memberCanRemove,
  memberName,
  memberOf,
  sanitizeProfile,
  syncProfileToClaimedMembers,
  uid,
  unackedCrownPass,
  type AppState,
  type Expense,
  type ExpenseDraft,
  type Lang,
  type NudgeStatus,
  type Persona,
  type RoundTo,
  type Tab,
  type Trip,
} from "@/lib/types"

export type OnboardDraft = {
  name: string
  gcash: string
  avatar: string
  persona: Persona
  bankNote?: string
}

export type ActionResult = { ok: true; message: string; tripId?: string } | { ok: false; message: string }

function applyDraft(state: AppState, draft?: OnboardDraft): AppState {
  if (!draft) return state
  const persona: Persona = PERSONA_IDS.includes(draft.persona) ? draft.persona : state.persona
  return {
    ...state,
    profile: sanitizeProfile({
      ...state.profile,
      ...draft,
      bankNote: draft.bankNote ?? state.profile.bankNote,
    }),
    persona,
  }
}

function takenCodes(state: AppState) {
  return state.lakads.map((trip) => trip.joinCode)
}

function queueCloudFlush() {
  void import("@/lib/sync").then((mod) => {
    void mod.flushDirtyTrips()
  })
}

function newTripBase(
  name: string,
  members: Trip["members"],
  extras: Pick<Trip, "gcash" | "open" | "roundTo">,
  state: AppState
): Trip {
  return {
    id: uid("t"),
    joinCode: makeJoinCode(name, takenCodes(state)),
    name,
    treasurer: members[0].id,
    gcash: extras.gcash,
    open: extras.open,
    roundTo: extras.roundTo,
    members,
    expenses: [],
    payments: [],
    nudges: [],
  }
}

function markDirty(state: AppState, tripId: string): AppState {
  if (isSeedTripId(tripId) || state.dirtyIds.includes(tripId)) return state
  return { ...state, dirtyIds: [...state.dirtyIds, tripId] }
}

function withAudit(expense: Expense, ts: number, by: string, auditNote: string, historyNote?: string) {
  const note = (historyNote || auditNote).slice(0, 140)
  return {
    auditNote: auditNote.slice(0, 140),
    edits: [...(expense.edits || []), { ts, by, note }].slice(-50),
  }
}

function applyPendingEdit(expense: Expense): Expense {
  const proposal = expense.pendingEdit
  if (!proposal) return { ...expense, pendingEdit: null }
  return {
    ...expense,
    title: proposal.title,
    amount: proposal.amount,
    sc: proposal.sc,
    payer: proposal.payer,
    method: proposal.method,
    ex: proposal.ex.slice(),
    items: proposal.items.map((item) => ({
      name: item.name,
      price: item.price,
      eaters: item.eaters.slice(),
    })),
    pendingEdit: null,
    rejectionReason: undefined,
  }
}

function nowTs(state: AppState) {
  return Date.now() + state.offset * DAY
}

function withTrip(state: AppState, tripId: string, updater: (trip: Trip) => Trip | null) {
  const index = state.lakads.findIndex((trip) => trip.id === tripId)
  if (index < 0) return state
  const nextTrip = updater(state.lakads[index])
  if (!nextTrip) {
    const lakads = state.lakads.filter((trip) => trip.id !== tripId)
    return {
      ...state,
      lakads,
      activeId: lakads[0]?.id ?? null,
      tab: "home" as Tab,
      screenshotMode: false,
      dirtyIds: state.dirtyIds.filter((id) => id !== tripId),
    }
  }
  const lakads = state.lakads.slice()
  lakads[index] = nextTrip
  queueCloudFlush()
  return markDirty({ ...state, lakads }, tripId)
}

function ensureViewer(state: AppState, trip: Trip) {
  if (trip.members.some((member) => member.id === state.as)) return state
  const mine = trip.members.find((member) => member.claimedByUid && member.claimedByUid === state.authUid)
  return { ...state, as: mine?.id || trip.treasurer }
}

function upsertTrip(state: AppState, trip: Trip, as: string, extras?: Partial<AppState>): AppState {
  const index = state.lakads.findIndex((item) => item.id === trip.id)
  const lakads = state.lakads.slice()
  if (index >= 0) lakads[index] = trip
  else lakads.unshift(trip)
  const next = markDirty(
    ensureViewer(
      {
        ...state,
        ...extras,
        lakads,
        activeId: trip.id,
        as,
        tab: "gastos",
        screenshotMode: false,
        onboarded: true,
        showTestTools: false,
      },
      trip
    ),
    trip.id
  )
  queueCloudFlush()
  return next
}

function migrateStorage(): string | null {
  const current = localStorage.getItem(STORAGE_KEY)
  if (current) return current
  try {
    const v6 = localStorage.getItem(PREV_STORAGE_KEY)
    if (v6) return JSON.stringify({ state: { state: hydrateState(JSON.parse(v6), false) }, version: 0 })
    const v5 = localStorage.getItem(LEGACY_STORAGE_KEY)
    if (v5) return JSON.stringify({ state: { state: hydrateState(JSON.parse(v5), true) }, version: 0 })
  } catch {
    return null
  }
  return null
}

type BarkadaStore = {
  hydrated: boolean
  state: AppState
  setHydrated: (value: boolean) => void
  setAuthUid: (uidValue: string) => void
  applyRemoteTrip: (trip: Trip, clearDirty: boolean) => void
  setTab: (tab: Tab) => void
  goHome: () => void
  openTrip: (id: string) => void
  toggleLang: () => void
  setLang: (lang: Lang) => void
  setAs: (id: string) => ActionResult
  timeTravel: (days: number) => ActionResult
  createTrip: (name: string, you: string, others: string[], gcash: string) => ActionResult
  startLakad: (name: string, friends: string[], open: boolean, roundTo: RoundTo, draft: OnboardDraft) => ActionResult
  joinLakad: (code: string, memberId: string | "new", draft: OnboardDraft) => ActionResult
  saveProfile: (draft: OnboardDraft) => ActionResult
  setRecoveryPin: (pin: string) => Promise<ActionResult>
  setMockGoogleEmail: (email: string) => void
  claimSeat: (
    trip: Trip,
    memberId: string | "new",
    draft: { name?: string; gcash: string; pin?: string }
  ) => Promise<ActionResult>
  resetSeatLock: (memberId: string) => Promise<ActionResult>
  loadDemo: (draft?: OnboardDraft) => ActionResult
  replayOnboarding: () => ActionResult
  deleteTrip: () => ActionResult
  resetDemo: () => ActionResult
  addExpense: (draft: ExpenseDraft) => ActionResult
  editExpense: (id: string, draft: ExpenseDraft) => ActionResult
  approveExpense: (id: string) => ActionResult
  approveAllPending: () => ActionResult
  rejectExpense: (id: string, reason: string) => ActionResult
  approveEdit: (id: string) => ActionResult
  rejectEdit: (id: string) => ActionResult
  deleteExpense: (id: string) => ActionResult
  markPaid: (from: string, to: string, amount: number) => ActionResult
  confirmPayment: (id: string) => ActionResult
  undoPayment: (id: string) => ActionResult
  sendNudge: (debtorId: string, creditorId: string, amount: number, persona: Persona, message: string) => ActionResult
  resolveNudge: (id: string, status: Exclude<NudgeStatus, "unread">) => ActionResult
  addMember: (name: string, gcash: string, lateComer?: boolean) => ActionResult
  editMember: (id: string, name: string, gcash: string) => ActionResult
  removeMember: (id: string) => ActionResult
  setGcash: (gcash: string) => ActionResult
  renameTrip: (name: string) => ActionResult
  setOpen: (open: boolean) => ActionResult
  setRoundTo: (roundTo: RoundTo) => ActionResult
  handoff: (id: string) => ActionResult
  ackCrownPass: () => ActionResult
  emergencyTakeover: (newMemberId: string, reason: string) => ActionResult
  setPersona: (persona: Persona) => void
  setScreenshotMode: (on: boolean) => void
  importCode: (code: string) => ActionResult
}

export const useBarkadaStore = create<BarkadaStore>()(
  persist(
    (set, get) => {
      const langOf = () => get().state.lang

      return {
        hydrated: false,
        state: emptyState(),
        setHydrated: (value) => set({ hydrated: value }),
        setAuthUid: (uidValue) =>
          set((store) => ({ state: store.state.authUid === uidValue ? store.state : { ...store.state, authUid: uidValue } })),
        applyRemoteTrip: (trip, clearDirty) =>
          set((store) => {
            const current = store.state.lakads.find((item) => item.id === trip.id)
            const dirty = store.state.dirtyIds.includes(trip.id)
            const next = current ? mergeTrip(current, trip, dirty && !clearDirty) : trip
            const lakads = current
              ? store.state.lakads.map((item) => (item.id === trip.id ? next : item))
              : [next, ...store.state.lakads]
            const keepDirty = dirty && (!clearDirty || !shouldClearDirty(current, trip))
            return {
              state: {
                ...store.state,
                lakads,
                lastSyncedAt: Date.now(),
                dirtyIds: keepDirty
                  ? store.state.dirtyIds
                  : store.state.dirtyIds.filter((id) => id !== trip.id),
              },
            }
          }),
        setTab: (tab) => {
          set((store) => ({ state: { ...store.state, tab, screenshotMode: false } }))
          if (typeof window !== "undefined") window.scrollTo(0, 0)
        },
        goHome: () => set((store) => ({ state: { ...store.state, tab: "home", screenshotMode: false } })),
        openTrip: (id) =>
          set((store) => {
            const found = store.state.lakads.find((item) => item.id === id)
            if (!found) return store
            return {
              state: ensureViewer({ ...store.state, activeId: id, tab: "gastos", screenshotMode: false }, found),
            }
          }),
        toggleLang: () =>
          set((store) => {
            const index = LANGS.indexOf(store.state.lang)
            const lang = LANGS[(index < 0 ? 0 : index + 1) % LANGS.length]
            return { state: { ...store.state, lang } }
          }),
        setLang: (lang) =>
          set((store) => ({ state: { ...store.state, lang: isLang(lang) ? lang : store.state.lang } })),
        setAs: (id) => {
          const { state } = get()
          const active = activeTrip(state)
          if (!active || !active.members.some((member) => member.id === id)) {
            return { ok: false, message: t(state.lang, "onlyT") }
          }
          set({ state: { ...state, as: id } })
          return { ok: true, message: t(state.lang, "viewing") + " " + memberName(active, id) }
        },
        timeTravel: (days) => {
          const { state } = get()
          const offset = days ? state.offset + days : 0
          set({ state: { ...state, offset } })
          return { ok: true, message: days ? t(state.lang, "dayPlus") + offset : t(state.lang, "timeReset") }
        },
        createTrip: (name, you, others, gcash) => {
          const { state } = get()
          const tripName = name.trim().slice(0, 60)
          const youName = you.trim().slice(0, 24)
          if (!tripName) return { ok: false, message: t(state.lang, "needTripName") }
          if (!youName) return { ok: false, message: t(state.lang, "needYourName") }
          const number = sanitizeGcash(gcash)
          if (!isValidGcash(number)) return { ok: false, message: t(state.lang, "badGcash") }
          const parsed = collectUniqueNicknames(youName, others)
          if (!parsed.ok) {
            return { ok: false, message: takenNicknameMessage(state.lang, parsed.existing, parsed.vsYou) }
          }
          const names = [youName, ...parsed.extra].slice(0, 60)
          const members = names.map((memberName, index) => ({
            id: uid("m"),
            name: memberName,
            gcash: index === 0 ? number : "",
            claimedByUid: index === 0 ? state.authUid || null : null,
          }))
          const created = newTripBase(tripName, members, { gcash: number, open: false, roundTo: 0 }, state)
          set({
            state: upsertTrip(state, created, created.treasurer),
          })
          return { ok: true, message: t(state.lang, "game") + " " + tripName + " " + t(state.lang, "created"), tripId: created.id }
        },
        startLakad: (name, friends, open, roundTo, draft) => {
          const { state } = get()
          const tripName = name.trim().slice(0, 60)
          if (!tripName) return { ok: false, message: t(state.lang, "needTripName") }
          const you = draft.name.trim().slice(0, 24)
          if (!you) return { ok: false, message: t(state.lang, "needYourName") }
          if (!isValidGcash(draft.gcash)) return { ok: false, message: t(state.lang, "badGcash") }
          const parsed = collectUniqueNicknames(you, friends)
          if (!parsed.ok) {
            return { ok: false, message: takenNicknameMessage(state.lang, parsed.existing, parsed.vsYou) }
          }
          const extra = parsed.extra.slice(0, 59)
          if (!extra.length) return { ok: false, message: t(state.lang, "obNeedFriend") }
          const profile = sanitizeProfile(draft)
          const members = [
            { id: uid("m"), name: you, gcash: profile.gcash, claimedByUid: state.authUid || null },
            ...extra.map((memberName) => ({ id: uid("m"), name: memberName, gcash: "", claimedByUid: null })),
          ]
          const created = newTripBase(tripName, members, { gcash: profile.gcash, open, roundTo }, state)
          set({
            state: upsertTrip(applyDraft(state, draft), created, created.treasurer),
          })
          return { ok: true, message: t(state.lang, "game") + " " + tripName + " " + t(state.lang, "created"), tripId: created.id }
        },
        joinLakad: (code, memberId, draft) => {
          const { state } = get()
          try {
            const incoming = parseTrip(code)
            const profile = sanitizeProfile(draft)
            if (memberId === "new" && !profile.name) return { ok: false, message: t(state.lang, "needYourName") }
            if (memberId === "new" && incoming.members.length >= 60) return { ok: false, message: t(state.lang, "maxMembers") }
            const bound = bindSeat(incoming, memberId, profile, state.authUid, { name: profile.name, gcash: profile.gcash })
            const ts = nowTs(state)
            if (!bound.ok) {
              const fallback = claimMember(incoming, profile, memberId)
              set({
                state: upsertTrip(
                  applyDraft(state, { ...draft, gcash: fallback.profile.gcash }),
                  logSeatClaimed(fallback.trip, fallback.as, ts),
                  fallback.as
                ),
              })
              return { ok: true, message: t(state.lang, "imported") + ": " + fallback.trip.name, tripId: fallback.trip.id }
            }
            set({
              state: upsertTrip(
                applyDraft(state, {
                  ...draft,
                  gcash: bound.profile.gcash,
                  name: bound.profile.name,
                  avatar: draft.avatar,
                  persona: draft.persona,
                }),
                logSeatClaimed(bound.trip, bound.as, ts),
                bound.as
              ),
            })
            return { ok: true, message: t(state.lang, "imported") + ": " + bound.trip.name, tripId: bound.trip.id }
          } catch (error) {
            return { ok: false, message: importErrorMessage(error, state.lang) }
          }
        },
        saveProfile: (draft) => {
          const { state } = get()
          if (!isValidGcash(draft.gcash)) return { ok: false, message: t(state.lang, "badGcash") }
          const next = applyDraft(state, { ...draft, gcash: sanitizeGcash(draft.gcash) })
          const synced = syncProfileToClaimedMembers(next.lakads, next.profile, {
            authUid: next.authUid,
            as: next.as,
          })
          let merged = { ...next, lakads: synced.lakads }
          for (const id of synced.changedIds) merged = markDirty(merged, id)
          if (synced.changedIds.length) queueCloudFlush()
          set({ state: merged })
          return { ok: true, message: t(merged.lang, "profileSaved") }
        },
        setRecoveryPin: async (pin) => {
          const { state } = get()
          const trimmed = pin.trim()
          if (!trimmed) {
            set({ state: { ...state, recoveryPinHash: "" } })
            return { ok: true, message: t(state.lang, "recoveryPinCleared") }
          }
          if (!isPin(trimmed)) return { ok: false, message: t(state.lang, "pinBad") }
          const hash = await hashPin(trimmed, "recovery:" + (state.authUid || "device"))
          set({ state: { ...get().state, recoveryPinHash: hash } })
          return { ok: true, message: t(get().state.lang, "recoveryPinSaved") }
        },
        setMockGoogleEmail: (email) =>
          set((store) => ({
            state: { ...store.state, mockGoogleEmail: email.trim().slice(0, 80) },
          })),
        claimSeat: async (trip, memberId, draft) => {
          const { state } = get()
          const lang = state.lang
          const profile = {
            ...state.profile,
            name: draft.name?.trim() || state.profile.name,
            gcash: draft.gcash.trim() || state.profile.gcash,
          }
          const pin = draft.pin?.trim() || ""
          if (pin && !isPin(pin)) return { ok: false, message: t(lang, "pinBad") }

          if (memberId !== "new") {
            const member = trip.members.find((item) => item.id === memberId)
            if (!member) return { ok: false, message: t(lang, "obNeedClaim") }
            const status = seatStatus(member, state.authUid)
            if (status === "locked") {
              const localHash = state.pinHashes[pinKey(trip.id, memberId)]
              const localOk = pin && localHash ? await pinsMatch(pin, trip.id + ":" + memberId, localHash) : false
              const remoteOk = pin ? await verifySeatPinRemote(trip.id, memberId, pin) : false
              const last4Ok = pin ? matchesGcashLast4(member.gcash, pin) : false
              if (!localOk && !remoteOk && !last4Ok) {
                return { ok: false, message: t(lang, pin ? "pinWrong" : "seatLocked") }
              }
              trip = {
                ...trip,
                members: trip.members.map((item) =>
                  item.id === memberId ? { ...item, claimedByUid: null } : item
                ),
              }
            }
          }

          const remote = await claimSeatRemote({
            tripId: trip.id,
            memberId,
            name: profile.name,
            gcash: profile.gcash,
            pin,
          })
          if (remote.ok && remote.trip) {
            trip = remote.trip
          }

          const bound = bindSeat(trip, memberId, profile, state.authUid, {
            name: profile.name,
            gcash: profile.gcash,
          })
          if (!bound.ok) {
            if (bound.reason === "missing-name") return { ok: false, message: t(lang, "needYourName") }
            if (bound.reason === "max") return { ok: false, message: t(lang, "maxMembers") }
            if (bound.reason === "locked") return { ok: false, message: t(lang, trip.open ? "seatLocked" : "addSelfClosed") }
            return { ok: false, message: t(lang, "obNeedClaim") }
          }

          let pinHashes = state.pinHashes
          if (pin) {
            const key = pinKey(bound.trip.id, bound.as)
            const hashed = await hashPin(pin, bound.trip.id + ":" + bound.as)
            pinHashes = { ...pinHashes, [key]: hashed }
          }

          set({
            state: {
              ...upsertTrip(state, logSeatClaimed(bound.trip, bound.as, nowTs(state)), bound.as, {
                profile: bound.profile,
                pinHashes,
              }),
            },
          })
          return { ok: true, message: t(lang, "seatClaimed") + " " + memberName(bound.trip, bound.as), tripId: bound.trip.id }
        },
        resetSeatLock: async (memberId) => {
          const { state } = get()
          const active = activeTrip(state)
          if (!active || !isTreasurer(state, active)) return { ok: false, message: t(state.lang, "onlyT") }
          if (!active.members.some((member) => member.id === memberId)) {
            return { ok: false, message: t(state.lang, "onlyT") }
          }
          await resetSeatLockRemote(active.id, memberId)
          const key = pinKey(active.id, memberId)
          const { [key]: _, ...pinHashes } = state.pinHashes
          const actor = memberOf(active, state.as)
          const targetName = memberName(active, memberId)
          const entry = {
            id: uid("em"),
            action: "lock_reset" as const,
            actorMemberId: actor.id,
            actorName: actor.name,
            details: "Reset device lock for " + targetName,
            ts: nowTs(state),
          }
          set({
            state: {
              ...withTrip(state, active.id, (trip) =>
                logActivity(appendEmergencyLog(resetMemberLock(trip, memberId), entry), emergencyActivity(entry))
              ),
              pinHashes,
            },
          })
          return { ok: true, message: t(state.lang, "lockReset") + " " + targetName }
        },
        loadDemo: (draft) => {
          const { state } = get()
          const demo = seed(Date.now())
          set({
            state: {
              ...applyDraft(
                {
                  ...demo,
                  lang: state.lang,
                  profile: state.profile.name ? state.profile : demo.profile,
                  persona: state.persona,
                  authUid: state.authUid,
                },
                draft
              ),
              onboarded: true,
              showTestTools: true,
              dirtyIds: [],
            },
          })
          return { ok: true, message: t(state.lang, "obExplore") }
        },
        replayOnboarding: () => {
          const lang = langOf()
          set({ state: emptyState(lang) })
          return { ok: true, message: t(lang, "replayDone") }
        },
        deleteTrip: () => {
          const { state } = get()
          const active = activeTrip(state)
          if (!active || !isTreasurer(state, active)) return { ok: false, message: t(state.lang, "onlyT") }
          set({ state: withTrip(state, active.id, () => null) })
          return { ok: true, message: t(state.lang, "deleted") }
        },
        resetDemo: () => {
          const { state } = get()
          const demo = seed(Date.now())
          set({
            state: {
              ...demo,
              lang: state.lang,
              profile: state.profile.name ? state.profile : demo.profile,
              persona: state.persona,
              authUid: state.authUid,
              onboarded: true,
              showTestTools: true,
              dirtyIds: [],
            },
          })
          return { ok: true, message: t(state.lang, "reset") }
        },
        addExpense: (draft) => {
          const { state } = get()
          const active = activeTrip(state)
          if (!active || !active.members.length) return { ok: false, message: t(state.lang, "needPeople") }
          const parsed = draftToExpense(active, draft)
          if (parsed.errs.length) return { ok: false, message: draftErrorMessage(parsed.errs, state.lang) }
          if (!active.members.some((member) => member.id === parsed.e.payer)) {
            return { ok: false, message: t(state.lang, "whoPaid") }
          }
          const auto = active.open || isTreasurer(state, active)
          const expense = {
            ...parsed.e,
            id: uid("e"),
            addedBy: state.as,
            status: (active.open || state.as === active.treasurer ? "approved" : "pending") as "approved" | "pending",
            ts: nowTs(state),
          }
          set({
            state: withTrip(state, active.id, (item) =>
              logActivity(
                {
                  ...item,
                  expenses: [...item.expenses, expense],
                },
                expenseAddedActivity(expense, memberName(item, state.as), state.as)
              )
            ),
          })
          return auto
            ? { ok: true, message: t(state.lang, "addedOk") }
            : { ok: true, message: t(state.lang, "addedPend") + " " + memberName(active, active.treasurer) }
        },
        editExpense: (id, draft) => {
          const { state } = get()
          const active = activeTrip(state)
          if (!active) return { ok: false, message: t(state.lang, "onlyT") }
          const existing = active.expenses.find((expense) => expense.id === id)
          if (!existing || !canEditExpense(state, active, existing)) {
            return { ok: false, message: t(state.lang, "onlyT") }
          }
          const parsed = draftToExpense(active, draft)
          if (parsed.errs.length) return { ok: false, message: draftErrorMessage(parsed.errs, state.lang) }
          const direct = active.open || isTreasurer(state, active)
          const ts = nowTs(state)
          const editor = memberName(active, state.as)
          const typed = (draft.note || "").trim()
          const oldAmount = totalOf(existing)
          const newAmount = totalOf(parsed.e)
          set({
            state: withTrip(state, active.id, (item) => {
              const next = {
              ...item,
              expenses: item.expenses.map((expense) => {
                if (expense.id !== id || !canEditExpense(state, item, expense)) return expense
                const liveDirect = item.open || state.as === item.treasurer
                if (liveDirect) {
                  const auditNote = `Edited by ${editor}`
                  return {
                    ...expense,
                    ...parsed.e,
                    status: "approved" as const,
                    pendingEdit: null,
                    rejectionReason: undefined,
                    ts,
                    ...withAudit(expense, ts, state.as, auditNote, typed),
                  }
                }
                if (expense.status === "approved") {
                  const auditNote = `Edit proposed by ${editor}`
                  return {
                    ...expense,
                    pendingEdit: {
                      ...parsed.e,
                      editedBy: state.as,
                      ts,
                    },
                    ...withAudit(expense, ts, state.as, auditNote, typed),
                  }
                }
                const auditNote = `Resubmitted by ${editor}`
                return {
                  ...expense,
                  ...parsed.e,
                  status: "pending" as const,
                  pendingEdit: null,
                  rejectionReason: undefined,
                  ts,
                  ...withAudit(expense, ts, state.as, auditNote, typed),
                }
              }),
              }
              return logActivity(
                next,
                expenseEditedActivity(existing, editor, state.as, oldAmount, newAmount, ts)
              )
            }),
          })
          if (direct) return { ok: true, message: t(state.lang, "updatedOk") }
          if (existing.status === "approved") {
            return {
              ok: true,
              message: t(state.lang, "editSubmitted").replace("{name}", memberName(active, active.treasurer)),
            }
          }
          return { ok: true, message: t(state.lang, "resubmitted") }
        },
        approveExpense: (id) => {
          const { state } = get()
          const active = activeTrip(state)
          if (!active || !isTreasurer(state, active)) return { ok: false, message: t(state.lang, "onlyT") }
          const existing = active.expenses.find((expense) => expense.id === id)
          if (!existing || existing.status !== "pending") return { ok: false, message: t(state.lang, "onlyT") }
          const ts = nowTs(state)
          set({
            state: withTrip(state, active.id, (trip) =>
              logActivity(
                {
                  ...trip,
                  expenses: trip.expenses.map((expense) =>
                    expense.id === id && expense.status === "pending"
                      ? {
                          ...expense,
                          status: "approved" as const,
                          rejectionReason: undefined,
                          pendingEdit: null,
                          ts,
                        }
                      : expense
                  ),
                },
                expenseApprovedActivity(existing, memberName(trip, state.as), state.as, ts)
              )
            ),
          })
          return { ok: true, message: t(state.lang, "approved") }
        },
        approveAllPending: () => {
          const { state } = get()
          const active = activeTrip(state)
          if (!active || !isTreasurer(state, active)) return { ok: false, message: t(state.lang, "onlyT") }
          const count = active.expenses.filter((expense) => expense.status === "pending").length
          if (!count) return { ok: false, message: t(state.lang, "onlyT") }
          const ts = nowTs(state)
          set({
            state: withTrip(state, active.id, (trip) => {
              const actor = memberName(trip, state.as)
              let next = {
                ...trip,
                expenses: trip.expenses.map((expense) =>
                  expense.status === "pending"
                    ? {
                        ...expense,
                        status: "approved" as const,
                        rejectionReason: undefined,
                        pendingEdit: null,
                        ts,
                      }
                    : expense
                ),
              }
              for (const expense of trip.expenses) {
                if (expense.status === "pending") {
                  next = logActivity(next, expenseApprovedActivity(expense, actor, state.as, ts))
                }
              }
              return next
            }),
          })
          return { ok: true, message: t(state.lang, "approved") }
        },
        rejectExpense: (id, reason) => {
          const { state } = get()
          const active = activeTrip(state)
          if (!active || !isTreasurer(state, active)) return { ok: false, message: t(state.lang, "onlyT") }
          const reasonText = reason.trim().slice(0, 80)
          const existing = active.expenses.find((expense) => expense.id === id)
          if (!reasonText || !existing || existing.status !== "pending") {
            return { ok: false, message: t(state.lang, "onlyT") }
          }
          const ts = nowTs(state)
          set({
            state: withTrip(state, active.id, (trip) =>
              logActivity(
                {
                  ...trip,
                  expenses: trip.expenses.map((expense) => {
                    if (expense.id !== id || expense.status !== "pending") return expense
                    return {
                      ...expense,
                      status: "rejected" as const,
                      rejectionReason: reasonText,
                      pendingEdit: null,
                      ...withAudit(expense, ts, state.as, `Returned: ${reasonText}`),
                    }
                  }),
                },
                expenseRejectedActivity(existing, memberName(trip, state.as), state.as, reasonText, ts)
              )
            ),
          })
          return { ok: true, message: t(state.lang, "returnedToast") }
        },
        approveEdit: (id) => {
          const { state } = get()
          const active = activeTrip(state)
          if (!active || !isTreasurer(state, active)) return { ok: false, message: t(state.lang, "onlyT") }
          const existing = active.expenses.find((expense) => expense.id === id)
          if (!existing?.pendingEdit) return { ok: false, message: t(state.lang, "onlyT") }
          const ts = nowTs(state)
          const auditNote = `Edit by ${memberName(active, existing.pendingEdit.editedBy)} approved by ${memberName(active, state.as)}`
          const oldAmount = totalOf(existing)
          const newAmount = totalOf(existing.pendingEdit)
          set({
            state: withTrip(state, active.id, (trip) =>
              logActivity(
                {
                  ...trip,
                  expenses: trip.expenses.map((expense) => {
                    if (expense.id !== id || !expense.pendingEdit) return expense
                    return {
                      ...applyPendingEdit(expense),
                      status: "approved" as const,
                      ...withAudit(expense, ts, state.as, auditNote),
                    }
                  }),
                },
                expenseEditedActivity(existing, memberName(trip, state.as), state.as, oldAmount, newAmount, ts)
              )
            ),
          })
          return { ok: true, message: t(state.lang, "editApprovedToast") }
        },
        rejectEdit: (id) => {
          const { state } = get()
          const active = activeTrip(state)
          if (!active || !isTreasurer(state, active)) return { ok: false, message: t(state.lang, "onlyT") }
          const existing = active.expenses.find((expense) => expense.id === id)
          if (!existing?.pendingEdit) return { ok: false, message: t(state.lang, "onlyT") }
          const ts = nowTs(state)
          set({
            state: withTrip(state, active.id, (trip) =>
              logActivity(
                {
                  ...trip,
                  expenses: trip.expenses.map((expense) => {
                    if (expense.id !== id || !expense.pendingEdit) return expense
                    return {
                      ...expense,
                      pendingEdit: null,
                      ...withAudit(expense, ts, state.as, "Edit rejected — kept original approved bill"),
                    }
                  }),
                },
                expenseRejectedActivity(
                  existing,
                  memberName(trip, state.as),
                  state.as,
                  "kept original approved bill",
                  ts
                )
              )
            ),
          })
          return { ok: true, message: t(state.lang, "editKeptToast") }
        },
        deleteExpense: (id) => {
          const { state } = get()
          const active = activeTrip(state)
          const expense = active?.expenses.find((item) => item.id === id)
          const ownPending = !!(expense && expense.addedBy === state.as && expense.status === "pending")
          const ownRejected = !!(expense && expense.addedBy === state.as && expense.status === "rejected")
          if (!active || (!isTreasurer(state, active) && !ownPending && !ownRejected)) {
            return { ok: false, message: t(state.lang, "onlyT") }
          }
          const ts = nowTs(state)
          set({
            state: withTrip(state, active.id, (trip) => {
              const gone = trip.expenses.find((item) => item.id === id)
              const next = gone
                ? logActivity(trip, expenseDeletedActivity(gone, memberName(trip, state.as), state.as, ts))
                : trip
              return omitExpense(next, id)
            }),
          })
          return { ok: true, message: t(state.lang, ownPending ? "withdrawn" : "deleted") }
        },
        markPaid: (from, to, amount) => {
          const { state } = get()
          const active = activeTrip(state)
          if (!active) return { ok: false, message: t(state.lang, "onlyT") }
          if (!canMarkTransferSent(state.as, active.treasurer, from, to)) {
            return { ok: false, message: t(state.lang, "onlyT") }
          }
          if (active.payments.some((payment) => payment.status === "sent" && payment.from === from && payment.to === to)) {
            return { ok: false, message: t(state.lang, "onlyT") }
          }
          const stamp = nowTs(state)
          const payment = {
            id: uid("p"),
            from,
            to,
            amount,
            status: "sent" as const,
            ts: stamp,
            daysLate: daysOwed(active, from, stamp),
          }
          set({
            state: withTrip(state, active.id, (trip) =>
              logActivity(
                {
                  ...trip,
                  payments: [
                    ...trip.payments,
                    { ...payment, daysLate: daysOwed(trip, from, stamp) },
                  ],
                  nudges: resolvePairNudges(trip.nudges, from, to, trip.treasurer),
                },
                paymentSentActivity(trip, payment)
              )
            ),
          })
          return { ok: true, message: t(state.lang, "markedSent") + " " + memberName(active, to) }
        },
        confirmPayment: (id) => {
          const { state } = get()
          const active = activeTrip(state)
          if (!active) return { ok: false, message: t(state.lang, "onlyT") }
          const payment = active.payments.find((item) => item.id === id)
          if (!payment || payment.status !== "sent") return { ok: false, message: t(state.lang, "onlyT") }
          if (state.as !== payment.to && !isTreasurer(state, active)) return { ok: false, message: t(state.lang, "onlyT") }
          const ts = nowTs(state)
          const confirmed = { ...payment, status: "confirmed" as const, ts }
          set({
            state: withTrip(state, active.id, (trip) =>
              logActivity(
                {
                  ...trip,
                  payments: trip.payments.map((item) => (item.id === id ? confirmed : item)),
                  nudges: resolvePairNudges(trip.nudges, payment.from, payment.to, trip.treasurer),
                },
                paymentConfirmedActivity(trip, confirmed, state.as)
              )
            ),
          })
          return { ok: true, message: t(state.lang, "confirmedToast") + " " + memberName(active, payment.from) }
        },
        sendNudge: (debtorId, creditorId, amount, persona, message) => {
          const { state } = get()
          const active = activeTrip(state)
          if (!active) return { ok: false, message: t(state.lang, "onlyT") }
          if (!canNudgeTransfer(state.as, active.treasurer, debtorId, creditorId)) {
            return { ok: false, message: t(state.lang, "onlyT") }
          }
          if (
            !active.members.some((member) => member.id === debtorId) ||
            !active.members.some((member) => member.id === creditorId) ||
            debtorId === creditorId
          ) {
            return { ok: false, message: t(state.lang, "onlyT") }
          }
          const now = Date.now() + state.offset * DAY
          if (hasCooldownNudge(active.nudges, debtorId, creditorId, active.treasurer, now)) {
            return { ok: false, message: t(state.lang, "nudgedPending") }
          }
          if (active.payments.some((payment) => payment.status === "sent" && payment.from === debtorId && payment.to === creditorId)) {
            return { ok: false, message: t(state.lang, "nudgedPending") }
          }
          const tone: Persona = PERSONA_IDS.includes(persona) ? persona : state.persona
          set({
            state: withTrip(state, active.id, (trip) => ({
              ...trip,
              nudges: [
                ...(trip.nudges || []),
                {
                  id: uid("n"),
                  from: state.as,
                  to: debtorId,
                  amount,
                  persona: tone,
                  message: message.trim().slice(0, 800),
                  ts: now,
                  read: false,
                  status: "unread" as const,
                },
              ],
            })),
          })
          return { ok: true, message: t(state.lang, "nudgeSent").replace("{name}", memberName(active, debtorId)) }
        },
        resolveNudge: (id, status) => {
          const { state } = get()
          const active = activeTrip(state)
          const nudge = active?.nudges?.find((item) => item.id === id)
          if (!active || !nudge) return { ok: false, message: t(state.lang, "onlyT") }
          if (state.as !== nudge.to && !isTreasurer(state, active)) return { ok: false, message: t(state.lang, "onlyT") }
          set({
            state: withTrip(state, active.id, (trip) => {
              const next = {
                ...trip,
                nudges: (trip.nudges || []).map((item) => (item.id === id ? applyNudgeResolution(item, status) : item)),
              }
              return status === "seen_zoned"
                ? logActivity(next, seenZonedActivity(trip, { ...nudge, ts: nowTs(state) }))
                : next
            }),
          })
          return { ok: true, message: t(state.lang, status === "seen_zoned" ? "seenZoneToast" : "nudgeReadToast") }
        },
        undoPayment: (id) => {
          const { state } = get()
          const active = activeTrip(state)
          if (!active) return { ok: false, message: t(state.lang, "cannotUndoPay") }
          const payment = active.payments.find((item) => item.id === id)
          if (!payment) return { ok: false, message: t(state.lang, "cannotUndoPay") }
          const now = Date.now() + state.offset * DAY
          const fakeNews = canRevertConfirmed(state.as, active, payment)
            ? makeFakeNewsNudge(active, payment, state.as, state.persona, state.lang, now)
            : undefined
          const result = applyUndoPayment(active, payment, state.as, now, fakeNews)
          if (!result.ok) return { ok: false, message: t(state.lang, "cannotUndoPay") }
          set({
            state: withTrip(state, active.id, () => result.trip),
          })
          return {
            ok: true,
            message:
              result.kind === "revert"
                ? t(state.lang, "revertToast").replace("{name}", memberName(active, payment.from))
                : t(state.lang, "undoToast"),
          }
        },
        addMember: (name, gcash, lateComer = false) => {
          const { state } = get()
          const trimmed = name.trim().slice(0, 24)
          if (!trimmed) return { ok: false, message: t(state.lang, "needMemberName") }
          const number = sanitizeGcash(gcash)
          if (!isValidGcash(number)) return { ok: false, message: t(state.lang, "badGcash") }
          const active = activeTrip(state)
          if (!active || !isTreasurer(state, active)) return { ok: false, message: t(state.lang, "onlyT") }
          if (active.members.length >= 60) return { ok: false, message: t(state.lang, "maxMembers") }
          const taken = findTakenMember(active.members, trimmed)
          if (taken) {
            return {
              ok: false,
              message: takenNicknameMessage(state.lang, taken.name, taken.id === active.treasurer),
            }
          }
          const memberId = uid("m")
          const ts = nowTs(state)
          set({
            state: withTrip(state, active.id, (trip) => {
              const rostered = {
                ...trip,
                members: [...trip.members, { id: memberId, name: trimmed, gcash: number, claimedByUid: null }],
              }
              const next = lateComer && trip.expenses.length > 0 ? excludeFromPastBills(rostered, memberId) : rostered
              return logActivity(
                next,
                membersAddedActivity(memberName(trip, state.as), state.as, [trimmed], memberId, ts)
              )
            }),
          })
          return { ok: true, message: t(state.lang, "addedToBarkada").replace("{name}", trimmed) }
        },
        editMember: (id, name, gcash) => {
          const { state } = get()
          const trimmed = name.trim().slice(0, 24)
          if (!trimmed) return { ok: false, message: t(state.lang, "needMemberName") }
          const number = sanitizeGcash(gcash)
          if (!isValidGcash(number)) return { ok: false, message: t(state.lang, "badGcash") }
          const active = activeTrip(state)
          if (!active) return { ok: false, message: t(state.lang, "onlyT") }
          if (!isTreasurer(state, active) && state.as !== id) return { ok: false, message: t(state.lang, "onlyT") }
          if (!active.members.some((member) => member.id === id)) return { ok: false, message: t(state.lang, "onlyT") }
          const taken = findTakenMember(active.members, trimmed, id)
          if (taken) {
            return {
              ok: false,
              message: takenNicknameMessage(state.lang, taken.name, taken.id === active.treasurer),
            }
          }
          const previous = memberOf(active, id)
          const ts = nowTs(state)
          set({
            state: withTrip(state, active.id, (trip) => {
              const next = {
                ...trip,
                members: trip.members.map((member) =>
                  member.id === id ? { ...member, name: trimmed, gcash: number } : member
                ),
              }
              if (previous.name === trimmed) return next
              return logActivity(
                next,
                memberRenamedActivity(memberName(trip, state.as), state.as, previous.name, trimmed, id, ts)
              )
            }),
          })
          return { ok: true, message: t(state.lang, "saved") }
        },
        removeMember: (id) => {
          const { state } = get()
          const active = activeTrip(state)
          if (!active || !isTreasurer(state, active)) return { ok: false, message: t(state.lang, "onlyT") }
          if (!memberCanRemove(active, id)) return { ok: false, message: t(state.lang, "cannotRemove") }
          const name = memberOf(active, id).name
          const key = pinKey(active.id, id)
          const { [key]: _, ...pinHashes } = state.pinHashes
          const ts = nowTs(state)
          set({
            state: {
              ...withTrip(state, active.id, (trip) =>
                logActivity(
                  {
                    ...trip,
                    members: trip.members.filter((member) => member.id !== id),
                  },
                  memberRemovedActivity(memberName(trip, state.as), state.as, name, id, ts)
                )
              ),
              pinHashes,
              as: state.as === id ? active.treasurer : state.as,
            },
          })
          return { ok: true, message: t(state.lang, "removedMember").replace("{name}", name) }
        },
        setGcash: (gcash) => {
          const { state } = get()
          const active = activeTrip(state)
          if (!active || !isTreasurer(state, active)) return { ok: false, message: t(state.lang, "onlyT") }
          const number = sanitizeGcash(gcash)
          if (!isValidGcash(number)) return { ok: false, message: t(state.lang, "badGcash") }
          set({ state: withTrip(state, active.id, (trip) => ({ ...trip, gcash: number })) })
          return { ok: true, message: t(state.lang, "tripGcashSaved") }
        },
        renameTrip: (name) => {
          const { state } = get()
          const trimmed = name.trim().slice(0, 80)
          if (!trimmed) return { ok: false, message: t(state.lang, "needTripName") }
          const active = activeTrip(state)
          if (!active) return { ok: false, message: t(state.lang, "needTripName") }
          set({ state: withTrip(state, active.id, (trip) => ({ ...trip, name: trimmed })) })
          return { ok: true, message: t(state.lang, "saved") }
        },
        setOpen: (open) => {
          const { state } = get()
          const active = activeTrip(state)
          if (!active || !isTreasurer(state, active)) return { ok: false, message: t(state.lang, "onlyT") }
          const ts = nowTs(state)
          set({
            state: withTrip(state, active.id, (trip) =>
              logActivity(
                {
                  ...trip,
                  open,
                  expenses: open
                    ? trip.expenses.map((expense) => {
                        if (expense.status === "rejected") return expense
                        if (expense.pendingEdit) {
                          return {
                            ...applyPendingEdit(expense),
                            status: "approved" as const,
                            ...withAudit(expense, ts, state.as, "Edit applied when trip opened"),
                          }
                        }
                        if (expense.status === "pending") {
                          return {
                            ...expense,
                            status: "approved" as const,
                            rejectionReason: undefined,
                            pendingEdit: null,
                            ts,
                          }
                        }
                        return expense
                      })
                    : trip.expenses,
                },
                openModeActivity(memberName(trip, state.as), state.as, open, ts)
              )
            ),
          })
          return { ok: true, message: open ? t(state.lang, "openOnToast") : t(state.lang, "openOffToast") }
        },
        setRoundTo: (roundTo) => {
          const { state } = get()
          const active = activeTrip(state)
          if (!active || !isTreasurer(state, active)) return { ok: false, message: t(state.lang, "onlyT") }
          const ts = nowTs(state)
          set({
            state: withTrip(state, active.id, (trip) =>
              logActivity( { ...trip, roundTo }, roundToActivity(memberName(trip, state.as), state.as, roundTo, ts))
            ),
          })
          return { ok: true, message: t(state.lang, "saved") }
        },
        handoff: (id) => {
          const { state } = get()
          const active = activeTrip(state)
          if (!active || !isTreasurer(state, active)) return { ok: false, message: t(state.lang, "onlyT") }
          if (!active.members.some((member) => member.id === id)) return { ok: false, message: t(state.lang, "onlyT") }
          const outgoing = memberOf(active, active.treasurer)
          const incoming = memberOf(active, id)
          const entry = {
            id: uid("em"),
            action: "crown_passed" as const,
            actorMemberId: outgoing.id,
            actorName: outgoing.name,
            details: "Passed crown to " + incoming.name,
            ts: nowTs(state),
          }
          set({
            state: withTrip(state, active.id, (trip) =>
              logActivity(appendEmergencyLog({ ...trip, treasurer: id }, entry), emergencyActivity(entry))
            ),
          })
          return { ok: true, message: t(state.lang, "crownPassToast").replace("{name}", incoming.name) }
        },
        ackCrownPass: () => {
          const { state } = get()
          const active = activeTrip(state)
          if (!active) return { ok: false, message: t(state.lang, "onlyT") }
          const entry = unackedCrownPass(active, state.as)
          if (!entry) return { ok: true, message: "" }
          set({ state: withTrip(state, active.id, (trip) => ackEmergencyLog(trip, entry.id)) })
          return { ok: true, message: "" }
        },
        emergencyTakeover: (newMemberId, reason) => {
          const { state } = get()
          const active = activeTrip(state)
          if (!active) return { ok: false, message: t(state.lang, "onlyT") }
          if (!active.members.some((member) => member.id === state.as)) {
            return { ok: false, message: t(state.lang, "emergencyTakeoverNeedMember") }
          }
          if (state.as === active.treasurer) return { ok: false, message: t(state.lang, "emergencyTakeoverSelf") }
          if (!newMemberId || !active.members.some((member) => member.id === newMemberId)) {
            return { ok: false, message: t(state.lang, "emergencyTakeoverNeedMember") }
          }
          if (newMemberId === active.treasurer) return { ok: false, message: t(state.lang, "emergencyTakeoverSelf") }
          const trimmed = reason.trim()
          if (!trimmed) return { ok: false, message: t(state.lang, "emergencyTakeoverNeedReason") }
          const incoming = memberOf(active, newMemberId)
          const entry = {
            id: uid("em"),
            action: "treasurer_takeover" as const,
            actorMemberId: incoming.id,
            actorName: incoming.name,
            details: "Emergency takeover due to unresponsive treasurer — " + trimmed.slice(0, 180),
            ts: nowTs(state),
          }
          set({
            state: withTrip(state, active.id, (trip) =>
              logActivity(appendEmergencyLog({ ...trip, treasurer: newMemberId }, entry), emergencyActivity(entry))
            ),
          })
          if (!isSeedTripId(active.id)) {
            void broadcastEmergencyTakeover(active.id, { treasurer: newMemberId, entry })
          }
          return {
            ok: true,
            message: t(state.lang, "emergencyTakeoverOk").replace("{name}", incoming.name),
          }
        },
        setPersona: (persona) => set((store) => ({ state: { ...store.state, persona } })),
        setScreenshotMode: (on) => {
          set((store) => ({ state: { ...store.state, screenshotMode: on } }))
          if (on && typeof window !== "undefined") window.scrollTo(0, 0)
        },
        importCode: (code) => {
          const { state } = get()
          try {
            const incoming = parseTrip(code)
            const known = state.profile.name.trim()
              ? incoming.members.find(
                  (member) => member.name.trim().toLowerCase() === state.profile.name.trim().toLowerCase()
                )
              : null
            const bound = known
              ? bindSeat(incoming, known.id, state.profile, state.authUid, { gcash: state.profile.gcash })
              : null
            const trip = bound && bound.ok ? bound.trip : incoming
            const as = bound && bound.ok ? bound.as : state.as
            set({
              state: upsertTrip(state, trip, as, {
                profile: bound && bound.ok ? bound.profile : state.profile,
              }),
            })
            const existed = state.lakads.some((item) => item.id === incoming.id)
            return {
              ok: true,
              message: t(state.lang, existed ? "updated" : "imported") + ": " + incoming.name,
              tripId: trip.id,
            }
          } catch (error) {
            return { ok: false, message: importErrorMessage(error, state.lang) }
          }
        },
      }
    },
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => ({
        getItem: (name) => {
          if (typeof window === "undefined") return null
          return migrateStorage() ?? localStorage.getItem(name)
        },
        setItem: (name, value) => localStorage.setItem(name, value),
        removeItem: (name) => localStorage.removeItem(name),
      })),
      partialize: (store) => ({ state: { ...store.state, screenshotMode: false } }),
      merge: (persisted, current) => {
        const raw = persisted as { state?: unknown } | undefined
        return {
          ...current,
          state: hydrateState(raw?.state ?? persisted, false),
        }
      },
      onRehydrateStorage: () => (store) => {
        store?.setHydrated(true)
      },
    }
  )
)

export { BarkadaProvider } from "@/components/barkada/providers"

export function useBarkada() {
  const store = useBarkadaStore()
  const trip = useMemo(() => activeTrip(store.state), [store.state])
  const now = Date.now() + (store.state.offset || 0) * DAY
  const treasurer = !!(trip && isTreasurer(store.state, trip))
  return { ...store, trip, now, treasurer }
}

