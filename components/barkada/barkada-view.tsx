"use client"

import { useEffect, useRef, useState } from "react"
import {
  CameraIcon,
  ClockIcon,
  CrownIcon,
  EllipsisVerticalIcon,
  ImagePlusIcon,
  MailIcon,
  ReceiptIcon,
  ScrollTextIcon,
  Share2Icon,
  UnlockIcon,
  UsersIcon,
} from "lucide-react"

import { ActivityLogCard } from "@/components/barkada/activity-log"
import { MemberSheet } from "@/components/barkada/sheets"
import { WrappedCard } from "@/components/barkada/wrapped-card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { Item, ItemActions, ItemContent, ItemGroup, ItemTitle } from "@/components/ui/item"
import { toast } from "@/components/ui/toast"
import {
  defaultBarkadaHub,
  latestActivityTs,
  unreadActivityCount,
  wrappedShareText,
  type BarkadaHub,
} from "@/lib/activity"
import { compressImage } from "@/lib/image-utils"
import { t } from "@/lib/i18n"
import { inviteUrl } from "@/lib/join-code"
import { titleCaseName } from "@/lib/member-names"
import { isSeedTripId } from "@/lib/merge-trip"
import { shareOrCopy } from "@/lib/snapshot"
import { useBarkada } from "@/lib/store"
import { initial, memberCanRemove, type Lang, type Member } from "@/lib/types"

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

export function lastSeenOf(tripId: string) {
  return readSeen()[tripId] ?? 0
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
    removeMember,
    setScreenshotMode,
    setTripPhotos,
  } = useBarkada()
  const { lang, as, screenshotMode, tab } = state
  const lastSeen = useLastSeenActivity(trip?.id ?? null)
  const [hub, setHub] = useState<BarkadaHub>(() =>
    trip && hubMemo.has(trip.id) ? hubMemo.get(trip.id)! : "roster"
  )
  const [friendOpen, setFriendOpen] = useState(false)
  const [friendId, setFriendId] = useState<string | null>(null)
  const [menuId, setMenuId] = useState<string | null>(null)
  const [hiddenId, setHiddenId] = useState<string | null>(null)
  const pendingRemove = useRef<{ id: string; timer: number } | null>(null)
  const wrappedPhotoRef = useRef<HTMLInputElement>(null)

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

  function openFriend(id: string | null) {
    setFriendId(id)
    setFriendOpen(true)
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
          <div className="grid min-h-[44px] grid-cols-3 gap-1 rounded-2xl bg-muted p-1">
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
            <div className="flex flex-col gap-2 rounded-xl bg-card p-3">
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

          <p className="text-sm font-semibold">{t(lang, "friendsList")}</p>
          <ItemGroup>
            {live.members
              .filter((member) => member.id !== hiddenId)
              .map((member) => {
                const claimed = !!member.claimedByUid
                const canEdit = treasurer || member.id === as
                const canRemove = treasurer && member.id !== live.treasurer
                const displayName = titleCaseName(member.name)
                return (
                  <Item key={member.id} className="min-h-[56px] items-center">
                    <Avatar size="sm">
                      <AvatarFallback>{initial(displayName)}</AvatarFallback>
                    </Avatar>
                    <ItemContent>
                      <ItemTitle className="flex-wrap">
                        <span>{displayName}</span>
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
                          onClick={() => onResetLock(member.id, displayName)}
                        >
                          <UnlockIcon data-icon="inline-start" />
                          {t(lang, "resetLock")}
                        </Button>
                      ) : null}
                      {canEdit || canRemove ? (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-9"
                          aria-label={displayName}
                          onClick={() => setMenuId(member.id)}
                        >
                          <EllipsisVerticalIcon className="size-4" />
                        </Button>
                      ) : null}
                    </ItemActions>
                  </Item>
                )
              })}
          </ItemGroup>
          {treasurer ? (
            <Button size="touch" variant="outline" className="w-full" onClick={() => openFriend(null)}>
              {t(lang, "addToRoster")}
            </Button>
          ) : null}
          <MemberSheet
            open={friendOpen}
            memberId={friendId}
            onOpenChange={setFriendOpen}
          />
          <FriendActionsSheet
            member={live.members.find((member) => member.id === menuId) ?? null}
            canEdit={!!menuId && (treasurer || menuId === as)}
            canRemove={!!menuId && treasurer && menuId !== live.treasurer}
            lang={lang}
            onOpenChange={(next) => {
              if (!next) setMenuId(null)
            }}
            onEdit={(id) => {
              setMenuId(null)
              openFriend(id)
            }}
            onRemove={(id) => {
              setMenuId(null)
              queueRemove(id)
            }}
          />
        </section>
      ) : null}

      {hub === "chismis" && !screenshotMode ? (
        <ActivityLogCard trip={live} now={now} lang={lang} onCopy={onCopy} />
      ) : null}

      {hub === "wrapped" || screenshotMode ? (
        <section className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">{t(lang, "wrappedHint")}</p>
          {!screenshotMode ? (
            <>
              <input
                ref={wrappedPhotoRef}
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={(event) => {
                  const files = [...(event.target.files || [])]
                  event.target.value = ""
                  void (async () => {
                    const urls = [...(live.wrappedPhotos || [])]
                    for (const file of files) {
                      if (urls.length >= 4) break
                      try {
                        urls.push(await compressImage(file))
                      } catch {
                        toast.add({ title: t(lang, "photoFailed"), timeout: 1800 })
                      }
                    }
                    setTripPhotos({
                      wrappedPhotos: urls.slice(0, 4),
                      coverPhotoUrl: live.coverPhotoUrl || urls[0] || null,
                    })
                  })()
                }}
              />
              <Button
                type="button"
                size="touch"
                variant="outline"
                className="min-h-[40px] w-full"
                onClick={() => wrappedPhotoRef.current?.click()}
              >
                <ImagePlusIcon data-icon="inline-start" />
                {t(lang, "customizeWrapped")}
              </Button>
            </>
          ) : null}
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

function FriendActionsSheet({
  member,
  canEdit,
  canRemove,
  lang,
  onOpenChange,
  onEdit,
  onRemove,
}: {
  member: Member | null
  canEdit: boolean
  canRemove: boolean
  lang: Lang
  onOpenChange: (open: boolean) => void
  onEdit: (id: string) => void
  onRemove: (id: string) => void
}) {
  return (
    <Drawer open={!!member} onOpenChange={onOpenChange} swipeDirection="down" showSwipeHandle>
      <DrawerContent className="mx-auto">
        <DrawerHeader>
          <DrawerTitle>{member ? titleCaseName(member.name) : ""}</DrawerTitle>
        </DrawerHeader>
        <div className="flex flex-col gap-2 px-4 py-3 pb-[max(16px,env(safe-area-inset-bottom))]">
          {member && canEdit ? (
            <Button size="cta" variant="outline" onClick={() => onEdit(member.id)}>
              {t(lang, "edit")}
            </Button>
          ) : null}
          {member && canRemove ? (
            <Button size="cta" variant="destructive" onClick={() => onRemove(member.id)}>
              {t(lang, "removeMember")}
            </Button>
          ) : null}
        </div>
      </DrawerContent>
    </Drawer>
  )
}
