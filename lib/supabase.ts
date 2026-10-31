import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js"

import { normalizeJoinCode } from "@/lib/join-code"
import { isPin } from "@/lib/pin"
import { isEmergencyAction, type EmergencyLogEntry, type Member, type Trip } from "@/lib/types"

export type TripPreview = {
  id: string
  joinCode: string
  name: string
  treasurer: string
  open: boolean
  gcash: string
  members: Member[]
}

let client: SupabaseClient | null = null

function supabaseUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || ""
}

function supabasePublicKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || ""
}

export function isSupabaseConfigured() {
  return !!(supabaseUrl() && supabasePublicKey())
}

export function getSupabase() {
  if (!isSupabaseConfigured()) return null
  if (!client) {
    client = createClient(supabaseUrl(), supabasePublicKey(), {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  }
  return client
}

export async function ensureAnonymousSession() {
  const supabase = getSupabase()
  if (!supabase) return ""
  const existing = await supabase.auth.getUser()
  if (existing.data.user?.id) return existing.data.user.id
  const { data, error } = await supabase.auth.signInAnonymously()
  if (error || !data.user) {
    console.warn("ensureAnonymousSession", error?.message || "no user")
    return ""
  }
  return data.user.id
}

export async function currentAuthUid() {
  const supabase = getSupabase()
  if (!supabase) return ""
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? ""
}

export async function getAuthUser() {
  const supabase = getSupabase()
  if (!supabase) return { id: "", email: "", google: false }
  const { data } = await supabase.auth.getUser()
  const user = data.user
  if (!user) return { id: "", email: "", google: false }
  const google = (user.identities || []).some((identity) => identity.provider === "google")
  return { id: user.id, email: user.email || "", google }
}

export async function hasGoogleLinked() {
  const user = await getAuthUser()
  return user.google || !!user.email
}

export type LinkGoogleReason = "offline" | "opening" | "manual" | "provider" | "already" | "error"

export function classifyLinkGoogleError(message: string): Exclude<LinkGoogleReason, "offline" | "opening"> {
  const text = message.toLowerCase()
  if (text.includes("manual linking")) return "manual"
  if (text.includes("already") && (text.includes("linked") || text.includes("identity"))) return "already"
  if (
    text.includes("provider is not enabled") ||
    text.includes("unsupported provider") ||
    text.includes("validation_failed") ||
    text.includes("unsupported_provider")
  ) {
    return "provider"
  }
  return "error"
}

export function oauthErrorFromUrl(search = "", hash = "") {
  const query = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
  const fragment = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash)
  const raw = query.get("error_description") || fragment.get("error_description") || query.get("error") || fragment.get("error") || ""
  if (!raw) return ""
  try {
    return decodeURIComponent(raw.replace(/\+/g, " "))
  } catch {
    return raw.replace(/\+/g, " ")
  }
}

export async function linkGoogle() {
  const supabase = getSupabase()
  if (!supabase) return { ok: false as const, reason: "offline" as const, message: "Supabase is not configured." }
  const origin = typeof window !== "undefined" ? window.location.origin : ""
  const { error } = await supabase.auth.linkIdentity({
    provider: "google",
    options: { redirectTo: origin + "/auth/callback" },
  })
  if (error) {
    const reason = classifyLinkGoogleError(error.message)
    return { ok: false as const, reason, message: error.message }
  }
  return { ok: true as const, reason: "opening" as const, message: "Opening Google…" }
}

export async function signInWithGoogle(options?: { selectAccount?: boolean }) {
  const supabase = getSupabase()
  if (!supabase) return { ok: false as const, reason: "offline" as const, message: "Supabase is not configured." }
  const origin = typeof window !== "undefined" ? window.location.origin : ""
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: origin + "/auth/callback",
      ...(options?.selectAccount ? { queryParams: { prompt: "select_account" } } : {}),
    },
  })
  if (error) {
    const reason = classifyLinkGoogleError(error.message)
    return { ok: false as const, reason, message: error.message }
  }
  return { ok: true as const, reason: "opening" as const, message: "Opening Google…" }
}

export async function fetchMyRemoteLakads(): Promise<Trip[]> {
  const supabase = getSupabase()
  if (!supabase) return []
  const { data, error } = await supabase.from("lakads").select("payload")
  if (error || !data) return []
  return data
    .map((row) => row.payload as Trip)
    .filter((trip) => trip && typeof trip.id === "string" && Array.isArray(trip.members))
}

export type TripPreviewResult =
  | { ok: true; preview: TripPreview; reason: "" }
  | { ok: false; preview: null; reason: "offline" | "missing" | "error"; message: string }

export async function fetchTripPreview(code: string): Promise<TripPreviewResult> {
  const supabase = getSupabase()
  if (!supabase) return { ok: false, preview: null, reason: "offline", message: "offline" }
  await ensureAnonymousSession()
  const { data, error } = await supabase.rpc("get_lakad_by_join_code", {
    p_code: normalizeJoinCode(code),
  })
  if (error) {
    console.warn("fetchTripPreview", error.message)
    return { ok: false, preview: null, reason: "error", message: error.message }
  }
  if (!data) return { ok: false, preview: null, reason: "missing", message: "" }
  return { ok: true, preview: data as TripPreview, reason: "" }
}

