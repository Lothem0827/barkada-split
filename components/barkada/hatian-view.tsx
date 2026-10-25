"use client"

import { useEffect, useRef, useState } from "react"
import {
  BanknoteIcon,
  BellIcon,
  CheckIcon,
  ClockIcon,
  CopyIcon,
  CrownIcon,
  HandIcon,
  InboxIcon,
  MegaphoneIcon,
  PartyPopperIcon,
  PlusIcon,
  SendIcon,
  TriangleAlertIcon,
  UsersIcon,
} from "lucide-react"

import { CopyAction } from "@/components/barkada/copy-action"
import { MascotAvatar, TaliStrip } from "@/components/barkada/tali-strip"
import { HatianActionSheet } from "@/components/barkada/hatian-action-sheet"
import { MemberSheet } from "@/components/barkada/sheets"
import { SulkMeter } from "@/components/barkada/sulk-meter"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { balances, dayStr, daysOwed, fmtAgo, fmtDate, peso, plain, potOf, transfers } from "@/lib/calc"
import { toast } from "@/components/ui/toast"
import { sulkMeta, t, type CopyKey } from "@/lib/i18n"
import {
  canConfirmTransfer,
  canCopyTransfer,
  canMarkTransferSent,
  canNudgeTransfer,
  hatianViewerRole,
} from "@/lib/payments"
import { signTaliNudge } from "@/lib/companion-ai"
import { reminder } from "@/lib/reminders"
import { useBarkada } from "@/lib/store"
import {
  PERSONAS,
  digits,
  gcashOf,
  hasCooldownNudge,
  isTreasurer,
  memberName,
  newestUnreadPairNudge,
  pairSeenZonedCount,
  type Lang,
  type Persona,
  type Transfer,
  type Trip,
} from "@/lib/types"

const PERSONA_COPY: Record<Persona, CopyKey> = {
  default: "personaDefault",
  conyo: "personaConyo",
  tita: "personaTita",
  corporate: "personaCorporate",
  guilttrip: "personaGuilt",
}

type HatianScope = "mine" | "all"

