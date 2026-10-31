import { sanitizeTrip } from "@/lib/snapshot"
import {
  PERSONA_IDS,
  TABS,
  emptyState,
  isSeedRoster,
  sanitizeProfile,
  type AppState,
  type Lang,
  type Persona,
  type Tab,
  type Trip,
} from "@/lib/types"

function readLakads(raw: unknown): Trip[] {
  if (!Array.isArray(raw)) return []
  const lakads: Trip[] = []
  raw.forEach((trip) => {
    try {
      lakads.push(sanitizeTrip(trip))
    } catch {
      // Skip a trip that no longer matches the current schema.
    }
  })
  return lakads
}

export function hydrateState(parsed: unknown, fromV5 = false): AppState {
  if (!parsed || typeof parsed !== "object") return emptyState()
  const row = parsed as Partial<AppState>
  const lakads = readLakads(row.lakads)
  const lang: Lang = "en"
  const tab: Tab = TABS.includes(row.tab as Tab) ? (row.tab as Tab) : "home"
  const persona: Persona = PERSONA_IDS.includes(row.persona as Persona) ? (row.persona as Persona) : "default"
  const migrated = fromV5 || typeof row.onboarded !== "boolean"
  const onboarded = migrated ? lakads.length > 0 : !!row.onboarded
  const showTestTools = migrated
    ? isSeedRoster(lakads)
    : typeof row.showTestTools === "boolean"
      ? row.showTestTools
      : isSeedRoster(lakads)

  return {
    onboarded,
    showTestTools,
    profile: sanitizeProfile(row.profile),
    lakads,
    activeId: typeof row.activeId === "string" ? row.activeId : null,
    as: typeof row.as === "string" ? row.as : "",
    tab,
    offset: Number.isSafeInteger(row.offset) ? row.offset! : 0,
    persona,
    screenshotMode: false,
    lang,
    authUid: typeof row.authUid === "string" ? row.authUid : "",
    lastSyncedAt: Number.isSafeInteger(row.lastSyncedAt) ? row.lastSyncedAt! : 0,
    dirtyIds: Array.isArray(row.dirtyIds) ? row.dirtyIds.filter((id): id is string => typeof id === "string") : [],
    pinHashes:
      row.pinHashes && typeof row.pinHashes === "object" && !Array.isArray(row.pinHashes)
        ? Object.fromEntries(
            Object.entries(row.pinHashes as Record<string, unknown>).filter(
              (entry): entry is [string, string] => typeof entry[1] === "string"
            )
          )
        : {},
    recoveryPinHash: typeof row.recoveryPinHash === "string" ? row.recoveryPinHash : "",
    mockGoogleEmail: typeof row.mockGoogleEmail === "string" ? row.mockGoogleEmail.trim().slice(0, 80) : "",
    hiddenTripIds: Array.isArray(row.hiddenTripIds)
      ? row.hiddenTripIds.filter((id): id is string => typeof id === "string")
      : [],
  }
}
