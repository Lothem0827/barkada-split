import assert from "node:assert/strict"
import { bindSeat, excludeFromPastBills, matchesGcashLast4, seatStatus } from "../lib/claim.ts"
import { isValidGcash, sanitizeGcash } from "../lib/gcash.ts"
import { balances, distribute, lvl, parsePeso, peso, sharesOf, totalOf, transfers, wrappedStats } from "../lib/calc.ts"
import { hydrateState } from "../lib/hydrate.ts"
import { inviteUrl, isJoinCode, makeJoinCode, normalizeJoinCode, parseJoinCodeFromInput } from "../lib/join-code.ts"
import { encode } from "uqr"
import {
  commitNames,
  hasNameSeparator,
  recentBarkadaNames,
  splitNameDraft,
  titleCaseName,
} from "../lib/member-names.ts"
import { t, takenNicknameMessage } from "../lib/i18n.ts"
import { classifyLinkGoogleError, oauthErrorFromUrl } from "../lib/supabase.ts"
import {
  applyUndoPayment,
  canCancelSent,
  canConfirmTransfer,
  canCopyTransfer,
  canMarkTransferSent,
  canNudgeTransfer,
  canRevertConfirmed,
  hatianViewerRole,
  makeFakeNewsNudge,
} from "../lib/payments.ts"
import { fakeNewsReminder, reminder, sampleReminder } from "../lib/reminders.ts"
import {
  cycleWrappedRoast,
  getExpenseReaction,
  getHeroCommentary,
  getMascotAvatar,
  getWrappedVerdict,
  personaMood,
  signTaliNudge,
  TALI_NUDGE_SIGNATURE,
  wrappedRoastSeed,
} from "../lib/companion-ai.ts"
import { homeSeat, homeTotals, isActiveTrip, isSettledTrip } from "../lib/home-dashboard.ts"
import { seed } from "../lib/seed.ts"
import {
  activityAgo,
  activityResiboText,
  defaultBarkadaHub,
  isDramaticActivity,
  mergeActivityLog,
  tripActivityLog,
  unreadActivityCount,
  wrappedShareText,
} from "../lib/activity.ts"
import { flushPayload, hasUnsyncedRows, mergeTrip, shouldClearDirty } from "../lib/merge-trip.ts"
import { memoryPhotosOf } from "../lib/image-utils.ts"
import { exportTrip, importTrip, sanitizeTrip } from "../lib/snapshot.ts"
import {
  ACTIVITY_LOG_CAP,
  AVATARS,
  DAY,
  PERSONAS,
  ackEmergencyLog,
  appendEmergencyLog,
  logActivity,
  collectUniqueNicknames,
  emptyState,
  emergencyLogOf,
  unackedCrownPass,
  findTakenMember,
  findTakenName,
  gcashOf,
  memberCanRemove,
  memberName,
  nameKey,
  resolvePairNudges,
  sanitizeProfile,
  syncProfileToClaimedMembers,
  type Expense,
  type Nudge,
  type Trip,
} from "../lib/types.ts"

function checkTrip(trip: Trip, label: string, now = Date.now()) {
  const bals = balances(trip)
  const sum = Object.values(bals).reduce((a, b) => a + b, 0)
  assert.equal(sum, 0, `${label}: balances sum to 0`)

  for (const expense of trip.expenses) {
    const shares = sharesOf(trip, expense)
    const total = Object.values(shares).reduce((a, b) => a + b, 0)
    assert.equal(total, totalOf(expense), `${label}: shares of "${expense.title}" sum to total`)
    for (const value of Object.values(shares)) {
      assert.ok(Number.isInteger(value) && value >= 0, `${label}: integer shares`)
    }
  }

  const left = { ...bals }
  for (const row of transfers(trip)) {
    assert.ok(row.amount > 0 && Number.isInteger(row.amount))
    left[row.from] += row.amount
    left[row.to] -= row.amount
  }
  for (const [id, value] of Object.entries(left)) {
    assert.equal(value, 0, `${label}: transfers clear ${id}`)
  }

  const back = importTrip(exportTrip(trip))
  assert.deepEqual(back, trip, `${label}: import(export(trip)) round-trips`)
  wrappedStats(trip, now)
}

const state = seed()
for (const trip of state.lakads) checkTrip(trip, trip.name)
console.log("ok  seed trips: balances, shares, transfers, round-trip")

const empty: Trip = {
  id: "t-empty",
  joinCode: "EMPT-00",
  name: "Empty",
  treasurer: "a",
  gcash: "",
  open: false,
  roundTo: 0,
  members: [{ id: "a", name: "A", gcash: "" }],
  expenses: [],
  payments: [],
}
const stats = wrappedStats(empty, Date.now())
assert.equal(stats.total, 0)
assert.equal(stats.financier, null)
checkTrip(empty, "empty trip")
const noPay: Trip = { ...state.lakads[0], payments: [] }
checkTrip(noPay, "no payments")
console.log("ok  wrappedStats on 0 expenses / 0 payments")

function rnd(n: number) {
  return Math.floor(Math.random() * n)
}

for (let k = 0; k < 400; k++) {
  const n = 1 + rnd(8)
  const members = Array.from({ length: n }, (_, i) => ({ id: "m" + i, name: "M" + i, gcash: "" }))
  const ids = members.map((member) => member.id)
  const methods = ["even", "item", "exclude", "libre"] as const
  const expenses = Array.from({ length: rnd(12) }, (_, i) => {
    const method = methods[rnd(4)]
    const items =
      method === "item"
        ? Array.from({ length: 1 + rnd(5) }, (_, j) => ({
            name: "i" + j,
            price: 1 + rnd(500000),
            eaters: ids.filter(() => Math.random() < 0.6),
          }))
        : []
    const amount = method === "item" ? items.reduce((sum, item) => sum + item.price, 0) : 1 + rnd(10_000_000)
    return {
      id: "e" + i,
      title: "E" + i,
      amount,
      sc: Math.random() < 0.4,
      payer: ids[rnd(n)],
      method,
      ex: method === "exclude" || method === "libre" ? [ids[rnd(n)]] : [],
      items,
      addedBy: ids[0],
      status: Math.random() < 0.85 ? ("approved" as const) : ("pending" as const),
      ts: Date.now() - rnd(30) * 86_400_000,
    }
  })
  const payments =
    n > 1
      ? Array.from({ length: rnd(4) }, (_, i) => {
          const from = rnd(n)
          const to = (from + 1 + rnd(n - 1)) % n
          return {
            id: "p" + i,
            from: ids[from],
            to: ids[to],
            amount: 1 + rnd(100000),
            status: Math.random() < 0.7 ? ("confirmed" as const) : ("sent" as const),
            ts: Date.now() - rnd(20) * 86_400_000,
            daysLate: rnd(15),
          }
        })
      : []
  const trip: Trip = {
    id: "t" + k,
    joinCode: "FUZZ-00",
    name: "Fuzz",
    treasurer: ids[0],
    gcash: "",
    open: false,
    roundTo: ([0, 100, 500] as const)[rnd(3)],
    members,
    expenses,
    payments,
  }
  checkTrip(trip, "fuzz " + k)
}
console.log("ok  400 randomized trips")

