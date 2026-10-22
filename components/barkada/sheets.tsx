"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { PlusIcon, XIcon } from "lucide-react"

import { CopyAction } from "@/components/barkada/copy-action"
import { Button } from "@/components/ui/button"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { estCalc, peso } from "@/lib/calc"
import { toast } from "@/components/ui/toast"
import { t } from "@/lib/i18n"
import { markJustCreated, parseJoinCodeFromInput } from "@/lib/join-code"
import { estMessage } from "@/lib/reminders"
import { useBarkada } from "@/lib/store"
import type { EstDraft } from "@/lib/types"

export function TripSheet({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const { state, createTrip } = useBarkada()
  const { lang, profile } = state
  const [name, setName] = useState("")
  const [you, setYou] = useState(profile.name)
  const [others, setOthers] = useState("")
  const [gcash, setGcash] = useState(profile.gcash)
  const [error, setError] = useState("")

  return (
    <Drawer open={open} onOpenChange={onOpenChange} swipeDirection="down" showSwipeHandle>
      <DrawerContent className="mx-auto max-w-[560px]">
        <DrawerHeader>
          <DrawerTitle>{t(lang, "newTrip")}</DrawerTitle>
        </DrawerHeader>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-3">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="f-name">{t(lang, "tripName")}</FieldLabel>
              <Input
                id="f-name"
                enterKeyHint="next"
                maxLength={60}
                value={name}
                placeholder="La Union Sunset Run"
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="f-you">{t(lang, "yourName")}</FieldLabel>
              <Input
                id="f-you"
                enterKeyHint="next"
                maxLength={40}
                value={you}
                placeholder="Migs"
                onChange={(event) => {
                  setYou(event.target.value)
                  if (error) setError("")
                }}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="f-others">{t(lang, "others")}</FieldLabel>
              <Input
                id="f-others"
                enterKeyHint="next"
                value={others}
                placeholder="Bea, Jopet, Tin"
                onChange={(event) => {
                  setOthers(event.target.value)
                  if (error) setError("")
                }}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="f-gc">{t(lang, "gnum")}</FieldLabel>
              <Input
                id="f-gc"
                type="tel"
                inputMode="tel"
                enterKeyHint="done"
                className="font-mono"
                maxLength={30}
                value={gcash}
                placeholder="09XX XXX XXXX"
                onChange={(event) => setGcash(event.target.value)}
              />
            </Field>
            {error ? <FieldError>{error}</FieldError> : null}
          </FieldGroup>
        </div>
        <DrawerFooter>
          <Button
            size="cta"
            onClick={() => {
              const result = createTrip(name, you, others, gcash)
              if (!result.ok) {
                setError(result.message)
                return
              }
              toast.add({ title: result.message, timeout: 1800 })
              onOpenChange(false)
              if (result.tripId) {
                markJustCreated(result.tripId)
                router.push("/lakad/" + result.tripId)
              }
            }}
          >
            {t(lang, "createTrip")}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

export function MemberSheet({
  open,
  memberId,
  onOpenChange,
}: {
  open: boolean
  memberId: string | null
  onOpenChange: (open: boolean) => void
}) {
  const { state, trip, addMember, editMember } = useBarkada()
  const { lang } = state
  const existing = trip && memberId ? trip.members.find((member) => member.id === memberId) : null
  const [name, setName] = useState(existing?.name ?? "")
  const [gcash, setGcash] = useState(existing?.gcash ?? "")
  const [error, setError] = useState("")

  return (
    <Drawer open={open} onOpenChange={onOpenChange} swipeDirection="down" showSwipeHandle>
      <DrawerContent className="mx-auto max-w-[560px]">
        <DrawerHeader>
          <DrawerTitle>{memberId ? t(lang, "edit") : t(lang, "addMember")}</DrawerTitle>
        </DrawerHeader>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-3">
          <FieldGroup>
            <Field data-invalid={error ? true : undefined}>
              <FieldLabel htmlFor="f-mn">{t(lang, "memberName")}</FieldLabel>
              <Input
                id="f-mn"
                enterKeyHint="next"
                maxLength={40}
                value={name}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "f-mn-error" : undefined}
                onChange={(event) => {
                  setName(event.target.value)
                  if (error) setError("")
                }}
              />
              {error ? <FieldError id="f-mn-error">{error}</FieldError> : null}
            </Field>
            <Field>
              <FieldLabel htmlFor="f-mg">{t(lang, "memberGcash")}</FieldLabel>
              <Input
                id="f-mg"
                type="tel"
                inputMode="tel"
                enterKeyHint="done"
                className="font-mono"
                maxLength={30}
                value={gcash}
                placeholder="09XX XXX XXXX"
                onChange={(event) => setGcash(event.target.value)}
              />
            </Field>
            {!memberId ? <FieldDescription>{t(lang, "memberAddHint")}</FieldDescription> : null}
          </FieldGroup>
        </div>
        <DrawerFooter>
          <Button
            size="cta"
            onClick={() => {
              const result = memberId ? editMember(memberId, name, gcash) : addMember(name, gcash)
              if (!result.ok) {
                setError(result.message)
                return
              }
              toast.add({ title: result.message, timeout: 1800 })
              onOpenChange(false)
            }}
          >
            {memberId ? t(lang, "save") : t(lang, "addMember")}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

export function JoinSheet({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const { state } = useBarkada()
  const { lang } = state
  const [code, setCode] = useState("")
  const [error, setError] = useState("")

  function go() {
    const short = parseJoinCodeFromInput(code)
    if (!short) {
      setError(t(lang, "joinCodeNeed"))
      return
    }
    onOpenChange(false)
    router.push("/join/" + short)
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange} swipeDirection="down" showSwipeHandle>
      <DrawerContent className="mx-auto max-w-[560px]">
        <DrawerHeader>
          <DrawerTitle>{t(lang, "joinViaCode")}</DrawerTitle>
          <DrawerDescription>{t(lang, "obJoinCodeHint")}</DrawerDescription>
        </DrawerHeader>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-3">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="join-code">{t(lang, "joinCodeLabel")}</FieldLabel>
              <Input
                id="join-code"
                className="font-mono"
                enterKeyHint="go"
                autoComplete="off"
                spellCheck={false}
                value={code}
                placeholder={t(lang, "joinCodePh")}
                onChange={(event) => {
                  setCode(event.target.value)
                  setError("")
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    go()
                  }
                }}
              />
            </Field>
            {error ? <FieldError>{error}</FieldError> : null}
          </FieldGroup>
        </div>
        <DrawerFooter>
          <Button size="cta" onClick={go}>
            {t(lang, "obJoinIn")}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

export function CopySheet({
  open,
  text,
  onOpenChange,
}: {
  open: boolean
  text: string
  onOpenChange: (open: boolean) => void
}) {
  const { state } = useBarkada()
  const { lang } = state

  return (
    <Drawer open={open} onOpenChange={onOpenChange} swipeDirection="down" showSwipeHandle>
      <DrawerContent className="mx-auto max-w-[560px]">
        <DrawerHeader>
          <DrawerTitle>{t(lang, "copyManual")}</DrawerTitle>
          <DrawerDescription>{t(lang, "copyManualHint")}</DrawerDescription>
        </DrawerHeader>
        <div className="px-4 py-3">
          <Textarea
            autoFocus
            readOnly
            className="min-h-28 font-mono text-base break-all select-all"
            value={text}
            onFocus={(event) => event.currentTarget.select()}
          />
        </div>
        <DrawerFooter>
          <Button size="cta" variant="outline" onClick={() => onOpenChange(false)}>
            {t(lang, "done")}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

export function EstimatorSheet({
  open,
  onOpenChange,
  onCopy,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCopy: (text: string, label: string) => boolean | void | Promise<boolean | void>
}) {
  const { state, trip } = useBarkada()
  const { lang } = state
  const [draft, setDraft] = useState<EstDraft>({
    rows: [
      { name: lang === "tl" ? "Tutuluyan" : "Stay", price: "" },
      { name: "Gas & toll", price: "" },
      { name: lang === "tl" ? "Pagkain" : "Food", price: "" },
      { name: "Activities", price: "" },
    ],
    people: String(trip?.members.length || 4),
    buffer: 10,
    round: 5000,
  })

  const calc = estCalc(draft)

  return (
    <Drawer open={open} onOpenChange={onOpenChange} swipeDirection="down" showSwipeHandle>
      <DrawerContent className="mx-auto max-w-[560px]">
        <DrawerHeader>
          <DrawerTitle>{t(lang, "estimator")}</DrawerTitle>
          <DrawerDescription>{t(lang, "estHint")}</DrawerDescription>
        </DrawerHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-3">
          {draft.rows.map((row, index) => (
            <div key={index} className="grid grid-cols-[minmax(0,1fr)_6.5rem_2.75rem] gap-2">
              <Input
                enterKeyHint="next"
                maxLength={60}
                value={row.name}
                onChange={(event) => {
                  const rows = draft.rows.slice()
                  rows[index] = { ...row, name: event.target.value }
                  setDraft({ ...draft, rows })
                }}
              />
              <Input
                type="text"
                inputMode="decimal"
                pattern="[0-9.]*"
                enterKeyHint="done"
                className="font-mono"
                value={row.price}
                placeholder="0.00"
                onChange={(event) => {
                  const rows = draft.rows.slice()
                  rows[index] = { ...row, price: event.target.value }
                  setDraft({ ...draft, rows })
                }}
              />
              <Button
                size="icon"
                variant="outline"
                className="size-11"
                aria-label={t(lang, "del")}
                onClick={() => setDraft({ ...draft, rows: draft.rows.filter((_, i) => i !== index) })}
              >
                <XIcon />
              </Button>
            </div>
          ))}
          <Button
            size="touch"
            variant="outline"
            onClick={() => setDraft({ ...draft, rows: [...draft.rows, { name: "", price: "" }] })}
          >
            <PlusIcon data-icon="inline-start" />
            {t(lang, "estAdd")}
          </Button>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="f-people">{t(lang, "estPeople")}</FieldLabel>
              <Input
                id="f-people"
                type="text"
                inputMode="numeric"
                enterKeyHint="done"
                className="font-mono"
                value={draft.people}
                onChange={(event) => setDraft({ ...draft, people: event.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel>{t(lang, "estBuffer")}</FieldLabel>
              <ToggleGroup
                variant="outline"
                spacing={1}
                value={[String(draft.buffer)]}
                onValueChange={(next) => {
                  const picked = next[next.length - 1]
                  if (picked) setDraft({ ...draft, buffer: Number(picked) })
                }}
              >
                {[0, 10, 15, 20].map((value) => (
                  <ToggleGroupItem key={value} value={String(value)} className="min-h-[40px] px-3.5">
                    {value}%
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>
            <Field>
              <FieldLabel>{t(lang, "estRound")}</FieldLabel>
              <ToggleGroup
                variant="outline"
                spacing={1}
                value={[String(draft.round)]}
                onValueChange={(next) => {
                  const picked = next[next.length - 1]
                  if (picked) setDraft({ ...draft, round: Number(picked) })
                }}
              >
                <ToggleGroupItem value="100" className="min-h-[40px] px-3.5">
                  ₱1
                </ToggleGroupItem>
                <ToggleGroupItem value="5000" className="min-h-[40px] px-3.5">
                  ₱50
                </ToggleGroupItem>
                <ToggleGroupItem value="10000" className="min-h-[40px] px-3.5">
                  ₱100
                </ToggleGroupItem>
              </ToggleGroup>
            </Field>
          </FieldGroup>
          <div className="rounded-xl bg-muted/50 p-3 text-sm">
            {!calc.total ? (
              <p className="text-muted-foreground">{t(lang, "estEmpty")}</p>
            ) : !calc.n ? (
              <p className="text-destructive">{t(lang, "estPeople")}</p>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="flex justify-between gap-2 font-semibold">
                  <span>{t(lang, "estTotal")}</span>
                  <span className="font-mono">{peso(calc.total)}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span>
                    {t(lang, "estBuffer")} ({draft.buffer}%)
                  </span>
                  <span className="font-mono">{peso(calc.buf)}</span>
                </div>
                <div className="flex justify-between gap-2 font-heading text-xl font-extrabold">
                  <span>{t(lang, "estPer")}</span>
                  <span className="font-mono">{peso(calc.per)}</span>
                </div>
                <p className="text-muted-foreground">
                  {t(lang, "estCollect")} {peso(calc.collect)} · {t(lang, "estExtra")} {peso(calc.extra)}
                </p>
              </div>
            )}
          </div>
        </div>
        <DrawerFooter>
          <CopyAction
            size="cta"
            disabled={!calc.total || !calc.n}
            copiedLabel={t(lang, "copyDone")}
            onCopy={() =>
              onCopy(
                estMessage(draft, calc, trip?.name || (lang === "tl" ? "lakad natin" : "our trip"), trip?.gcash || "", lang),
                t(lang, "ambagCopied")
              )
            }
          >
            {t(lang, "estCopy")}
          </CopyAction>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
