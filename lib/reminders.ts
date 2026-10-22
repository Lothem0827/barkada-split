import { peso } from "@/lib/calc"
import { daysOwed, lvl } from "@/lib/split-math"
import { gcashOf, memberName, uiLang, type Lang, type Persona, type Transfer, type Trip } from "@/lib/types"

const TONES: Record<"en" | "tl", Record<Persona, string[]>> = {
  tl: {
    default: [
      "Hi {from}! Quick lang: {amt} pa yung share mo sa {trip} 🙌\n{num}\nSalamat!",
      "Hello {from}! Paalala lang, {amt} pa for {trip}. No rush (pero konti lang) 😄\n{num}",
      "{from}, {d} na 'to ha 👀 {amt} pa for {trip}. Medyo nagtatampo na si {to}.\n{num}",
      "{from}!! {d} na 😤 {amt} para sa {trip}. Si {to} nagbibilang na ng araw sa kalendaryo.\n{num}",
      "{from}, legend ka na 🏆 {d} na. {amt} pa rin para sa {trip}. Miss ka na ng pera ni {to} 🥲\n{num}",
    ],
    conyo: [
      "Hey {from}! So like, your share for {trip} is {amt}. Just send it lang, okay? Thanks, bes! ✨\n{num}",
      "{from}, just a lil' reminder lang ha, {amt} pa for {trip}. Super chill, but like, please? 💅\n{num}",
      "Wait, {from}, it's been {d} na? Like, {amt} for {trip}. Not to be OA pero... 🙃\n{num}",
      "Okay {from}, I'm literally so shookt. {d} na. {amt}. Let's not make this awkward, k? 😬\n{num}",
      "{from}, bes, this is giving ghosting na. {d}. {amt} for {trip}. I can't even. 😩\n{num}",
    ],
    tita: [
      "Hija/Hijo {from}, nakapag-merienda ka na ba? 😊 By the way, {amt} pa ang share mo sa {trip}. God bless!\n{num}",
      "{from}, anak, paalala lang ni Tita: {amt} for {trip}. Kumain ka na ba? 🙏\n{num}",
      "{from}, {d} na, anak. Hindi naman sa naniningil si Tita ha, pero {amt}. Pumayat ka yata? 🤔\n{num}",
      "Ay naku, {from}! {d} na. {amt} para sa {trip}. Ipagdadasal kita sa Simbang Gabi. 📿\n{num}",
      "{from}, nabanggit na kita sa family reunion. 🎄 {d}, {amt}. Love ka pa rin ni Tita, anak.\n{num}",
    ],
    corporate: [
      "Hi {from}, hope this finds you well. Per our {trip} reconciliation, your outstanding balance is {amt}. Kindly remit at your convenience. Thanks!\n{num}",
      "Hi {from}, just circling back on the {amt} for {trip}. Kindly settle when you have the bandwidth. Best, Judith\n{num}",
      "Hi {from}, following up on my previous message re: {amt} ({d} outstanding). Kindly advise on ETA. 🙂\n{num}",
      "Dear {from}, this is a gentle escalation. {amt} for {trip} has been pending for {d}. Please action ASAP. CC: the GC (joke lang).\n{num}",
      "{from}, per my last 14 emails 🙂 {amt} for {trip}, {d} overdue. Let's take this offline. Regards, HR.\n{num}",
    ],
    guilttrip: [
      "Hi {from} 🥺 {amt} lang naman for {trip}. Okay lang kahit mamaya... or bukas... basta 'wag mo kalimutan.\n{num}",
      "{from}, okay lang ako. Pancit canton lang ulam ko ngayong linggo. Pero yung {amt} for {trip}? 🥲\n{num}",
      "{from}, {d} na. Hindi ako galit. Nalulungkot lang. {amt}. 😔\n{num}",
      "{from}, muntik ko nang ibenta ang kidney ko para sa {trip}. Joke lang. Pero {amt} pa rin. 💔\n{num}",
      "{from}, {d}. Kinukwento na kita sa therapist ko. 👻 {amt} for {trip}. Mahal pa rin kita, pare.\n{num}",
    ],
  },
  en: {
    default: [
      "Hi {from}! Quick one: {amt} is still your share for {trip} 🙌\n{num}\nThanks!",
      "Hello {from}! Friendly reminder that {amt} is still open for {trip}. No rush (but a little rush) 😄\n{num}",
      "{from}, it's been {d} 👀 {amt} still for {trip}. {to} is getting a tiny bit sulky.\n{num}",
      "{from}!! {d} now 😤 {amt} for {trip}. {to} has started marking the calendar.\n{num}",
      "{from}, legend status 🏆 {d} in. {amt} still for {trip}. {to}'s wallet misses you 🥲\n{num}",
    ],
    conyo: [
      "Hey {from}! So like, your share for {trip} is {amt}. Just send it, okay? Thanks, bes! ✨\n{num}",
      "{from}, just a lil' reminder, {amt} still for {trip}. Super chill, but like, please? 💅\n{num}",
      "Wait, {from}, it's been {d}? Like, {amt} for {trip}. Not to be extra but... 🙃\n{num}",
      "Okay {from}, I'm literally so shook. {d} now. {amt}. Let's not make this awkward, k? 😬\n{num}",
      "{from}, bes, this is giving ghosting. {d}. {amt} for {trip}. I can't even. 😩\n{num}",
    ],
    tita: [
      "Dear {from}, have you eaten? 😊 By the way, {amt} is still your share for {trip}. God bless!\n{num}",
      "{from}, anak, a note from Tita: {amt} for {trip}. Have you eaten? 🙏\n{num}",
      "{from}, {d} already, anak. Tita isn't collecting ha, but {amt}. Have you lost weight? 🤔\n{num}",
      "Ay naku, {from}! {d} already. {amt} for {trip}. I'll include you in my novena. 📿\n{num}",
      "{from}, I mentioned you at the family reunion. 🎄 {d}, {amt}. Tita still loves you, anak.\n{num}",
    ],
    corporate: [
      "Hi {from}, hope this finds you well. Per our {trip} reconciliation, your outstanding balance is {amt}. Kindly remit at your convenience. Thanks!\n{num}",
      "Hi {from}, just circling back on the {amt} for {trip}. Kindly settle when you have the bandwidth. Best, Judith\n{num}",
      "Hi {from}, following up on my previous message re: {amt} ({d} outstanding). Kindly advise on ETA. 🙂\n{num}",
      "Dear {from}, this is a gentle escalation. {amt} for {trip} has been pending for {d}. Please action ASAP. CC: the group chat (kidding).\n{num}",
      "{from}, per my last 14 emails 🙂 {amt} for {trip}, {d} overdue. Let's take this offline. Regards, HR.\n{num}",
    ],
    guilttrip: [
      "Hi {from} 🥺 it's only {amt} for {trip}. Later is fine... or tomorrow... just don't forget.\n{num}",
      "{from}, I'm okay. Instant noodles this week. But that {amt} for {trip}? 🥲\n{num}",
      "{from}, {d} now. I'm not mad. Just a little sad. {amt}. 😔\n{num}",
      "{from}, I almost sold a kidney for {trip}. Kidding. But {amt} is still open. 💔\n{num}",
      "{from}, {d}. I brought this up in therapy. 👻 {amt} for {trip}. Still love you, though.\n{num}",
    ],
  },
}

