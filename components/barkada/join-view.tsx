"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeftIcon, CheckIcon, CrownIcon, LockIcon, PlusIcon, UserRoundIcon } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { gcashLast4, seatStatus } from "@/lib/claim"
import { isValidGcash, sanitizeGcash } from "@/lib/gcash"
import { t } from "@/lib/i18n"
import { normalizeJoinCode } from "@/lib/join-code"
import { fetchTripPreview, type TripPreview } from "@/lib/supabase"
import { useBarkada, useBarkadaStore } from "@/lib/store"
import { memberName, type Member, type Trip } from "@/lib/types"

function asTrip(preview: TripPreview): Trip {
  return {
    id: preview.id,
    joinCode: preview.joinCode,
    name: preview.name,
    treasurer: preview.treasurer,
    gcash: preview.gcash,
    open: preview.open,
    roundTo: 0,
    members: Array.isArray(preview.members) ? preview.members : [],
    expenses: [],
    payments: [],
  }
}

export function JoinView({ code, seat }: { code: string; seat?: string }) {
  const router = useRouter()
  const store = useBarkada()
  const { lang, authUid, profile, lakads, onboarded } = store.state
  const joinCode = normalizeJoinCode(code)
  const [trip, setTrip] = useState<Trip | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [selected, setSelected] = useState<string | "new" | "">("")
  const [adding, setAdding] = useState(false)
  const [showAll, setShowAll] = useState(!seat)
  const [recoverId, setRecoverId] = useState("")
  const [name, setName] = useState(profile.name)
  const [gcash, setGcash] = useState(profile.gcash)
  const [pin, setPin] = useState("")
  const [busy, setBusy] = useState(false)
  const [inAppBrowser, setInAppBrowser] = useState(false)

  useEffect(() => {
    setInAppBrowser(/FBAN|FBAV|Instagram/i.test(navigator.userAgent))
  }, [])

  const localTrip = useMemo(
    () => lakads.find((item) => item.joinCode === joinCode || normalizeJoinCode(item.joinCode) === joinCode) ?? null,
    [lakads, joinCode]
  )

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (localTrip) setTrip(localTrip)
      else {
        setTrip(null)
        setLoading(true)
      }
      const result = await fetchTripPreview(joinCode)
      if (cancelled) return
      if (result.ok) {
        const next = asTrip(result.preview)
        setTrip(next)
        setError("")
        const mine = next.members.find((member) => member.claimedByUid && member.claimedByUid === authUid)
        if (mine) {
          useBarkadaStore.getState().openTrip(next.id)
          router.replace("/lakad/" + next.id)
          return
        }
      } else if (localTrip) {
        setTrip(localTrip)
        if (result.reason === "error" || result.reason === "offline") {
          setError(t(lang, result.reason === "offline" ? "joinOffline" : "joinLookupFail"))
        }
      } else if (result.reason === "error" || result.reason === "offline") {
        setError(t(lang, result.reason === "offline" ? "joinOffline" : "joinLookupFail"))
      } else {
        setError("")
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [joinCode, authUid, localTrip, router, lang])

  const featured = useMemo(() => {
    if (!trip || !seat) return null
    const match = trip.members.find((member) => member.id === seat)
    if (!match || match.claimedByUid) return null
    return match
  }, [trip, seat])

  useEffect(() => {
    if (featured) {
      setSelected(featured.id)
      setAdding(false)
      setGcash(profile.gcash || featured.gcash || "")
    }
  }, [featured, profile.gcash])

  const member = selected && selected !== "new" ? trip?.members.find((item) => item.id === selected) : null
  const recoverMember = recoverId ? trip?.members.find((item) => item.id === recoverId) : null

  function pickSeat(id: string) {
    const found = trip?.members.find((item) => item.id === id)
    if (found && seatStatus(found, authUid) === "locked") {
      setRecoverId(id)
      setSelected("")
      setAdding(false)
      setPin("")
      setError("")
      return
    }
    setRecoverId("")
    setSelected(id)
    setAdding(false)
    setError("")
    setGcash(profile.gcash || found?.gcash || "")
    if (found && !profile.name) setName(found.name)
  }

  async function claim(memberId: string | "new", recoveryPin = "") {
    if (!trip) {
      setError(t(lang, "obNeedClaim"))
      return
    }
    if (!isValidGcash(gcash)) {
      setError(t(lang, "badGcash"))
      return
    }
    setBusy(true)
    const found = memberId !== "new" ? trip.members.find((item) => item.id === memberId) : null
    const result = await store.claimSeat(trip, memberId, {
      name: memberId === "new" ? name : found?.name || name,
      gcash,
      pin: recoveryPin,
    })
    setBusy(false)
    if (!result.ok) {
      setError(result.message)
      return
    }
    router.replace("/lakad/" + (result.tripId || trip.id))
  }

  const gridMembers = trip ? (showAll || !featured ? trip.members : []) : []

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col bg-background">
      <header className="flex items-center gap-2 border-b px-4 pt-[max(12px,env(safe-area-inset-top))] pb-3">
        <Button
          variant="outline"
          size="icon"
          className="size-11"
          aria-label={t(lang, "back")}
          onClick={() => router.push(onboarded ? "/" : "/onboarding")}
        >
          <ArrowLeftIcon />
        </Button>
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t(lang, "joinCodeLabel")}</p>
          <p className="font-mono text-sm select-all">{joinCode}</p>
        </div>
      </header>

      <main className={`flex flex-1 flex-col gap-5 overflow-y-auto px-4 py-5 ${selected ? "pb-40" : ""}`}>
        {inAppBrowser ? (
          <Alert className="border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-50">
            <AlertDescription>{t(lang, "messengerBanner")}</AlertDescription>
          </Alert>
        ) : null}
        {loading ? <p className="text-sm text-muted-foreground">{t(lang, "joinLoading")}</p> : null}

        {!loading && !trip && !error ? <p className="text-sm text-muted-foreground">{t(lang, "joinMissing")}</p> : null}

        {trip ? (
          <>
            <div>
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {t(lang, "treas")}: {memberName(trip, trip.treasurer)}
                {trip.open ? " · " + t(lang, "openModeOn") : ""}
              </p>
              <h1 className="font-heading text-3xl font-extrabold tracking-tight wrap-break-word">{trip.name}</h1>
            </div>

            {featured && !showAll ? (
              <div className="flex flex-col gap-3">
                <p className="text-base wrap-break-word">
                  {t(lang, "heySeat").replace("{name}", featured.name).replace("{trip}", trip.name)}
                </p>
                <SeatCard
                  member={featured}
                  treasurer={featured.id === trip.treasurer}
                  status={seatStatus(featured, authUid)}
                  selected={selected === featured.id}
                  onSelect={() => pickSeat(featured.id)}
                  claimedLabel={t(lang, "taken")}
                  treasLabel={t(lang, "treas")}
                />
                <Button size="touch" variant="ghost" className="w-full" onClick={() => setShowAll(true)}>
                  {t(lang, "notMe").replace("{name}", featured.name)}
                </Button>
              </div>
            ) : (
              <>
                <div>
                  <h2 className="font-heading text-lg font-semibold">{t(lang, "sinoKa")}</h2>
                  <p className="text-sm text-muted-foreground">{t(lang, "obClaimHint")}</p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {gridMembers.map((item) => (
                    <SeatCard
                      key={item.id}
                      member={item}
                      treasurer={item.id === trip.treasurer}
                      status={seatStatus(item, authUid)}
                      selected={selected === item.id}
                      onSelect={() => pickSeat(item.id)}
                      claimedLabel={t(lang, "taken")}
                      treasLabel={t(lang, "treas")}
                    />
                  ))}
                  {trip.open ? (
                    <button
                      type="button"
                      onClick={() => {
                        setRecoverId("")
                        setSelected("new")
                        setAdding(true)
                        setError("")
                        setGcash(profile.gcash)
                      }}
                      className={`flex min-h-[56px] flex-col items-start justify-center gap-1 rounded-xl border px-3 py-3 text-left ${
                        selected === "new" ? "border-primary bg-primary/5" : "bg-card"
                      }`}
                    >
                      <PlusIcon className="size-4" />
                      <span className="text-sm font-semibold">{t(lang, "addSelf")}</span>
                    </button>
                  ) : null}
                </div>
              </>
            )}

            {recoverMember ? (
              <div className="flex flex-col gap-3 rounded-xl border p-4">
                <p className="text-sm text-muted-foreground">
                  {t(lang, "takenHint").replace("{name}", memberName(trip, trip.treasurer))}
                </p>
                <Field>
                  <FieldLabel htmlFor="join-pin">
                    {t(lang, gcashLast4(recoverMember.gcash) ? "pinAskGcash" : "pinAsk")}
                  </FieldLabel>
                  <Input
                    id="join-pin"
                    type="text"
                    inputMode="numeric"
                    enterKeyHint="done"
                    className="font-mono"
                    maxLength={4}
                    value={pin}
                    placeholder={t(lang, "claimPinPh")}
                    onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
                  />
                </Field>
                <Button
                  size="cta"
                  className="min-h-[52px]"
                  disabled={busy || pin.length !== 4}
                  onClick={() => void claim(recoverMember.id, pin)}
                >
                  {t(lang, "claimAs").replace("{name}", recoverMember.name)}
                </Button>
              </div>
            ) : null}
          </>
        ) : null}

        {error ? <FieldError>{error}</FieldError> : null}
      </main>
      {trip && selected && !recoverId ? (
        <footer className="border-t bg-background/95 px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] backdrop-blur">
          <FieldGroup>
            {adding ? (
              <Field>
                <FieldLabel htmlFor="join-name">{t(lang, "obNick")}</FieldLabel>
                <Input
                  id="join-name"
                  enterKeyHint="next"
                  value={name}
                  maxLength={24}
                  onChange={(event) => setName(event.target.value)}
                />
              </Field>
            ) : null}
            <Field>
              <FieldLabel htmlFor="join-gcash">{t(lang, "claimGcash")}</FieldLabel>
              <Input
                id="join-gcash"
                type="tel"
                inputMode="tel"
                enterKeyHint="done"
                className="h-11 font-mono text-base"
                maxLength={16}
                value={gcash}
                placeholder="09XX XXX XXXX"
                onChange={(event) => setGcash(sanitizeGcash(event.target.value))}
              />
              <p className="text-sm text-muted-foreground">{t(lang, "claimGcashHint")}</p>
            </Field>
          </FieldGroup>
          <Button
            size="cta"
            className="mt-3 min-h-[52px]"
            disabled={busy || (adding && !name.trim())}
            onClick={() => void claim(selected)}
          >
            {t(lang, "claimAs").replace("{name}", adding ? name.trim() || "…" : member?.name || "")}
          </Button>
        </footer>
      ) : null}
    </div>
  )
}

function SeatCard({
  member,
  treasurer,
  status,
  selected,
  onSelect,
  claimedLabel,
  treasLabel,
}: {
  member: Member
  treasurer: boolean
  status: "free" | "mine" | "locked"
  selected: boolean
  onSelect: () => void
  claimedLabel: string
  treasLabel: string
}) {
  const locked = status === "locked"
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex min-h-[56px] flex-col items-start justify-between gap-1 rounded-xl border px-3 py-3 text-left ${
        locked ? "opacity-60" : ""
      } ${selected ? "border-2 border-primary bg-primary/5" : "bg-card"}`}
    >
      <span className="flex items-center gap-1 text-sm font-semibold">
        {locked ? (
          <LockIcon className="size-3.5" />
        ) : selected ? (
          <CheckIcon className="size-3.5" />
        ) : treasurer ? (
          <CrownIcon className="size-3.5" />
        ) : (
          <UserRoundIcon className="size-3.5" />
        )}
        {member.name}
      </span>
      {locked ? (
        <Badge variant="secondary">{"\u{1F512} "}{claimedLabel}</Badge>
      ) : treasurer ? (
        <Badge>{treasLabel}</Badge>
      ) : null}
    </button>
  )
}
