"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { XIcon } from "lucide-react"

import { ArmButton } from "@/components/barkada/arm-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { toast } from "@/components/ui/toast"
import { sanitizeGcash } from "@/lib/gcash"
import { linkGoogleCopyKey, t, type CopyKey } from "@/lib/i18n"
import { sampleReminder } from "@/lib/reminders"
import { useBarkada, useBarkadaStore } from "@/lib/store"
import { getAuthUser, isSupabaseConfigured, linkGoogle } from "@/lib/supabase"
import {
  AVATARS,
  LANGS,
  PERSONAS,
  initial,
  memberName,
  type Lang,
  type Persona,
} from "@/lib/types"

const PERSONA_COPY: Record<Persona, CopyKey> = {
  default: "personaDefault",
  conyo: "personaConyo",
  tita: "personaTita",
  corporate: "personaCorporate",
  guilttrip: "personaGuilt",
}

const LANG_COPY: Record<Lang, CopyKey> = {
  tl: "langTaglish",
  en: "langEnglish",
  ceb: "langBisaya",
}

const THEME_COPY = {
  system: "themeSystem",
  light: "themeLight",
  dark: "themeDark",
} as const

type ThemeChoice = keyof typeof THEME_COPY

export function useGoogleAccount() {
  const mockGoogleEmail = useBarkadaStore((store) => store.state.mockGoogleEmail)
  const [email, setEmail] = useState("")
  const [google, setGoogle] = useState(false)

  const refresh = useCallback(() => {
    if (!isSupabaseConfigured()) {
      setEmail("")
      setGoogle(false)
      return
    }
    void getAuthUser().then((user) => {
      setEmail(user.email)
      setGoogle(user.google)
    })
  }, [])

  useEffect(() => {
    refresh()
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh()
    }
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("focus", onVisible)
    return () => {
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("focus", onVisible)
    }
  }, [refresh])

  const linkedEmail = email || mockGoogleEmail
  return { email: linkedEmail, linked: google || !!linkedEmail, refresh }
}

export function ProfilePill({ onClick }: { onClick: () => void }) {
  const { state, trip } = useBarkada()
  const { linked } = useGoogleAccount()
  const fromTrip = trip ? memberName(trip, state.as) : ""
  const name = state.profile.name || fromTrip || t(state.lang, "openProfile")
  const mark = state.profile.avatar || initial(name)

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t(state.lang, "openProfile")}
      className="flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 transition active:scale-95"
    >
      <span className="shrink-0 text-base">{mark}</span>
      <span className="max-w-[72px] truncate text-sm font-bold">{name}</span>
      <span
        className={`size-2 shrink-0 rounded-full ${linked ? "bg-emerald-500" : "bg-amber-400"}`}
        aria-hidden
      />
    </button>
  )
}