function fill(template: string, vars: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (vars[key] != null ? vars[key] : match))
}

function dayPhrase(days: number, lang: Lang) {
  if (uiLang(lang) === "tl") return days === 1 ? "1 araw" : days + " araw"
  return days === 1 ? "1 day" : days + " days"
}

export function sampleReminder(persona: Persona, lang: Lang) {
  const tone = uiLang(lang)
  const set = TONES[tone][persona] ?? TONES[tone].default
  return fill(set[0], {
    from: "Migs",
    to: "Bea",
    amt: "₱420",
    trip: "Siargao",
    d: tone === "tl" ? "2 araw" : "2 days",
    num: "GCash/Maya: 0918 555 0142 (Bea)",
  })
}

const FAKE_NEWS: Record<"en" | "tl", Record<Persona, string>> = {
  tl: {
    default: "Fake news! 🚨 GCash not received. {amt} for {trip} — wala pumasok, {from}.",
    conyo: "Wait, like, scam??? Wala pumasok 💸 {amt} for {trip}, {from}. Super not posted.",
    tita: "Anak, fake news 'yan. Hindi pa natanggap ni Tita ang GCash. {amt} pa for {trip}.",
    corporate: "Please be advised: remittance of {amt} for {trip} was not posted. Kindly resend, {from}.",
    guilttrip: "Hindi ako galit... pero wala pumasok 💸 {amt} for {trip}, {from}.",
  },
  en: {
    default: "Fake news! 🚨 GCash not received. {amt} for {trip} never landed, {from}.",
    conyo: "Wait, like, scam??? Nothing came in 💸 {amt} for {trip}, {from}.",
    tita: "Anak, that's fake news. Tita hasn't received the GCash. {amt} still for {trip}.",
    corporate: "Please be advised: remittance of {amt} for {trip} was not posted. Kindly resend, {from}.",
    guilttrip: "I'm not mad... but nothing came in 💸 {amt} for {trip}, {from}.",
  },
}

export function fakeNewsReminder(
  persona: Persona,
  lang: Lang,
  vars: { from: string; to: string; amt: string; trip: string }
) {
  const tone = uiLang(lang)
  const set = FAKE_NEWS[tone]
  return fill(set[persona] ?? set.default, vars)
}

export function reminder(trip: Trip, transfer: Transfer, persona: Persona, lang: Lang, now: number) {
  const days = daysOwed(trip, transfer.from, now)
  const tone = uiLang(lang)
  const set = TONES[tone][persona] ?? TONES[tone].default
  const number = gcashOf(trip, transfer.to)
  const toName = memberName(trip, transfer.to)
  return fill(set[lvl(days)], {
    from: memberName(trip, transfer.from),
    to: toName,
    amt: peso(transfer.pay != null ? transfer.pay : transfer.amount),
    trip: trip.name,
    d: dayPhrase(days, lang),
    num: number
      ? "GCash/Maya: " + number + " (" + toName + ")"
      : tone === "tl"
        ? "PM mo si " + toName + " for the GCash/Maya #"
        : "Ask " + toName + " for the GCash/Maya number",
  })
}

export function estMessage(
  draft: { buffer: number },
  calc: { total: number; n: number; per: number },
  tripName: string,
  gcash: string,
  lang: Lang
) {
  const gc = gcash ? "\nGCash/Maya: " + gcash : ""
  if (uiLang(lang) === "tl") {
    return (
      "Ambagan para sa " +
      tripName +
      " 🏝️\nEstimated: " +
      peso(calc.total) +
      (draft.buffer ? " + " + draft.buffer + "% buffer" : "") +
      "\nAmbag each (" +
      calc.n +
      " pax): " +
      peso(calc.per) +
      gc +
      "\nIbabalik ang sukli after the trip, promise 🤞"
    )
  }
  return (
    "Kitty for " +
    tripName +
    " 🏝️\nEstimated: " +
    peso(calc.total) +
    (draft.buffer ? " + " + draft.buffer + "% buffer" : "") +
    "\nEach (" +
    calc.n +
    " pax): " +
    peso(calc.per) +
    gc +
    "\nWe'll return leftovers after the trip, promise 🤞"
  )
}
