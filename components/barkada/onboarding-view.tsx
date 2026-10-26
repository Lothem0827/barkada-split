"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import {
  ArrowLeftIcon,
  CrownIcon,
  MoonIcon,
  RefreshCwIcon,
  SmartphoneIcon,
  SunIcon,
} from "lucide-react"

import {
  BarkadaMemberInput,
  type BarkadaMemberInputHandle,
} from "@/components/barkada/barkada-member-input"
import { JoinView } from "@/components/barkada/join-view"
import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { isValidGcash, sanitizeGcash } from "@/lib/gcash"
import { linkGoogleCopyKey, t } from "@/lib/i18n"
import { markJustCreated, parseJoinCodeFromInput } from "@/lib/join-code"
import { useBarkada, type OnboardDraft } from "@/lib/store"
import { signInWithGoogle } from "@/lib/supabase"
import { AVATARS, type Lang, type RoundTo } from "@/lib/types"

type Step = "intent" | "join" | "create" | "sync"

const QUICK_AVATARS = AVATARS.slice(0, 8)

const HOOKS = [
  { emoji: "🏝️", title: "obHook1Title", body: "obHook1Body" },
  { emoji: "🕯️", title: "obHook2Title", body: "obHook2Body" },
  { emoji: "🧾", title: "obHook3Title", body: "obHook3Body" },
] as const

function WelcomeCarousel({ lang }: { lang: Lang }) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)
  const pausedRef = useRef(false)

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const onScroll = () => {
      const width = el.clientWidth
      if (!width) return
      setIndex(Math.min(HOOKS.length - 1, Math.max(0, Math.round(el.scrollLeft / width))))
    }
    el.addEventListener("scroll", onScroll, { passive: true })
    return () => el.removeEventListener("scroll", onScroll)
  }, [])

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const id = window.setInterval(() => {
      if (pausedRef.current) return
      const el = scrollerRef.current
      if (!el) return
      const next = (index + 1) % HOOKS.length
      el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" })
    }, 4000)
    return () => window.clearInterval(id)
  }, [index])

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div
        ref={scrollerRef}
        role="region"
        aria-roledescription="carousel"
        aria-label={t(lang, "obTagline")}
        className="no-scrollbar flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto"
        onPointerDown={() => {
          pausedRef.current = true
        }}
        onFocus={() => {
          pausedRef.current = true
        }}
      >
        {HOOKS.map((hook) => (
          <section
            key={hook.title}
            className="flex w-full min-w-full shrink-0 snap-center flex-col items-center justify-center gap-3 px-2 text-center"
          >
            <span aria-hidden="true" className="text-6xl leading-none">
              {hook.emoji}
            </span>
            <h1 className="font-heading text-3xl font-extrabold tracking-tight">{t(lang, hook.title)}</h1>
            <p className="text-sm text-muted-foreground">{t(lang, hook.body)}</p>
          </section>
        ))}
      </div>
      <div className="flex justify-center gap-1.5" aria-hidden>
        {HOOKS.map((hook, i) => (
          <span
            key={hook.title}
            className={`size-1.5 rounded-full ${i === index ? "bg-foreground" : "bg-muted-foreground/40"}`}
          />
        ))}
      </div>
    </div>
  )
}

const PRESETS = [
  { emoji: "🏖️", key: "obPresetBeach" as const },
  { emoji: "⛰️", key: "obPresetHike" as const },
  { emoji: "🍻", key: "obPresetBgc" as const },
  { emoji: "🥟", key: "obPresetFood" as const },
]

function emptyDraft(profile: { name: string; gcash: string; avatar: string }, persona: OnboardDraft["persona"]): OnboardDraft {
  return {
    name: profile.name,
    gcash: profile.gcash,
    avatar: profile.avatar || "😎",
    persona,
  }
}

function AvatarRow({
  value,
  onChange,
}: {
  value: string
  onChange: (avatar: string) => void
}) {
  return (
    <div className="no-scrollbar -mx-4 min-w-0 overflow-x-auto overscroll-x-contain snap-x px-1 py-1">
      <div className="flex w-max gap-2">
        {QUICK_AVATARS.map((avatar) => (
          <Button
            key={avatar}
            type="button"
            variant={value === avatar ? "default" : "outline"}
            className="size-11 shrink-0 snap-start text-lg"
            aria-pressed={value === avatar}
            onClick={() => onChange(avatar)}
          >
            {avatar}
          </Button>
        ))}
      </div>
    </div>
  )
}