const split = distribute(100, { a: 1, b: 1, c: 1 })
assert.equal(split.a, 34)
assert.equal(split.b, 33)
assert.equal(split.c, 33)
assert.equal(split.a + split.b + split.c, 100)
assert.equal(parsePeso("1,250.5"), 125050)
assert.ok(Number.isNaN(parsePeso("12.345")))
assert.equal(peso(123456789), "₱1,234,567.89")
assert.equal(sanitizeGcash("abc0917-555-0142"), "0917-555-0142")
assert.equal(isValidGcash(""), true)
assert.equal(isValidGcash("09175550142"), true)
assert.equal(isValidGcash("+639175550142"), true)
assert.equal(isValidGcash("abc"), false)
{
  function owedTrip(cents: number, roundTo: 0 | 100 | 500): Trip {
    return {
      id: "t-round",
      joinCode: "RNDD-00",
      name: "Round",
      treasurer: "a",
      gcash: "",
      open: false,
      roundTo,
      members: [
        { id: "a", name: "A", gcash: "" },
        { id: "b", name: "B", gcash: "" },
      ],
      expenses: [
        {
          id: "e1",
          title: "x",
          amount: cents * 2,
          sc: false,
          payer: "a",
          method: "even",
          ex: [],
          items: [],
          addedBy: "a",
          status: "approved",
          ts: 1,
        },
      ],
      payments: [],
    }
  }
  const keep = transfers(owedTrip(200, 500))[0]
  assert.equal(keep.amount, 200)
  assert.equal(keep.pay, 200)
  assert.equal(keep.roundingDiff, 0)
  const up = transfers(owedTrip(300, 500))[0]
  assert.equal(up.amount, 300)
  assert.equal(up.pay, 500)
  assert.equal(up.exactAmount, 300)
  assert.equal(up.roundingDiff, 200)
}
console.log("ok  money helpers")

assert.throws(() => importTrip("not a code at all"))
assert.throws(() => importTrip(btoa("%7B%22id%22%3A1%7D")))
const evil = structuredClone(state.lakads[0])
evil.members[0].name = "<img src=x onerror=alert(1)>"
const imported = importTrip(exportTrip(evil))
assert.equal(imported.members[0].name, "<img src=x onerror=alert(1)>")
const badPayer = structuredClone(state.lakads[0])
badPayer.expenses[0].payer = "ghost"
assert.throws(() => importTrip(exportTrip(badPayer)))
console.log("ok  import validation")

const trip0 = state.lakads[0]
assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 13, 14, 99].map(lvl), [0, 0, 1, 1, 2, 2, 2, 3, 3, 4, 4])
const transfer0 = transfers(trip0)[0]
for (const persona of ["default", "conyo", "tita", "corporate", "guilttrip"] as const) {
  const msg = reminder(trip0, transfer0, persona, "tl", Date.now())
  assert.ok(msg.length > 20 && !/\{\w+\}/.test(msg), "reminder filled: " + persona)
}
console.log("ok  sulk meter + reminders")

assert.equal(emptyState().onboarded, false)
assert.equal(emptyState().lakads.length, 0)
const migrated = hydrateState(
  { lakads: state.lakads, activeId: "t-siargao", as: "mg", tab: "gastos", lang: "en" },
  true
)
assert.equal(migrated.onboarded, true)
assert.equal(migrated.showTestTools, true)
const custom = hydrateState({ lakads: [{ ...state.lakads[0], id: "t-custom" }] }, true)
assert.equal(custom.onboarded, true)
assert.equal(custom.showTestTools, false)
assert.equal(hydrateState({ lakads: [] }, true).onboarded, false)
assert.ok(sampleReminder("tita", "en", "Migs").includes("Migs") && !/\{\w+\}/.test(sampleReminder("tita", "en", "Migs")))
assert.ok(sampleReminder("tita", "en").includes("Bea"))
console.log("ok  onboarding hydrate + sample reminder")

assert.equal(state.lakads[0].joinCode, "SIAR-26")
assert.equal(normalizeJoinCode("elyu26"), "ELYU-26")
{
  const first = makeJoinCode("Beach Trip", [])
  assert.equal(first, "BEAC-" + String(new Date().getFullYear()).slice(-2))
  const second = makeJoinCode("Beach Trip", [first])
  assert.notEqual(second, first)
  assert.ok(isJoinCode(second))
}
assert.ok(isJoinCode("ELYU-26"))
assert.equal(parseJoinCodeFromInput("https://app.example/join/ELYU-26"), "ELYU-26")
assert.equal(inviteUrl("ELYU-26", "https://app.example"), "https://app.example/join/ELYU-26")
assert.equal(inviteUrl("ELYU-26", "https://app.example", "m_jigs"), "https://app.example/join/ELYU-26?seat=m_jigs")
{
  const general = encode(inviteUrl("ELYU-26", "https://app.example"), { ecc: "M", border: 2 })
  const seated = encode(inviteUrl("ELYU-26", "https://app.example", "m_jigs"), { ecc: "M", border: 2 })
  assert.ok(general.size >= 21)
  assert.equal(general.data.length, general.size)
  assert.equal(general.data[0].length, general.size)
  assert.ok(seated.size >= 21)
}
const seeded = structuredClone(state.lakads[0])
const free = bindSeat(seeded, "bea", { name: "Bea", gcash: "0918", avatar: "😎" }, "uid-bea")
assert.equal(free.ok, true)
if (free.ok) {
  assert.equal(seatStatus(free.trip.members.find((m) => m.id === "bea")!, "uid-bea"), "mine")
  const denied = bindSeat(free.trip, "bea", { name: "Bea", gcash: "", avatar: "😎" }, "uid-other")
  assert.equal(denied.ok, false)
  if (!denied.ok) assert.equal(denied.reason, "locked")
}
const closedAdd = bindSeat(seeded, "new", { name: "Jigs", gcash: "", avatar: "😎" }, "uid-jigs")
assert.equal(closedAdd.ok, false)
const openTrip = { ...seeded, open: true }
const added = bindSeat(openTrip, "new", { name: "Jigs", gcash: "0917", avatar: "😎" }, "uid-jigs")
assert.equal(added.ok, true)
if (added.ok) assert.equal(added.trip.members.at(-1)?.claimedByUid, "uid-jigs")
assert.equal(matchesGcashLast4("0917 555 0101", "0101"), true)
assert.equal(matchesGcashLast4("0917 555 0101", "9999"), false)
assert.equal(matchesGcashLast4("091", "0091"), false)
console.log("ok  join codes + seat claim locks")

{
  const base: Trip = {
    id: "t-late",
    joinCode: "LATE-26",
    name: "Late",
    treasurer: "a",
    gcash: "",
    open: true,
    roundTo: 0,
    members: [
      { id: "a", name: "A", gcash: "" },
      { id: "b", name: "B", gcash: "" },
    ],
    expenses: [
      {
        id: "e1",
        title: "taxi",
        amount: 10000,
        sc: false,
        payer: "a",
        method: "even",
        ex: [],
        items: [],
        addedBy: "a",
        status: "approved",
        ts: 1,
      },
    ],
    payments: [],
  }
  const withNew = { ...base, members: [...base.members, { id: "c", name: "C", gcash: "" }] }
  const future = excludeFromPastBills(withNew, "c")
  const even = future.expenses[0]
  assert.equal(even.method, "exclude")
  assert.deepEqual(even.ex, ["c"])
  const futureShares = sharesOf(future, even)
  assert.equal(futureShares.c, undefined)
  assert.equal((futureShares.a || 0) + (futureShares.b || 0), 10000)
  const pastShares = sharesOf(withNew, withNew.expenses[0])
  assert.equal(pastShares.c, 3333)
  assert.ok(even.ts >= base.expenses[0].ts)
  const merged = mergeTrip(future, withNew, true)
  assert.equal(merged.expenses[0].method, "exclude")
  assert.deepEqual(merged.expenses[0].ex, ["c"])
  console.log("ok  late-comer future vs past pantay")
}

