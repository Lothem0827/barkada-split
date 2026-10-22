"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeftIcon,
  ArrowLeftRightIcon,
  HouseIcon,
  Link2Icon,
  PlusIcon,
  ReceiptIcon,
  SettingsIcon,
  UsersIcon,
} from "lucide-react"

import { BarkadaView } from "@/components/barkada/barkada-view"
import { OnboardingView } from "@/components/barkada/onboarding-view"
import { ExpenseSheet } from "@/components/barkada/expense-sheet"
import { GastosView } from "@/components/barkada/gastos-view"
import { HatianView } from "@/components/barkada/hatian-view"
import { IncomingNudge } from "@/components/barkada/incoming-nudge"
import { HomeView } from "@/components/barkada/home-view"
import { InviteBarkadaSheet } from "@/components/barkada/invite-sheet"
import { LakadSettingsSheet } from "@/components/barkada/lakad-settings-sheet"
import { ProfilePill, ProfileSheet } from "@/components/barkada/profile-sheet"
import {
  CopySheet,
  EstimatorSheet,
  JoinSheet,
  MemberSheet,
  TripSheet,
} from "@/components/barkada/sheets"
import { WrappedCard } from "@/components/barkada/wrapped-card"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "@/components/ui/toast"
import { t } from "@/lib/i18n"
import { consumeJustCreated } from "@/lib/join-code"
import { isSeedTripId } from "@/lib/merge-trip"
import { copyText } from "@/lib/snapshot"
import { useBarkada } from "@/lib/store"
import { editExpenseDraft, memberName, newExpenseDraft, type ExpenseDraft, type ShotRatio, type Tab } from "@/lib/types"

const TABS: { id: Tab; icon: typeof HouseIcon; key: "home" | "gastos" | "hatian" | "barkada" }[] = [
  { id: "home", icon: HouseIcon, key: "home" },
  { id: "gastos", icon: ReceiptIcon, key: "gastos" },
  { id: "hatian", icon: ArrowLeftRightIcon, key: "hatian" },
  { id: "barkada", icon: UsersIcon, key: "barkada" },
]

type Confirm =
  | { kind: "delete"; id: string }
  | { kind: "handoff"; id: string; name: string }
  | { kind: "reset-lock"; id: string; name: string }
  | { kind: "del-trip" }
  | null

export function Shell() {
  return <AppFrame />
}

export function HomePage() {
  const router = useRouter()
  const { state, goHome } = useBarkada()
  useEffect(() => {
    if (!state.onboarded) router.replace("/onboarding")
    else goHome()
  }, [state.onboarded, router, goHome])
  return <AppFrame />
}

export function TripPage({ tripId }: { tripId: string }) {
  const router = useRouter()
  const { state, openTrip } = useBarkada()
  useEffect(() => {
    if (!state.onboarded) {
      router.replace("/onboarding")
      return
    }
    const found = state.lakads.find((trip) => trip.id === tripId)
    if (!found) {
      router.replace("/")
      return
    }
    if (state.activeId !== tripId) openTrip(tripId)
  }, [tripId, state.onboarded, state.lakads, state.activeId, openTrip, router])
  if (!state.onboarded) return null
  return <AppFrame />
}

