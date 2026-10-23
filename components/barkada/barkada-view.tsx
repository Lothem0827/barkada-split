"use client"

import { useEffect, useRef, useState } from "react"
import {
  CameraIcon,
  ClockIcon,
  CrownIcon,
  MailIcon,
  PencilIcon,
  ReceiptIcon,
  RefreshCwIcon,
  ScrollTextIcon,
  Share2Icon,
  SparkleIcon,
  Trash2Icon,
  UnlockIcon,
  UsersIcon,
} from "lucide-react"

import { ActivityLogCard } from "@/components/barkada/activity-log"
import { ArmButton } from "@/components/barkada/arm-button"
import { WrappedCard } from "@/components/barkada/wrapped-card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { toast } from "@/components/ui/toast"
import {
  defaultBarkadaHub,
  latestActivityTs,
  unreadActivityCount,
  wrappedShareText,
  type BarkadaHub,
} from "@/lib/activity"
import { sanitizeGcash } from "@/lib/gcash"
import { t } from "@/lib/i18n"
import { inviteUrl } from "@/lib/join-code"
import { splitNameDraft } from "@/lib/member-names"
import { isSeedTripId } from "@/lib/merge-trip"
import { shareOrCopy } from "@/lib/snapshot"
import { useBarkada } from "@/lib/store"
import { initial, memberCanRemove } from "@/lib/types"

const SEEN_KEY = "barkada-seen-activity"
const seenListeners = new Set<() => void>()

