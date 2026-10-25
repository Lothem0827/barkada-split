"use client"

import { useEffect, useState } from "react"
import {
  CrownIcon,
  SettingsIcon,
  SirenIcon,
  Trash2Icon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react"

import { ArmButton } from "@/components/barkada/arm-button"
import { Button } from "@/components/ui/button"
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { toast } from "@/components/ui/toast"
import { t } from "@/lib/i18n"
import { useBarkada } from "@/lib/store"
import { emergencyLogOf, type EmergencyAction, type Lang, type RoundTo } from "@/lib/types"

export function LakadSettingsSheet({
  open,
  onOpenChange,
  onDeleteTrip,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleteTrip: () => void
}) {
  const { state, trip, treasurer, renameTrip, setOpen, setRoundTo, setTab, handoff, emergencyTakeover } =
    useBarkada()
  const { lang, as } = state
  const [lakadName, setLakadName] = useState("")
  const [pendingHandoffId, setPendingHandoffId] = useState("")
  const [takeoverOpen, setTakeoverOpen] = useState(false)
  const [takeoverId, setTakeoverId] = useState("")
  const [takeoverReason, setTakeoverReason] = useState("")
  const [takeoverError, setTakeoverError] = useState("")

  useEffect(() => {
    if (!open) {
      setPendingHandoffId("")
      setTakeoverOpen(false)
      setTakeoverReason("")
      setTakeoverError("")
      return
    }
    if (trip) setLakadName(trip.name)
  }, [open, trip])

  if (!trip) return null
  const live = trip
  const others = live.members.filter((member) => member.id !== live.treasurer)
  const pending = others.find((member) => member.id === pendingHandoffId) ?? null
  const treasName = live.members.find((member) => member.id === live.treasurer)?.name || "?"
  const emergencyLog = emergencyLogOf(live)
  const takeoverCandidates = live.members.filter((member) => member.id !== live.treasurer)
  const selectedTakeover =
    takeoverCandidates.some((member) => member.id === takeoverId) ? takeoverId : takeoverCandidates[0]?.id || ""

  function notify(message: string) {
    toast.add({ title: message, timeout: 1800 })
  }

  function commitName() {
    if (lakadName.trim() === live.name) return
    const result = renameTrip(lakadName)
    if (!result.ok) {
      setLakadName(live.name)
      notify(result.message)
      return
    }
    notify(result.message)
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange} swipeDirection="down" showSwipeHandle>
      <DrawerContent className="mx-auto">
        <DrawerHeader>
          <div className="flex items-start justify-between gap-2 text-left">
            <DrawerTitle className="flex items-start gap-2 wrap-break-word pr-2">
              <SettingsIcon className="mt-0.5 size-4 shrink-0" />
              <span>{t(lang, "lakadSettings").replace("{name}", live.name)}</span>
            </DrawerTitle>
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
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-3 pb-[max(16px,env(safe-area-inset-bottom))]">
          <section className="flex flex-col gap-2">
            <label htmlFor="t-lakad-name" className="text-sm text-muted-foreground">
              {t(lang, "tripName")}
            </label>
            <div className="overflow-hidden rounded-2xl bg-muted">
              <div className="px-4 py-3">
                <Input
                  id="t-lakad-name"
                  maxLength={80}
                  value={lakadName}
                  onChange={(event) => setLakadName(event.target.value)}
                  onBlur={commitName}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault()
                      commitName()
                    }
                  }}
                />
              </div>
              <button
                type="button"
                className="w-full border-t border-border/60 px-4 py-3 text-left text-sm text-muted-foreground"
                onClick={() => {
                  onOpenChange(false)
                  setTab("barkada")
                }}
              >
                {t(lang, "goToRoster")}
              </button>
            </div>
          </section>

          {treasurer ? (
            <section className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">{t(lang, "approvalSection")}</p>
              <div className="rounded-2xl bg-muted px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{t(lang, "openModeOn")}</p>
                    <p className="text-xs text-muted-foreground">
                      {t(lang, live.open ? "openOn" : "openOff")}
                    </p>
                  </div>
                  <Switch
                    checked={live.open}
                    onCheckedChange={(checked) => {
                      const result = setOpen(checked)
                      notify(result.message)
                    }}
                  />
                </div>
              </div>
            </section>
          ) : null}

          {treasurer ? (
            <section className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">{t(lang, "barya")}</p>
              <div className="rounded-2xl bg-muted px-4 py-3">
                <ToggleGroup
                  variant="outline"
                  spacing={1}
                  className="flex-wrap"
                  value={[String(live.roundTo || 0)]}
                  onValueChange={(next) => {
                    const picked = next[next.length - 1]
                    if (picked === "0" || picked === "100" || picked === "500") {
                      const result = setRoundTo(Number(picked) as RoundTo)
                      notify(result.message)
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
                <p className="mt-2 text-xs text-muted-foreground">{t(lang, "butalRoundHint")}</p>
              </div>
            </section>
          ) : null}

          {treasurer && others.length ? (
            <section className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">{t(lang, "dangerSection")}</p>
              <div className="rounded-2xl bg-muted px-4 py-3">
                <p className="mb-2 text-sm font-medium">{t(lang, "handoff")}</p>
                <div className="flex flex-wrap gap-2">
                  {others.map((member) => (
                    <Button
                      key={member.id}
                      size="touch"
                      variant={pendingHandoffId === member.id ? "default" : "outline"}
                      aria-pressed={pendingHandoffId === member.id}
                      onClick={() =>
                        setPendingHandoffId((current) => (current === member.id ? "" : member.id))
                      }
                    >
                      <CrownIcon data-icon="inline-start" />
                      {member.name}
                    </Button>
                  ))}
                </div>
                {pending ? (
                  <div className="mt-3">
                    <p className="text-sm">{t(lang, "crownPassAsk").replace("{name}", pending.name)}</p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <Button
                        className="btn-primary min-h-[44px]"
                        onClick={() => {
                          const result = handoff(pending.id)
                          if (result.ok) setPendingHandoffId("")
                          notify(result.message)
                        }}
                      >
                        <CrownIcon data-icon="inline-start" />
                        {t(lang, "crownPassConfirm").replace("{name}", pending.name)}
                      </Button>
                      <Button
                        variant="secondary"
                        className="btn-soft min-h-[44px]"
                        onClick={() => setPendingHandoffId("")}
                      >
                        {t(lang, "cancel")}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          {!treasurer && takeoverCandidates.length ? (
            <section className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">{t(lang, "dangerSection")}</p>
              <div className="overflow-hidden rounded-2xl bg-muted">
                <button
                  type="button"
                  className="flex w-full items-center gap-1 px-4 py-3 text-left text-sm font-medium text-destructive"
                  onClick={() => {
                    setTakeoverOpen((next) => !next)
                    setTakeoverError("")
                    if (!takeoverId) {
                      setTakeoverId(takeoverCandidates.some((member) => member.id === as) ? as : takeoverCandidates[0].id)
                    }
                  }}
                >
                  <TriangleAlertIcon className="size-3.5" />
                  {t(lang, "emergencyTakeoverBtn")}
                </button>
                {takeoverOpen ? (
                  <div className="flex flex-col gap-3 border-t border-border/60 px-4 py-3">
                    <p className="text-xs text-muted-foreground">
                      {t(lang, "emergencyTakeoverWarn").replace("{name}", treasName)}
                    </p>
                    <FieldGroup>
                      <Field>
                        <FieldLabel htmlFor="f-takeover-who">{t(lang, "emergencyTakeoverWho")}</FieldLabel>
                        <select
                          id="f-takeover-who"
                          className="h-11 w-full rounded-lg border border-input bg-transparent px-2.5 text-base"
                          value={selectedTakeover}
                          onChange={(event) => {
                            setTakeoverId(event.target.value)
                            setTakeoverError("")
                          }}
                        >
                          {takeoverCandidates.map((member) => (
                            <option key={member.id} value={member.id}>
                              {member.name}
                              {member.id === as ? ` (${t(lang, "you")})` : ""}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field data-invalid={takeoverError ? true : undefined}>
                        <FieldLabel htmlFor="f-takeover-reason">{t(lang, "emergencyTakeoverReason")}</FieldLabel>
                        <Input
                          id="f-takeover-reason"
                          autoComplete="off"
                          maxLength={180}
                          value={takeoverReason}
                          placeholder={t(lang, "emergencyTakeoverReasonPh")}
                          aria-invalid={takeoverError ? true : undefined}
                          aria-describedby={takeoverError ? "f-takeover-reason-error" : undefined}
                          onChange={(event) => {
                            setTakeoverReason(event.target.value)
                            setTakeoverError("")
                          }}
                        />
                        {takeoverError ? <FieldError id="f-takeover-reason-error">{takeoverError}</FieldError> : null}
                      </Field>
                    </FieldGroup>
                    <ArmButton
                      variant="destructive"
                      className="btn-danger min-h-[48px] w-full"
                      label={
                        <>
                          <SirenIcon className="size-4" />
                          {t(lang, "emergencyTakeoverConfirm")}
                        </>
                      }
                      armedLabel={t(lang, "sure")}
                      cancelLabel={t(lang, "cancel")}
                      onConfirm={() => {
                        const result = emergencyTakeover(selectedTakeover, takeoverReason)
                        if (!result.ok) {
                          setTakeoverError(result.message)
                          return
                        }
                        setTakeoverOpen(false)
                        setTakeoverReason("")
                        setTakeoverError("")
                        toast.add({ title: result.message, timeout: 3200 })
                      }}
                    />
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          {treasurer ? (
            <div className="overflow-hidden rounded-2xl bg-muted">
              <ArmButton
                variant="destructive"
                className="w-full"
                label={
                  <>
                    <Trash2Icon className="size-4" />
                    {t(lang, "delTrip")}
                  </>
                }
                armedLabel={t(lang, "sureDelForever")}
                cancelLabel={t(lang, "cancel")}
                onConfirm={onDeleteTrip}
              />
            </div>
          ) : null}

          {emergencyLog.length ? (
            <section className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">{t(lang, "emergencyHistory")}</p>
              <details className="rounded-2xl bg-muted px-4 py-3">
                <summary className="cursor-pointer text-sm font-medium">{t(lang, "emergencyHistory")}</summary>
                <ul className="mt-3 flex flex-col gap-3">
                  {[...emergencyLog]
                    .sort((a, b) => b.ts - a.ts)
                    .map((entry) => (
                      <li key={entry.id} className="flex flex-col gap-0.5 border-t border-border/60 pt-2 first:border-t-0 first:pt-0">
                        <p className="text-sm font-medium">{emergencyActionLabel(lang, entry.action)}</p>
                        <p className="text-xs text-muted-foreground">{entry.actorName}</p>
                        {entry.details ? <p className="text-xs text-muted-foreground">{entry.details}</p> : null}
                        <p className="text-xs text-muted-foreground">{formatEmergencyTime(entry.ts)}</p>
                      </li>
                    ))}
                </ul>
              </details>
            </section>
          ) : null}
        </div>
      </DrawerContent>
    </Drawer>
  )
}

function emergencyActionLabel(lang: Lang, action: EmergencyAction) {
  if (action === "treasurer_takeover") return t(lang, "emergencyActionTakeover")
  if (action === "lock_reset") return t(lang, "emergencyActionLock")
  return t(lang, "emergencyActionCrown")
}

function formatEmergencyTime(ts: number) {
  try {
    return new Date(ts).toLocaleString()
  } catch {
    return String(ts)
  }
}
