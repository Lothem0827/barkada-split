"use client"

import { useEffect, useRef, useState } from "react"
import { ClipboardIcon, XIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { toast } from "@/components/ui/toast"
import { t } from "@/lib/i18n"
import { inviteUrl } from "@/lib/join-code"
import { isSeedTripId } from "@/lib/merge-trip"
import { useBarkada } from "@/lib/store"
import {
  emergencyLogOf,
  initial,
  isOwnerName,
  memberCanRemove,
  type EmergencyAction,
  type Lang,
  type RoundTo,
} from "@/lib/types"

export function LakadSettingsSheet({
  open,
  onOpenChange,
  onEditMember,
  onInvite,
  onHandoff,
  onResetLock,
  onDeleteTrip,
  onCopy,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onEditMember: (id: string) => void
  onInvite: (memberId?: string) => void
  onHandoff: (id: string, name: string) => void
  onResetLock: (id: string, name: string) => void
  onDeleteTrip: () => void
  onCopy: (text: string, label: string) => boolean | void | Promise<boolean | void>
}) {
  const { state, trip, treasurer, addMember, removeMember, setGcash, setOpen, setRoundTo, emergencyTakeover } =
    useBarkada()
  const { lang, as, profile } = state
  const [friendName, setFriendName] = useState("")
  const [friendGcash, setFriendGcash] = useState("")
  const [addError, setAddError] = useState("")
  const [takeoverOpen, setTakeoverOpen] = useState(false)
  const [takeoverId, setTakeoverId] = useState("")
  const [takeoverReason, setTakeoverReason] = useState("")
  const [takeoverError, setTakeoverError] = useState("")
  const gcashRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) return
    setTakeoverOpen(false)
    setTakeoverReason("")
    setTakeoverError("")
  }, [open])

  if (!trip) return null
  const live = trip
  const liveInvite = !isSeedTripId(live.id)
  const others = live.members.filter((member) => member.id !== live.treasurer)
  const treasName = live.members.find((member) => member.id === live.treasurer)?.name || "?"
  const emergencyLog = emergencyLogOf(live)
  const takeoverCandidates = live.members.filter((member) => member.id !== live.treasurer)
  const selectedTakeover =
    takeoverCandidates.some((member) => member.id === takeoverId) ? takeoverId : takeoverCandidates[0]?.id || ""

  function notify(message: string) {
    toast.add({ title: message, timeout: 1800 })
  }

  function submitFriend() {
    const result = addMember(friendName, friendGcash)
    if (!result.ok) {
      setAddError(result.message)
      return
    }
    setAddError("")
    setFriendName("")
    setFriendGcash("")
    notify(result.message)
  }

  async function copyInvite() {
    const url = inviteUrl(live.joinCode)
    const message = t(lang, "inviteMsg")
      .replace("{name}", live.name)
      .replace("{url}", url)
      .replace("{code}", live.joinCode)
    await onCopy(message, t(lang, "inviteCopied"))
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange} swipeDirection="down" showSwipeHandle>
      <DrawerContent className="mx-auto max-w-[560px]">
        <DrawerHeader>
          <div className="flex items-start justify-between gap-2 text-left">
            <DrawerTitle className="wrap-break-word pr-2">
              {t(lang, "lakadSettings").replace("{name}", live.name)}
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
          <section className="flex flex-col gap-3">
            <h3 className="font-heading text-sm font-semibold">👥 {t(lang, "rosterSection")}</h3>
            <ItemGroup>
              {live.members.map((member) => {
                const claimed = !!member.claimedByUid
                const mark = isOwnerName(profile, member.name) ? profile.avatar : initial(member.name)
                return (
                  <Item key={member.id}>
                    <ItemContent>
                      <ItemTitle className="flex-wrap">
                        <span className="grid size-6 place-items-center rounded-full bg-muted text-xs font-bold">
                          {mark}
                        </span>
                        {member.name}
                        {claimed ? (
                          <Badge variant="secondary">🟢 {t(lang, "joined")}</Badge>
                        ) : (
                          <Badge variant="outline">⏳ {t(lang, "unclaimed")}</Badge>
                        )}
                        {member.id === live.treasurer ? <Badge>👑 {t(lang, "treas")}</Badge> : null}
                        {member.id === as ? <Badge variant="secondary">{t(lang, "you")}</Badge> : null}
                      </ItemTitle>
                      <ItemDescription className="font-mono select-all">
                        {member.gcash || t(lang, "noGcashMember")}
                      </ItemDescription>
                    </ItemContent>
                    <ItemActions>
                      {!claimed && liveInvite ? (
                        <Button size="touch" className="min-h-[38px]" onClick={() => onInvite(member.id)}>
                          {t(lang, "inviteName").replace("{name}", member.name)}
                        </Button>
                      ) : treasurer && claimed ? (
                        <Button
                          size="touch"
                          variant="ghost"
                          className="min-h-[38px]"
                          onClick={() => onResetLock(member.id, member.name)}
                        >
                          {t(lang, "resetLock")}
                        </Button>
                      ) : null}
                      {treasurer || member.id === as ? (
                        <Button size="touch" variant="outline" onClick={() => onEditMember(member.id)}>
                          {t(lang, "edit")}
                        </Button>
                      ) : null}
                      {treasurer && memberCanRemove(live, member.id) ? (
                        <Button
                          size="touch"
                          variant="ghost"
                          className="min-h-[38px] text-muted-foreground"
                          onClick={() => {
                            const result = removeMember(member.id)
                            notify(result.message)
                          }}
                        >
                          🗑️ {t(lang, "removeMember")}
                        </Button>
                      ) : null}
                    </ItemActions>
                  </Item>
                )
              })}
            </ItemGroup>
            {treasurer ? (
              <form
                className="flex flex-col gap-3"
                onSubmit={(event) => {
                  event.preventDefault()
                  submitFriend()
                }}
              >
                <FieldGroup>
                  <Field data-invalid={addError ? true : undefined}>
                    <FieldLabel htmlFor="f-friend-name">{t(lang, "addFriendName")}</FieldLabel>
                    <Input
                      id="f-friend-name"
                      enterKeyHint="next"
                      autoComplete="off"
                      maxLength={40}
                      value={friendName}
                      aria-invalid={addError ? true : undefined}
                      aria-describedby={addError ? "f-friend-name-error" : undefined}
                      onChange={(event) => {
                        setFriendName(event.target.value)
                        setAddError("")
                      }}
                    />
                    {addError ? <FieldError id="f-friend-name-error">{addError}</FieldError> : null}
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="f-friend-gcash">{t(lang, "friendGcash")}</FieldLabel>
                    <Input
                      id="f-friend-gcash"
                      type="tel"
                      inputMode="tel"
                      enterKeyHint="done"
                      autoComplete="off"
                      className="font-mono"
                      maxLength={30}
                      value={friendGcash}
                      placeholder="09XX XXX XXXX"
                      onChange={(event) => setFriendGcash(event.target.value)}
                    />
                  </Field>
                  <FieldDescription>{t(lang, "memberAddHint")}</FieldDescription>
                </FieldGroup>
                <Button type="submit" className="min-h-[44px]">
                  {t(lang, "addToRoster")}
                </Button>
              </form>
            ) : null}
          </section>

          {liveInvite ? (
            <section className="flex flex-col gap-3">
              <h3 className="font-heading text-sm font-semibold">📲 {t(lang, "shareSection")}</h3>
              <div className="flex justify-center">
                <Badge variant="secondary" className="h-8 px-3 font-mono text-sm tracking-[0.18em]">
                  {live.joinCode}
                </Badge>
              </div>
              <Button variant="secondary" className="min-h-[44px] w-full" onClick={() => void copyInvite()}>
                <ClipboardIcon data-icon="inline-start" />
                {t(lang, "copyInviteGc")}
              </Button>
            </section>
          ) : null}

          {treasurer ? (
            <section className="flex flex-col gap-3">
              <h3 className="font-heading text-sm font-semibold">🔒 {t(lang, "rulesSection")}</h3>
              <FieldGroup>
                <Field>
                  <FieldLabel>{t(lang, "openMode")}</FieldLabel>
                  <ToggleGroup
                    variant="outline"
                    spacing={1}
                    className="flex w-full flex-wrap"
                    value={[live.open ? "open" : "locked"]}
                    onValueChange={(next) => {
                      const picked = next[next.length - 1]
                      if (picked === "open" || picked === "locked") {
                        const result = setOpen(picked === "open")
                        notify(result.message)
                      }
                    }}
                  >
                    <ToggleGroupItem value="open" className="min-h-[40px] flex-1 px-3.5">
                      🔓 {t(lang, "openModePill")}
                    </ToggleGroupItem>
                    <ToggleGroupItem value="locked" className="min-h-[40px] flex-1 px-3.5">
                      🔒 {t(lang, "treasApprovalMode")}
                    </ToggleGroupItem>
                  </ToggleGroup>
                </Field>
                <Field>
                  <FieldLabel htmlFor="t-gcash">{t(lang, "gnum")}</FieldLabel>
                  <InputGroup className="h-11">
                    <InputGroupInput
                      key={live.id + live.gcash}
                      ref={gcashRef}
                      id="t-gcash"
                      type="tel"
                      className="font-mono"
                      inputMode="tel"
                      enterKeyHint="done"
                      autoComplete="off"
                      defaultValue={live.gcash}
                      placeholder="09XX XXX XXXX"
                    />
                    <InputGroupAddon align="inline-end">
                      <InputGroupButton
                        className="min-h-[44px] min-w-[44px] px-3.5"
                        onClick={() => {
                          const result = setGcash(gcashRef.current?.value ?? "")
                          notify(result.message)
                        }}
                      >
                        {t(lang, "save")}
                      </InputGroupButton>
                    </InputGroupAddon>
                  </InputGroup>
                  <FieldDescription>{t(lang, "gnumHint")}</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel>{t(lang, "barya")}</FieldLabel>
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
                </Field>
                {others.length ? (
                  <Field>
                    <FieldLabel>{t(lang, "handoff")}</FieldLabel>
                    <div className="flex flex-wrap gap-2">
                      {others.map((member) => (
                        <Button
                          key={member.id}
                          size="touch"
                          variant="outline"
                          onClick={() => onHandoff(member.id, member.name)}
                        >
                          👑 {member.name}
                        </Button>
                      ))}
                    </div>
                  </Field>
                ) : null}
              </FieldGroup>
              <Button className="min-h-[40px] w-full" variant="destructive" onClick={onDeleteTrip}>
                {t(lang, "delTrip")}
              </Button>
            </section>
          ) : (
            <section className="flex flex-col gap-2 rounded-xl border bg-card p-3">
              <h3 className="font-heading text-sm font-semibold">
                {t(lang, "treasIs")}: {live.members.find((member) => member.id === live.treasurer)?.name}
              </h3>
              <p className="text-sm text-muted-foreground">
                {t(lang, "treasInfo")}
                {live.gcash ? (
                  <>
                    : <span className="font-mono select-all">{live.gcash}</span>
                  </>
                ) : null}
              </p>
              <p className="text-sm text-muted-foreground">{live.open ? t(lang, "openOn") : t(lang, "openOff")}</p>
            </section>
          )}

          {!treasurer && takeoverCandidates.length ? (
            <section className="flex flex-col gap-2">
              <button
                type="button"
                className="text-left text-xs font-semibold text-destructive"
                onClick={() => {
                  setTakeoverOpen((next) => !next)
                  setTakeoverError("")
                  if (!takeoverId) {
                    setTakeoverId(takeoverCandidates.some((member) => member.id === as) ? as : takeoverCandidates[0].id)
                  }
                }}
              >
                {t(lang, "emergencyTakeoverBtn")}
              </button>
              {takeoverOpen ? (
                <div className="flex flex-col gap-3 rounded-xl border border-destructive/30 bg-card p-3">
                  <p className="text-sm text-muted-foreground">
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
                  <Button
                    type="button"
                    variant="destructive"
                    className="btn-danger min-h-[48px] w-full"
                    onClick={() => {
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
                  >
                    {t(lang, "emergencyTakeoverConfirm")}
                  </Button>
                </div>
              ) : null}
            </section>
          ) : null}

          {emergencyLog.length ? (
            <details className="rounded-xl border bg-card p-3">
              <summary className="cursor-pointer font-heading text-sm font-semibold">
                {t(lang, "emergencyHistory")}
              </summary>
              <ul className="mt-3 flex flex-col gap-3">
                {[...emergencyLog]
                  .sort((a, b) => b.ts - a.ts)
                  .map((entry) => (
                    <li key={entry.id} className="flex flex-col gap-0.5 border-t pt-2 first:border-t-0 first:pt-0">
                      <p className="text-sm font-medium">{emergencyActionLabel(lang, entry.action)}</p>
                      <p className="text-sm text-muted-foreground">{entry.actorName}</p>
                      {entry.details ? <p className="text-sm text-muted-foreground">{entry.details}</p> : null}
                      <p className="text-xs text-muted-foreground">{formatEmergencyTime(entry.ts)}</p>
                    </li>
                  ))}
              </ul>
            </details>
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