function liveExpense(id: string, addedBy: string, ts: number): Expense {
  return {
    id,
    title: id,
    amount: 10000,
    sc: false,
    payer: addedBy,
    method: "even",
    ex: [],
    items: [],
    addedBy,
    status: "approved",
    ts,
  }
}

{
  const base: Trip = {
    id: "t-live",
    joinCode: "LIVE-26",
    name: "Live",
    treasurer: "carl",
    gcash: "",
    open: true,
    roundTo: 0,
    members: [
      { id: "carl", name: "Carl", gcash: "", claimedByUid: "uid-carl" },
      { id: "mel", name: "Mel", gcash: "", claimedByUid: "uid-mel" },
    ],
    expenses: [],
    payments: [],
  }
  const remote = { ...base, expenses: [liveExpense("e-old", "carl", 1)] }
  const staleLocal = { ...base, expenses: [liveExpense("e-old", "carl", 1)] }
  const currentLocal = {
    ...base,
    expenses: [liveExpense("e-old", "carl", 1), liveExpense("e-mel", "mel", 2)],
  }
  const ignoredStale = flushPayload(staleLocal, remote)
  const payload = flushPayload(currentLocal, remote)
  assert.ok(ignoredStale)
  assert.equal(ignoredStale.expenses.length, 1)
  assert.ok(payload)
  assert.equal(payload.expenses.map((expense) => expense.id).sort().join(","), "e-mel,e-old")
  assert.equal(shouldClearDirty(currentLocal, payload), true)
  assert.equal(shouldClearDirty(currentLocal, remote), false)

  const carlAdd = { ...base, expenses: [liveExpense("e-carl", "carl", 3)] }
  const melAdd = { ...base, expenses: [liveExpense("e-mel", "mel", 4)] }
  const union = mergeTrip(melAdd, carlAdd, true)
  assert.equal(union.expenses.map((expense) => expense.id).sort().join(","), "e-carl,e-mel")

  const pending = { ...liveExpense("e-pals", "mel", 10), status: "pending" as const, title: "halo" }
  const approved = { ...pending, status: "approved" as const }
  const edited = {
    ...pending,
    title: "halo-halo",
    amount: 25000,
    status: "pending" as const,
    ts: 10,
    edits: [{ ts: 20, by: "mel", note: "more ice" }],
  }
  const afterEdit = flushPayload({ ...base, expenses: [edited] }, { ...base, expenses: [approved] })
  assert.ok(afterEdit)
  assert.equal(afterEdit.expenses.length, 1)
  assert.equal(afterEdit.expenses[0]?.title, "halo-halo")
  assert.equal(afterEdit.expenses[0]?.status, "pending")
  assert.equal(shouldClearDirty({ ...base, expenses: [edited] }, { ...base, expenses: [approved] }), false)

  const carlDeleted = { ...base, expenses: [], deletedExpenseIds: ["e-pals"] }
  const palsStillHas = { ...base, expenses: [approved] }
  const afterDelete = flushPayload(carlDeleted, palsStillHas)
  assert.ok(afterDelete)
  assert.equal(afterDelete.expenses.length, 0)
  assert.ok(afterDelete.deletedExpenseIds?.includes("e-pals"))
  assert.equal(shouldClearDirty(carlDeleted, palsStillHas), false)
  assert.equal(shouldClearDirty(carlDeleted, afterDelete), true)
  const palsIncoming = mergeTrip(palsStillHas, afterDelete, false)
  assert.equal(palsIncoming.expenses.length, 0)

  const snap = importTrip(exportTrip(afterDelete))
  assert.equal(snap.expenses.length, 0)
  assert.ok(snap.deletedExpenseIds?.includes("e-pals"))
  console.log("ok  live flush payload + two-device expense union")
}

{
  const approved = {
    ...liveExpense("e-ok", "mel", 5),
    title: "Halo-halo",
    amount: 345000,
    pendingEdit: {
      title: "Halo-halo deluxe",
      amount: 360000,
      sc: false,
      payer: "mel",
      method: "even" as const,
      ex: [],
      items: [],
      editedBy: "mel",
      ts: 9,
    },
  }
  const rejected = {
    ...liveExpense("e-no", "carl", 3),
    amount: 50000,
    status: "rejected" as const,
    rejectionReason: "reasonWrong",
    auditNote: "Returned: reasonWrong",
  }
  const trip: Trip = {
    id: "t-edit",
    joinCode: "EDIT-26",
    name: "Edit",
    treasurer: "carl",
    gcash: "",
    open: false,
    roundTo: 0,
    members: [
      { id: "carl", name: "Carl", gcash: "" },
      { id: "mel", name: "Mel", gcash: "" },
    ],
    expenses: [approved, rejected],
    payments: [],
  }
  const onlyApproved: Trip = { ...trip, expenses: [{ ...approved, pendingEdit: null }] }
  assert.deepEqual(balances(trip), balances(onlyApproved))
  assert.equal(wrappedStats(trip, 10).total, wrappedStats(onlyApproved, 10).total)
  assert.equal(wrappedStats(trip, 10).count, 1)
  assert.equal(totalOf(trip.expenses[0]!), 345000)

  const snap = importTrip(exportTrip(trip))
  const kept = snap.expenses.find((expense) => expense.id === "e-ok")
  const returned = snap.expenses.find((expense) => expense.id === "e-no")
  assert.equal(kept?.status, "approved")
  assert.equal(kept?.amount, 345000)
  assert.equal(kept?.pendingEdit?.amount, 360000)
  assert.equal(kept?.pendingEdit?.title, "Halo-halo deluxe")
  assert.equal(returned?.status, "rejected")
  assert.equal(returned?.rejectionReason, "reasonWrong")
  assert.equal(returned?.auditNote, "Returned: reasonWrong")
  assert.deepEqual(balances(snap), balances(trip))

  const dirty = sanitizeTrip({
    ...trip,
    expenses: [{ ...liveExpense("e-ok", "mel", 5), pendingEdit: { title: 1 } }],
  })
  assert.equal(dirty.expenses[0]?.pendingEdit ?? null, null)
  assert.equal(dirty.expenses[0]?.status, "approved")

  const remote = { ...trip, expenses: [{ ...liveExpense("e-ok", "mel", 5), amount: 345000 }] }
  const proposed = mergeTrip({ ...trip, expenses: [approved] }, remote, true)
  assert.equal(proposed.expenses[0]?.pendingEdit?.amount, 360000)
  const cleared = {
    ...approved,
    pendingEdit: null,
    edits: [{ ts: 20, by: "carl", note: "Edit rejected — kept original approved bill" }],
  }
  const keptOriginal = mergeTrip({ ...trip, expenses: [cleared] }, { ...trip, expenses: [approved] }, true)
  assert.equal(keptOriginal.expenses[0]?.pendingEdit ?? null, null)
  assert.equal(keptOriginal.expenses[0]?.amount, 345000)
  console.log("ok  pending edits stay off the balance until approved")
}