export async function fetchRemoteTrip(id: string) {
  const supabase = getSupabase()
  if (!supabase) return null
  const { data, error } = await supabase.from("lakads").select("payload, updated_at").eq("id", id).maybeSingle()
  if (error || !data?.payload) return null
  return {
    payload: data.payload as Trip,
    updatedAt: Date.parse(data.updated_at) || 0,
    updatedAtIso: String(data.updated_at || ""),
  }
}

function conflictKind(message: string, code?: string) {
  const duplicate = code === "23505" || /duplicate key/i.test(message)
  if (!duplicate) return { taken: false, stale: false }
  if (/join_code/i.test(message)) return { taken: true, stale: false }
  return { taken: false, stale: true }
}

/** null = insert a new lakad. string = update with updated_at CAS. false = update by id only. */
export async function upsertRemoteTrip(trip: Trip, expectedUpdatedAt?: string | null | false) {
  const supabase = getSupabase()
  if (!supabase) return { ok: false as const, message: "offline", taken: false, stale: false }
  const uid = await ensureAnonymousSession()
  if (!uid) return { ok: false as const, message: "no session", taken: false, stale: false }
  const payload = trip
  const updatedAt = new Date().toISOString()
  if (expectedUpdatedAt !== undefined && expectedUpdatedAt !== null) {
    let query = supabase
      .from("lakads")
      .update({
        join_code: payload.joinCode,
        payload,
        updated_at: updatedAt,
      })
      .eq("id", payload.id)
    if (expectedUpdatedAt !== false) query = query.eq("updated_at", expectedUpdatedAt)
    const { data, error } = await query.select("id")
    if (error) {
      console.warn("upsertRemoteTrip", error.message)
      const kind = conflictKind(error.message, error.code)
      return { ok: false as const, message: error.message, taken: kind.taken, stale: kind.stale }
    }
    if (!data?.length) return { ok: false as const, message: "stale", taken: false, stale: true }
    return { ok: true as const, message: "", taken: false, stale: false, trip: payload, uid }
  }
  const { error } = await supabase.from("lakads").insert({
    id: payload.id,
    join_code: payload.joinCode,
    payload,
    updated_at: updatedAt,
    created_by: uid,
  })
  if (error) {
    console.warn("upsertRemoteTrip", error.message)
    const kind = conflictKind(error.message, error.code)
    return { ok: false as const, message: error.message, taken: kind.taken, stale: kind.stale }
  }
  return { ok: true as const, message: "", taken: false, stale: false, trip: payload, uid }
}

export async function deleteRemoteTrip(tripId: string) {
  const supabase = getSupabase()
  if (!supabase) return { ok: false as const, message: "offline" }
  const uid = await ensureAnonymousSession()
  if (!uid) return { ok: false as const, message: "no session" }
  const { error } = await supabase.from("lakads").delete().eq("id", tripId)
  if (error) {
    console.warn("deleteRemoteTrip", error.message)
    return { ok: false as const, message: error.message }
  }
  return { ok: true as const, message: "" }
}

export async function claimSeatRemote(input: {
  tripId: string
  memberId: string | "new"
  name?: string
  gcash?: string
  pin?: string
}) {
  const supabase = getSupabase()
  if (!supabase) return { ok: false as const, reason: "offline" as const, trip: null }
  const { data, error } = await supabase.rpc("claim_seat", {
    p_trip_id: input.tripId,
    p_member_id: input.memberId,
    p_name: input.name ?? "",
    p_gcash: input.gcash ?? "",
    p_pin: input.pin ?? "",
  })
  if (error || !data) return { ok: false as const, reason: "rpc" as const, trip: null }
  const row = data as { ok?: boolean; reason?: string; trip?: Trip }
  if (!row.ok || !row.trip) return { ok: false as const, reason: (row.reason || "rpc") as string, trip: null }
  return { ok: true as const, reason: "", trip: row.trip }
}

export async function verifySeatPinRemote(tripId: string, memberId: string, pin: string) {
  const supabase = getSupabase()
  if (!supabase) return false
  if (!isPin(pin)) return false
  const { data, error } = await supabase.rpc("verify_seat_pin", {
    p_trip_id: tripId,
    p_member_id: memberId,
    p_pin: pin,
  })
  return !error && !!data
}

export async function resetSeatLockRemote(tripId: string, memberId: string) {
  const supabase = getSupabase()
  if (!supabase) return false
  const { error } = await supabase.rpc("reset_seat_lock", {
    p_trip_id: tripId,
    p_member_id: memberId,
  })
  return !error
}

export type EmergencyTakeoverPayload = {
  treasurer: string
  entry: EmergencyLogEntry
}

const lakadChannels = new Map<string, RealtimeChannel>()
const lakadStops = new Map<string, () => void>()

function retryDelay(attempt: number) {
  return Math.min(8000, 1000 * 2 ** attempt)
}