function AppFrame() {
  const router = useRouter()
  const store = useBarkada()
  const { state, trip } = store
  const { lang, as, tab, screenshotMode, onboarded } = state
  const [expenseOpen, setExpenseOpen] = useState(false)
  const [draft, setDraft] = useState<ExpenseDraft | null>(null)
  const [tripOpen, setTripOpen] = useState(false)
  const [memberOpen, setMemberOpen] = useState(false)
  const [memberId, setMemberId] = useState<string | null>(null)
  const [joinOpen, setJoinOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteSeat, setInviteSeat] = useState<string | null>(null)
  const [inviteSkip, setInviteSkip] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [estimatorOpen, setEstimatorOpen] = useState(false)
  const [copyOpen, setCopyOpen] = useState(false)
  const [copyValue, setCopyValue] = useState("")
  const [shotRatio, setShotRatio] = useState<ShotRatio>("916")
  const [confirm, setConfirm] = useState<Confirm>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [hatianFocus, setHatianFocus] = useState<string | null>(null)

  const liveInvite = !!(trip && !isSeedTripId(trip.id))

  useEffect(() => {
    if (!trip || isSeedTripId(trip.id)) return
    if (typeof window === "undefined" || !window.location.pathname.startsWith("/lakad/")) return
    if (!consumeJustCreated(trip.id)) return
    setInviteSeat(null)
    setInviteSkip(true)
    setInviteOpen(true)
  }, [trip?.id])

  function notify(message: string) {
    toast.add({ title: message, timeout: 1800 })
  }

  function run(result: { ok: boolean; message: string }) {
    notify(result.message)
  }

  async function copy(text: string, label: string) {
    const ok = await copyText(text)
    if (ok) {
      notify(label)
      return true
    }
    setCopyValue(text)
    setCopyOpen(true)
    notify(t(lang, "copyManual"))
    return false
  }

  function openConfirm(next: Exclude<Confirm, null>) {
    setConfirm(next)
    setDialogOpen(true)
  }

  function runConfirm() {
    if (!confirm) return
    if (confirm.kind === "delete") run(store.deleteExpense(confirm.id))
    else if (confirm.kind === "handoff") run(store.handoff(confirm.id))
    else if (confirm.kind === "reset-lock") void store.resetSeatLock(confirm.id).then(run)
    else if (confirm.kind === "del-trip") {
      run(store.deleteTrip())
      router.push("/")
    }
    setDialogOpen(false)
  }

  function openInvite(memberId?: string) {
    if (!liveInvite) return
    setInviteSeat(memberId || null)
    setInviteSkip(false)
    setInviteOpen(true)
  }

  function openAdd() {
    if (!trip) return
    setDraft(newExpenseDraft(trip, as))
    setExpenseOpen(true)
  }

  function openEdit(id: string) {
    if (!trip) return
    const expense = trip.expenses.find((item) => item.id === id)
    if (!expense) return
    setDraft(editExpenseDraft(trip, expense, as))
    setExpenseOpen(true)
  }

  if (!onboarded) {
    return <OnboardingView />
  }

  if (screenshotMode && trip) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col items-center justify-center gap-3 bg-background px-4 py-4">
        <div
          className={`flex w-full max-w-full flex-col justify-center overflow-hidden bg-muted/40 ${shotRatio === "45" ? "aspect-[4/5] px-[7%] py-[4%]" : "aspect-[9/16] px-[6%] py-[7%]"}`}
        >
          <WrappedCard trip={trip} now={store.now} lang={lang} />
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button
            className="h-11"
            variant={shotRatio === "916" ? "default" : "outline"}
            onClick={() => setShotRatio("916")}
          >
            {t(lang, "story")}
          </Button>
          <Button
            className="h-11"
            variant={shotRatio === "45" ? "default" : "outline"}
            onClick={() => setShotRatio("45")}
          >
            {t(lang, "post")}
          </Button>
          <Button className="h-11" variant="ghost" onClick={() => store.setScreenshotMode(false)}>
            {t(lang, "exitShot")}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh overflow-x-hidden bg-muted">
      <Tabs
        value={tab}
        onValueChange={(value) => store.setTab(value as Tab)}
        className="mx-auto min-h-dvh w-full max-w-[560px] gap-0 bg-background pb-16"
      >
        {tab === "home" || !trip ? (
          <header className="flex items-start justify-between gap-3 border-b px-4 pt-[max(12px,env(safe-area-inset-top))] pb-4">
            <div className="min-w-0">
              <h1 className="font-heading text-3xl font-extrabold tracking-tight">Barkada Split</h1>
              <p className="text-sm text-muted-foreground">{t(lang, "brandTag")}</p>
            </div>
            <ProfilePill onClick={() => setProfileOpen(true)} />
          </header>
        ) : (
          <header className="flex flex-col gap-3 border-b px-4 pt-[max(12px,env(safe-area-inset-top))] pb-4">
            <div className="flex items-start gap-2">
              <Button
                variant="outline"
                size="icon"
                className="size-11"
                aria-label={t(lang, "back")}
                onClick={() => {
                  store.goHome()
                  router.push("/")
                }}
              >
                <ArrowLeftIcon />
              </Button>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {t(lang, "treas")}: {memberName(trip, trip.treasurer)}
                  {trip.open ? " · " + t(lang, "openModeOn") : ""}
                </p>
                <div className="flex items-start justify-between gap-2">
                  <h1 className="font-heading text-xl font-bold wrap-break-word">{trip.name}</h1>
                  <div className="flex shrink-0 flex-wrap justify-end gap-2">
                    {liveInvite ? (
                      <Button
                        variant="outline"
                        className="min-h-[38px] shrink-0 rounded-xl px-3 text-sm font-semibold"
                        onClick={() => openInvite()}
                      >
                        <Link2Icon data-icon="inline-start" />
                        {t(lang, "invitePill").replace("{code}", trip.joinCode)}
                      </Button>
                    ) : null}
                    <Button
                      variant="outline"
                      className="min-h-[38px] shrink-0 rounded-xl px-3 text-sm font-semibold"
                      onClick={() => setSettingsOpen(true)}
                    >
                      <SettingsIcon data-icon="inline-start" />
                      {t(lang, "settingsBtn")}
                    </Button>
                  </div>
                </div>
              </div>
              <ProfilePill onClick={() => setProfileOpen(true)} />
            </div>
          </header>
        )}

        {trip && tab !== "home" ? (
          <IncomingNudge
            onPay={(focusKey) => {
              store.setTab("hatian")
              setHatianFocus(focusKey)
            }}
            onDismiss={() => {}}
          />
        ) : null}

        <main
          className={`flex flex-col gap-4 px-4 py-4 ${
            tab === "home" || !trip ? "pb-40" : trip ? "pb-36" : ""
          }`}
        >
          <TabsContent value="home">
            <HomeView
              onNewTrip={() => setTripOpen(true)}
              onJoin={() => setJoinOpen(true)}
              onEstimator={() => setEstimatorOpen(true)}
            />
          </TabsContent>
          <TabsContent value="gastos">
            {trip ? (
              <GastosView
                onEdit={openEdit}
                onApprove={(id) => run(store.approveExpense(id))}
                onApproveAll={() => run(store.approveAllPending())}
                onReject={(id, reason) => run(store.rejectExpense(id, reason))}
                onApproveEdit={(id) => run(store.approveEdit(id))}
                onRejectEdit={(id) => run(store.rejectEdit(id))}
                onDelete={(id) => run(store.deleteExpense(id))}
                onInvite={() => openInvite()}
              />
            ) : null}
          </TabsContent>
          <TabsContent value="hatian">
            {trip ? (
              <HatianView
                onCopy={copy}
                focusKey={hatianFocus}
                onFocused={() => setHatianFocus(null)}
              />
            ) : null}
          </TabsContent>
          <TabsContent value="barkada">
            {trip ? <BarkadaView /> : null}
          </TabsContent>
        </main>

        <TabsList
          variant="line"
          className="fixed bottom-0 left-1/2 z-30 grid h-auto! w-full max-w-[560px] -translate-x-1/2 grid-cols-4 rounded-none border-t bg-background select-none pb-[max(12px,env(safe-area-inset-bottom))]"
        >
          {TABS.map((item) => {
            const Icon = item.icon
            const disabled = !trip && item.id !== "home"
            return (
              <TabsTrigger
                key={item.id}
                value={item.id}
                disabled={disabled}
                className="h-auto min-h-12 flex-col gap-0 py-1"
              >
                <Icon />
                {t(lang, item.key)}
              </TabsTrigger>
            )
          })}
        </TabsList>
      </Tabs>

      {trip && tab !== "home" ? (
        <Button
          className="fixed right-[max(1rem,calc(50%-280px+1rem))] bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-20 min-h-[50px] rounded-full px-5 shadow-lg"
          onClick={openAdd}
        >
          <PlusIcon data-icon="inline-start" />
          {t(lang, "add")}
        </Button>
      ) : null}

      <ExpenseSheet
        key={draft?.id ?? (expenseOpen ? "new" : "closed")}
        open={expenseOpen}
        draft={draft}
        onDraftChange={setDraft}
        onOpenChange={(open) => {
          setExpenseOpen(open)
          if (!open) setDraft(null)
        }}
      />
      {tripOpen ? <TripSheet key="trip" open onOpenChange={setTripOpen} /> : null}
      {memberOpen ? (
        <MemberSheet key={memberId ?? "new-member"} open memberId={memberId} onOpenChange={setMemberOpen} />
      ) : null}
      {joinOpen ? <JoinSheet key="join" open onOpenChange={setJoinOpen} /> : null}
      <ProfileSheet open={profileOpen} onOpenChange={setProfileOpen} />
      {trip ? (
        <LakadSettingsSheet
          open={settingsOpen}
          onEditMember={(id) => {
            setMemberId(id)
            setMemberOpen(true)
          }}
          onInvite={(memberId) => openInvite(memberId)}
          onDeleteTrip={() => openConfirm({ kind: "del-trip" })}
          onHandoff={(id, name) => openConfirm({ kind: "handoff", id, name })}
          onResetLock={(id, name) => openConfirm({ kind: "reset-lock", id, name })}
          onCopy={copy}
          onOpenChange={setSettingsOpen}
        />
      ) : null}
      {liveInvite ? (
        <InviteBarkadaSheet
          open={inviteOpen}
          seatId={inviteSeat}
          showSkip={inviteSkip}
          onSkip={() => store.setTab("gastos")}
          onOpenChange={(open) => {
            setInviteOpen(open)
            if (!open) {
              setInviteSeat(null)
              setInviteSkip(false)
            }
          }}
        />
      ) : null}
      {estimatorOpen ? (
        <EstimatorSheet key="est" open onOpenChange={setEstimatorOpen} onCopy={copy} />
      ) : null}
      {copyOpen ? <CopySheet key="copy" open text={copyValue} onOpenChange={setCopyOpen} /> : null}

      <AlertDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) setDialogOpen(false)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === "delete"
                ? t(lang, "deleteAsk")
                : confirm?.kind === "handoff"
                  ? t(lang, "handAsk")
                  : confirm?.kind === "reset-lock"
                    ? t(lang, "resetLockAsk")
                    : t(lang, "delTripAsk")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === "delete"
                ? t(lang, "deleteBody")
                : confirm?.kind === "handoff"
                  ? t(lang, "handBody").replace("{name}", confirm.name)
                  : confirm?.kind === "reset-lock"
                    ? t(lang, "resetLockBody").replace("{name}", confirm.name)
                    : t(lang, "delTripBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-[50px]">{t(lang, "cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-[50px]"
              variant={confirm?.kind === "delete" || confirm?.kind === "del-trip" ? "destructive" : "default"}
              onClick={runConfirm}
            >
              {confirm?.kind === "delete" || confirm?.kind === "del-trip" ? t(lang, "del") : t(lang, "save")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