{
  const trip: Trip = {
    id: "t-rm",
    joinCode: "REMV-26",
    name: "Remove",
    treasurer: "a",
    gcash: "",
    open: true,
    roundTo: 0,
    members: [
      { id: "a", name: "A", gcash: "" },
      { id: "b", name: "B", gcash: "" },
      { id: "c", name: "C", gcash: "" },
    ],
    expenses: [],
    payments: [],
  }
  assert.equal(memberCanRemove(trip, "a"), false)
  assert.equal(memberCanRemove(trip, "b"), true)
  assert.equal(memberCanRemove({ ...trip, expenses: [liveExpense("e1", "a", 1)] }, "b"), false)
  const itemized: Trip = {
    ...trip,
    expenses: [
      {
        id: "e-item",
        title: "pizza",
        amount: 10000,
        sc: false,
        payer: "a",
        method: "item",
        ex: [],
        items: [{ name: "slice", price: 10000, eaters: ["a"] }],
        addedBy: "a",
        status: "approved",
        ts: 1,
      },
    ],
  }
  assert.equal(memberCanRemove(itemized, "b"), true)
  assert.equal(memberCanRemove(itemized, "a"), false)
  const emptyEaters: Trip = {
    ...itemized,
    expenses: [{ ...itemized.expenses[0], items: [{ name: "slice", price: 10000, eaters: [] }] }],
  }
  assert.equal(memberCanRemove(emptyEaters, "b"), false)
  const paid: Trip = {
    ...trip,
    payments: [{ id: "p1", from: "b", to: "a", amount: 100, status: "confirmed", ts: 1, daysLate: 0 }],
  }
  assert.equal(memberCanRemove(paid, "b"), false)
  assert.equal(memberCanRemove({ ...trip, members: trip.members.slice(0, 1) }, "a"), false)
  console.log("ok  memberCanRemove")
}

{
  const trip: Trip = {
    id: "t-gc",
    joinCode: "GCSH-26",
    name: "GCash",
    treasurer: "a",
    gcash: "09170000000",
    open: true,
    roundTo: 0,
    members: [
      { id: "a", name: "A", gcash: "" },
      { id: "b", name: "B", gcash: "09171111111" },
    ],
    expenses: [],
    payments: [],
  }
  assert.equal(gcashOf(trip, "a"), "")
  assert.equal(gcashOf(trip, "b"), "09171111111")
  console.log("ok  gcashOf uses member number only")
}

{
  assert.equal(nameKey(" Carl "), "carl")
  assert.equal(findTakenName(["Carl", "Bea"], "carl"), "Carl")
  assert.equal(findTakenName(["Carl", "Bea"], "Carlo"), null)
  assert.equal(findTakenName(["Carl", "Bea"], "carl", "Carl"), null)
  const members = [
    { id: "a", name: "Carl" },
    { id: "b", name: "Bea" },
  ]
  assert.equal(findTakenMember(members, "CARL")?.id, "a")
  assert.equal(findTakenMember(members, "carl", "a"), null)
  assert.equal(findTakenMember(members, "Bea", "a")?.id, "b")
  const vsYou = collectUniqueNicknames("Carl", ["carl", "Bea"])
  assert.equal(vsYou.ok, false)
  if (!vsYou.ok) {
    assert.equal(vsYou.existing, "Carl")
    assert.equal(vsYou.vsYou, true)
  }
  const vsFriend = collectUniqueNicknames("Carl", ["Bea", "bea"])
  assert.equal(vsFriend.ok, false)
  if (!vsFriend.ok) {
    assert.equal(vsFriend.existing, "Bea")
    assert.equal(vsFriend.vsYou, false)
  }
  const unique = collectUniqueNicknames("Carl", ["Bea", "Carlo", "Carl B."])
  assert.equal(unique.ok, true)
  if (unique.ok) assert.deepEqual(unique.extra, ["Bea", "Carlo", "Carl B."])
  assert.equal(
    takenNicknameMessage("en", "Carl", true),
    "Carl is already you. Give them another nickname — not the same as Carl."
  )
  assert.equal(
    takenNicknameMessage("en", "Bea", false),
    "Bea is already on the roster. Use a different nickname so we can tell you apart."
  )
  console.log("ok  unique nicknames")
}

{
  assert.equal(titleCaseName("carl"), "Carl")
  assert.equal(titleCaseName("  DJ   "), "Dj")
  assert.equal(titleCaseName("Jigs 🏄‍♂️"), "Jigs 🏄‍♂️")
  assert.equal(titleCaseName("<script>Bea"), "Scriptbea")
  assert.equal(titleCaseName(""), "")
  assert.equal(hasNameSeparator("Carl,"), true)
  assert.equal(hasNameSeparator("Carl"), false)
  assert.equal(hasNameSeparator("Carl & Mel"), true)
  assert.equal(hasNameSeparator("Carl&Mel"), false)
  assert.deepEqual(splitNameDraft("Carl, Mel, Pals", false), { complete: ["Carl", "Mel"], rest: "Pals" })
  assert.deepEqual(splitNameDraft("Carl, Mel, Pals", true), { complete: ["Carl", "Mel", "Pals"], rest: "" })
  assert.deepEqual(splitNameDraft("Carl & Mel", false), { complete: ["Carl"], rest: "Mel" })
  assert.deepEqual(splitNameDraft("Carl&Mel", false), { complete: [], rest: "Carl&Mel" })
  assert.deepEqual(splitNameDraft("Carl,\nMel", true), { complete: ["Carl", "Mel"], rest: "" })
  const qa = splitNameDraft("Bea, Bea, bea, <script>x, 🍕🔥, ZZZZZZZZZZZZZZZZZZZZZZZZZZ, , Jomar", true)
  assert.ok(qa.complete.includes("Jomar"))
  assert.ok(qa.complete.includes("🍕🔥"))
  const qaCommit = commitNames("Host", [], qa.complete)
  assert.ok(qaCommit.names.includes("Jomar"))
  assert.ok(qaCommit.skipped.length > 0)
  const vsYou = commitNames("Carl", [], ["carl", "Mel"])
  assert.deepEqual(vsYou.names, ["Mel"])
  assert.equal(vsYou.flash, "Carl")
  assert.equal(vsYou.vsYou, true)
  const vsFriend = commitNames("Carl", ["Mel"], ["mel", "Pals"])
  assert.deepEqual(vsFriend.names, ["Mel", "Pals"])
  assert.equal(vsFriend.flash, "Mel")
  assert.equal(vsFriend.vsYou, false)
  const trips = [
    {
      id: "t-real",
      members: [{ name: "Mel" }, { name: "Carl" }, { name: "Pals" }],
    },
    {
      id: "t-siargao",
      members: [{ name: "Tita" }],
    },
  ] as Trip[]
  assert.deepEqual(recentBarkadaNames(trips, "Carl", []), ["Mel", "Pals"])
  assert.deepEqual(recentBarkadaNames(trips, "Carl", ["Mel"]), ["Pals"])
  console.log("ok  member name chips")
}

