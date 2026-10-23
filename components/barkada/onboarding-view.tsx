"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import {
  ArrowLeftIcon,
  BeerIcon,
  CrownIcon,
  LanguagesIcon,
  MoonIcon,
  MountainIcon,
  PalmtreeIcon,
  SmartphoneIcon,
  SunIcon,
  UtensilsCrossedIcon,
} from "lucide-react"

import {
  BarkadaMemberInput,
  type BarkadaMemberInputHandle,
} from "@/components/barkada/barkada-member-input"
import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { isValidGcash, sanitizeGcash } from "@/lib/gcash"
import { personaLabel, t, type CopyKey } from "@/lib/i18n"
import { markJustCreated, parseJoinCodeFromInput } from "@/lib/join-code"
import { sampleReminder } from "@/lib/reminders"
import { useBarkada, type OnboardDraft } from "@/lib/store"
import { AVATARS, PERSONAS, type Persona, type RoundTo } from "@/lib/types"

type Step = "welcome" | "profile" | "path" | "create" | "join"

const HOOKS: { title: CopyKey; body: CopyKey }[] = [
  { title: "obHook1Title", body: "obHook1Body" },
  { title: "obHook2Title", body: "obHook2Body" },
  { title: "obHook3Title", body: "obHook3Body" },
]

const PRESETS: { icon: typeof PalmtreeIcon; key: CopyKey }[] = [
  { icon: PalmtreeIcon, key: "obPresetBeach" },
  { icon: MountainIcon, key: "obPresetHike" },
  { icon: BeerIcon, key: "obPresetBgc" },
  { icon: UtensilsCrossedIcon, key: "obPresetFood" },
]

function emptyDraft(): OnboardDraft {
  return { name: "", gcash: "", avatar: "😎", persona: "default" }
}

