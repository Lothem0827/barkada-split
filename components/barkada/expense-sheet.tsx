"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { BanknoteIcon, ImagePlusIcon, PlusIcon, XIcon } from "lucide-react"

import { AmountBumpers } from "@/components/barkada/amount-bumpers"
import { MascotAvatar } from "@/components/barkada/tali-strip"
import { MemberChipRow } from "@/components/barkada/member-chip-row"
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Toggle } from "@/components/ui/toggle"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { draftToExpense, parsePeso, peso, plain, sharesOf, totalOf } from "@/lib/calc"
import { compressImage } from "@/lib/image-utils"
import { getExpenseReaction } from "@/lib/companion-ai"
import { toast } from "@/components/ui/toast"
import { t, type CopyKey } from "@/lib/i18n"
import { useBarkada } from "@/lib/store"
import {
  METHODS,
  memberName,
  newItemDraft,
  type ExpenseDraft,
  type SplitMethod,
} from "@/lib/types"

const METHOD_KEY: Record<SplitMethod, CopyKey> = {
  even: "even",
  item: "item",
  exclude: "exclude",
  libre: "libre",
}

export function ExpenseSheet({
  open,
  draft,
  onDraftChange,
  onOpenChange,
}: {
  open: boolean
  draft: ExpenseDraft | null
  onDraftChange: (draft: ExpenseDraft) => void
  onOpenChange: (open: boolean) => void
}) {
  const { state, trip, addExpense, editExpense } = useBarkada()
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)
  const savingRef = useRef(false)
  const photoRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) return
    savingRef.current = false
    setSaving(false)
  }, [open])

  const preview = useMemo(() => {
    if (!trip || !draft) return null
    return draftToExpense(trip, draft)
  }, [trip, draft])

  if (!trip || !draft) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange} swipeDirection="down" showSwipeHandle>
        <DrawerContent className="mx-auto">
          <DrawerHeader>
            <DrawerTitle>{t(state.lang, "add")}</DrawerTitle>
          </DrawerHeader>
        </DrawerContent>
      </Drawer>
    )
  }

  const { lang } = state
  const liveTrip = trip
  const liveDraft = draft
  const treasurer = state.as === liveTrip.treasurer
  const willPend = !(liveTrip.open || treasurer)
  const parsed = preview ?? draftToExpense(liveTrip, liveDraft)
  const receiptCents = liveDraft.receipt.trim() ? parsePeso(liveDraft.receipt) : NaN
  const remainder = Number.isFinite(receiptCents) ? receiptCents - parsed.e.amount : 0

  function patch(next: Partial<ExpenseDraft>) {
    onDraftChange({ ...liveDraft, ...next })
    setError("")
  }

  function save() {
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    const result = liveDraft.id ? editExpense(liveDraft.id, liveDraft) : addExpense(liveDraft)
    if (!result.ok) {
      savingRef.current = false
      setSaving(false)
      setError(result.message)
      return
    }
    toast.add({ title: result.message, timeout: 1800 })
    onOpenChange(false)
  }

  async function pickPhoto(file: File | undefined) {
    if (!file) return
    setPhotoBusy(true)
    try {
      patch({ photoUrl: await compressImage(file), photoType: liveDraft.photoType || "memory" })
    } catch {
      toast.add({ title: t(lang, "photoFailed"), timeout: 1800 })
    } finally {
      setPhotoBusy(false)
    }
  }

  function splitRemainder() {
    if (!(remainder > 0)) return
    patch({
      items: [
        ...liveDraft.items,
        { name: t(lang, "sukli"), price: plain(remainder), eaters: liveTrip.members.map((m) => m.id) },
      ],
    })
  }

  const shares = parsed.e.amount > 0 ? sharesOf(trip, { ...parsed.e, id: "preview", addedBy: state.as, status: "approved", ts: 0 }) : {}
  const kasali = trip.members.filter((member) => (shares[member.id] || 0) > 0)
  const free = trip.members.filter((member) => parsed.e.ex.includes(member.id) || (parsed.e.amount > 0 && !(shares[member.id] > 0)))
  const head = kasali[0] ? shares[kasali[0].id] : 0
  const patak =
    parsed.e.amount > 0
      ? free.length && (draft.method === "exclude" || draft.method === "libre")
        ? t(lang, "patakLibre")
            .replace("{amt}", peso(head))
            .replace("{n}", String(kasali.length))
            .replace("{free}", free.map((member) => member.name).join(", "))
        : t(lang, "patakHead").replace("{amt}", peso(head)).replace("{n}", String(kasali.length))
      : ""
  const taliReact = getExpenseReaction({
    amount: parsed.e.amount,
    method: draft.method,
    excludedNames: free.map((member) => member.name),
    head,
    payingCount: kasali.length,
  })

  return (
    <Drawer open={open} onOpenChange={onOpenChange} swipeDirection="down" showSwipeHandle>
      <DrawerContent className="mx-auto">
        <DrawerHeader>
          <DrawerTitle>{draft.id ? t(lang, "edit") : t(lang, "add")}</DrawerTitle>
          <DrawerDescription>
            {willPend ? t(lang, "pendingTreas").replace("{name}", trip.members.find((m) => m.id === trip.treasurer)?.name ?? "") : t(lang, "save")}
          </DrawerDescription>
        </DrawerHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-3">
          {trip.members.length === 0 ? (
            <Alert>
              <AlertDescription>{t(lang, "needPeople")}</AlertDescription>
            </Alert>
          ) : (
            <FieldGroup>
              <Field data-invalid={error && !draft.title.trim() ? true : undefined}>
                <FieldLabel htmlFor="f-title">{t(lang, "title")}</FieldLabel>
                <Input
                  id="f-title"
                  enterKeyHint="next"
                  maxLength={80}
                  value={draft.title}
                  placeholder="Sisig sa Aling Nena's"
                  onChange={(event) => patch({ title: event.target.value })}
                />
                {draft.title.length >= 64 ? (
                  <FieldDescription>{t(lang, "charsLeft").replace("{n}", String(80 - draft.title.length))}</FieldDescription>
                ) : null}
              </Field>
              {draft.method !== "item" ? (
                <Field>
                  <FieldLabel htmlFor="f-amt">{t(lang, "amount")}</FieldLabel>
                  <Input
                    id="f-amt"
                    type="text"
                    inputMode="decimal"
                    pattern="[0-9.]*"
                    enterKeyHint="done"
                    className="font-mono"
                    value={draft.amount}
                    placeholder="0.00"
                    onChange={(event) => patch({ amount: event.target.value })}
                  />
                  <AmountBumpers value={draft.amount} onChange={(amount) => patch({ amount })} lang={lang} />
                </Field>
              ) : null}
              <Field>
                <FieldLabel>{t(lang, "payer")}</FieldLabel>
                <MemberChipRow
                  members={[
                    ...trip.members.filter((member) => member.id === state.as),
                    ...trip.members.filter((member) => member.id !== state.as),
                  ]}
                  selected={[draft.payer]}
                  label={(member) =>
                    member.id === state.as ? t(lang, "payerMe").replace("{name}", member.name) : member.name
                  }
                  onToggle={(id) =>
                    patch({
                      payer: id,
                      ex: draft.ex.filter((item) => item !== id),
                    })
                  }
                />
              </Field>
              <Field>
                <FieldLabel>{t(lang, "split")}</FieldLabel>
                <ToggleGroup
                  variant="outline"
                  spacing={2}
                  className="grid w-full grid-cols-2"
                  value={[draft.method]}
                  onValueChange={(next) => {
                    const picked = next[next.length - 1]
                    if (picked) patch({ method: picked as SplitMethod })
                  }}
                >
                  {METHODS.map((method) => (
                    <ToggleGroupItem key={method.id} value={method.id} className="min-h-[44px] px-3.5">
                      {t(lang, METHOD_KEY[method.id])}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </Field>
              {draft.method === "exclude" || draft.method === "libre" ? (
                <Field>
                  <FieldLabel>{draft.method === "libre" ? t(lang, "libreWho") : t(lang, "excludeWho")}</FieldLabel>
                  <MemberChipRow
                    members={[
                      ...trip.members.filter((member) => member.id !== draft.payer),
                      ...trip.members.filter((member) => member.id === draft.payer),
                    ]}
                    selected={draft.ex}
                    onToggle={(id) => {
                      const selected = draft.ex.includes(id)
                      if (!selected && draft.ex.length >= trip.members.length - 1) return
                      patch({
                        ex: selected ? draft.ex.filter((item) => item !== id) : [...draft.ex, id],
                      })
                    }}
                    disabled={(id) => !draft.ex.includes(id) && draft.ex.length >= trip.members.length - 1}
                  />
                  {draft.ex.includes(draft.payer) ? (
                    <Alert>
                      <AlertDescription>
                        {(draft.method === "libre" ? t(lang, "abonoLibre") : t(lang, "abonoPwera")).replace(
                          "{name}",
                          trip.members.find((member) => member.id === draft.payer)?.name ?? ""
                        )}
                      </AlertDescription>
                    </Alert>
                  ) : null}
                </Field>
              ) : null}
              {draft.method === "item" ? (
                <FieldSet>
                  <FieldLegend variant="label">{t(lang, "items")}</FieldLegend>
                  <FieldDescription>{t(lang, "itemsHint")}</FieldDescription>
                  {draft.items.map((item, index) => {
                    const allOn = item.eaters.length === trip.members.length
                    return (
                      <div key={index} className="flex flex-col gap-2 rounded-xl bg-card p-3">
                        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_110px_auto] gap-2">
                          <div className="min-w-0">
                            <Input
                              enterKeyHint="next"
                              maxLength={60}
                              className="min-w-0"
                              value={item.name}
                              placeholder={`${t(lang, "item")} ${index + 1}`}
                              aria-label={`${t(lang, "item")} ${index + 1}`}
                              onChange={(event) => {
                                const items = draft.items.slice()
                                items[index] = { ...item, name: event.target.value }
                                patch({ items })
                              }}
                            />
                            {item.name.length >= 48 ? (
                              <p className="mt-1 text-xs text-muted-foreground">
                                {t(lang, "charsLeft").replace("{n}", String(60 - item.name.length))}
                              </p>
                            ) : null}
                          </div>
                          <Input
                            type="text"
                            inputMode="decimal"
                            pattern="[0-9.]*"
                            enterKeyHint="done"
                            className="w-[110px] font-mono"
                            value={item.price}
                            placeholder="0.00"
                            aria-label={`${t(lang, "amount")} ${index + 1}`}
                            onChange={(event) => {
                              const items = draft.items.slice()
                              items[index] = { ...item, price: event.target.value }
                              patch({ items })
                            }}
                          />
                          <Button
                            size="icon"
                            variant="outline"
                            className="size-11"
                            aria-label={t(lang, "del")}
                            onClick={() => patch({ items: draft.items.filter((_, i) => i !== index) })}
                          >
                            <XIcon />
                          </Button>
                        </div>
                        <MemberChipRow
                          members={trip.members}
                          selected={item.eaters}
                          onToggle={(id) => {
                            const items = draft.items.slice()
                            const eaters = item.eaters.includes(id)
                              ? item.eaters.filter((eater) => eater !== id)
                              : item.eaters.concat(id)
                            items[index] = { ...item, eaters }
                            patch({ items })
                          }}
                        />
                        <div className="flex gap-2">
                          <Toggle
                            variant="outline"
                            className="min-h-[40px] px-3.5"
                            pressed={allOn}
                            onPressedChange={() => {
                              const items = draft.items.slice()
                              items[index] = {
                                ...item,
                                eaters: allOn ? [] : trip.members.map((member) => member.id),
                              }
                              patch({ items })
                            }}
                          >
                            {allOn ? t(lang, "clear") : t(lang, "all")}
                          </Toggle>
                        </div>
                      </div>
                    )
                  })}
                  <Button
                    size="touch"
                    variant="outline"
                    onClick={() => patch({ items: [...draft.items, newItemDraft(trip)] })}
                  >
                    <PlusIcon data-icon="inline-start" />
                    {t(lang, "addItem")}
                  </Button>
                  <Field>
                    <FieldLabel htmlFor="f-rcpt">{t(lang, "receipt")}</FieldLabel>
                    <Input
                      id="f-rcpt"
                      type="text"
                      inputMode="decimal"
                      pattern="[0-9.]*"
                      enterKeyHint="done"
                      className="font-mono"
                      value={draft.receipt}
                      onChange={(event) => patch({ receipt: event.target.value })}
                    />
                    <FieldDescription>{t(lang, "receiptHint")}</FieldDescription>
                  </Field>
                </FieldSet>
              ) : null}
              <Field orientation="horizontal">
                <Switch id="d-sc" checked={draft.sc} onCheckedChange={(checked) => patch({ sc: checked })} />
                <FieldLabel htmlFor="d-sc">{t(lang, "sc")}</FieldLabel>
              </Field>
              <Field>
                <input
                  ref={photoRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  onChange={(event) => {
                    void pickPhoto(event.target.files?.[0])
                    event.target.value = ""
                  }}
                />
                {draft.photoUrl ? (
                  <div className="flex items-start gap-2">
                    <img src={draft.photoUrl} alt="" className="size-[72px] rounded-lg object-cover" />
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <ToggleGroup
                        variant="outline"
                        spacing={1}
                        className="flex w-full"
                        value={[draft.photoType === "receipt" ? "receipt" : "memory"]}
                        onValueChange={(next) => {
                          const picked = next[next.length - 1]
                          if (picked === "memory" || picked === "receipt") patch({ photoType: picked })
                        }}
                      >
                        <ToggleGroupItem value="memory" className="min-h-[40px] flex-1 px-2 text-xs">
                          {t(lang, "memoryPhoto")}
                        </ToggleGroupItem>
                        <ToggleGroupItem value="receipt" className="min-h-[40px] flex-1 px-2 text-xs">
                          {t(lang, "receiptPhoto")}
                        </ToggleGroupItem>
                      </ToggleGroup>
                      <Button type="button" size="xs" variant="ghost" onClick={() => patch({ photoUrl: "", photoType: "memory" })}>
                        <XIcon data-icon="inline-start" />
                        {t(lang, "removePhoto")}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    type="button"
                    size="touch"
                    variant="outline"
                    className="min-h-[44px]"
                    disabled={photoBusy}
                    onClick={() => photoRef.current?.click()}
                  >
                    <ImagePlusIcon data-icon="inline-start" />
                    {t(lang, "addPhoto")}
                  </Button>
                )}
              </Field>
              {draft.id ? (
                <Field>
                  <FieldLabel htmlFor="f-note">{t(lang, "audit")}</FieldLabel>
                  <Input
                    id="f-note"
                    enterKeyHint="done"
                    maxLength={140}
                    value={draft.note}
                    onChange={(event) => patch({ note: event.target.value })}
                  />
                </Field>
              ) : null}
              {error ? <FieldError>{error}</FieldError> : null}
              {parsed.e.amount > 0 ? (
                <div className="rounded-xl bg-muted/50 p-3 text-sm">
                  <div className="flex justify-between gap-2 font-semibold">
                    <span>
                      {t(lang, "previewTotal")}
                      {parsed.e.sc ? ` (${t(lang, "inclSc")} ${peso(totalOf(parsed.e) - parsed.e.amount)})` : ""}
                    </span>
                    <span className="font-mono">{peso(totalOf(parsed.e))}</span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                    {trip.members
                      .filter((member) => (shares[member.id] || 0) > 0)
                      .map((member) => (
                        <div key={member.id} className="flex justify-between gap-2">
                          <span className="truncate">{member.name}</span>
                          <span className="font-mono tabular-nums">{peso(shares[member.id])}</span>
                        </div>
                      ))}
                  </div>
                </div>
              ) : null}
              {draft.method === "item" && draft.receipt.trim() ? (
                !Number.isFinite(receiptCents) || !(receiptCents > 0) ? (
                  <Alert>
                    <AlertDescription>{t(lang, "sukliBad")}</AlertDescription>
                  </Alert>
                ) : remainder > 0 ? (
                  <Alert>
                    <AlertTitle>
                      {t(lang, "sukli")}: {peso(remainder)}
                    </AlertTitle>
                    <AlertAction>
                      <Button variant="outline" size="touch" onClick={splitRemainder}>
                        {t(lang, "splitRest")}
                      </Button>
                    </AlertAction>
                  </Alert>
                ) : remainder < 0 ? (
                  <Alert variant="destructive">
                    <AlertDescription>
                      {t(lang, "sukliOver")} {peso(-remainder)}
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Alert>
                    <AlertDescription>{t(lang, "sukliOk")}</AlertDescription>
                  </Alert>
                )
              ) : null}
            </FieldGroup>
          )}
        </div>
        {trip.members.length ? (
          <DrawerFooter>
            {patak ? (
              <p className="rounded-full bg-muted px-3 py-2 text-center text-sm font-medium wrap-break-word">
                <BanknoteIcon className="mr-1 inline size-3.5 align-[-2px]" />
                {patak}
              </p>
            ) : null}
            {taliReact ? (
              <div className="flex items-center gap-2.5 rounded-xl bg-card/80 p-2.5">
                <MascotAvatar />
                <p key={taliReact.message} className="min-w-0 flex-1 text-sm leading-snug wrap-break-word animate-in fade-in-0">
                  {taliReact.message}
                </p>
              </div>
            ) : null}
            <p className="text-center text-xs text-muted-foreground">
              {willPend
                ? t(lang, "treasModeHint").replace("{name}", memberName(trip, trip.treasurer))
                : t(lang, "autoApprovedHint")}
            </p>
            <Button size="cta" disabled={saving} onClick={save}>
              {draft.id ? t(lang, "save") : willPend ? t(lang, "submitApproval") : t(lang, "saveApprove")}
            </Button>
          </DrawerFooter>
        ) : null}
      </DrawerContent>
    </Drawer>
  )
}
