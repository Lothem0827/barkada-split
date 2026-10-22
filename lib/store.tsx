"use client"

import { useMemo } from "react"
import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

import { daysOwed, draftErrorMessage, draftToExpense } from "@/lib/calc"
import { bindSeat, resetMemberLock, seatStatus } from "@/lib/claim"
import { hydrateState } from "@/lib/hydrate"
import { t, takenNicknameMessage } from "@/lib/i18n"
import { makeJoinCode } from "@/lib/join-code"
import { isSeedTripId, mergeTrip, omitExpense, shouldClearDirty } from "@/lib/merge-trip"
import { applyUndoPayment, canRevertConfirmed, makeFakeNewsNudge } from "@/lib/payments"
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
  memberCanRemove,
  memberName,
  memberOf,
  sanitizeProfile,
  syncProfileToClaimedMembers,
  uid,
  type AppState,
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
  createTrip: (name: string, you: string, others: string, gcash: string) => ActionResult
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
  rejectExpense: (id: string) => ActionResult
  deleteExpense: (id: string) => ActionResult
  markPaid: (from: string, to: string, amount: number) => ActionResult
  confirmPayment: (id: string) => ActionResult
  undoPayment: (id: string) => ActionResult
  sendNudge: (debtorId: string, creditorId: string, amount: number, persona: Persona, message: string) => ActionResult
  resolveNudge: (id: string, status: Exclude<NudgeStatus, "unread">) => ActionResult
  addMember: (name: string, gcash: string) => ActionResult
  editMember: (id: string, name: string, gcash: string) => ActionResult
  removeMember: (id: string) => ActionResult
  setGcash: (gcash: string) => ActionResult
  setOpen: (open: boolean) => ActionResult
  setRoundTo: (roundTo: RoundTo) => ActionResult
  handoff: (id: string) => ActionResult
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
          const youName = you.trim().slice(0, 40)
          if (!tripName) return { ok: false, message: t(state.lang, "needTripName") }
          if (!youName) return { ok: false, message: t(state.lang, "needYourName") }
          const parsed = collectUniqueNicknames(youName, others.split(/[,\n]/))
          if (!parsed.ok) {
            return { ok: false, message: takenNicknameMessage(state.lang, parsed.existing, parsed.vsYou) }
          }
          const names = [youName, ...parsed.extra].slice(0, 60)
          const members = names.map((memberName, index) => ({
            id: uid("m"),
            name: memberName,
            gcash: index === 0 ? gcash.trim().slice(0, 30) : "",
            claimedByUid: index === 0 ? state.authUid || null : null,
          }))
          const created = newTripBase(tripName, members, { gcash: gcash.trim().slice(0, 30), open: false, roundTo: 0 }, state)
          set({
            state: upsertTrip(state, created, created.treasurer),
          })
          return { ok: true, message: t(state.lang, "game") + " " + tripName + " " + t(state.lang, "created"), tripId: created.id }
        },
        startLakad: (name, friends, open, roundTo, draft) => {
          const { state } = get()
          const tripName = name.trim().slice(0, 60)
          if (!tripName) return { ok: false, message: t(state.lang, "needTripName") }
          const you = draft.name.trim().slice(0, 40)
          if (!you) return { ok: false, message: t(state.lang, "needYourName") }
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
            if (!bound.ok) {
              const fallback = claimMember(incoming, profile, memberId)
              set({
                state: upsertTrip(applyDraft(state, { ...draft, gcash: fallback.profile.gcash }), fallback.trip, fallback.as),
              })
              return { ok: true, message: t(state.lang, "imported") + ": " + fallback.trip.name, tripId: fallback.trip.id }
            }
            set({
              state: upsertTrip(applyDraft(state, { ...draft, gcash: bound.profile.gcash, name: bound.profile.name, avatar: draft.avatar, persona: draft.persona }), bound.trip, bound.as),
            })
            return { ok: true, message: t(state.lang, "imported") + ": " + bound.trip.name, tripId: bound.trip.id }
          } catch (error) {
            return { ok: false, message: importErrorMessage(error, state.lang) }
          }
        },
        saveProfile: (draft) => {
          const { state } = get()
          const next = applyDraft(state, draft)
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
              if (!localOk && !remoteOk) {
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
              ...upsertTrip(state, bound.trip, bound.as, {
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
          set({
            state: {
              ...withTrip(state, active.id, (trip) =>
                appendEmergencyLog(resetMemberLock(trip, memberId), {
                  id: uid("em"),
                  action: "lock_reset",
                  actorMemberId: actor.id,
                  actorName: actor.name,
                  details: "Reset device lock for " + targetName,
                  ts: Date.now() + state.offset * DAY,
                })
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
          set({
            state: withTrip(state, active.id, (item) => ({
              ...item,
              expenses: [
                ...item.expenses,
                {
                  ...parsed.e,
                  id: uid("e"),
                  addedBy: state.as,
                  status: (item.open || state.as === item.treasurer ? "approved" : "pending") as "approved" | "pending",
                  ts: Date.now() + state.offset * DAY,
                },
              ],
            })),
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
          const auto = active.open || isTreasurer(state, active)
          set({
            state: withTrip(state, active.id, (item) => ({
              ...item,
              expenses: item.expenses.map((expense) => {
                if (expense.id !== id) return expense
                if (!canEditExpense(state, item, expense)) return expense
                const ts = Date.now() + state.offset * DAY
                return {
                  ...expense,
                  ...parsed.e,
                  status: item.open || state.as === item.treasurer ? expense.status : "pending",
                  ts,
                  edits: [
                    ...(expense.edits || []),
                    {
                      ts,
                      by: state.as,
                      note: (draft.note || "").trim().slice(0, 140),
                    },
                  ],
                }
              }),
            })),
          })
          return auto
            ? { ok: true, message: t(state.lang, "updatedOk") }
            : { ok: true, message: t(state.lang, "updatedPend") }
        },
        approveExpense: (id) => {
          const { state } = get()
          const active = activeTrip(state)
          if (!active || !isTreasurer(state, active)) return { ok: false, message: t(state.lang, "onlyT") }
          set({
            state: withTrip(state, active.id, (trip) => ({
              ...trip,
              expenses: trip.expenses.map((expense) =>
                expense.id === id
                  ? { ...expense, status: "approved" as const, ts: Date.now() + state.offset * DAY }
                  : expense
              ),
            })),
          })
          return { ok: true, message: t(state.lang, "approved") }
        },
        approveAllPending: () => {
          const { state } = get()
          const active = activeTrip(state)
          if (!active || !isTreasurer(state, active)) return { ok: false, message: t(state.lang, "onlyT") }
          const count = active.expenses.filter((expense) => expense.status === "pending").length
          if (!count) return { ok: false, message: t(state.lang, "onlyT") }
          set({
            state: withTrip(state, active.id, (trip) => ({
              ...trip,
              expenses: trip.expenses.map((expense) =>
                expense.status === "pending"
                  ? { ...expense, status: "approved" as const, ts: Date.now() + state.offset * DAY }
                  : expense
              ),
            })),
          })
          return { ok: true, message: t(state.lang, "approved") }
        },
        rejectExpense: (id) => {
          const { state } = get()
          const active = activeTrip(state)
          if (!active || !isTreasurer(state, active)) return { ok: false, message: t(state.lang, "onlyT") }
          set({
            state: withTrip(state, active.id, (trip) => omitExpense(trip, id)),
          })
          return { ok: true, message: t(state.lang, "rejected") }
        },
        deleteExpense: (id) => {
          const { state } = get()
          const active = activeTrip(state)
          const expense = active?.expenses.find((item) => item.id === id)
          const adderPending = !!(expense && expense.addedBy === state.as && expense.status === "pending")
          if (!active || (!isTreasurer(state, active) && !adderPending)) {
            return { ok: false, message: t(state.lang, "onlyT") }
          }
          set({
            state: withTrip(state, active.id, (trip) => omitExpense(trip, id)),
          })
          return { ok: true, message: t(state.lang, adderPending ? "withdrawn" : "deleted") }
        },
        markPaid: (from, to, amount) => {
          const { state } = get()
          const active = activeTrip(state)
          if (!active) return { ok: false, message: t(state.lang, "onlyT") }
          if (from !== state.as && !isTreasurer(state, active)) return { ok: false, message: t(state.lang, "onlyT") }
          if (active.payments.some((payment) => payment.status === "sent" && payment.from === from && payment.to === to)) {
            return { ok: false, message: t(state.lang, "onlyT") }
          }
          const stamp = Date.now() + state.offset * DAY
          set({
            state: withTrip(state, active.id, (trip) => ({
              ...trip,
              payments: [
                ...trip.payments,
                {
                  id: uid("p"),
                  from,
                  to,
                  amount,
                  status: "sent",
                  ts: stamp,
                  daysLate: daysOwed(trip, from, stamp),
                },
              ],
              nudges: resolvePairNudges(trip.nudges, from, to, trip.treasurer),
            })),
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
          set({
            state: withTrip(state, active.id, (trip) => ({
              ...trip,
              payments: trip.payments.map((item) =>
                item.id === id ? { ...item, status: "confirmed" as const, ts: Date.now() + state.offset * DAY } : item
              ),
              nudges: resolvePairNudges(trip.nudges, payment.from, payment.to, trip.treasurer),
            })),
          })
          return { ok: true, message: t(state.lang, "confirmedToast") + " " + memberName(active, payment.from) }
        },
        sendNudge: (debtorId, creditorId, amount, persona, message) => {
          const { state } = get()
          const active = activeTrip(state)
          if (!active) return { ok: false, message: t(state.lang, "onlyT") }
          if (state.as !== creditorId && !isTreasurer(state, active)) return { ok: false, message: t(state.lang, "onlyT") }
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
            state: withTrip(state, active.id, (trip) => ({
              ...trip,
              nudges: (trip.nudges || []).map((item) => (item.id === id ? applyNudgeResolution(item, status) : item)),
            })),
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
        addMember: (name, gcash) => {
          const { state } = get()
          const trimmed = name.trim().slice(0, 40)
          if (!trimmed) return { ok: false, message: t(state.lang, "needMemberName") }
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
          set({
            state: withTrip(state, active.id, (trip) => ({
              ...trip,
              members: [...trip.members, { id: uid("m"), name: trimmed, gcash: gcash.trim().slice(0, 30), claimedByUid: null }],
            })),
          })
          return { ok: true, message: t(state.lang, "addedToBarkada").replace("{name}", trimmed) }
        },
        editMember: (id, name, gcash) => {
          const { state } = get()
          const trimmed = name.trim().slice(0, 40)
          if (!trimmed) return { ok: false, message: t(state.lang, "needMemberName") }
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
          set({
            state: withTrip(state, active.id, (trip) => ({
              ...trip,
              members: trip.members.map((member) =>
                member.id === id ? { ...member, name: trimmed, gcash: gcash.trim().slice(0, 30) } : member
              ),
            })),
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
          set({
            state: {
              ...withTrip(state, active.id, (trip) => ({
                ...trip,
                members: trip.members.filter((member) => member.id !== id),
              })),
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
          set({ state: withTrip(state, active.id, (trip) => ({ ...trip, gcash: gcash.trim().slice(0, 30) })) })
          return { ok: true, message: t(state.lang, "tripGcashSaved") }
        },
        setOpen: (open) => {
          const { state } = get()
          const active = activeTrip(state)
          if (!active || !isTreasurer(state, active)) return { ok: false, message: t(state.lang, "onlyT") }
          set({
            state: withTrip(state, active.id, (trip) => ({
              ...trip,
              open,
              expenses: open
                ? trip.expenses.map((expense) =>
                    expense.status === "pending"
                      ? { ...expense, status: "approved" as const, ts: Date.now() + state.offset * DAY }
                      : expense
                  )
                : trip.expenses,
            })),
          })
          return { ok: true, message: open ? t(state.lang, "openOnToast") : t(state.lang, "openOffToast") }
        },
        setRoundTo: (roundTo) => {
          const { state } = get()
          const active = activeTrip(state)
          if (!active || !isTreasurer(state, active)) return { ok: false, message: t(state.lang, "onlyT") }
          set({ state: withTrip(state, active.id, (trip) => ({ ...trip, roundTo })) })
          return { ok: true, message: t(state.lang, "saved") }
        },
        handoff: (id) => {
          const { state } = get()
          const active = activeTrip(state)
          if (!active || !isTreasurer(state, active)) return { ok: false, message: t(state.lang, "onlyT") }
          if (!active.members.some((member) => member.id === id)) return { ok: false, message: t(state.lang, "onlyT") }
          const outgoing = memberOf(active, active.treasurer)
          const incoming = memberOf(active, id)
          set({
            state: withTrip(state, active.id, (trip) =>
              appendEmergencyLog(
                { ...trip, treasurer: id },
                {
                  id: uid("em"),
                  action: "crown_passed",
                  actorMemberId: outgoing.id,
                  actorName: outgoing.name,
                  details: "Passed crown to " + incoming.name,
                  ts: Date.now() + state.offset * DAY,
                }
              )
            ),
          })
          return { ok: true, message: incoming.name + " " + t(state.lang, "newTreas") }
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
            ts: Date.now() + state.offset * DAY,
          }
          set({
            state: withTrip(state, active.id, (trip) => appendEmergencyLog({ ...trip, treasurer: newMemberId }, entry)),
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

