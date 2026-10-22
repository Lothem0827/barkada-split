"use client"

import { useEffect, useRef, useState } from "react"

import { CopyAction } from "@/components/barkada/copy-action"
import { HatianActionSheet } from "@/components/barkada/hatian-action-sheet"
import { SulkMeter } from "@/components/barkada/sulk-meter"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { balances, dayStr, daysOwed, fmtAgo, fmtDate, peso, plain, potOf, transfers } from "@/lib/calc"
import { toast } from "@/components/ui/toast"
import { t, type CopyKey } from "@/lib/i18n"
import { reminder } from "@/lib/reminders"
import { useBarkada } from "@/lib/store"
import {
  PERSONAS,
  digits,
  gcashOf,
  hasCooldownNudge,
  isTreasurer,
  memberName,
  type Lang,
  type Persona,
  type Transfer,
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
  const [toneOpen, setToneOpen] = useState<string | null>(null)
  const [cardPersona, setCardPersona] = useState<Record<string, Persona>>({})
  const [hatianScope, setHatianScope] = useState<HatianScope>(treasurer ? "all" : "mine")
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null)
  const cardRefs = useRef<Record<string, HTMLElement | null>>({})

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

  function involved(row: Transfer) {
    return row.from === as || row.to === as
  }

  function canInteract(row: Transfer) {
    return involved(row) || treasurer
  }

  function canNudge(row: Transfer) {
    return row.to === as || treasurer
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
          {t(lang, "myHatian").replace("{n}", String(mine.length))}
        </ToggleGroupItem>
        <ToggleGroupItem value="all" className="min-h-[40px] flex-1 px-3.5">
          {t(lang, "allHatian").replace("{n}", String(list.length))}
        </ToggleGroupItem>
      </ToggleGroup>

      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-heading text-lg font-semibold">{t(lang, "members")}</h2>
        <span className="text-sm text-muted-foreground">{t(lang, "plusOwed")}</span>
      </div>
      <Card>
        <CardContent>
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
          if (!canInteract(row)) {
            return (
              <Card key={key}>
                <CardContent className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <p className="font-heading text-sm font-semibold">
                      {memberName(trip, row.from)}
                      <span className="text-muted-foreground"> → </span>
                      {memberName(trip, row.to)}
                    </p>
                    <Badge variant="secondary" className="w-fit">
                      {pending ? t(lang, "sentShort") : t(lang, "chill")}
                    </Badge>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-0.5">
                    <span className="font-mono text-base font-semibold tabular-nums">{peso(row.pay)}</span>
                    {row.pay !== row.amount ? (
                      <span className="text-xs text-muted-foreground">
                        {t(lang, "exact")}: {peso(row.amount)}
                      </span>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            )
          }

          const number = gcashOf(trip, row.to)
          const tone = personaOf(key)
          const preview = reminder(trip, row, tone, lang, now)
          const nudgeLocked =
            !!pending || hasCooldownNudge(trip.nudges, row.from, row.to, trip.treasurer, now)
          return (
            <Card
              key={key}
              ref={(node) => {
                cardRefs.current[key] = node
              }}
            >
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-1">
                  {memberName(trip, row.from)}
                  <span className="text-muted-foreground">→</span>
                  {memberName(trip, row.to)}
                </CardTitle>
                <CardAction>
                  <span className="font-mono text-lg font-semibold tabular-nums">{peso(row.pay)}</span>
                </CardAction>
                {row.from === as ? (
                  <Badge className="w-fit border-transparent bg-l3/15 text-l3">
                    {t(lang, "youPay").replace("{name}", memberName(trip, row.to))}
                  </Badge>
                ) : row.to === as ? (
                  <Badge className="w-fit border-transparent bg-l0/15 text-l0">
                    {t(lang, "youCollect").replace("{name}", memberName(trip, row.from))}
                  </Badge>
                ) : null}
                {row.pay !== row.amount ? (
                  <CardDescription>
                    {t(lang, "exact")}: {peso(row.amount)}
                  </CardDescription>
                ) : null}
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <SulkMeter days={daysOwed(trip, row.from, now)} lang={lang} />
                <p className="text-sm text-muted-foreground wrap-break-word">
                  {t(lang, "gcashOf")} {memberName(trip, row.to)}:{" "}
                  <span className="font-mono select-all">{number || t(lang, "noGcash")}</span>
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <CopyAction
                    size="touch"
                    variant="outline"
                    className="w-full"
                    disabled={!number}
                    copiedLabel={t(lang, "copyDone")}
                    onCopy={() => onCopy(digits(number), t(lang, "numCopied"))}
                  >
                    {t(lang, "copyNum")}
                  </CopyAction>
                  <CopyAction
                    size="touch"
                    variant="outline"
                    className="w-full"
                    copiedLabel={t(lang, "copyDone")}
                    onCopy={() => onCopy(plain(row.pay), plain(row.pay) + " " + t(lang, "copied"))}
                  >
                    {t(lang, "copyAmt")}
                  </CopyAction>
                </div>
                {pending ? (
                  <div className="flex flex-col gap-2">
                    <Badge variant="secondary">
                      {t(lang, "sentWait").replace("{name}", memberName(trip, row.to))}
                    </Badge>
                    {as === row.to || treasurer ? (
                      <Button
                        size="cta"
                        className="min-h-[46px]"
                        onClick={() => {
                          const result = confirmPayment(pending.id)
                          toast.add({ title: result.message, timeout: 1800 })
                        }}
                      >
                        {t(lang, "confirm")}
                      </Button>
                    ) : null}
                  </div>
                ) : as === row.from || treasurer ? (
                  <Button
                    size="cta"
                    className="min-h-[46px]"
                    onClick={() => {
                      const result = markPaid(row.from, row.to, row.amount)
                      toast.add({ title: result.message, timeout: 1800 })
                    }}
                  >
                    {as === row.from ? t(lang, "paid") : t(lang, "markPaid")}
                  </Button>
                ) : null}
                {canNudge(row) ? (
                  <Button
                    size="touch"
                    variant="ghost"
                    className="w-full"
                    aria-expanded={openKey === key}
                    onClick={() => {
                      const next = openKey === key ? null : key
                      setOpenKey(next)
                      if (next && !cardPersona[key]) {
                        setCardPersona((prev) => ({ ...prev, [key]: persona }))
                      }
                    }}
                  >
                    {t(lang, "remind")}
                  </Button>
                ) : null}
                {canNudge(row) && openKey === key ? (
                  <div className="flex flex-col gap-2 border-t border-dashed pt-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        className="min-h-[34px] rounded-full border border-border bg-background px-2.5 text-xs font-bold"
                        aria-expanded={toneOpen === key}
                        onClick={() => setToneOpen(toneOpen === key ? null : key)}
                      >
                        {t(lang, "tonePill").replace("{persona}", t(lang, PERSONA_COPY[tone]))}
                      </button>
                    </div>
                    {toneOpen === key ? (
                      <div className="flex flex-wrap gap-1.5">
                        {PERSONAS.map((item) => (
                          <Button
                            key={item.id}
                            type="button"
                            size="xs"
                            variant={tone === item.id ? "default" : "outline"}
                            className="min-h-[34px] rounded-full px-2.5 text-xs font-bold"
                            onClick={() => setCardPersona((prev) => ({ ...prev, [key]: item.id }))}
                          >
                            {t(lang, PERSONA_COPY[item.id])}
                          </Button>
                        ))}
                      </div>
                    ) : null}
                    <p className="rounded-lg border bg-muted/40 p-3 text-sm whitespace-pre-wrap wrap-break-word">
                      {preview}
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        className="min-h-[42px] w-full"
                        disabled={nudgeLocked}
                        onClick={() => {
                          const result = sendNudge(row.from, row.to, row.amount, tone, preview)
                          toast.add({ title: result.message, timeout: 1800 })
                        }}
                      >
                        {nudgeLocked
                          ? t(lang, "nudgedPending")
                          : t(lang, "nudgeInApp").replace("{name}", memberName(trip, row.from))}
                      </Button>
                      <CopyAction
                        variant="secondary"
                        className="min-h-[42px] w-full"
                        copiedLabel={t(lang, "copyDone")}
                        onCopy={() => onCopy(preview, t(lang, "msgCopied"))}
                      >
                        {t(lang, "copyForGc")}
                      </CopyAction>
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          )
        })
      ) : (
        <Empty className="border">
          <EmptyHeader>
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
    </div>
  )
}

function dayLate(days: number, lang: Lang) {
  return dayStr(days, lang) + " " + t(lang, "beforePay")
}
