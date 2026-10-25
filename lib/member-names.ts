import { isSeedTripId } from "@/lib/merge-trip"
import { findTakenName, nameKey, type Trip } from "@/lib/types"

export const MEMBER_NAME_MAX = 24
export const RECENT_BARKADA_CAP = 8
export const MAX_FRIEND_NAMES = 59

const SEPARATOR = /[,;\n\r]+|\s+&\s+/
const HAS_SEPARATOR = /[,;\n\r]|\s+&\s+/

function titleCaseWord(word: string) {
  const chars = [...word]
  const first = chars.findIndex((ch) => /\p{L}/u.test(ch))
  if (first < 0) return word
  return chars
    .map((ch, i) => {
      if (i === first) return ch.toLocaleUpperCase()
      return /\p{L}/u.test(ch) ? ch.toLocaleLowerCase() : ch
    })
    .join("")
}

export function sanitizeName(value: string) {
  return value
    .replace(/[<>]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, MEMBER_NAME_MAX)
    .replace(/\S+/g, titleCaseWord)
}

export const titleCaseName = sanitizeName

export function hasNameSeparator(value: string) {
  return HAS_SEPARATOR.test(value)
}

export function splitNameDraft(raw: string, commitTrailing: boolean) {
  const parts = raw.split(SEPARATOR)
  if (commitTrailing) {
    return { complete: parts.map((part) => sanitizeName(part)).filter(Boolean), rest: "" }
  }
  const rest = (parts.pop() ?? "").replace(/^\s+/, "")
  return { complete: parts.map((part) => sanitizeName(part)).filter(Boolean), rest }
}

export type NameCommitResult = {
  names: string[]
  flash: string | null
  vsYou: boolean
  added: number
  skipped: string[]
}

export function commitNames(you: string, existing: string[], tokens: string[]): NameCommitResult {
  const next = [...existing]
  let flash: string | null = null
  let vsYou = false
  let added = 0
  const skipped: string[] = []
  for (const token of tokens) {
    if (next.length >= MAX_FRIEND_NAMES) {
      skipped.push(token)
      continue
    }
    const name = sanitizeName(token)
    if (!name) {
      skipped.push(token)
      continue
    }
    const taken = findTakenName([you, ...next], name)
    if (taken) {
      skipped.push(name)
      if (!flash) {
        flash = taken
        vsYou = nameKey(taken) === nameKey(you)
      }
      continue
    }
    next.push(name)
    added += 1
  }
  return { names: next, flash, vsYou, added, skipped }
}

export function recentBarkadaNames(
  lakads: Trip[],
  you: string,
  already: string[],
  cap = RECENT_BARKADA_CAP
) {
  const seen = new Set([nameKey(you), ...already.map(nameKey)].filter(Boolean))
  const out: string[] = []
  for (const trip of lakads) {
    if (isSeedTripId(trip.id)) continue
    for (const member of trip.members) {
      const key = nameKey(member.name)
      if (!key || seen.has(key)) continue
      seen.add(key)
      out.push(member.name)
      if (out.length >= cap) return out
    }
  }
  return out
}