{
  assert.equal(AVATARS.length, 10)
  assert.ok(AVATARS.includes("🌺") && AVATARS.includes("🦈"))
  assert.equal(sanitizeProfile({ name: "Bea", gcash: "0917", bankNote: "Maya preferred" }).bankNote, "Maya preferred")
  assert.equal(emptyState().lang, "en")
  assert.equal(hydrateState({ lang: "ceb", lakads: [] }).lang, "en")
  assert.equal(t("ceb", "gastos"), "Mga gasto")
  assert.equal(t("ceb", "needTripName"), t("tl", "needTripName"))

  const trip: Trip = {
    id: "t-sync",
    joinCode: "SYNC-26",
    name: "Sync",
    treasurer: "a",
    gcash: "",
    open: false,
    roundTo: 0,
    members: [
      { id: "a", name: "Old", gcash: "111", claimedByUid: "uid1" },
      { id: "b", name: "Bea", gcash: "", claimedByUid: null },
    ],
    expenses: [],
    payments: [],
  }
  const claimed = syncProfileToClaimedMembers(
    [trip],
    { name: "New", gcash: "0917", avatar: "😎", bankNote: "" },
    { authUid: "uid1", as: "" }
  )
  assert.equal(claimed.lakads[0].members[0].name, "New")
  assert.equal(claimed.lakads[0].members[0].gcash, "0917")
  assert.equal(claimed.lakads[0].members[1].name, "Bea")
  assert.deepEqual(claimed.changedIds, ["t-sync"])

  const collide = syncProfileToClaimedMembers(
    [trip],
    { name: "Bea", gcash: "0918", avatar: "😎", bankNote: "" },
    { authUid: "uid1", as: "" }
  )
  assert.equal(collide.lakads[0].members[0].name, "Old")
  assert.equal(collide.lakads[0].members[0].gcash, "0918")
  console.log("ok  profile sync + i18n ceb")
}

{
  assert.equal(classifyLinkGoogleError("Manual linking is disabled"), "manual")
  assert.equal(classifyLinkGoogleError("Identity is already linked to another user"), "already")
  assert.equal(classifyLinkGoogleError("Provider is not enabled"), "provider")
  assert.equal(classifyLinkGoogleError("network exploded"), "error")
  assert.equal(oauthErrorFromUrl("?error=access_denied&error_description=User+denied+access", ""), "User denied access")
  assert.equal(oauthErrorFromUrl("", "#error=server_error"), "server_error")
  assert.equal(oauthErrorFromUrl("", ""), "")
  console.log("ok  google link errors")
}

{
  const unread: Nudge = {
    id: "n1",
    from: "a",
    to: "b",
    amount: 120000,
    persona: "conyo",
    message: "Hoy B, ₱1,200 please",
    ts: 10,
    read: false,
    status: "unread",
  }
  const seen: Nudge = { ...unread, id: "n2", ts: 11, read: true, status: "seen_zoned" }
  const base: Trip = {
    id: "t-nudge",
    joinCode: "NUDG-26",
    name: "Nudge",
    treasurer: "a",
    gcash: "",
    open: false,
    roundTo: 0,
    members: [
      { id: "a", name: "A", gcash: "" },
      { id: "b", name: "B", gcash: "" },
    ],
    expenses: [
      {
        id: "e1",
        title: "food",
        amount: 20000,
        sc: false,
        payer: "a",
        method: "even",
        ex: [],
        items: [],
        addedBy: "a",
        status: "approved",
        ts: Date.now() - 5 * DAY,
      },
    ],
    payments: [],
    nudges: [unread, seen],
  }

  const roundTrip = importTrip(exportTrip(base))
  assert.equal(roundTrip.nudges?.length, 2)
  assert.equal(roundTrip.nudges?.[0]?.status, "unread")
  assert.equal(roundTrip.nudges?.[0]?.read, false)
  assert.equal(roundTrip.nudges?.[1]?.status, "seen_zoned")
  assert.equal(roundTrip.nudges?.[1]?.read, true)

  const localRead: Trip = {
    ...base,
    nudges: [{ ...unread, read: true, status: "read" }, seen],
  }
  const remoteUnread: Trip = { ...base, nudges: [unread] }
  const merged = mergeTrip(localRead, remoteUnread, true)
  const mergedOne = merged.nudges?.find((row) => row.id === "n1")
  const mergedSeen = merged.nudges?.find((row) => row.id === "n2")
  assert.equal(merged.nudges?.length, 2)
  assert.equal(mergedOne?.read, true)
  assert.equal(mergedOne?.status, "read")
  assert.equal(mergedSeen?.status, "seen_zoned")

  const keepSeen = mergeTrip(
    { ...base, nudges: [{ ...unread, read: true, status: "seen_zoned" }] },
    { ...base, nudges: [{ ...unread, read: true, status: "read" }] },
    true
  )
  assert.equal(keepSeen.nudges?.[0]?.status, "seen_zoned")

  assert.equal(hasUnsyncedRows(localRead, remoteUnread), true)
  assert.equal(hasUnsyncedRows(localRead, localRead), false)

  const cleared = resolvePairNudges(base.nudges, "b", "a", "a")
  assert.equal(cleared?.find((row) => row.id === "n1")?.status, "read")
  assert.equal(cleared?.find((row) => row.id === "n1")?.read, true)
  assert.equal(cleared?.find((row) => row.id === "n2")?.status, "seen_zoned")

  const now = Date.now()
  const stats = wrappedStats(base, now)
  assert.equal(stats.tampo?.id, "b")
  assert.equal(stats.seenZoner?.id, "b")
  assert.equal(stats.seenZoner?.value, 1)
  assert.ok(stats.tampo && stats.seenZoner && stats.seenZoner.id === stats.tampo.id)

  const otherSeen: Trip = {
    ...base,
    nudges: [
      unread,
      { ...seen, to: "a", from: "b" },
      { ...seen, id: "n3", to: "a", from: "b", ts: 12 },
    ],
  }
  const otherStats = wrappedStats(otherSeen, now)
  assert.equal(otherStats.tampo?.id, "b")
  assert.equal(otherStats.seenZoner?.id, "a")
  assert.equal(otherStats.seenZoner?.value, 2)
  console.log("ok  nudges sanitize/merge/wrapped")
}

{
  const base: Trip = {
    id: "t-em",
    joinCode: "EMRG-26",
    name: "Emergency",
    treasurer: "carl",
    gcash: "",
    open: false,
    roundTo: 0,
    members: [
      { id: "carl", name: "Carl", gcash: "" },
      { id: "mel", name: "Mel", gcash: "" },
    ],
    expenses: [],
    payments: [],
  }
  const entry = {
    id: "em1",
    action: "treasurer_takeover" as const,
    actorMemberId: "mel",
    actorName: "Mel",
    details: "Emergency takeover due to unresponsive treasurer — phone in sea",
    ts: 100,
  }
  const localTakeover = appendEmergencyLog({ ...base, treasurer: "mel" }, entry)
  assert.equal(localTakeover.treasurer, "mel")
  assert.equal(emergencyLogOf(localTakeover).length, 1)
  assert.equal(appendEmergencyLog(localTakeover, entry).emergencyLog?.length, 1)

  const round = importTrip(exportTrip(localTakeover))
  assert.equal(round.treasurer, "mel")
  assert.equal(round.emergencyLog?.[0]?.id, "em1")
  assert.deepEqual(round, localTakeover)

  const emptyRound = importTrip(exportTrip(base))
  assert.equal(emptyRound.emergencyLog, undefined)
  assert.deepEqual(emptyRound, base)

  const garbage = sanitizeTrip({
    ...base,
    emergencyLog: [
      entry,
      { id: "bad", action: "nope", actorMemberId: "mel", actorName: "Mel", details: "x", ts: 1 },
      { id: "em1", action: "lock_reset", actorMemberId: "mel", actorName: "Mel", details: "dup", ts: 2 },
      { id: "em3", action: "crown_passed", actorMemberId: "carl", actorName: "Carl", details: "Passed crown to Mel", ts: 300 },
    ],
  })
  assert.equal(garbage.emergencyLog?.map((row) => row.id).join(","), "em1,em3")
  assert.equal(garbage.emergencyLog?.[0]?.action, "treasurer_takeover")

  assert.equal(hasUnsyncedRows(localTakeover, base), true)
  assert.equal(hasUnsyncedRows(localTakeover, localTakeover), false)
  assert.equal(shouldClearDirty(localTakeover, base), false)
  assert.equal(shouldClearDirty(localTakeover, localTakeover), true)

  const remoteLog = {
    id: "em2",
    action: "lock_reset" as const,
    actorMemberId: "carl",
    actorName: "Carl",
    details: "Reset device lock for Mel",
    ts: 200,
  }
  const merged = mergeTrip(localTakeover, { ...base, emergencyLog: [remoteLog] }, true)
  assert.equal(merged.treasurer, "mel")
  assert.equal(
    merged.emergencyLog
      ?.map((row) => row.id)
      .sort()
      .join(","),
    "em1,em2"
  )
  console.log("ok  emergency log sanitize/merge/unsynced")
}