export function OnboardingView() {
  const router = useRouter()
  const store = useBarkada()
  const { lang } = store.state
  const { resolvedTheme, setTheme } = useTheme()
  const [step, setStep] = useState<Step>("welcome")
  const [slide, setSlide] = useState(0)
  const [draft, setDraft] = useState<OnboardDraft>(emptyDraft)
  const [tripName, setTripName] = useState("")
  const [friends, setFriends] = useState<string[]>([])
  const [friendDraft, setFriendDraft] = useState("")
  const [openMode, setOpenMode] = useState(false)
  const [roundTo, setRoundTo] = useState<RoundTo>(0)
  const [code, setCode] = useState("")
  const [error, setError] = useState("")
  const [isCreating, setIsCreating] = useState(false)
  const creatingRef = useRef(false)
  const rosterRef = useRef<BarkadaMemberInputHandle>(null)

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
    setStep(next)
  }

  const nickReady = !!draft.name.trim()
  const rosterReady = friends.length > 0 || !!friendDraft.trim()

  return (
    <div className="min-h-dvh overflow-x-hidden bg-muted">
      <div className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col bg-background">
        <header className="flex items-center gap-2 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-2">
          {step === "welcome" ? (
            <div className="min-w-0 flex-1">
              <p className="font-heading text-lg font-extrabold tracking-tight">Barkada Split</p>
            </div>
          ) : (
            <>
              <Button
                variant="outline"
                size="icon"
                className="size-11 shrink-0"
                aria-label={t(lang, "back")}
                onClick={() => {
                  if (step === "profile") go("welcome")
                  else if (step === "path") go("profile")
                  else go("path")
                }}
              >
                <ArrowLeftIcon />
              </Button>
              <p className="min-w-0 flex-1 text-sm font-semibold text-muted-foreground">
                {t(
                  lang,
                  step === "profile"
                    ? "obProfileStep"
                    : step === "path"
                      ? "obPathStep"
                      : step === "create"
                        ? "obCreateStep"
                        : "obJoinStep"
                )}
              </p>
            </>
          )}
          <Button variant="outline" size="icon" className="size-11" aria-label={t(lang, "lang")} onClick={store.toggleLang}>
            <LanguagesIcon />
          </Button>
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

        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto px-4 py-4">
          {step === "welcome" ? (
            <div className="flex flex-1 flex-col justify-center gap-6">
              <div className="flex flex-col gap-3">
                <h1 className="font-heading text-4xl leading-tight font-extrabold tracking-tight wrap-break-word">
                  {t(lang, HOOKS[slide].title)}
                </h1>
                <p className="text-base text-muted-foreground wrap-break-word">{t(lang, HOOKS[slide].body)}</p>
              </div>
              <div className="flex gap-2" role="tablist" aria-label="Welcome">
                {HOOKS.map((hook, index) => (
                  <button
                    key={hook.title}
                    type="button"
                    role="tab"
                    aria-selected={slide === index}
                    aria-label={t(lang, hook.title)}
                    className="flex min-h-[28px] min-w-[28px] items-center justify-center"
                    onClick={() => setSlide(index)}
                  >
                    <span
                      className={`h-2.5 rounded-full transition-all ${slide === index ? "w-6 bg-foreground" : "w-2.5 bg-muted-foreground/40"}`}
                    />
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {step === "profile" ? (
            <div className="flex flex-col gap-5">
              <h1 className="font-heading text-3xl font-extrabold tracking-tight wrap-break-word">
                {t(lang, "obProfileTitle")}
              </h1>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="ob-nick">{t(lang, "obNick")}</FieldLabel>
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
                  <div className="no-scrollbar -mx-4 min-w-0 overflow-x-auto overscroll-x-contain snap-x px-1 py-1">
                    <div className="flex w-max gap-2">
                      {AVATARS.map((avatar) => (
                        <Button
                          key={avatar}
                          type="button"
                          variant={draft.avatar === avatar ? "default" : "outline"}
                          className="size-11 shrink-0 snap-start text-lg"
                          aria-pressed={draft.avatar === avatar}
                          onClick={() => setDraft((current) => ({ ...current, avatar }))}
                        >
                          {avatar}
                        </Button>
                      ))}
                    </div>
                  </div>
                </Field>
                <Field>
                  <FieldLabel htmlFor="ob-gcash">{t(lang, "obDefaultGcash")}</FieldLabel>
                  <Input
                    id="ob-gcash"
                    type="tel"
                    inputMode="tel"
                    enterKeyHint="done"
                    className="font-mono"
                    maxLength={16}
                    value={draft.gcash}
                    placeholder="09XX XXX XXXX"
                    onChange={(event) => setDraft((current) => ({ ...current, gcash: sanitizeGcash(event.target.value) }))}
                  />
                </Field>
                <Field>
                  <FieldLabel>{t(lang, "obPersona")}</FieldLabel>
                  <div className="no-scrollbar -mx-4 min-w-0 overflow-x-auto overscroll-x-contain snap-x px-4">
                    <ToggleGroup
                      variant="outline"
                      spacing={2}
                      className="max-w-none flex-nowrap"
                      value={[draft.persona]}
                      onValueChange={(next) => {
                        const picked = next[next.length - 1] as Persona | undefined
                        if (picked) setDraft((current) => ({ ...current, persona: picked }))
                      }}
                    >
                      {PERSONAS.map((item) => (
                        <ToggleGroupItem key={item.id} value={item.id} className="min-h-[40px] shrink-0 snap-start px-3.5">
                          {personaLabel(lang, item.id)}
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                  </div>
                  <p className="text-sm text-muted-foreground wrap-break-word">
                    {sampleReminder(draft.persona, lang, draft.name || "Bea").split("\n")[0]}
                  </p>
                </Field>
              </FieldGroup>
            </div>
          ) : null}

          {step === "path" ? (
            <div className="flex flex-col gap-4">
              <h1 className="font-heading text-3xl font-extrabold tracking-tight wrap-break-word">
                {t(lang, "obPathTitle")}
              </h1>
              <button type="button" className="text-left" onClick={() => go("create")}>
                <Card className="transition-colors hover:bg-muted/40">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CrownIcon className="size-4" />
                      {t(lang, "obStartLakad")}
                    </CardTitle>
                    <CardDescription>{t(lang, "obStartLakadHint")}</CardDescription>
                  </CardHeader>
                </Card>
              </button>
              <button type="button" className="text-left" onClick={() => go("join")}>
                <Card className="transition-colors hover:bg-muted/40">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <SmartphoneIcon className="size-4" />
                      {t(lang, "obJoinCode")}
                    </CardTitle>
                    <CardDescription>{t(lang, "obJoinCodeHint")}</CardDescription>
                  </CardHeader>
                </Card>
              </button>
            </div>
          ) : null}

          {step === "create" ? (
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
                    {PRESETS.map((preset) => {
                      const Icon = preset.icon
                      return (
                        <Button
                          key={preset.key}
                          type="button"
                          variant="outline"
                          className="h-11"
                          onClick={() => setTripName(t(lang, preset.key))}
                        >
                          <Icon data-icon="inline-start" />
                          {t(lang, preset.key)}
                        </Button>
                      )
                    })}
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
                      label: t(lang, "obYouTreas"),
                    }}
                  />
                </Field>
                <Field>
                  <FieldLabel>{t(lang, "obRules")}</FieldLabel>
                  <div className="flex items-center justify-between gap-3 rounded-xl border px-3 py-3">
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

          {step === "join" ? (
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

          {error ? <FieldError className="mt-4">{error}</FieldError> : null}
        </main>

        {step !== "path" ? (
          <footer className="flex flex-col gap-2 border-t bg-background/95 px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] backdrop-blur">
            {step === "welcome" ? (
              <>
                <Button
                  size="cta"
                  onClick={() => {
                    if (slide < HOOKS.length - 1) setSlide(slide + 1)
                    else go("profile")
                  }}
                >
                  {slide < HOOKS.length - 1 ? t(lang, "obNext") : t(lang, "obSetup")}
                </Button>
              </>
            ) : null}
            {step === "profile" ? (
              <Button
                size="cta"
                disabled={!nickReady}
                onClick={() => {
                  if (!isValidGcash(draft.gcash)) {
                    setError(t(lang, "badGcash"))
                    return
                  }
                  go("path")
                }}
              >
                {t(lang, "obContinue")}
              </Button>
            ) : null}
            {step === "create" ? (
              <Button
                size="cta"
                disabled={isCreating || !tripName.trim() || !rosterReady}
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
                {t(lang, "obStart")}
              </Button>
            ) : null}
            {step === "join" ? (
              <Button
                size="cta"
                disabled={!code.trim()}
                onClick={() => {
                  const short = parseJoinCodeFromInput(code)
                  if (!short) {
                    setError(t(lang, "joinCodeNeed"))
                    return
                  }
                  store.saveProfile(draft)
                  router.push("/join/" + short)
                }}
              >
                {t(lang, "obJoinIn")}
              </Button>
            ) : null}
          </footer>
        ) : null}
      </div>
    </div>
  )
}
