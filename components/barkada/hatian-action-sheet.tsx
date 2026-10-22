"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import { toast } from "@/components/ui/toast"
import { fmtAgo, peso } from "@/lib/calc"
import { t } from "@/lib/i18n"
import { canCancelSent, canConfirmPayment, canRevertConfirmed } from "@/lib/payments"
import { useBarkada } from "@/lib/store"
import { memberName, type Payment } from "@/lib/types"

export function HatianActionSheet({
  payment,
  open,
  onOpenChange,
}: {
  payment: Payment | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { state, trip, now, confirmPayment, undoPayment } = useBarkada()
  if (!trip || !payment) return null

  const { lang, as } = state
  const current = payment
  const showConfirm = canConfirmPayment(as, trip, current)
  const showCancel = canCancelSent(as, trip, current)
  const showRevert = canRevertConfirmed(as, trip, current)
  const showUndo = showCancel || showRevert

  function close() {
    onOpenChange(false)
  }

  function runUndo() {
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(15)
    const result = undoPayment(current.id)
    toast.add({ title: result.message, timeout: 1800 })
    if (result.ok) close()
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange} swipeDirection="down" showSwipeHandle>
      <DrawerContent className="mx-auto min-h-[52vh] max-w-[560px]">
        <DrawerHeader>
          <DrawerTitle>{t(lang, "hatianPaySheetTitle")}</DrawerTitle>
          <DrawerDescription>
            {t(lang, current.status === "confirmed" ? "hatianPaySheetConfirmed" : "hatianPaySheetSent")}
          </DrawerDescription>
        </DrawerHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
          <p className="font-heading text-base font-semibold wrap-break-word">
            {memberName(trip, current.from)}
            <span className="text-muted-foreground"> → </span>
            {memberName(trip, current.to)}
          </p>
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-mono text-2xl font-semibold tabular-nums">{peso(current.amount)}</span>
            <Badge variant="secondary">
              {t(lang, current.status === "confirmed" ? "confirmedShort" : "sentShort")}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{fmtAgo(current.ts, now, lang)}</p>
          {showConfirm ? (
            <Button
              size="cta"
              className="min-h-[46px]"
              onClick={() => {
                const result = confirmPayment(current.id)
                toast.add({ title: result.message, timeout: 1800 })
                if (result.ok) close()
              }}
            >
              {t(lang, "confirm")}
            </Button>
          ) : null}
        </div>
        {showUndo ? (
          <DrawerFooter className="min-h-[30%] justify-end pb-[calc(4.75rem+env(safe-area-inset-bottom))]">
            <Button variant="outline" className="min-h-[44px] w-full" onClick={runUndo}>
              {showRevert ? t(lang, "revertPay") : t(lang, "undoPay")}
            </Button>
          </DrawerFooter>
        ) : null}
      </DrawerContent>
    </Drawer>
  )
}