export function ViewAsBar({ className }: { className?: string }) {
  const { state, trip, setAs } = useBarkada()
  const { lang, as } = state
  if (!trip) return null

  return (
    <div className={`flex flex-col gap-2 ${className ?? ""}`}>
      <span className="text-sm font-medium text-muted-foreground">{t(lang, "viewAs")}</span>
      <div className="no-scrollbar -mx-4 min-w-0 overflow-x-auto overscroll-x-contain snap-x px-4">
        <ToggleGroup
          variant="outline"
          spacing={2}
          className="max-w-none flex-nowrap"
          value={[as]}
          onValueChange={(next) => {
            const picked = next[next.length - 1]
            if (!picked) return
            const result = setAs(picked)
            toast.add({ title: result.message, timeout: 1800 })
          }}
        >
          {trip.members.map((member) => (
            <ToggleGroupItem key={member.id} value={member.id} className="min-h-[40px] shrink-0 snap-start px-3.5">
              {member.name}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
    </div>
  )
}

function TimeTravelBar({ className }: { className?: string }) {
  const { state, timeTravel } = useBarkada()
  const { lang } = state

  function run(days: number) {
    const result = timeTravel(days)
    toast.add({ title: result.message, timeout: 1800 })
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className ?? ""}`}>
      <Button variant="outline" className="min-h-[40px] flex-1 px-3.5" onClick={() => run(-1)}>
        {t(lang, "minus1d")}
      </Button>
      <Button variant="outline" className="min-h-[40px] flex-1 px-3.5" onClick={() => run(3)}>
        {t(lang, "plus3d")}
      </Button>
      <Button variant="ghost" className="min-h-[40px] flex-1 px-3.5" onClick={() => run(0)}>
        {t(lang, "timeReset")}
      </Button>
    </div>
  )
}

export function ProfileSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter()
  const { state, saveProfile, setLang, setPersona, setRecoveryPin, setMockGoogleEmail, replayOnboarding } = useBarkada()
  const { lang, profile, persona, lastSyncedAt, recoveryPinHash, showTestTools } = state
  const { theme, setTheme } = useTheme()
  const { email, linked, refresh } = useGoogleAccount()
  const [mounted, setMounted] = useState(false)
  const [name, setName] = useState(profile.name)
  const [gcash, setGcash] = useState(profile.gcash)
  const [bankNote, setBankNote] = useState(profile.bankNote)
  const [avatar, setAvatar] = useState(profile.avatar)
  const [pin, setPin] = useState("")

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!open) return
    setName(profile.name)
    setGcash(profile.gcash)
    setBankNote(profile.bankNote)
    setAvatar(profile.avatar)
    setPin("")
  }, [open, profile])

  const currentTheme: ThemeChoice =
    mounted && (theme === "light" || theme === "dark" || theme === "system") ? theme : "system"

  function notify(message: string) {
    toast.add({ title: message, timeout: 1800 })
  }

  function saveIdentity() {
    const result = saveProfile({
      name,
      gcash,
      avatar,
      persona,
      bankNote,
    })
    notify(result.message)
  }

  function linkAccount() {
    if (!isSupabaseConfigured()) {
      setMockGoogleEmail(email || "bea@gmail.com")
      notify(t(lang, "mockGoogleOn"))
      return
    }
    void linkGoogle().then((result) => {
      toast.add({
        title: t(lang, linkGoogleCopyKey(result.reason)),
        timeout: result.ok ? 1800 : 4200,
      })
      refresh()
    })
  }

  function savePin() {
    void setRecoveryPin(pin).then((result) => {
      notify(result.message)
      if (result.ok) setPin("")
    })
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange} swipeDirection="down" showSwipeHandle>
      <DrawerContent className="mx-auto max-w-[560px]">
        <DrawerHeader>
          <div className="flex items-start justify-between gap-2 text-left">
            <DrawerTitle className="wrap-break-word pr-2">{t(lang, "profileTitle")}</DrawerTitle>
            <Button
              variant="ghost"
              size="icon"
              className="size-11 shrink-0"
              aria-label={t(lang, "done")}
              onClick={() => onOpenChange(false)}
            >
              <XIcon />
            </Button>
          </div>
        </DrawerHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 py-3 pb-[max(16px,env(safe-area-inset-bottom))]">
          <section className="flex flex-col gap-3">
            <h3 className="font-heading text-sm font-semibold">{t(lang, "identitySection")}</h3>
            <FieldGroup>
              <Field>
                <FieldLabel>{t(lang, "obAvatar")}</FieldLabel>
                <div className="no-scrollbar -mx-4 min-w-0 overflow-x-auto overscroll-x-contain snap-x px-1 py-1">
                  <div className="flex w-max gap-2">
                    {AVATARS.map((item) => (
                      <Button
                        key={item}
                        type="button"
                        variant={avatar === item ? "default" : "outline"}
                        className="size-11 shrink-0 snap-start text-lg"
                        aria-pressed={avatar === item}
                        onClick={() => setAvatar(item)}
                      >
                        {item}
                      </Button>
                    ))}
                  </div>
                </div>
              </Field>
              <Field>
                <FieldLabel htmlFor="profile-nick">{t(lang, "obNick")}</FieldLabel>
                <Input
                  id="profile-nick"
                  enterKeyHint="next"
                  maxLength={24}
                  value={name}
                  placeholder={t(lang, "obNickPh")}
                  onChange={(event) => setName(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="profile-gcash">{t(lang, "obDefaultGcash")}</FieldLabel>
                <Input
                  id="profile-gcash"
                  type="tel"
                  inputMode="tel"
                  enterKeyHint="next"
                  className="font-mono"
                  maxLength={16}
                  value={gcash}
                  placeholder="0917-XXX-XXXX"
                  onChange={(event) => setGcash(sanitizeGcash(event.target.value))}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="profile-bank">{t(lang, "bankNote")}</FieldLabel>
                <Input
                  id="profile-bank"
                  enterKeyHint="done"
                  maxLength={80}
                  value={bankNote}
                  placeholder={t(lang, "bankNotePh")}
                  onChange={(event) => setBankNote(event.target.value)}
                />
                <FieldDescription>{t(lang, "bankNoteHint")}</FieldDescription>
              </Field>
            </FieldGroup>
            <Button className="min-h-[48px] w-full" onClick={saveIdentity}>
              {t(lang, "saveProfile")}
            </Button>
          </section>

          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                {t(lang, "accountSection")}
                {linked ? (
                  <Badge variant="secondary">🟢 {t(lang, "syncedGoogle")}</Badge>
                ) : (
                  <Badge variant="outline">🟡 {t(lang, "guestBadge")}</Badge>
                )}
              </CardTitle>
              <CardDescription>
                {linked
                  ? `${email}${lastSyncedAt ? " · " + t(lang, "lastSynced") + " " + formatSynced(lastSyncedAt) : " · " + t(lang, "neverSynced")}`
                  : t(lang, "googleHintProfile")}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {!linked ? (
                <Button className="min-h-[48px] w-full" variant="outline" onClick={linkAccount}>
                  {t(lang, "linkGoogleBackup")}
                </Button>
              ) : null}
              <Field>
                <FieldLabel htmlFor="profile-pin">{t(lang, "recoveryPin")}</FieldLabel>
                <div className="flex gap-2">
                  <Input
                    id="profile-pin"
                    type="tel"
                    inputMode="numeric"
                    maxLength={4}
                    className="font-mono"
                    value={pin}
                    placeholder={t(lang, "claimPinPh")}
                    onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
                  />
                  <Button variant="outline" className="min-h-[44px] shrink-0 px-4" onClick={savePin}>
                    {t(lang, "save")}
                  </Button>
                </div>
                <FieldDescription>
                  {recoveryPinHash ? t(lang, "recoveryPinSet") + " · " : ""}
                  {t(lang, "recoveryPinHint")}
                </FieldDescription>
              </Field>
            </CardContent>
          </Card>

          <section className="flex flex-col gap-4">
            <h3 className="font-heading text-sm font-semibold">{t(lang, "prefsSection")}</h3>
            <Field>
              <FieldLabel>{t(lang, "langUi")}</FieldLabel>
              <div className="no-scrollbar -mx-4 min-w-0 overflow-x-auto overscroll-x-contain snap-x px-4">
                <ToggleGroup
                  variant="outline"
                  spacing={2}
                  className="max-w-none flex-nowrap"
                  value={[lang]}
                  onValueChange={(next) => {
                    const picked = next[next.length - 1] as Lang | undefined
                    if (picked) setLang(picked)
                  }}
                >
                  {LANGS.map((item) => (
                    <ToggleGroupItem key={item} value={item} className="min-h-[40px] shrink-0 snap-start px-3.5">
                      {t(lang, LANG_COPY[item])}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
            </Field>
            <Field>
              <FieldLabel>{t(lang, "appearance")}</FieldLabel>
              <ToggleGroup
                variant="outline"
                spacing={2}
                className="max-w-none"
                value={[currentTheme]}
                onValueChange={(next) => {
                  const picked = next[next.length - 1] as ThemeChoice | undefined
                  if (picked) setTheme(picked)
                }}
              >
                {(Object.keys(THEME_COPY) as ThemeChoice[]).map((item) => (
                  <ToggleGroupItem key={item} value={item} className="min-h-[40px] flex-1 px-3">
                    {t(lang, THEME_COPY[item])}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>
            <Field>
              <FieldLabel>{t(lang, "defaultPersona")}</FieldLabel>
              <div className="no-scrollbar -mx-4 min-w-0 overflow-x-auto overscroll-x-contain snap-x px-4">
                <ToggleGroup
                  variant="outline"
                  spacing={2}
                  className="max-w-none flex-nowrap"
                  value={[persona]}
                  onValueChange={(next) => {
                    const picked = next[next.length - 1] as Persona | undefined
                    if (picked) setPersona(picked)
                  }}
                >
                  {PERSONAS.map((item) => (
                    <ToggleGroupItem key={item.id} value={item.id} className="min-h-[40px] shrink-0 snap-start px-3.5">
                      {t(lang, PERSONA_COPY[item.id])}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
              <FieldDescription>{sampleReminder(persona, lang, name || profile.name || "Bea").split("\n")[0]}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel>
                {t(lang, "demoTime")}
                {state.offset ? ` · ${state.offset > 0 ? "+" : ""}${state.offset}d` : ""}
              </FieldLabel>
              <TimeTravelBar />
            </Field>
          </section>

          <section className="flex flex-col gap-3">
            <h3 className="font-heading text-sm font-semibold">{t(lang, "testSection")}</h3>
            {showTestTools ? <ViewAsBar /> : null}
            <ArmButton
              className="min-h-[42px] w-full"
              label={t(lang, "replayReset")}
              armedLabel={t(lang, "replaySureReset")}
              cancelLabel={t(lang, "cancel")}
              onConfirm={() => {
                const result = replayOnboarding()
                notify(result.message)
                if (result.ok) {
                  onOpenChange(false)
                  router.replace("/onboarding")
                }
              }}
            />
          </section>
        </div>
      </DrawerContent>
    </Drawer>
  )
}

function formatSynced(ts: number) {
  return new Date(ts).toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}