{
  const base: Trip = {
    id: "t-crown",
    joinCode: "CRWN-26",
    name: "Crown",
    treasurer: "mel",
    gcash: "",
    open: false,
    roundTo: 0,
    members: [
      { id: "carl", name: "Carl", gcash: "" },
      { id: "mel", name: "Mel", gcash: "" },
    ],
    expenses: [],
    payments: [],
    emergencyLog: [
      {
        id: "em-crown",
        action: "crown_passed",
        actorMemberId: "carl",
        actorName: "Carl",
        details: "Passed crown to Mel",
        ts: 100,
      },
    ],
  }
  const shown = unackedCrownPass(base, "mel")
  assert.equal(shown?.id, "em-crown")
  assert.equal(unackedCrownPass(base, "carl"), null)

  const acked = ackEmergencyLog(base, "em-crown")
  assert.equal(unackedCrownPass(acked, "mel"), null)
  assert.equal(acked.emergencyLog?.[0]?.ack, true)

  const round = importTrip(exportTrip(acked))
  assert.equal(round.emergencyLog?.[0]?.ack, true)
  assert.equal(hasUnsyncedRows(acked, base), true)

  const merged = mergeTrip(acked, base, true)
  assert.equal(merged.emergencyLog?.[0]?.ack, true)
  assert.equal(shouldClearDirty(acked, merged), true)
  console.log("ok  crown pass ack/banner helpers")
}

{
  const siargao = seed().lakads[0]
  const sentPay = siargao.payments.find((payment) => payment.status === "sent")
  const confirmedPay = siargao.payments.find((payment) => payment.id === "p2")
  const otherConfirmed = siargao.payments.find((payment) => payment.id === "p1")
  assert.ok(sentPay && confirmedPay && otherConfirmed)

  assert.equal(canCancelSent("tin", siargao, sentPay), true)
  assert.equal(canCancelSent("mg", siargao, sentPay), true)
  assert.equal(canCancelSent("bea", siargao, sentPay), false)
  assert.equal(canRevertConfirmed("mg", siargao, confirmedPay), true)
  assert.equal(canRevertConfirmed("pao", siargao, confirmedPay), false)
  assert.equal(canRevertConfirmed("jp", siargao, otherConfirmed), true)
  assert.equal(canRevertConfirmed("tin", siargao, otherConfirmed), false)
  assert.equal(canRevertConfirmed("bea", siargao, otherConfirmed), false)
  assert.equal(applyUndoPayment(siargao, sentPay, "bea", Date.now()).ok, false)
  assert.equal(applyUndoPayment(siargao, confirmedPay, "pao", Date.now()).ok, false)

  const balsBeforeSent = balances(siargao)
  const cancelled = applyUndoPayment(siargao, sentPay, "tin", Date.now())
  assert.equal(cancelled.ok, true)
  if (!cancelled.ok) throw new Error("expected cancel")
  assert.equal(cancelled.kind, "cancel")
  assert.equal(cancelled.trip.payments.some((payment) => payment.id === sentPay.id), false)
  assert.deepEqual(balances(cancelled.trip), balsBeforeSent)
  assert.equal((cancelled.trip.nudges || []).length, (siargao.nudges || []).length)
  checkTrip(cancelled.trip, "cancel sent")

  const balsBeforeConfirm = balances(siargao)
  const stamp = Date.now()
  const fakeNews = makeFakeNewsNudge(siargao, confirmedPay, "mg", "default", "tl", stamp)
  const reverted = applyUndoPayment(siargao, confirmedPay, "mg", stamp, fakeNews)
  assert.equal(reverted.ok, true)
  if (!reverted.ok) throw new Error("expected revert")
  assert.equal(reverted.kind, "revert")
  const nextPay = reverted.trip.payments.find((payment) => payment.id === confirmedPay.id)
  assert.equal(nextPay?.status, "sent")
  assert.equal(nextPay?.ts, stamp)
  assert.equal(balances(reverted.trip)[confirmedPay.from], balsBeforeConfirm[confirmedPay.from] - confirmedPay.amount)
  assert.equal(balances(reverted.trip)[confirmedPay.to], balsBeforeConfirm[confirmedPay.to] + confirmedPay.amount)
  const news = (reverted.trip.nudges || []).find((nudge) => nudge.id === fakeNews.id)
  assert.ok(news)
  assert.equal(news?.to, confirmedPay.from)
  assert.equal(news?.from, "mg")
  assert.equal(news?.read, false)
  assert.equal(news?.status, "unread")
  assert.ok(news && news.message.length > 10 && !/\{\w+\}/.test(news.message))
  checkTrip(reverted.trip, "revert confirmed")

  for (const persona of PERSONAS) {
    for (const lang of ["en", "tl"] as const) {
      const msg = fakeNewsReminder(persona.id, lang, {
        from: "Tin",
        to: "Migs",
        amt: "₱200.00",
        trip: "Siargao",
      })
      assert.ok(msg.length > 10 && !/\{\w+\}/.test(msg), "fake news filled: " + persona.id + " " + lang)
    }
  }
  console.log("ok  undo/revert payment + fake news")
}