function readSeen(): Record<string, number> {
  if (typeof window === "undefined") return {}
  try {
    const raw = window.localStorage.getItem(SEEN_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function writeSeen(map: Record<string, number>) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(SEEN_KEY, JSON.stringify(map))
}

export function peekLastSeen(tripId: string, now = Date.now()) {
  const map = readSeen()
  if (map[tripId] != null) return map[tripId]
  if (typeof window === "undefined") return now
  writeSeen({ ...map, [tripId]: now })
  return now
}

export function markActivitySeen(tripId: string, ts: number) {
  const map = readSeen()
  if ((map[tripId] ?? 0) >= ts) {
    seenListeners.forEach((fn) => fn())
    return
  }
  writeSeen({ ...map, [tripId]: ts })
  seenListeners.forEach((fn) => fn())
}

export function useLastSeenActivity(tripId: string | null) {
  const [seen, setSeen] = useState(() => (tripId ? peekLastSeen(tripId) : 0))
  useEffect(() => {
    const sync = () => setSeen(tripId ? peekLastSeen(tripId) : 0)
    sync()
    seenListeners.add(sync)
    return () => {
      seenListeners.delete(sync)
    }
  }, [tripId])
  return seen
}

const HUBS: BarkadaHub[] = ["roster", "chismis", "wrapped"]
const hubMemo = new Map<string, BarkadaHub>()

export function BarkadaView({
  onCopy,
  onResetLock,
  onInvite,
}: {
  onCopy: (text: string, label: string) => boolean | void | Promise<boolean | void>
  onResetLock: (id: string, name: string) => void
  onInvite: (memberId?: string) => void
}) {
  const {
    state,
    trip,
    now,
    treasurer,
    addMember,
    editMember,
    removeMember,
    saveProfile,
    setScreenshotMode,
  } = useBarkada()
  const { lang, as, profile, persona, screenshotMode, tab } = state
  const lastSeen = useLastSeenActivity(trip?.id ?? null)
  const [hub, setHub] = useState<BarkadaHub>(() =>
    trip && hubMemo.has(trip.id) ? hubMemo.get(trip.id)! : "roster"
  )
  const [friendName, setFriendName] = useState("")
  const [friendGcash, setFriendGcash] = useState("")
  const [addError, setAddError] = useState("")
  const [lateComer, setLateComer] = useState(true)
  const [renameId, setRenameId] = useState("")
  const [renameValue, setRenameValue] = useState("")
  const [gcashId, setGcashId] = useState("")
  const [gcashValue, setGcashValue] = useState("")
  const [hiddenId, setHiddenId] = useState<string | null>(null)
  const pendingRemove = useRef<{ id: string; timer: number } | null>(null)

  useEffect(() => {
    return () => {
      const pending = pendingRemove.current
      if (!pending) return
      window.clearTimeout(pending.timer)
      removeMember(pending.id)
      pendingRemove.current = null
    }
  }, [removeMember])

  function selectHub(next: BarkadaHub) {
    if (trip) hubMemo.set(trip.id, next)
    setHub(next)
    if (next === "chismis" && trip) {
      markActivitySeen(trip.id, Math.max(Date.now(), latestActivityTs(trip)))
    }
  }

  useEffect(() => {
    if (!trip) return
    if (tab !== "barkada") {
      hubMemo.delete(trip.id)
      return
    }
    if (hubMemo.has(trip.id)) {
      setHub(hubMemo.get(trip.id)!)
      return
    }
    const next = defaultBarkadaHub(trip, peekLastSeen(trip.id))
    hubMemo.set(trip.id, next)
    setHub(next)
    if (next === "chismis") markActivitySeen(trip.id, Math.max(Date.now(), latestActivityTs(trip)))
  }, [tab, trip?.id])

  const latest = trip ? latestActivityTs(trip) : 0
  useEffect(() => {
    if (tab !== "barkada" || hub !== "chismis" || !trip) return
    markActivitySeen(trip.id, Math.max(Date.now(), latest))
  }, [tab, hub, trip?.id, latest])

  if (!trip) return null
  const live = trip
  const liveInvite = !isSeedTripId(live.id)
  const joined = live.members.filter((member) => member.claimedByUid).length
  const waiting = live.members.length - joined
  const unread = unreadActivityCount(live, lastSeen)

  function notify(message: string, timeout = 1800) {
    toast.add({ title: message, timeout })
  }

  function submitFriends() {
    const names = splitNameDraft(friendName, true).complete
    if (!names.length) {
      setAddError(t(lang, "needMemberName"))
      return
    }
    const late = lateComer && live.expenses.length > 0
    const skipped: string[] = []
    let added = 0
    let lastError = ""
    for (const name of names) {
      const result = addMember(name, friendGcash, late)
      if (result.ok) added += 1
      else {
        skipped.push(name)
        lastError = result.message
      }
    }
    if (!added) {
      setAddError(lastError || t(lang, "needMemberName"))
      return
    }
    setAddError("")
    setFriendName("")
    setFriendGcash("")
    notify(
      skipped.length
        ? t(lang, "rosterAdded").replace("{n}", String(added)).replace("{skipped}", skipped.join(", "))
        : added === 1
          ? t(lang, "addedToBarkada").replace("{name}", names[0])
          : t(lang, "rosterAddedClean").replace("{n}", String(added))
    )
  }

  function commitRename() {
    if (!renameId) return
    const member = live.members.find((item) => item.id === renameId)
    const result = editMember(renameId, renameValue, member?.gcash || "")
    if (!result.ok) {
      notify(result.message)
      return
    }
    setRenameId("")
    notify(result.message)
  }

  function commitGcash() {
    if (!gcashId) return
    const member = live.members.find((item) => item.id === gcashId)
    if (!member) {
      setGcashId("")
      return
    }
    const result = editMember(gcashId, member.name, gcashValue)
    if (!result.ok) {
      notify(result.message)
      return
    }
    if (gcashId === as) saveProfile({ ...profile, persona, gcash: sanitizeGcash(gcashValue) })
    setGcashId("")
    notify(result.message)
  }

  async function shareWrapped() {
    const url = inviteUrl(live.joinCode)
    const message = wrappedShareText(live, now)
    const result = await shareOrCopy(url, live.name + " Wrapped", message)
    if (result === "copied") notify(t(lang, "wrappedShared"))
    else if (result === "manual") await onCopy(message, t(lang, "wrappedShared"))
  }

  function queueRemove(id: string) {
    if (!memberCanRemove(live, id)) {
      notify(t(lang, "cannotRemove"), 3200)
      return
    }
    const prev = pendingRemove.current
    if (prev) {
      window.clearTimeout(prev.timer)
      removeMember(prev.id)
    }
    setHiddenId(id)
    const timer = window.setTimeout(() => {
      removeMember(id)
      pendingRemove.current = null
      setHiddenId(null)
    }, 5000)
    pendingRemove.current = { id, timer }
    toast.add({
      title: t(lang, "removedMember").replace("{name}", live.members.find((item) => item.id === id)?.name || ""),
      timeout: 5000,
      actionProps: {
        children: t(lang, "undoDelete"),
        onClick: () => {
          if (pendingRemove.current?.timer) window.clearTimeout(pendingRemove.current.timer)
          pendingRemove.current = null
          setHiddenId(null)
        },
      },
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {!screenshotMode ? (
        <div className="sticky top-0 z-10 -mx-4 bg-background px-4 pb-1">
          <div className="grid min-h-[44px] grid-cols-3 gap-1 rounded-2xl border border-border bg-muted p-1">
            {HUBS.map((id) => {
              const active = hub === id
              const Icon = id === "roster" ? UsersIcon : id === "chismis" ? ScrollTextIcon : ReceiptIcon
              const label =
                id === "roster"
                  ? t(lang, "hubRoster") + " (" + live.members.length + ")"
                  : id === "chismis"
                    ? t(lang, "hubChismis")
                    : t(lang, "hubWrapped")
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={active}
                  className={`inline-flex min-h-[36px] items-center justify-center gap-1 rounded-xl px-1 text-xs font-bold transition active:scale-95 ${
                    active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                  }`}
                  onClick={() => selectHub(id)}
                >
                  <Icon className="size-3.5 shrink-0" />
                  {label}
                  {id === "chismis" && unread > 0 ? (
                    <span className="ml-1 inline-flex items-center gap-1 text-destructive">
                      <span className="size-1.5 rounded-full bg-destructive" />
                      {unread}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}

      {hub === "roster" && !screenshotMode ? (
        <section className="flex flex-col gap-4">
          {liveInvite ? (
            <div className="flex flex-col gap-2 rounded-xl border bg-card p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge variant="secondary" className="h-8 px-3 font-mono text-sm tracking-[0.18em]">
                  {live.joinCode}
                </Badge>
                <Button size="touch" onClick={() => onInvite()}>
                  <CameraIcon data-icon="inline-start" />
                  {t(lang, "shareInviteLink")}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                {t(lang, "joinedWaiting")
                  .replace("{joined}", String(joined))
                  .replace("{waiting}", String(waiting))}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t(lang, "joinedWaiting")
                .replace("{joined}", String(joined))
                .replace("{waiting}", String(waiting))}
            </p>
          )}

          {treasurer ? (
            <form
              className="flex flex-col gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                submitFriends()
              }}
            >
              <div className="flex flex-wrap gap-2">
                <Input
                  className="min-w-[10rem] flex-1"
                  enterKeyHint="next"
                  autoComplete="off"
                  maxLength={80}
                  value={friendName}
                  placeholder={t(lang, "addFriendName")}
                  aria-invalid={addError ? true : undefined}
                  onChange={(event) => {
                    setFriendName(event.target.value)
                    setAddError("")
                  }}
                />
                <Input
                  type="tel"
                  inputMode="tel"
                  autoComplete="off"
                  className="w-[9.5rem] font-mono"
                  maxLength={16}
                  value={friendGcash}
                  placeholder={t(lang, "friendGcash")}
                  onChange={(event) => setFriendGcash(sanitizeGcash(event.target.value))}
                />
                <Button type="submit" size="touch" className="shrink-0">
                  {t(lang, "addToRoster")}
                </Button>
              </div>
              {addError ? <p className="text-sm text-destructive">{addError}</p> : null}
              {live.expenses.length > 0 ? (
                <ToggleGroup
                  variant="outline"
                  spacing={1}
                  className="flex w-full flex-wrap"
                  value={[lateComer ? "future" : "past"]}
                  onValueChange={(next) => {
                    const picked = next[next.length - 1]
                    if (picked === "future" || picked === "past") setLateComer(picked === "future")
                  }}
                >
                  <ToggleGroupItem value="future" className="min-h-[40px] flex-1 px-3 text-left">
                    <SparkleIcon data-icon="inline-start" />
                    {t(lang, "lateComerFuture")}
                  </ToggleGroupItem>
                  <ToggleGroupItem value="past" className="min-h-[40px] flex-1 px-3 text-left">
                    <RefreshCwIcon data-icon="inline-start" />
                    {t(lang, "lateComerPast")}
                  </ToggleGroupItem>
                </ToggleGroup>
              ) : null}
            </form>
          ) : null}

          <ItemGroup>
            {live.members
              .filter((member) => member.id !== hiddenId)
              .map((member) => {
                const claimed = !!member.claimedByUid
                const canEdit = treasurer || member.id === as
                return (
                  <Item key={member.id} className="min-h-[56px] items-center">
                    <Avatar size="sm">
                      <AvatarFallback>{initial(member.name)}</AvatarFallback>
                    </Avatar>
                    <ItemContent>
                      <ItemTitle className="flex-wrap">
                        {renameId === member.id ? (
                          <Input
                            autoFocus
                            className="h-8 max-w-[10rem]"
                            maxLength={40}
                            value={renameValue}
                            aria-label={t(lang, "rename")}
                            onChange={(event) => setRenameValue(event.target.value)}
                            onBlur={commitRename}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault()
                                commitRename()
                              }
                              if (event.key === "Escape") setRenameId("")
                            }}
                          />
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            {member.name}
                            {canEdit ? (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-8"
                                aria-label={t(lang, "rename")}
                                onClick={() => {
                                  setRenameId(member.id)
                                  setRenameValue(member.name)
                                }}
                              >
                                <PencilIcon className="size-3.5" />
                              </Button>
                            ) : null}
                          </span>
                        )}
                        {member.id === live.treasurer ? (
                          <Badge>
                            <CrownIcon className="size-3.5" />
                            {t(lang, "treas")}
                          </Badge>
                        ) : null}
                        {claimed ? (
                          <Badge variant="secondary">
                            <span className="size-2 rounded-full bg-emerald-500" />
                            {t(lang, "joined")}
                          </Badge>
                        ) : (
                          <Badge variant="outline">
                            <ClockIcon className="size-3.5" />
                            {t(lang, "unclaimed")}
                          </Badge>
                        )}
                        {member.id === as ? <Badge variant="secondary">{t(lang, "you")}</Badge> : null}
                      </ItemTitle>
                      {gcashId === member.id ? (
                        <Input
                          autoFocus
                          type="tel"
                          inputMode="tel"
                          className="mt-1 h-8 max-w-[12rem] font-mono"
                          maxLength={16}
                          value={gcashValue}
                          placeholder="09XX XXX XXXX"
                          onChange={(event) => setGcashValue(sanitizeGcash(event.target.value))}
                          onBlur={commitGcash}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault()
                              commitGcash()
                            }
                            if (event.key === "Escape") setGcashId("")
                          }}
                        />
                      ) : (
                        <ItemDescription>
                          {canEdit ? (
                            <button
                              type="button"
                              className="font-mono text-left underline-offset-4 hover:underline"
                              onClick={() => {
                                setGcashId(member.id)
                                setGcashValue(member.gcash)
                              }}
                            >
                              {member.gcash || t(lang, "noGcashMember")}
                            </button>
                          ) : (
                            <span className="font-mono">{member.gcash || t(lang, "noGcashMember")}</span>
                          )}
                        </ItemDescription>
                      )}
                    </ItemContent>
                    <ItemActions>
                      {!claimed && liveInvite ? (
                        <Button
                          size="touch"
                          className="min-h-[38px]"
                          onClick={() => onInvite(member.id)}
                        >
                          <MailIcon data-icon="inline-start" />
                          {t(lang, "inviteSeat")}
                        </Button>
                      ) : treasurer && claimed ? (
                        <Button
                          size="touch"
                          variant="ghost"
                          className="min-h-[38px] text-muted-foreground"
                          onClick={() => onResetLock(member.id, member.name)}
                        >
                          <UnlockIcon data-icon="inline-start" />
                          {t(lang, "resetLock")}
                        </Button>
                      ) : null}
                      {treasurer && member.id !== live.treasurer ? (
                        memberCanRemove(live, member.id) ? (
                          <ArmButton
                            variant="ghost"
                            className="min-h-[38px] text-muted-foreground"
                            label={<Trash2Icon className="size-4" />}
                            armedLabel={t(lang, "removeMember") + "?"}
                            cancelLabel={t(lang, "cancel")}
                            onConfirm={() => queueRemove(member.id)}
                          />
                        ) : (
                          <Button
                            size="touch"
                            variant="ghost"
                            className="min-h-[38px] text-muted-foreground"
                            onClick={() => notify(t(lang, "cannotRemove"), 3200)}
                          >
                            <Trash2Icon className="size-4" />
                          </Button>
                        )
                      ) : null}
                    </ItemActions>
                  </Item>
                )
              })}
          </ItemGroup>
        </section>
      ) : null}

      {hub === "chismis" && !screenshotMode ? (
        <ActivityLogCard trip={live} now={now} lang={lang} onCopy={onCopy} />
      ) : null}

      {hub === "wrapped" || screenshotMode ? (
        <section className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">{t(lang, "wrappedHint")}</p>
          <WrappedCard trip={live} now={now} lang={lang} />
          {!screenshotMode ? (
            <div className="grid grid-cols-2 gap-2">
              <Button size="touch" onClick={() => setScreenshotMode(true)}>
                <CameraIcon data-icon="inline-start" />
                {t(lang, "screenshot")}
              </Button>
              <Button size="touch" variant="outline" onClick={() => void shareWrapped()}>
                <Share2Icon data-icon="inline-start" />
                {t(lang, "shareWrapped")}
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