export function OnboardingView() {
  const router = useRouter()
  const store = useBarkada()
  const { lang, profile, persona, onboarded, activeId } = store.state
  const { resolvedTheme, setTheme } = useTheme()
  const [step, setStep] = useState<Step>("intent")
  const [createPhase, setCreatePhase] = useState<"profile" | "trip">("profile")
  const [draft, setDraft] = useState<OnboardDraft>(() => emptyDraft(profile, persona))
  const [tripName, setTripName] = useState("")
  const [friends, setFriends] = useState<string[]>([])
  const [friendDraft, setFriendDraft] = useState("")
  const [openMode, setOpenMode] = useState(false)
  const [roundTo, setRoundTo] = useState<RoundTo>(0)
  const [code, setCode] = useState("")
  const [joinShort, setJoinShort] = useState("")
  const [error, setError] = useState("")
  const [isCreating, setIsCreating] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const creatingRef = useRef(false)
  const rosterRef = useRef<BarkadaMemberInputHandle>(null)

  useEffect(() => {
    const next = new URLSearchParams(window.location.search).get("step")
    if (next === "sync") setStep("sync")
  }, [])

  useEffect(() => {
    if (!onboarded) return
    router.replace(activeId ? "/lakad/" + activeId : "/")
  }, [onboarded, activeId, router])

  function notify(result: { ok: boolean; message: string; tripId?: string }) {
    if (!result.ok) {
      setError(result.message)
      return false
    }
    if (result.tripId) {
      markJustCreated(result.tripId)
      router.replace("/lakad/" + result.tripId)
    } else router.replace("/")
    return true
  }

  function go(next: Step) {
    setError("")
    if (next === "create") setCreatePhase(profile.name.trim() ? "trip" : "profile")
    setStep(next)
  }

  function back() {
    setError("")
    if (step === "join" && joinShort) {
      setJoinShort("")
      return
    }
    if (step === "create" && createPhase === "trip" && !profile.name.trim()) {
      setCreatePhase("profile")
      return
    }
    go("intent")
  }

  async function startSync() {
    go("sync")
    setSyncing(true)
    const result = await signInWithGoogle({ selectAccount: true })
    setSyncing(false)
    if (!result.ok) {
      setError(t(lang, linkGoogleCopyKey(result.reason)))
    }
  }

  function finishSyncProfile() {
    if (!draft.name.trim()) {
      setError(t(lang, "needYourName"))
      return
    }
    if (!isValidGcash(draft.gcash)) {
      setError(t(lang, "badGcash"))
      return
    }
    const saved = store.saveProfile(draft)
    if (!saved.ok) {
      setError(saved.message)
      return
    }
    store.finishOnboarding()
    router.replace("/")
  }

  const nickReady = !!draft.name.trim()
  const gcashReady = isValidGcash(draft.gcash)
  const rosterReady = friends.length > 0 || !!friendDraft.trim()
  const showCreateProfile = step === "create" && createPhase === "profile"
  const showCreateTrip = step === "create" && createPhase === "trip"
  const showJoinCode = step === "join" && !joinShort

  return (
    <div className="h-dvh overflow-hidden bg-background">
      <div className="flex h-full w-full flex-col bg-background">
        <header className="flex items-center gap-2 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-2">
          {step === "intent" ? (
            <div className="min-w-0 flex-1">
              <p className="font-heading text-lg font-extrabold tracking-tight">Tally</p>
            </div>
          ) : (
            <>
              <Button
                variant="outline"
                size="icon"
                className="size-11 shrink-0"
                aria-label={t(lang, "back")}
                onClick={back}
              >
                <ArrowLeftIcon />
              </Button>
              <p className="min-w-0 flex-1 text-sm font-semibold text-muted-foreground">
                {t(
                  lang,
                  showCreateProfile
                    ? "obProfileStep"
                    : step === "create"
                      ? "obCreateStep"
                      : step === "sync"
                        ? "obSyncAccount"
                        : "obJoinStep"
                )}
              </p>
            </>
          )}
          <Button
            variant="outline"
            size="icon"
            className="size-11"
            aria-label={t(lang, "theme")}
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          >
            {resolvedTheme === "dark" ? <SunIcon /> : <MoonIcon />}
          </Button>
        </header>

        <main
          className={`flex min-h-0 min-w-0 flex-1 flex-col px-4 ${
            step === "intent" || (step === "join" && joinShort) ? "overflow-hidden py-2" : "overflow-y-auto py-4"
          }`}
        >
          {step === "intent" ? (
            <div className="relative flex min-h-0 flex-1 flex-col">
              <Button
                type="button"
                variant="outline"
                className="absolute top-0 right-0 z-10 h-8 rounded-full px-3 text-xs font-semibold"
                onClick={() => {
                  if (!notify(store.loadDemo())) return
                }}
              >
                🧪 {t(lang, "obTryDemo")}
              </Button>
              <WelcomeCarousel lang={lang} />
            </div>
          ) : null}

          {showCreateProfile ? (
            <div className="flex flex-col gap-5">
              <h1 className="font-heading text-3xl font-extrabold tracking-tight wrap-break-word">
                {t(lang, "obCreateProfileTitle")}
              </h1>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="ob-nick">{t(lang, "obTreasNick")}</FieldLabel>
                  <Input
                    id="ob-nick"
                    enterKeyHint="next"
                    maxLength={24}
                    value={draft.name}
                    placeholder={t(lang, "obNickPh")}
                    onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                  />
                </Field>
                <Field>
                  <FieldLabel>{t(lang, "obAvatar")}</FieldLabel>
                  <AvatarRow
                    value={draft.avatar}
                    onChange={(avatar) => setDraft((current) => ({ ...current, avatar }))}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="ob-gcash">{t(lang, "obDefaultGcash")}</FieldLabel>
                  <Input
                    id="ob-gcash"
                    type="tel"
                    inputMode="tel"
                    enterKeyHint="next"
                    className="font-mono"
                    maxLength={16}
                    value={draft.gcash}
                    placeholder="09XX XXX XXXX"
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, gcash: sanitizeGcash(event.target.value) }))
                    }
                  />
                </Field>
              </FieldGroup>
            </div>
          ) : null}

          {showCreateTrip ? (
            <div className="flex flex-col gap-5">
              <h1 className="font-heading text-3xl font-extrabold tracking-tight wrap-break-word">
                {t(lang, "obCreateTitle")}
              </h1>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="ob-trip">{t(lang, "tripName")}</FieldLabel>
                  <Input
                    id="ob-trip"
                    enterKeyHint="next"
                    maxLength={60}
                    value={tripName}
                    placeholder="La Union Sunset Run"
                    onChange={(event) => setTripName(event.target.value)}
                  />
                  <div className="flex flex-wrap gap-2">
                    <span className="sr-only">{t(lang, "obPresets")}</span>
                    {PRESETS.map((preset) => (
                      <Button
                        key={preset.key}
                        type="button"
                        variant="outline"
                        className="h-11"
                        onClick={() => setTripName(t(lang, preset.key))}
                      >
                        {preset.emoji} {t(lang, preset.key)}
                      </Button>
                    ))}
                  </div>
                </Field>
                <Field>
                  <FieldLabel htmlFor="ob-friend">{t(lang, "obRoster")}</FieldLabel>
                  <BarkadaMemberInput
                    ref={rosterRef}
                    inputId="ob-friend"
                    lang={lang}
                    names={friends}
                    onChange={setFriends}
                    onDraftChange={setFriendDraft}
                    self={{
                      name: draft.name,
                      avatar: draft.avatar,
                      label: "👑 " + (draft.name.trim() || t(lang, "obNick")) + " (" + t(lang, "obYouTreas") + ")",
                    }}
                  />
                </Field>
                <Field>
                  <FieldLabel>{t(lang, "obRules")}</FieldLabel>
                  <div className="flex items-center justify-between gap-3 rounded-xl bg-card px-3 py-3">
                    <div className="min-w-0">
                      <p className="font-medium">{openMode ? t(lang, "obOpenAuto") : t(lang, "obOpenLock")}</p>
                      <p className="text-sm text-muted-foreground">{t(lang, "openHint")}</p>
                    </div>
                    <Switch checked={openMode} onCheckedChange={setOpenMode} />
                  </div>
                  <ToggleGroup
                    variant="outline"
                    spacing={1}
                    className="flex-wrap"
                    value={[String(roundTo)]}
                    onValueChange={(next) => {
                      const picked = next[next.length - 1]
                      if (picked === "0" || picked === "100" || picked === "500") {
                        setRoundTo(Number(picked) as RoundTo)
                      }
                    }}
                  >
                    <ToggleGroupItem value="0" className="min-h-[40px] px-3.5">
                      {t(lang, "round0")}
                    </ToggleGroupItem>
                    <ToggleGroupItem value="100" className="min-h-[40px] px-3.5">
                      {t(lang, "round1")}
                    </ToggleGroupItem>
                    <ToggleGroupItem value="500" className="min-h-[40px] px-3.5">
                      {t(lang, "round5")}
                    </ToggleGroupItem>
                  </ToggleGroup>
                </Field>
              </FieldGroup>
            </div>
          ) : null}

          {showJoinCode ? (
            <div className="flex flex-col gap-5">
              <h1 className="font-heading text-3xl font-extrabold tracking-tight wrap-break-word">
                {t(lang, "obJoinTitle")}
              </h1>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="ob-code">{t(lang, "joinCodeLabel")}</FieldLabel>
                  <Input
                    id="ob-code"
                    className="font-mono"
                    enterKeyHint="go"
                    spellCheck={false}
                    autoComplete="off"
                    value={code}
                    placeholder={t(lang, "joinCodePh")}
                    onChange={(event) => {
                      setCode(event.target.value)
                      setError("")
                    }}
                  />
                </Field>
              </FieldGroup>
            </div>
          ) : null}

          {step === "join" && joinShort ? <JoinView code={joinShort} embedded /> : null}

          {step === "sync" ? (
            <div className="flex flex-col gap-5">
              <h1 className="font-heading text-3xl font-extrabold tracking-tight wrap-break-word">
                {syncing || profile.name.trim() ? t(lang, "obSyncing") : t(lang, "obSyncProfileTitle")}
              </h1>
              {syncing || profile.name.trim() ? (
                <p className="text-sm text-muted-foreground">{t(lang, "obSyncing")}</p>
              ) : (
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="ob-sync-nick">{t(lang, "obTreasNick")}</FieldLabel>
                    <Input
                      id="ob-sync-nick"
                      enterKeyHint="next"
                      maxLength={24}
                      value={draft.name}
                      placeholder={t(lang, "obNickPh")}
                      onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                    />
                  </Field>
                  <Field>
                    <FieldLabel>{t(lang, "obAvatar")}</FieldLabel>
                    <AvatarRow
                      value={draft.avatar}
                      onChange={(avatar) => setDraft((current) => ({ ...current, avatar }))}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="ob-sync-gcash">{t(lang, "obDefaultGcash")}</FieldLabel>
                    <Input
                      id="ob-sync-gcash"
                      type="tel"
                      inputMode="tel"
                      enterKeyHint="done"
                      className="font-mono"
                      maxLength={16}
                      value={draft.gcash}
                      placeholder="09XX XXX XXXX"
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, gcash: sanitizeGcash(event.target.value) }))
                      }
                    />
                  </Field>
                </FieldGroup>
              )}
            </div>
          ) : null}

          {error ? <FieldError className="mt-4">{error}</FieldError> : null}
        </main>

        {step === "intent" || showJoinCode || step === "create" || (step === "sync" && !syncing && !profile.name.trim()) ? (
          <footer className="flex shrink-0 flex-col gap-2 border-t bg-background/95 px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] backdrop-blur">
            {step === "intent" ? (
              <div className="flex flex-col gap-3">
                <button type="button" className="text-left" onClick={() => go("join")}>
                  <Card className="min-h-[56px] bg-primary text-primary-foreground">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-primary-foreground">
                        <SmartphoneIcon className="size-4" />
                        {t(lang, "obJoinCode")}
                      </CardTitle>
                      <CardDescription className="text-primary-foreground/80">{t(lang, "obJoinCodeHint")}</CardDescription>
                    </CardHeader>
                  </Card>
                </button>
                <button type="button" className="text-left" onClick={() => go("create")}>
                  <Card className="min-h-[56px] transition-colors hover:bg-muted/40">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <CrownIcon className="size-4" />
                        {t(lang, "obStartLakad")}
                      </CardTitle>
                      <CardDescription>{t(lang, "obStartLakadHint")}</CardDescription>
                    </CardHeader>
                  </Card>
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-[44px] w-full whitespace-normal"
                  onClick={() => void startSync()}
                >
                  <RefreshCwIcon data-icon="inline-start" />
                  {t(lang, "obSyncAccount")}
                </Button>
              </div>
            ) : null}
            {showJoinCode ? (
              <Button
                size="cta"
                disabled={!code.trim()}
                onClick={() => {
                  const short = parseJoinCodeFromInput(code)
                  if (!short) {
                    setError(t(lang, "joinCodeNeed"))
                    return
                  }
                  setError("")
                  setJoinShort(short)
                }}
              >
                {t(lang, "obJoinIn")}
              </Button>
            ) : null}
            {showCreateProfile ? (
              <Button
                size="cta"
                className="min-h-[52px]"
                disabled={!nickReady || !gcashReady}
                onClick={() => {
                  setError("")
                  setCreatePhase("trip")
                }}
              >
                {t(lang, "obContinue")}
              </Button>
            ) : null}
            {showCreateTrip ? (
              <Button
                size="cta"
                className="min-h-[52px]"
                disabled={isCreating || !tripName.trim() || !rosterReady || !nickReady}
                onClick={() => {
                  if (creatingRef.current) return
                  creatingRef.current = true
                  setIsCreating(true)
                  const extra = rosterRef.current?.commitDraft() ?? friends
                  if (!notify(store.startLakad(tripName, extra, openMode, roundTo, draft))) {
                    creatingRef.current = false
                    setIsCreating(false)
                  }
                }}
              >
                🎉 {t(lang, "obStart")}
              </Button>
            ) : null}
            {step === "sync" && !syncing && !profile.name.trim() ? (
              <Button size="cta" className="min-h-[52px]" disabled={!nickReady} onClick={finishSyncProfile}>
                {t(lang, "obContinue")}
              </Button>
            ) : null}
          </footer>
        ) : null}
      </div>
    </div>
  )
}