{
  const treas = "mg"
  assert.equal(hatianViewerRole("mg", treas, "mg", "bea"), "debtor")
  assert.equal(canCopyTransfer("mg", treas, "mg", "bea"), true)
  assert.equal(canNudgeTransfer("mg", treas, "mg", "bea"), false)
  assert.equal(canMarkTransferSent("mg", treas, "mg", "bea"), true)
  assert.equal(canConfirmTransfer("mg", treas, "mg", "bea"), false)

  assert.equal(hatianViewerRole("bea", treas, "jp", "bea"), "creditor")
  assert.equal(canCopyTransfer("bea", treas, "jp", "bea"), false)
  assert.equal(canNudgeTransfer("bea", treas, "jp", "bea"), true)
  assert.equal(canMarkTransferSent("bea", treas, "jp", "bea"), true)
  assert.equal(canConfirmTransfer("bea", treas, "jp", "bea"), true)

  assert.equal(hatianViewerRole("mg", treas, "jp", "bea"), "treasurer_overseeing")
  assert.equal(canCopyTransfer("mg", treas, "jp", "bea"), false)
  assert.equal(canNudgeTransfer("mg", treas, "jp", "bea"), true)
  assert.equal(canMarkTransferSent("mg", treas, "jp", "bea"), true)
  assert.equal(canConfirmTransfer("mg", treas, "jp", "bea"), true)

  assert.equal(hatianViewerRole("tin", treas, "jp", "bea"), "uninvolved")
  assert.equal(canCopyTransfer("tin", treas, "jp", "bea"), false)
  assert.equal(canNudgeTransfer("tin", treas, "jp", "bea"), false)
  assert.equal(canMarkTransferSent("tin", treas, "jp", "bea"), false)
  assert.equal(canConfirmTransfer("tin", treas, "jp", "bea"), false)

  const siargao = seed().lakads[0]
  const otherPair = transfers(siargao).find((row) => row.from !== siargao.treasurer && row.to !== siargao.treasurer)
  assert.ok(otherPair)
  const assist = reminder(siargao, otherPair, "default", "en", Date.now(), { fromTreasurer: true })
  const plainNudge = reminder(siargao, otherPair, "default", "en", Date.now())
  assert.ok(assist.includes("Treasurer assist"))
  assert.ok(assist.includes("Migs"))
  assert.ok(assist.includes(memberName(siargao, otherPair.to)))
  assert.ok(assist.includes(memberName(siargao, otherPair.from)))
  assert.ok(!/\{\w+\}/.test(assist))
  assert.equal(plainNudge.includes("Treasurer assist"), false)
  console.log("ok  hatian viewer roles + treasurer assist reminder")
}

{
  const siargao = seed().lakads[0]
  const timeline = tripActivityLog(siargao)
  assert.ok(timeline.length >= siargao.expenses.length + siargao.payments.length)
  assert.equal(timeline[0].ts >= timeline[timeline.length - 1].ts, true)
  assert.ok(timeline.some((row) => row.id === "al-e-e6" && row.message.includes("Pending approval")))
  assert.ok(timeline.some((row) => row.id === "al-pok-p1" && row.category === "bayad"))
  assert.ok(timeline.some((row) => row.id === "al-p-p3" && row.message.includes("marked")))

  const first = {
    id: "al-1",
    category: "gastos" as const,
    icon: "🧾",
    actorName: "Migs",
    message: "Migs added 'Halo'",
    ts: 200,
  }
  const logged = logActivity(siargao, first)
  assert.equal(logged.activityLog?.[0]?.id, "al-1")
  assert.equal(logActivity(logged, first).activityLog?.length, 1)

  let capped = logged
  for (let i = 0; i < ACTIVITY_LOG_CAP + 5; i++) {
    capped = logActivity(capped, {
      id: "al-cap-" + i,
      category: "admin",
      icon: "👑",
      actorName: "Migs",
      message: "cap " + i,
      ts: 300 + i,
    })
  }
  assert.equal(capped.activityLog?.length, ACTIVITY_LOG_CAP)
  assert.equal(capped.activityLog?.[0]?.id, "al-cap-" + (ACTIVITY_LOG_CAP + 4))

  const round = importTrip(exportTrip(logged))
  assert.equal(round.activityLog?.[0]?.id, "al-1")
  assert.deepEqual(round.activityLog, logged.activityLog)

  const remote = {
    id: "al-2",
    category: "bayad" as const,
    icon: "✅",
    actorName: "Bea",
    message: "Bea confirmed ₱1.00",
    amount: 100,
    ts: 400,
  }
  const merged = mergeActivityLog(logged.activityLog || [], [remote])
  assert.equal(merged.map((row) => row.id).join(","), "al-2,al-1")

  const tripMerged = mergeTrip(logged, { ...siargao, activityLog: [remote] }, true)
  assert.equal(hasUnsyncedRows(logged, siargao), true)
  assert.ok(tripMerged.activityLog?.some((row) => row.id === "al-1"))
  assert.ok(tripMerged.activityLog?.some((row) => row.id === "al-2"))

  const garbage = sanitizeTrip({
    ...siargao,
    activityLog: [
      first,
      { id: "bad", category: "nope", icon: "x", actorName: "A", message: "x", ts: 1 },
      { id: "al-1", category: "admin", icon: "👑", actorName: "Dup", message: "dup", ts: 2 },
    ],
  })
  assert.equal(garbage.activityLog?.map((row) => row.id).join(","), "al-1")

  assert.equal(activityAgo(1000, 1000), "Just now")
  assert.equal(activityAgo(1000, 1000 + 15 * 60_000), "15m ago")
  assert.equal(activityAgo(1000, 1000 + 2 * DAY), "2d ago")

  assert.equal(unreadActivityCount(siargao, 0), 0)
  assert.ok(unreadActivityCount(siargao, 1) > 0)
  assert.equal(defaultBarkadaHub(siargao, Date.now()), "roster")
  assert.equal(defaultBarkadaHub({ ...siargao, expenses: [], payments: [] }, Date.now()), "roster")
  assert.equal(defaultBarkadaHub(siargao, 1), "chismis")

  const settled = {
    ...siargao,
    members: [
      { id: "a", name: "A", gcash: "", claimedByUid: "1" },
      { id: "b", name: "B", gcash: "", claimedByUid: "2" },
    ],
    treasurer: "a",
    expenses: [
      {
        id: "e-hub",
        title: "Halo",
        amount: 10000,
        sc: false,
        payer: "a",
        method: "even" as const,
        ex: [],
        items: [],
        addedBy: "a",
        status: "approved" as const,
        ts: 1,
      },
    ],
    payments: [
      {
        id: "p-hub",
        from: "b",
        to: "a",
        amount: 5000,
        status: "confirmed" as const,
        ts: 2,
        daysLate: 0,
      },
    ],
    activityLog: [],
    nudges: [],
  }
  assert.equal(defaultBarkadaHub(settled, Date.now()), "wrapped")
  assert.equal(isDramaticActivity(remote), true)
  assert.equal(isDramaticActivity(first), false)
  const resibo = activityResiboText(
    {
      id: "al-sz-1",
      category: "bayad",
      icon: "👀",
      actorName: "Jigs",
      message: "Jigs seen-zoned Bea's reminder for ₱850.00",
      amount: 85000,
      ts: Date.parse("2026-10-23T14:14:00"),
    },
    { ...siargao, joinCode: "HIKE-26" },
    Date.parse("2026-10-23T14:20:00"),
    "https://barkada-split-bywn.vercel.app"
  )
  assert.ok(resibo.startsWith("📜 RECEIPT ALERT (Tally): 👀 Jigs SEEN ZONED"))
  assert.ok(resibo.includes("Today at"))
  assert.ok(resibo.includes("/join/HIKE-26"))
  assert.ok(wrappedShareText(siargao, Date.now()).includes("TRIP WRAPPED"))
  console.log("ok  activity log backfill/sanitize/merge")
}

