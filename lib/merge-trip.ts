import {
  emergencyLogOf,
  higherNudgeStatus,
  SEED_TRIP_IDS,
  type EmergencyLogEntry,
  type Nudge,
  type Trip,
} from "@/lib/types"

export function isSeedTripId(id: string) {
  return (SEED_TRIP_IDS as readonly string[]).includes(id)
}

function stamp(row: { ts?: number; edits?: { ts?: number }[]; pendingEdit?: { ts?: number } | null }) {
  let value = row.ts || 0
  for (const edit of row.edits || []) {
    if ((edit.ts || 0) > value) value = edit.ts || 0
  }
  const proposed = row.pendingEdit?.ts || 0
  if (proposed > value) value = proposed
  return value
}

function later<T extends { id: string; ts?: number; edits?: { ts?: number }[] }>(a: T, b: T) {
  return stamp(b) > stamp(a) ? b : a
}

function unionById<T extends { id: string; ts?: number; edits?: { ts?: number }[] }>(local: T[], remote: T[]) {
  const map = new Map<string, T>()
  remote.forEach((row) => map.set(row.id, row))
  local.forEach((row) => {
    const existing = map.get(row.id)
    map.set(row.id, existing ? later(existing, row) : row)
  })
  return Array.from(map.values())
}

function unionIds(left?: string[], right?: string[]) {
  return Array.from(new Set([...(left || []), ...(right || [])]))
}

function dropGone<T extends { id: string }>(rows: T[], gone: string[]) {
  if (!gone.length) return rows
  const hide = new Set(gone)
  return rows.filter((row) => !hide.has(row.id))
}

function mergeEmergencyLog(local: EmergencyLogEntry[], remote: EmergencyLogEntry[]) {
  const map = new Map<string, EmergencyLogEntry>()
  for (const row of [...remote, ...local]) {
    const existing = map.get(row.id)
    if (!existing) {
      map.set(row.id, row)
      continue
    }
    const newer = later(existing, row)
    map.set(row.id, {
      ...newer,
      ...(existing.ack || row.ack ? { ack: true as const } : {}),
    })
  }
  return Array.from(map.values())
}

export function mergeNudges(local?: Nudge[], remote?: Nudge[]) {
  const map = new Map<string, Nudge>()
  for (const row of [...(remote || []), ...(local || [])]) {
    const existing = map.get(row.id)
    if (!existing) {
      map.set(row.id, row)
      continue
    }
    const newer = later(existing, row)
    map.set(row.id, {
      ...newer,
      read: existing.read || row.read,
      status: higherNudgeStatus(existing.status, row.status),
    })
  }
  return Array.from(map.values())
}

export function omitExpense(trip: Trip, id: string): Trip {
  return {
    ...trip,
    expenses: trip.expenses.filter((item) => item.id !== id),
    deletedExpenseIds: unionIds(trip.deletedExpenseIds, [id]),
  }
}

export function omitPayment(trip: Trip, id: string): Trip {
  return {
    ...trip,
    payments: trip.payments.filter((item) => item.id !== id),
    deletedPaymentIds: unionIds(trip.deletedPaymentIds, [id]),
  }
}

export function mergeTrip(local: Trip, remote: Trip, dirty: boolean): Trip {
  const members = remote.members.map((remoteMember) => {
    const localMember = local.members.find((member) => member.id === remoteMember.id)
    if (!localMember) return remoteMember
    return {
      ...remoteMember,
      name: dirty ? localMember.name : remoteMember.name,
      gcash: localMember.gcash || remoteMember.gcash,
      claimedByUid: localMember.claimedByUid || remoteMember.claimedByUid || null,
    }
  })
  local.members.forEach((localMember) => {
    if (!members.some((member) => member.id === localMember.id)) members.push(localMember)
  })
  const deletedExpenseIds = unionIds(local.deletedExpenseIds, remote.deletedExpenseIds)
  const deletedPaymentIds = unionIds(local.deletedPaymentIds, remote.deletedPaymentIds)
  const emergencyLog = mergeEmergencyLog(emergencyLogOf(local), emergencyLogOf(remote))
  const next: Trip = {
    ...(dirty ? local : remote),
    joinCode: (dirty ? local.joinCode : remote.joinCode) || local.joinCode || remote.joinCode,
    members,
    expenses: dropGone(unionById(local.expenses, remote.expenses), deletedExpenseIds),
    payments: dropGone(unionById(local.payments, remote.payments), deletedPaymentIds),
    nudges: mergeNudges(local.nudges, remote.nudges),
    deletedExpenseIds,
    deletedPaymentIds,
  }
  if (emergencyLog.length) next.emergencyLog = emergencyLog
  else delete next.emergencyLog
  return next
}

/** Latest blob to write: always the current local trip, merged with remote. Never a stale snapshot. */
export function flushPayload(local: Trip | undefined, remote: Trip | null): Trip | null {
  if (!local) return null
  return remote ? mergeTrip(local, remote, true) : local
}

function newerOrMissing<T extends { id: string; ts?: number; edits?: { ts?: number }[] }>(local: T[], written: T[]) {
  const stamps = new Map(written.map((row) => [row.id, stamp(row)]))
  return local.some((row) => !stamps.has(row.id) || stamp(row) > (stamps.get(row.id) || 0))
}

function extraIds(local?: string[], written?: string[]) {
  const have = new Set(written || [])
  return (local || []).some((id) => !have.has(id))
}

function nudgesUnsynced(local?: Nudge[], written?: Nudge[]) {
  const have = new Map((written || []).map((row) => [row.id, row]))
  return (local || []).some((row) => {
    const remote = have.get(row.id)
    if (!remote) return true
    return row.read !== remote.read || row.status !== remote.status || row.ts !== remote.ts
  })
}

export function hasUnsyncedRows(local: Trip, written: Trip) {
  return (
    local.treasurer !== written.treasurer ||
    newerOrMissing(local.expenses, written.expenses) ||
    newerOrMissing(local.payments, written.payments) ||
    extraIds(local.deletedExpenseIds, written.deletedExpenseIds) ||
    extraIds(local.deletedPaymentIds, written.deletedPaymentIds) ||
    nudgesUnsynced(local.nudges, written.nudges) ||
    emergencyLogUnsynced(emergencyLogOf(local), emergencyLogOf(written))
  )
}

function emergencyLogUnsynced(local: EmergencyLogEntry[], written: EmergencyLogEntry[]) {
  if (newerOrMissing(local, written)) return true
  const have = new Map(written.map((row) => [row.id, row]))
  return local.some((row) => !!row.ack !== !!have.get(row.id)?.ack)
}

export function shouldClearDirty(local: Trip | undefined, written: Trip) {
  return !local || !hasUnsyncedRows(local, written)
}