function isEmergencyTakeoverPayload(value: unknown): value is EmergencyTakeoverPayload {
  if (!value || typeof value !== "object") return false
  const row = value as Record<string, unknown>
  if (typeof row.treasurer !== "string" || !row.treasurer) return false
  const entry = row.entry
  if (!entry || typeof entry !== "object") return false
  const log = entry as Record<string, unknown>
  return (
    typeof log.id === "string" &&
    isEmergencyAction(log.action) &&
    typeof log.actorMemberId === "string" &&
    typeof log.actorName === "string" &&
    typeof log.details === "string" &&
    Number.isSafeInteger(log.ts)
  )
}

export function subscribeLakad(
  tripId: string,
  onChange: (trip: Trip) => void,
  onEmergency?: (payload: EmergencyTakeoverPayload) => void,
  onSubscribed?: () => void
) {
  const supabase = getSupabase()
  if (!supabase) return () => {}
  lakadStops.get(tripId)?.()

  let stopped = false
  let epoch = 0
  let attempt = 0
  let channel: RealtimeChannel | null = null
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let joinedToken = ""
  let inflightToken = ""

  const scheduleRetry = (token: string) => {
    if (stopped || retryTimer) return
    const delay = retryDelay(attempt)
    attempt += 1
    retryTimer = setTimeout(() => {
      retryTimer = null
      void join(token)
    }, delay)
  }

  const join = async (token: string) => {
    if (stopped || !token) return
    if ((token === joinedToken && channel) || token === inflightToken) return
    inflightToken = token
    if (retryTimer) {
      clearTimeout(retryTimer)
      retryTimer = null
    }
    try {
      await supabase.realtime.setAuth(token)
    } catch {
      if (inflightToken === token) inflightToken = ""
      scheduleRetry(token)
      return
    }
    if (stopped || inflightToken !== token) return

    const ticket = ++epoch
    const previous = channel
    channel = null
    joinedToken = ""
    if (previous && lakadChannels.get(tripId) === previous) lakadChannels.delete(tripId)
    if (previous) await supabase.removeChannel(previous).catch(() => {})
    if (stopped || ticket !== epoch) {
      if (inflightToken === token) inflightToken = ""
      return
    }

    const next = supabase
      .channel("lakad-" + tripId, { config: { broadcast: { self: false } } })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lakads", filter: "id=eq." + tripId },
        (payload) => {
          const row = payload.new as { payload?: Trip } | null
          if (row?.payload) onChange(row.payload)
        }
      )
      .on("broadcast", { event: "emergency_takeover" }, (msg) => {
        if (isEmergencyTakeoverPayload(msg.payload)) onEmergency?.(msg.payload)
      })
    channel = next
    lakadChannels.set(tripId, next)
    next.subscribe((status) => {
      if (stopped || ticket !== epoch) return
      if (status === "SUBSCRIBED") {
        attempt = 0
        joinedToken = token
        if (inflightToken === token) inflightToken = ""
        onSubscribed?.()
        return
      }
      if (status !== "CHANNEL_ERROR" && status !== "TIMED_OUT" && status !== "CLOSED") return
      if (retryTimer) return
      joinedToken = ""
      if (inflightToken === token) inflightToken = ""
      if (channel === next) channel = null
      if (lakadChannels.get(tripId) === next) lakadChannels.delete(tripId)
      scheduleRetry(token)
      void supabase.removeChannel(next)
    })
  }

  const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
    if (stopped) return
    if (event !== "INITIAL_SESSION" && event !== "SIGNED_IN" && event !== "TOKEN_REFRESHED") return
    const token = session?.access_token
    if (!token) return
    setTimeout(() => {
      if (!stopped) void join(token)
    }, 0)
  })

  void (async () => {
    const { data } = await supabase.auth.getSession()
    if (stopped) return
    const token = data.session?.access_token
    if (token) void join(token)
  })()

  const stop = () => {
    if (stopped) return
    stopped = true
    epoch += 1
    inflightToken = ""
    joinedToken = ""
    if (retryTimer) clearTimeout(retryTimer)
    authListener.subscription.unsubscribe()
    const current = channel
    channel = null
    if (lakadStops.get(tripId) === stop) lakadStops.delete(tripId)
    if (current && lakadChannels.get(tripId) === current) {
      lakadChannels.delete(tripId)
      void supabase.removeChannel(current)
    }
  }
  lakadStops.set(tripId, stop)
  return stop
}

export async function broadcastEmergencyTakeover(tripId: string, payload: EmergencyTakeoverPayload) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return
  const supabase = getSupabase()
  if (!supabase) return
  const live = lakadChannels.get(tripId)
  if (live) {
    await live.send({ type: "broadcast", event: "emergency_takeover", payload })
    return
  }
  const channel = supabase.channel("lakad-" + tripId)
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 2500)
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        clearTimeout(timer)
        resolve()
      }
    })
  })
  await channel.send({ type: "broadcast", event: "emergency_takeover", payload })
  void supabase.removeChannel(channel)
}
