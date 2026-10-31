"use client"

import { useEffect, useRef, useState } from "react"
import {
  CameraIcon,
  ClockIcon,
  CrownIcon,
  EllipsisVerticalIcon,
  MailIcon,
  UnlockIcon,
} from "lucide-react"

import { MemberSheet } from "@/components/barkada/sheets"
import { WrappedCta } from "@/components/barkada/wrapped-cta"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { Item, ItemActions, ItemContent, ItemGroup, ItemTitle } from "@/components/ui/item"
import { toast } from "@/components/ui/toast"
import { memberCanRemove, peso, wrappedStats } from "@/lib/calc"
import { t } from "@/lib/i18n"
import { titleCaseName } from "@/lib/member-names"
import { isSeedTripId } from "@/lib/merge-trip"
import { useBarkada } from "@/lib/store"
import { activeMembers, initial, type Lang, type Member } from "@/lib/types"

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

export function BarkadaView({
  onResetLock,
  onInvite,
  onOpenWrapped,
}: {
  onResetLock: (id: string, name: string) => void
  onInvite: (memberId?: string) => void
  onOpenWrapped: () => void
}) {
  const { state, trip, now, treasurer, removeMember } = useBarkada()
  const { lang, as } = state
  const [friendOpen, setFriendOpen] = useState(false)
  const [friendId, setFriendId] = useState<string | null>(null)
  const [menuId, setMenuId] = useState<string | null>(null)
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

  if (!trip) return null
  const live = trip
  const roster = activeMembers(live)
  const liveInvite = !isSeedTripId(live.id)
  const joined = roster.filter((member) => member.claimedByUid).length
  const waiting = roster.length - joined
  const stats = wrappedStats(live, now)

  function notify(message: string, timeout = 1800) {
    toast.add({ title: message, timeout })
  }

  function openFriend(id: string | null) {
    setFriendId(id)
    setFriendOpen(true)
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
      <Card>
        <CardHeader>
          <CardDescription>{t(lang, "totalGastos")}</CardDescription>
          <CardTitle className="font-mono text-3xl font-extrabold tabular-nums">{peso(stats.total)}</CardTitle>
          <CardAction className="self-center">
            <WrappedCta trip={live} variant="hero" lang={lang} onOpen={onOpenWrapped} />
          </CardAction>
        </CardHeader>
      </Card>

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
          {roster
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
                      <Button size="touch" className="min-h-[38px]" onClick={() => onInvite(member.id)}>
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
        <MemberSheet open={friendOpen} memberId={friendId} onOpenChange={setFriendOpen} />
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
