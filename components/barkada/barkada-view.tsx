"use client"

import { useEffect, useRef, useState } from "react"
import { CameraIcon, PencilIcon } from "lucide-react"

import { ArmButton } from "@/components/barkada/arm-button"
import { WrappedCard } from "@/components/barkada/wrapped-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { toast } from "@/components/ui/toast"
import { sanitizeGcash } from "@/lib/gcash"
import { barkadaCountLabel, t } from "@/lib/i18n"
import { inviteUrl } from "@/lib/join-code"
import { splitNameDraft } from "@/lib/member-names"
import { isSeedTripId } from "@/lib/merge-trip"
import { shareOrCopy } from "@/lib/snapshot"
import { useBarkada } from "@/lib/store"
import { memberCanRemove } from "@/lib/types"

export function BarkadaView({
  onCopy,
  onResetLock,
}: {
  onCopy: (text: string, label: string) => boolean | void | Promise<boolean | void>
  onResetLock: (id: string, name: string) => void
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
  const { lang, as, profile, persona, screenshotMode } = state
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

  if (!trip) return null
  const live = trip
  const liveInvite = !isSeedTripId(live.id)

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

  async function shareInvite() {
    const url = inviteUrl(live.joinCode)
    const message = t(lang, "inviteMsg")
      .replace("{name}", live.name)
      .replace("{url}", url)
      .replace("{code}", live.joinCode)
    const result = await shareOrCopy(url, live.name, message)
    if (result === "copied") notify(t(lang, "inviteCopied"))
    else if (result === "manual") await onCopy(message, t(lang, "inviteCopied"))
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
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-heading text-lg font-semibold">🧾 {t(lang, "wrapped")}</h2>
        <span className="text-sm text-muted-foreground">{barkadaCountLabel(lang, live.members)}</span>
      </div>
      <p className="text-sm text-muted-foreground">{t(lang, "wrappedHint")}</p>
      <WrappedCard trip={live} now={now} lang={lang} />
      <Button size="touch" className="w-full" onClick={() => setScreenshotMode(true)}>
        <CameraIcon data-icon="inline-start" />
        {t(lang, "screenshot")}
      </Button>

      {!screenshotMode ? (
        <section className="flex flex-col gap-4">
          <h2 className="font-heading text-lg font-semibold">👥 {t(lang, "rosterSection")}</h2>

          {liveInvite ? (
            <div className="flex flex-col gap-2 rounded-xl border bg-card p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge variant="secondary" className="h-8 px-3 font-mono text-sm tracking-[0.18em]">
                  {live.joinCode}
                </Badge>
                <Button size="touch" onClick={() => void shareInvite()}>
                  {t(lang, "shareInviteLink")}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">{barkadaCountLabel(lang, live.members)}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{barkadaCountLabel(lang, live.members)}</p>
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
                    {t(lang, "lateComerFuture")}
                  </ToggleGroupItem>
                  <ToggleGroupItem value="past" className="min-h-[40px] flex-1 px-3 text-left">
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
                        {member.id === live.treasurer ? <Badge>👑 {t(lang, "treas")}</Badge> : null}
                        {claimed ? (
                          <Badge variant="secondary">🟢 {t(lang, "joined")}</Badge>
                        ) : (
                          <Badge variant="outline">⏳ {t(lang, "unclaimed")}</Badge>
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
                          onClick={() => void onCopy(inviteUrl(live.joinCode, "", member.id), t(lang, "inviteCopied"))}
                        >
                          {t(lang, "inviteSeat")}
                        </Button>
                      ) : treasurer && claimed ? (
                        <Button
                          size="touch"
                          variant="ghost"
                          className="min-h-[38px] text-muted-foreground"
                          onClick={() => onResetLock(member.id, member.name)}
                        >
                          🔓 {t(lang, "resetLock")}
                        </Button>
                      ) : null}
                      {treasurer && member.id !== live.treasurer ? (
                        memberCanRemove(live, member.id) ? (
                          <ArmButton
                            variant="ghost"
                            className="min-h-[38px] text-muted-foreground"
                            label="🗑️"
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
                            🗑️
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
    </div>
  )
}
