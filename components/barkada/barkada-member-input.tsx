"use client"

import { useEffect, useImperativeHandle, useRef, useState } from "react"
import { XIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { FieldDescription } from "@/components/ui/field"
import { toast } from "@/components/ui/toast"
import { t, takenNicknameMessage } from "@/lib/i18n"
import {
  MEMBER_NAME_MAX,
  commitNames,
  hasNameSeparator,
  splitNameDraft,
} from "@/lib/member-names"
import { initial, nameKey, type Lang } from "@/lib/types"
import { cn } from "cn"

export type BarkadaMemberInputHandle = {
  commitDraft: () => string[]
}

export function BarkadaMemberInput({
  ref,
  names,
  onChange,
  self,
  suggestions = [],
  inputId,
  lang,
  onDraftChange,
}: {
  ref?: React.Ref<BarkadaMemberInputHandle>
  names: string[]
  onChange: (names: string[]) => void
  self: { name: string; avatar?: string; label: string }
  suggestions?: string[]
  inputId: string
  lang: Lang
  onDraftChange?: (draft: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const composing = useRef(false)
  const namesRef = useRef(names)
  const draftRef = useRef("")
  const [draft, setDraft] = useState("")
  const [flash, setFlash] = useState<{ key: string; vsYou: boolean; tick: number } | null>(null)
  namesRef.current = names
  draftRef.current = draft

  useEffect(() => {
    if (!flash) return
    const id = window.setTimeout(() => setFlash(null), 420)
    return () => window.clearTimeout(id)
  }, [flash])

  function setDraftValue(value: string) {
    draftRef.current = value
    setDraft(value)
    onDraftChange?.(value)
  }

  function applyCommit(result: { names: string[]; flash: string | null; vsYou: boolean; added: number; skipped: string[] }) {
    namesRef.current = result.names
    onChange(result.names)
    if (result.flash) {
      setFlash((current) => ({
        key: nameKey(result.flash!),
        vsYou: result.vsYou,
        tick: (current?.tick ?? 0) + 1,
      }))
    }
    if (result.skipped.length) {
      toast.add({
        title: t(lang, "rosterAdded")
          .replace("{n}", String(result.added))
          .replace("{skipped}", result.skipped.join(", ")),
        timeout: 3200,
      })
    }
  }

  function ingest(raw: string, commitTrailing: boolean) {
    const { complete, rest } = splitNameDraft(raw, commitTrailing)
    if (!complete.length) {
      setDraftValue(commitTrailing ? "" : rest)
      return namesRef.current
    }
    const result = commitNames(self.name, namesRef.current, complete)
    applyCommit(result)
    setDraftValue(rest)
    return result.names
  }

  function commitDraft() {
    return ingest(draftRef.current, true)
  }

  useImperativeHandle(ref, () => ({ commitDraft }))

  const visibleSuggestions = suggestions.filter((name) => {
    const key = nameKey(name)
    if (!key || key === nameKey(self.name)) return false
    return !names.some((friend) => nameKey(friend) === key)
  })

  const flashedName = flash
    ? flash.vsYou
      ? self.name.trim() || flash.key
      : names.find((name) => nameKey(name) === flash.key) || flash.key
    : ""
  const flashMessage = flash ? takenNicknameMessage(lang, flashedName, flash.vsYou) : ""

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <div
          className={cn(
            "flex min-h-11 min-w-0 flex-1 flex-wrap items-center gap-1.5 rounded-lg border border-input bg-transparent p-1.5 transition-colors",
            "focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
            "dark:bg-input/30"
          )}
          onClick={() => inputRef.current?.focus()}
        >
          {self.name.trim() ? (
            <Badge
              className={cn(
                "h-9 overflow-visible rounded-full px-2.5 text-sm",
                flash?.key === nameKey(self.name) && "chip-flash"
              )}
            >
              <span aria-hidden="true">{self.avatar || "😎"}</span>
              {self.name.trim()} · {self.label}
            </Badge>
          ) : null}
          {names.map((friend) => (
            <Badge
              key={friend}
              variant="secondary"
              className={cn(
                "chip-enter h-9 gap-0.5 overflow-visible rounded-full py-0 pr-0.5 pl-2 text-sm",
                flash?.key === nameKey(friend) && "chip-flash"
              )}
            >
              <span
                className="grid size-5 place-items-center rounded-full bg-foreground/10 text-[10px] font-bold"
                aria-hidden="true"
              >
                {initial(friend)}
              </span>
              {friend}
              <button
                type="button"
                className="grid size-8 place-items-center rounded-full active:scale-[0.97]"
                aria-label={`${t(lang, "del")} ${friend}`}
                onClick={(event) => {
                  event.stopPropagation()
                  const next = namesRef.current.filter((name) => name !== friend)
                  namesRef.current = next
                  onChange(next)
                }}
              >
                <XIcon className="size-3.5" />
              </button>
            </Badge>
          ))}
          <input
            ref={inputRef}
            id={inputId}
            className="h-9 min-w-[4.5rem] flex-1 bg-transparent px-1.5 text-base outline-none placeholder:text-muted-foreground"
            enterKeyHint="done"
            autoCapitalize="words"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="off"
            maxLength={MEMBER_NAME_MAX}
            value={draft}
            placeholder={names.length || self.name.trim() ? "" : t(lang, "obAddFriend")}
            aria-describedby={`${inputId}-tip`}
            onChange={(event) => {
              const value = event.target.value
              if (composing.current) {
                setDraftValue(value)
                return
              }
              if (hasNameSeparator(value)) ingest(value, false)
              else setDraftValue(value)
            }}
            onPaste={(event) => {
              const text = event.clipboardData.getData("text")
              if (!hasNameSeparator(text)) return
              event.preventDefault()
              ingest(`${draft}${text}`, true)
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                if (!composing.current) ingest(draft, true)
                return
              }
              if (event.key === "Backspace" && !draft && namesRef.current.length) {
                event.preventDefault()
                const next = namesRef.current.slice(0, -1)
                namesRef.current = next
                onChange(next)
              }
            }}
            onBlur={() => {
              if (draft.trim()) ingest(draft, true)
            }}
            onCompositionStart={() => {
              composing.current = true
            }}
            onCompositionEnd={(event) => {
              composing.current = false
              const value = event.currentTarget.value
              if (hasNameSeparator(value)) ingest(value, false)
              else setDraftValue(value)
            }}
          />
        </div>
        <Button
          type="button"
          size="touch"
          className="shrink-0 active:scale-[0.97]"
          variant="outline"
          onClick={() => {
            ingest(draft, true)
            inputRef.current?.focus()
          }}
        >
          {t(lang, "obAddChip")}
        </Button>
      </div>
      <FieldDescription id={`${inputId}-tip`}>{t(lang, "rosterTip")}</FieldDescription>
      <p className="sr-only" aria-live="polite">
        {flashMessage}
      </p>
      {visibleSuggestions.length ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label={t(lang, "recentBarkada")}>
          {visibleSuggestions.map((name) => (
            <Button
              key={name}
              type="button"
              variant="outline"
              className="h-11 rounded-full px-3.5 active:scale-[0.97]"
              onClick={() => {
                const result = commitNames(self.name, names, [name])
                applyCommit(result)
                inputRef.current?.focus()
              }}
            >
              + {name}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
