"use client"

import { useEffect } from "react"

import { toast } from "@/components/ui/toast"
import { peso, totalOf } from "@/lib/calc"
import { t } from "@/lib/i18n"
import { makeJoinCode } from "@/lib/join-code"
import { flushPayload, isSeedTripId, shouldClearDirty } from "@/lib/merge-trip"
import {
  ensureAnonymousSession,
  fetchRemoteTrip,
  isSupabaseConfigured,
  subscribeLakad,
  upsertRemoteTrip,
  type EmergencyTakeoverPayload,
} from "@/lib/supabase"
import { useBarkadaStore } from "@/lib/store"
import { appendEmergencyLog, emergencyLogOf, isSeedRoster, memberName, type Trip } from "@/lib/types"

let flushing = false
let queued = false

function liveTrip(id: string) {
  return useBarkadaStore.getState().state.lakads.find((item) => item.id === id)
}

function notifyRemoteExpenses(prev: Trip | undefined, remote: Trip) {
  const known = new Set(prev?.expenses.map((expense) => expense.id) ?? [])
  const { as, lang } = useBarkadaStore.getState().state
  for (const expense of remote.expenses) {
    if (known.has(expense.id) || expense.addedBy === as) continue
    const key = expense.status === "pending" ? "pendingToast" : "approvedToast"
    toast.add({
      title: t(lang, key)
        .replace("{name}", memberName(remote, expense.addedBy))
        .replace("{title}", expense.title)
        .replace("{amount}", peso(totalOf(expense))),
      timeout: 3200,
    })
  }
}

function applyIncoming(remote: Trip, clearDirty: boolean) {
  const prev = liveTrip(remote.id)
  useBarkadaStore.getState().applyRemoteTrip(remote, clearDirty)
  notifyRemoteExpenses(prev, remote)
}

function applyEmergencyBroadcast(tripId: string, payload: EmergencyTakeoverPayload) {
  const prev = liveTrip(tripId)
  if (!prev) return
  if (prev.treasurer === payload.treasurer && emergencyLogOf(prev).some((row) => row.id === payload.entry.id)) return
  applyIncoming(appendEmergencyLog({ ...prev, treasurer: payload.treasurer }, payload.entry), false)
}

async function flushTrip(id: string) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const trip = liveTrip(id)
    if (!trip || isSeedRoster([trip])) return
    const remote = await fetchRemoteTrip(id)
    const latest = liveTrip(id)
    const next = flushPayload(latest, remote?.payload ?? null)
    if (!next) return
    const cas = remote ? (attempt >= 7 ? false : remote.updatedAtIso || false) : null
    let result = await upsertRemoteTrip(next, cas)
    if (!result.ok && result.taken) {
      const taken = useBarkadaStore.getState().state.lakads.map((item) => item.joinCode).concat(next.joinCode)
      const renamed = { ...next, joinCode: makeJoinCode(next.name, taken) }
      result = await upsertRemoteTrip(renamed, cas)
    }
    if (result.stale) continue
    if (result.ok) {
      const written = result.trip ?? next
      const local = liveTrip(id)
      const clear = shouldClearDirty(local, written)
      useBarkadaStore.getState().applyRemoteTrip(written, clear)
      if (!clear) continue
      return
    }
    toast.add({
      title: t(useBarkadaStore.getState().state.lang, "syncFailed").replace("{reason}", result.message),
      timeout: 4200,
    })
    return
  }
}

async function flushOnce() {
  if (!isSupabaseConfigured() || (typeof navigator !== "undefined" && !navigator.onLine)) return
  const uid = await ensureAnonymousSession()
  const store = useBarkadaStore.getState()
  if (uid && store.state.authUid !== uid) store.setAuthUid(uid)
  if (!uid) {
    console.warn("flushDirtyTrips: no auth session")
    toast.add({
      title: t(store.state.lang, "syncFailed").replace("{reason}", "no session"),
      timeout: 4200,
    })
    return
  }
  const dirty = useBarkadaStore
    .getState()
    .state.dirtyIds.filter((id) => !isSeedTripId(id))
  for (const id of dirty) {
    await flushTrip(id)
  }
}

export async function flushDirtyTrips() {
  if (flushing) {
    queued = true
    return
  }
  flushing = true
  try {
    do {
      queued = false
      await flushOnce()
    } while (queued)
  } finally {
    flushing = false
    if (queued) void flushDirtyTrips()
  }
}

export function useSyncEngine() {
  const dirtyKey = useBarkadaStore((store) => store.state.dirtyIds.join(","))
  const activeId = useBarkadaStore((store) => store.state.activeId)
  const authUid = useBarkadaStore((store) => store.state.authUid)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const uid = await ensureAnonymousSession()
      if (!cancelled && uid) useBarkadaStore.getState().setAuthUid(uid)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    void flushDirtyTrips()
  }, [dirtyKey, authUid])

  useEffect(() => {
    const onOnline = () => {
      void flushDirtyTrips()
    }
    window.addEventListener("online", onOnline)
    return () => window.removeEventListener("online", onOnline)
  }, [])

  useEffect(() => {
    if (!activeId || isSeedTripId(activeId) || !isSupabaseConfigured()) return
    let cancelled = false
    let sawRealtime = false
    const unsub = subscribeLakad(
      activeId,
      (remote) => {
        if (cancelled) return
        sawRealtime = true
        applyIncoming(remote, false)
      },
      (payload) => {
        if (cancelled) return
        applyEmergencyBroadcast(activeId, payload)
      }
    )
    void (async () => {
      const remote = await fetchRemoteTrip(activeId)
      if (cancelled || sawRealtime || !remote) return
      useBarkadaStore.getState().applyRemoteTrip(remote.payload, false)
    })()
    return () => {
      cancelled = true
      unsub()
    }
  }, [activeId])
}