{
  function taliTrip(over: Partial<Trip> = {}): Trip {
    return {
      id: "t-tali",
      joinCode: "TALI-00",
      name: "Elyu",
      treasurer: "a",
      gcash: "",
      open: false,
      roundTo: 0,
      members: [
        { id: "a", name: "Bea", gcash: "" },
        { id: "b", name: "Jigs", gcash: "" },
      ],
      expenses: [],
      payments: [],
      ...over,
    }
  }
  function bill(over: Partial<Expense> = {}): Expense {
    return {
      id: "e1",
      title: "Unli",
      amount: 100000,
      sc: false,
      payer: "a",
      method: "even",
      ex: [],
      items: [],
      addedBy: "a",
      status: "approved",
      ts: 0,
      ...over,
    }
  }

  assert.equal(getMascotAvatar("chill"), "🦦🕶️")
  assert.equal(getMascotAvatar("detective"), "🦦🔍")
  assert.equal(personaMood("conyo"), "conyo")
  assert.equal(personaMood("tita"), "tita")
  assert.equal(personaMood("guilttrip"), "tampo")
  assert.equal(personaMood("corporate"), "detective")
  assert.ok(signTaliNudge("Hoy bayad na").endsWith(TALI_NUDGE_SIGNATURE))

  const pending = taliTrip({
    expenses: [
      bill({ id: "p1", status: "pending" }),
      bill({
        id: "p2",
        status: "approved",
        pendingEdit: {
          title: "Unli",
          amount: 120000,
          sc: false,
          payer: "a",
          method: "even",
          ex: [],
          items: [],
          editedBy: "b",
          ts: 1,
        },
      }),
    ],
  })
  const treas = getHeroCommentary(pending, "a", "gastos", 0)
  assert.equal(treas.mood, "detective")
  assert.match(treas.lines[0], /may 2 pending gastos/)

  const seen = taliTrip({
    expenses: [bill()],
    nudges: [
      {
        id: "n1",
        from: "a",
        to: "b",
        amount: 50000,
        persona: "conyo",
        message: "bayad",
        ts: 4,
        read: true,
        status: "seen_zoned",
      },
    ],
  })
  const zoned = getHeroCommentary(seen, "a", "hatian", 0)
  assert.equal(zoned.mood, "tampo")
  assert.match(zoned.lines[0], /Na-SEEN ZONE ni Jigs/)

  const owing = taliTrip({ expenses: [bill({ ts: 0 })] })
  const tita = getHeroCommentary(owing, "b", "hatian", 3 * DAY)
  assert.equal(tita.mood, "tita")
  assert.match(tita.lines[0], /Huy Jigs, 3 days na/)
  assert.ok(tita.lines[0].includes(peso(50000)))
  assert.ok(tita.lines[0].includes("Bea"))

  const chill = getHeroCommentary(taliTrip({ expenses: [bill()] }), "a", "gastos", 0)
  assert.equal(chill.mood, "chill")
  assert.match(chill.lines[0], /Grabe si Bea/)
  assert.ok(chill.lines[0].includes(peso(100000)))

  const settled = taliTrip({
    expenses: [bill({ amount: 10000 })],
    payments: [{ id: "pay1", from: "b", to: "a", amount: 5000, status: "confirmed", ts: 2, daysLate: 0 }],
  })
  const fiesta = getHeroCommentary(settled, "a", "gastos", 2)
  assert.equal(fiesta.mood, "fiesta")
  assert.match(fiesta.lines[0], /Quits na lahat/)

  const empty = getHeroCommentary(taliTrip(), "a", "gastos", 0)
  assert.equal(empty.mood, "chill")
  assert.ok(!empty.lines[0].includes("Quits na lahat"))

  const rich = getExpenseReaction({
    amount: 500000,
    method: "even",
    excludedNames: [],
    head: 250000,
    payingCount: 2,
  })
  assert.ok(rich)
  assert.match(rich.message, /pang-rich kid/)
  const libre = getExpenseReaction({
    amount: 20000,
    method: "libre",
    excludedNames: ["Bea"],
    head: 20000,
    payingCount: 1,
  })
  assert.ok(libre)
  assert.match(libre.message, /manlilibre si Bea/)
  const pwera = getExpenseReaction({
    amount: 30000,
    method: "exclude",
    excludedNames: ["Jigs"],
    head: 15000,
    payingCount: 2,
  })
  assert.ok(pwera)
  assert.match(pwera.message, /Pwera si Jigs/)
  assert.equal(
    getExpenseReaction({ amount: 0, method: "libre", excludedNames: ["Bea"], head: 0, payingCount: 0 }),
    null
  )

  const roast = getWrappedVerdict(taliTrip({ expenses: [bill()] }), 0, 0)
  assert.equal(roast.includes("{"), false)
  assert.ok(roast.split(". ").length >= 2)
  const nextSeed = cycleWrappedRoast("t-tali")
  assert.equal(nextSeed, 1)
  assert.equal(wrappedRoastSeed("t-tali"), 1)
  assert.ok(wrappedShareText(taliTrip({ expenses: [bill()] }), 0).includes("🐾 TALLY:"))
  console.log("ok  tali companion commentary")
}

{
  const lakads = seed().lakads
  const ids = { authUid: "", profileName: "Migs" }
  const seat = homeSeat(lakads[0], ids)
  assert.equal(seat?.id, "mg")
  let owed = 0
  let owe = 0
  for (const trip of lakads) {
    const mine = homeSeat(trip, ids)
    if (!mine) continue
    const net = balances(trip)[mine.id] || 0
    if (net > 0) owed += net
    else if (net < 0) owe += -net
  }
  const totals = homeTotals(lakads, ids)
  assert.equal(totals.totalOwedToMe, owed)
  assert.equal(totals.totalIOwe, owe)
  assert.equal(totals.overallNet, owed - owe)
  assert.ok(lakads.every((trip) => isActiveTrip(trip) !== isSettledTrip(trip)))
  assert.deepEqual(homeTotals(lakads, { authUid: "", profileName: "" }), {
    totalOwedToMe: 0,
    totalIOwe: 0,
    overallNet: 0,
  })
  console.log("ok  home dashboard totals")
}

{
  const photoTrip: Trip = {
    ...empty,
    coverPhotoUrl: "https://example.com/c.jpg",
    wrappedPhotos: ["https://example.com/w.jpg"],
    expenses: [
      {
        id: "e1",
        title: "KBBQ",
        amount: 420000,
        sc: false,
        payer: "a",
        method: "even",
        ex: [],
        items: [],
        addedBy: "a",
        status: "approved",
        ts: 1,
        photoUrl: "data:image/jpeg;base64,abc",
        photoType: "memory",
      },
      {
        id: "e2",
        title: "Resibo",
        amount: 100,
        sc: false,
        payer: "a",
        method: "even",
        ex: [],
        items: [],
        addedBy: "a",
        status: "approved",
        ts: 2,
        photoUrl: "data:image/jpeg;base64,def",
        photoType: "receipt",
      },
    ],
  }
  const clean = sanitizeTrip(photoTrip)
  assert.equal(clean.coverPhotoUrl, "https://example.com/c.jpg")
  assert.equal(clean.expenses[0]?.photoUrl, "data:image/jpeg;base64,abc")
  assert.equal(memoryPhotosOf(clean).length, 3)
  const back = importTrip(exportTrip(clean))
  assert.equal(back.coverPhotoUrl, "https://example.com/c.jpg")
  assert.equal(back.expenses[0]?.photoUrl, undefined)
  assert.equal(back.expenses[1]?.photoUrl, undefined)
  assert.equal(sanitizeTrip({ ...empty, coverPhotoUrl: "javascript:alert(1)" }).coverPhotoUrl, undefined)
  console.log("ok  memory photos persist and export strips data URLs")
}

console.log("\nAll checks passed.")