export function HatianView({
  onCopy,
  focusKey,
  onFocused,
}: {
  onCopy: (text: string, label: string) => boolean | void | Promise<boolean | void>
  focusKey?: string | null
  onFocused?: () => void
}) {
  const store = useBarkada()
  const { state, trip, now, markPaid, confirmPayment, sendNudge } = store
  const treasurer = trip ? isTreasurer(state, trip) : false
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [cardPersona, setCardPersona] = useState<Record<string, Persona>>({})
  const [hatianScope, setHatianScope] = useState<HatianScope>(treasurer ? "all" : "mine")
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null)
  const [gcashMemberId, setGcashMemberId] = useState<string | null>(null)
  const [payBusy, setPayBusy] = useState(false)
  const payBusyRef = useRef(false)
  const cardRefs = useRef<Record<string, HTMLElement | null>>({})

  function runPay(fn: () => { ok: boolean; message: string }) {
    if (payBusyRef.current) return
    payBusyRef.current = true
    setPayBusy(true)
    const result = fn()
    toast.add({ title: result.message, timeout: 1800 })
    payBusyRef.current = false
    setPayBusy(false)
  }

  useEffect(() => {
    setHatianScope(treasurer ? "all" : "mine")
  }, [trip?.id, state.as, treasurer])

  useEffect(() => {
    if (!focusKey) return
    setOpenKey(focusKey)
    setHatianScope((scope) => {
      if (scope === "all") return scope
      const [from, to] = focusKey.split(">")
      if (from === state.as || to === state.as) return scope
      return "all"
    })
    const frame = window.requestAnimationFrame(() => {
      cardRefs.current[focusKey]?.scrollIntoView({ behavior: "smooth", block: "center" })
      onFocused?.()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [focusKey, onFocused, state.as])

  if (!trip) return null
  const { lang, as, persona } = state
  const bals = balances(trip)
  const list = transfers(trip)
  const mine = list.filter((row) => row.from === as || row.to === as)
  const visible = hatianScope === "mine" ? mine : list
  const sent = trip.payments.filter((payment) => payment.status === "sent")
  const done = trip.payments
    .filter((payment) => payment.status === "confirmed")
    .slice()
    .sort((a, b) => b.ts - a.ts)
  const pot = potOf(list)
  const members = trip.members.slice().sort((a, b) => bals[a.id] - bals[b.id])
  const selectedPayment = trip.payments.find((payment) => payment.id === selectedPaymentId) ?? null

  function keyOf(row: Transfer) {
    return row.from + ">" + row.to
  }

  function personaOf(key: string) {
    return cardPersona[key] ?? persona
  }

  return (
    <div className="flex flex-col gap-4">
      <ToggleGroup
        variant="outline"
        spacing={1}
        className="flex w-full"
        value={[hatianScope]}
        onValueChange={(next) => {
          const picked = next[next.length - 1]
          if (picked === "mine" || picked === "all") setHatianScope(picked)
        }}
      >
        <ToggleGroupItem value="mine" className="min-h-[40px] flex-1 px-3.5">
          <HandIcon data-icon="inline-start" />
          {t(lang, "myHatian").replace("{n}", String(mine.length))}
        </ToggleGroupItem>
        <ToggleGroupItem value="all" className="min-h-[40px] flex-1 px-3.5">
          <UsersIcon data-icon="inline-start" />
          {t(lang, "allHatian").replace("{n}", String(list.length))}
        </ToggleGroupItem>
      </ToggleGroup>

      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-heading text-lg font-semibold">{t(lang, "members")}</h2>
        <span className="text-sm text-muted-foreground">{t(lang, "plusOwed")}</span>
      </div>
      <Card>
        <CardContent className="flex flex-col gap-3">
          <TaliStrip trip={trip} viewerId={as} activeTab="hatian" now={now} lang={lang} />
          <ItemGroup>
            {members.map((member) => {
              const value = bals[member.id]
              return (
                <Item key={member.id}>
                  <ItemContent>
                    <ItemTitle className="flex-wrap">
                      {member.name}
                      {member.id === as ? <Badge variant="secondary">{t(lang, "you")}</Badge> : null}
                    </ItemTitle>
                    {value < 0 ? (
                      <SulkMeter days={daysOwed(trip, member.id, now)} lang={lang} />
                    ) : (
                      <ItemDescription>
                        {value > 0 ? t(lang, "sisingilin") : t(lang, "quits")}
                      </ItemDescription>
                    )}
                  </ItemContent>
                  <ItemActions>
                    <span
                      className={`font-mono font-semibold tabular-nums ${value < 0 ? "text-destructive" : value > 0 ? "text-foreground" : "text-muted-foreground"}`}
                    >
                      {value > 0 ? "+" : ""}
                      {peso(value)}
                    </span>
                  </ItemActions>
                </Item>
              )
            })}
          </ItemGroup>
        </CardContent>
      </Card>

      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-heading text-lg font-semibold">{t(lang, "settle")}</h2>
        <span className="text-sm text-muted-foreground">
          {list.length} {t(lang, "transfers")}
          {trip.roundTo ? " · " + t(lang, "rounded") + " " + peso(trip.roundTo) : ""}
        </span>
      </div>

      {visible.length ? (
        visible.map((row) => {
          const key = keyOf(row)
          const pending = sent.find((payment) => payment.from === row.from && payment.to === row.to)
          const role = hatianViewerRole(as, trip.treasurer, row.from, row.to)
          const sulk = sulkMeta(lang, daysOwed(trip, row.from, now))
          const fromName = memberName(trip, row.from)
          const toName = memberName(trip, row.to)

          if (role === "uninvolved") {
            return (
              <div
                key={key}
                ref={(node) => {
                  cardRefs.current[key] = node
                }}
                className="flex items-center justify-between gap-3 rounded-full border bg-background px-3.5 py-2.5 text-sm"
              >
                <p className="min-w-0 truncate font-medium">
                  {fromName}
                  <span className="text-muted-foreground"> → </span>
                  {toName}
                </p>
                <div className="flex shrink-0 items-center gap-2">
                  <div className="flex flex-col items-end">
                    <span className="font-mono font-semibold tabular-nums">{peso(row.pay)}</span>
                    {row.roundingDiff !== 0 ? (
                      <span className="max-w-[160px] text-right text-[11px] leading-tight text-muted-foreground">
                        {t(lang, "butalBadge")
                          .replace("{exact}", peso(row.exactAmount))
                          .replace("{diff}", (row.roundingDiff > 0 ? "+" : "") + peso(row.roundingDiff))}
                      </span>
                    ) : null}
                  </div>
                  <Badge variant="secondary">
                    {pending ? (
                      <>
                        <ClockIcon className="size-3.5" />
                        {t(lang, "sentShort")}
                      </>
                    ) : (
                      sulk.emoji + " " + sulk.name
                    )}
                  </Badge>
                </div>
              </div>
            )
          }

          const number = gcashOf(trip, row.to)
          const tone = personaOf(key)
          const fromTreasurer = role === "treasurer_overseeing"
          const preview = signTaliNudge(reminder(trip, row, tone, "tl", now, { fromTreasurer }))
          const nudgeLocked =
            !!pending || hasCooldownNudge(trip.nudges, row.from, row.to, trip.treasurer, now)
          const incoming = newestUnreadPairNudge(trip.nudges, row.from, row.to, trip.treasurer)
          const seenCount = pairSeenZonedCount(trip.nudges, row.from, row.to, trip.treasurer)
          const showCopy = canCopyTransfer(as, trip.treasurer, row.from, row.to)
          const showNudge = canNudgeTransfer(as, trip.treasurer, row.from, row.to) && !pending
          const showConfirm = !!pending && canConfirmTransfer(as, trip.treasurer, row.from, row.to)
          const showMarkPaid = !pending && canMarkTransferSent(as, trip.treasurer, row.from, row.to)

          return (
            <Card
              key={key}
              ref={(node) => {
                cardRefs.current[key] = node
              }}
              className={openKey === key ? "ring-2 ring-ring" : undefined}
            >
              <CardHeader>
                <CardTitle className="flex min-w-0 flex-wrap items-center gap-1">
                  <span className="max-w-[140px] truncate">{fromName}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="max-w-[140px] truncate">{toName}</span>
                </CardTitle>
                <CardAction>
                  <span className="font-mono text-lg font-semibold tabular-nums">{peso(row.pay)}</span>
                </CardAction>
                {role === "debtor" ? (
                  <Badge className="w-fit border-transparent bg-l3/15 text-l3">
                    <SendIcon className="size-3.5" />
                    {t(lang, "youPay").replace("{name}", toName)}
                  </Badge>
                ) : role === "creditor" ? (
                  <Badge className="w-fit border-transparent bg-l0/15 text-l0">
                    <InboxIcon className="size-3.5" />
                    {t(lang, "youCollect").replace("{name}", fromName)}
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="w-fit">
                    <CrownIcon className="size-3.5" />
                    {t(lang, "treasOversight").replace("{from}", fromName).replace("{to}", toName)}
                  </Badge>
                )}
                {row.roundingDiff !== 0 ? (
                  <CardDescription>
                    {t(lang, "butalBadge")
                      .replace("{exact}", peso(row.exactAmount))
                      .replace("{diff}", (row.roundingDiff > 0 ? "+" : "") + peso(row.roundingDiff))}
                  </CardDescription>
                ) : null}
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <SulkMeter days={daysOwed(trip, row.from, now)} lang={lang} />
                {role === "debtor" && incoming ? (
                  <Alert>
                    <AlertDescription>
                      <MegaphoneIcon className="mr-1 inline size-3.5 align-[-2px]" />
                      {t(lang, "nudgedYou").replace("{name}", memberName(trip, incoming.from))}
                    </AlertDescription>
                  </Alert>
                ) : null}
                {showCopy ? (
                  <>
                    <p className="text-sm text-muted-foreground wrap-break-word">
                      {t(lang, "gcashOf")} {toName}:{" "}
                      <span className="font-mono select-all">{number || t(lang, "noGcash")}</span>
                    </p>
                    {!number && role === "debtor" ? (
                      <p className="text-sm font-medium text-destructive">
                        <TriangleAlertIcon className="mr-1 inline size-3.5 align-[-2px]" />
                        {t(lang, "creditorNoGcash").replace("{name}", toName)}
                      </p>
                    ) : null}
                    <div className="grid grid-cols-2 gap-2">
                      <CopyAction
                        size="touch"
                        variant="outline"
                        className="w-full"
                        disabled={!number}
                        copiedLabel={t(lang, "copyDone")}
                        onCopy={() => onCopy(digits(number), t(lang, "numCopied"))}
                      >
                        <CopyIcon data-icon="inline-start" />
                        {t(lang, "copyNumOf").replace("{name}", toName)}
                      </CopyAction>
                      <CopyAction
                        size="touch"
                        variant="outline"
                        className="w-full"
                        copiedLabel={t(lang, "copyDone")}
                        onCopy={() => onCopy(plain(row.pay), plain(row.pay) + " " + t(lang, "copied"))}
                      >
                        <BanknoteIcon data-icon="inline-start" />
                        {t(lang, "copyAmt")}
                      </CopyAction>
                    </div>
                  </>
                ) : null}
                {role === "creditor" && !number ? (
                  <Button
                    size="touch"
                    className="w-full"
                    onClick={() => setGcashMemberId(row.to)}
                  >
                    <PlusIcon data-icon="inline-start" />
                    {t(lang, "addMyGcash")}
                  </Button>
                ) : null}
                {role === "debtor" && pending ? (
                  <Badge variant="secondary" className="w-fit whitespace-normal">
                    <ClockIcon className="size-3.5 shrink-0" />
                    {t(lang, "sentWaitConfirm")
                      .replace("{amt}", peso(pending.amount))
                      .replace("{name}", toName)}
                  </Badge>
                ) : null}
                {showConfirm && pending ? (
                  <Button
                    size="cta"
                    className={
                      role === "creditor"
                        ? "min-h-[46px] bg-l0 text-white hover:bg-l0/90"
                        : "min-h-[46px]"
                    }
                    disabled={payBusy}
                    onClick={() => runPay(() => confirmPayment(pending.id))}
                  >
                    <CheckIcon data-icon="inline-start" />
                    {t(lang, "confirmReceived").replace("{amt}", peso(pending.amount))}
                  </Button>
                ) : null}
                {showMarkPaid && role === "debtor" ? (
                  <Button
                    size="cta"
                    className="min-h-[46px]"
                    disabled={payBusy}
                    onClick={() => runPay(() => markPaid(row.from, row.to, row.amount))}
                  >
                    <HandIcon data-icon="inline-start" />
                    {t(lang, "paidAmt").replace("{amt}", peso(row.pay))}
                  </Button>
                ) : null}
                {showNudge ? (
                  <NudgeComposer
                    trip={trip}
                    row={row}
                    lang={lang}
                    tone={tone}
                    preview={preview}
                    nudgeLocked={nudgeLocked}
                    fromTreasurer={fromTreasurer}
                    seenCount={seenCount}
                    onTone={(next) => setCardPersona((prev) => ({ ...prev, [key]: next }))}
                    onNudge={() => {
                      const result = sendNudge(row.from, row.to, row.amount, tone, preview)
                      toast.add({ title: result.message, timeout: 1800 })
                    }}
                    onCopy={() => onCopy(preview, t(lang, "msgCopied"))}
                  />
                ) : null}
                {showMarkPaid && role === "treasurer_overseeing" ? (
                  <Button
                    size="cta"
                    className="min-h-[46px]"
                    disabled={payBusy}
                    onClick={() => runPay(() => markPaid(row.from, row.to, row.amount))}
                  >
                    <HandIcon data-icon="inline-start" />
                    {t(lang, "markPaidCta")}
                  </Button>
                ) : null}
                {showMarkPaid && role === "creditor" ? (
                  <Button
                    size="touch"
                    variant="ghost"
                    className="w-full text-muted-foreground"
                    disabled={payBusy}
                    onClick={() => runPay(() => markPaid(row.from, row.to, row.amount))}
                  >
                    {t(lang, "markPaidBehalf")}
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          )
        })
      ) : (
        <Empty className="border">
          <EmptyHeader>
            {!(list.length && hatianScope === "mine") ? (
              <EmptyMedia variant="icon">
                <PartyPopperIcon />
              </EmptyMedia>
            ) : null}
            <EmptyTitle>
              {list.length && hatianScope === "mine" ? t(lang, "noMyDebts") : t(lang, "noDebts")}
            </EmptyTitle>
          </EmptyHeader>
        </Empty>
      )}

      {trip.roundTo && list.length ? (
        <Alert>
          <AlertTitle className="flex justify-between gap-2">
            <span>{t(lang, "pot")}</span>
            <span className="font-mono">
              {pot >= 0 ? "+" : ""}
              {peso(pot)}
            </span>
          </AlertTitle>
          <AlertDescription>{t(lang, "potHint")}</AlertDescription>
        </Alert>
      ) : null}

      {sent.length ? (
        <Card>
          <CardHeader>
            <CardTitle>{t(lang, "waiting")}</CardTitle>
            <CardDescription>
              <Badge variant="secondary">{sent.length}</Badge>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ItemGroup>
              {sent.map((payment) => (
                <Item
                  key={payment.id}
                  render={<button type="button" />}
                  className="cursor-pointer text-left hover:bg-muted/50"
                  onClick={() => setSelectedPaymentId(payment.id)}
                >
                  <ItemContent>
                    <ItemTitle className="flex-wrap">
                      {memberName(trip, payment.from)} → {memberName(trip, payment.to)}
                    </ItemTitle>
                    <ItemDescription>
                      {t(lang, "sent")} · {fmtAgo(payment.ts, now, lang)}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <span className="font-mono tabular-nums">{peso(payment.amount)}</span>
                  </ItemActions>
                </Item>
              ))}
            </ItemGroup>
          </CardContent>
        </Card>
      ) : null}

      {done.length ? (
        <Card>
          <CardHeader>
            <CardTitle>{t(lang, "payments")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ItemGroup>
              {done.map((payment) => (
                <Item
                  key={payment.id}
                  render={<button type="button" />}
                  className="cursor-pointer text-left hover:bg-muted/50"
                  onClick={() => setSelectedPaymentId(payment.id)}
                >
                  <ItemContent>
                    <ItemTitle className="flex-wrap">
                      {memberName(trip, payment.from)} → {memberName(trip, payment.to)}
                    </ItemTitle>
                    <ItemDescription>
                      {fmtDate(payment.ts)} ·{" "}
                      {payment.daysLate ? dayLate(payment.daysLate, lang) : t(lang, "onTime")}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <span className="font-mono tabular-nums">{peso(payment.amount)}</span>
                  </ItemActions>
                </Item>
              ))}
            </ItemGroup>
          </CardContent>
        </Card>
      ) : null}

      <p className="text-sm text-muted-foreground">{t(lang, "noMoney")}</p>
      <HatianActionSheet
        payment={selectedPayment}
        open={!!selectedPayment}
        onOpenChange={(next) => {
          if (!next) setSelectedPaymentId(null)
        }}
      />
      <MemberSheet
        open={!!gcashMemberId}
        memberId={gcashMemberId}
        onOpenChange={(open) => {
          if (!open) setGcashMemberId(null)
        }}
      />
    </div>
  )
}

function NudgeComposer({
  trip,
  row,
  lang,
  tone,
  preview,
  nudgeLocked,
  fromTreasurer,
  seenCount,
  onTone,
  onNudge,
  onCopy,
}: {
  trip: Trip
  row: Transfer
  lang: Lang
  tone: Persona
  preview: string
  nudgeLocked: boolean
  fromTreasurer: boolean
  seenCount: number
  onTone: (persona: Persona) => void
  onNudge: () => void
  onCopy: () => boolean | void | Promise<boolean | void>
}) {
  const fromName = memberName(trip, row.from)
  const toName = memberName(trip, row.to)
  return (
    <div className="flex flex-col gap-2 border-t border-dashed pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold">
          {fromTreasurer ? (
            <span className="inline-flex items-center gap-1">
              <CrownIcon className="size-3.5" />
              {t(lang, "treasAssistNudge")}
            </span>
          ) : (
            t(lang, "tonePill").replace("{persona}", t(lang, PERSONA_COPY[tone]))
          )}
        </p>
        {nudgeLocked ? (
          <Badge variant="secondary">
            <BellIcon className="size-3.5" />
            {t(lang, "nudgedPending")}
          </Badge>
        ) : seenCount > 0 ? (
          <Badge variant="secondary">{t(lang, "seenZoner").replace("{n}", String(seenCount))}</Badge>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <MascotAvatar />
        <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          {PERSONAS.map((item) => (
            <Button
              key={item.id}
              type="button"
              size="xs"
              variant={tone === item.id ? "default" : "outline"}
              className="min-h-[34px] rounded-full px-2.5 text-xs font-bold"
              onClick={() => onTone(item.id)}
            >
              {t(lang, PERSONA_COPY[item.id])}
            </Button>
          ))}
        </div>
      </div>
      <p className="rounded-lg border bg-muted/40 p-3 text-sm whitespace-pre-wrap wrap-break-word">{preview}</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="secondary"
          className="min-h-[42px] w-full"
          disabled={nudgeLocked}
          onClick={onNudge}
        >
          <BellIcon data-icon="inline-start" />
          {nudgeLocked
            ? t(lang, "nudgedPending")
            : fromTreasurer
              ? t(lang, "nudgeFor").replace("{from}", fromName).replace("{to}", toName)
              : t(lang, "taliNudge")}
        </Button>
        <CopyAction
          variant="secondary"
          className="min-h-[42px] w-full"
          copiedLabel={t(lang, "copyDone")}
          onCopy={onCopy}
        >
          <CopyIcon data-icon="inline-start" />
          {t(lang, "copyForGc")}
        </CopyAction>
      </div>
    </div>
  )
}

function dayLate(days: number, lang: Lang) {
  return dayStr(days, lang) + " " + t(lang, "beforePay")
}
