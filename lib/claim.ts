import { activeMembers, digits, sanitizeProfile, uid, type Member, type Profile, type Trip } from "@/lib/types"

export function gcashLast4(gcash: string) {
  const only = digits(gcash).replace(/\D/g, "")
  return only.length >= 4 ? only.slice(-4) : ""
}

export function matchesGcashLast4(gcash: string, secret: string) {
  const last4 = gcashLast4(gcash)
  return last4.length === 4 && secret === last4
}

export function seatStatus(member: Member, uidValue: string) {
  if (!member.claimedByUid) return "free" as const
  if (uidValue && member.claimedByUid === uidValue) return "mine" as const
  return "locked" as const
}

export function bindSeat(
  trip: Trip,
  memberId: string | "new",
  profile: Profile,
  authUid: string,
  extras?: { name?: string; gcash?: string }
): { ok: true; trip: Trip; as: string; profile: Profile } | { ok: false; reason: "missing-name" | "max" | "locked" | "missing-seat" } {
  const nick = (extras?.name || profile.name).trim().slice(0, 40)
  const gcash = (extras?.gcash ?? profile.gcash).trim().slice(0, 30)
  let nextProfile = gcash && !profile.gcash ? { ...profile, gcash } : profile

  if (memberId === "new") {
    if (!nick) return { ok: false, reason: "missing-name" }
    if (!trip.open) return { ok: false, reason: "locked" }
    if (activeMembers(trip).length >= 60) return { ok: false, reason: "max" }
    const match = activeMembers(trip).find((member) => member.name.trim().toLowerCase() === nick.toLowerCase())
    if (match) {
      return bindSeat(trip, match.id, nextProfile, authUid, { gcash })
    }
    const id = uid("m")
    return {
      ok: true,
      trip: {
        ...trip,
        members: [...trip.members, { id, name: nick, gcash, claimedByUid: authUid || null, joinedAt: Date.now() }],
      },
      as: id,
      profile: { ...nextProfile, name: nick || nextProfile.name },
    }
  }

  const member = activeMembers(trip).find((item) => item.id === memberId)
  if (!member) return { ok: false, reason: "missing-seat" }
  const status = seatStatus(member, authUid)
  if (status === "locked") return { ok: false, reason: "locked" }

  return {
    ok: true,
    trip: {
      ...trip,
      members: trip.members.map((item) =>
        item.id === memberId
          ? {
              ...item,
              gcash: gcash || item.gcash,
              claimedByUid: authUid || item.claimedByUid || null,
            }
          : item
      ),
    },
    as: memberId,
    profile: {
      ...nextProfile,
      name: nextProfile.name || member.name,
      gcash: gcash || member.gcash || nextProfile.gcash,
    },
  }
}

export function profileFromClaimedSeats(trips: Trip[], uidValue: string, current: Profile): Profile {
  if (current.name.trim()) return current
  if (!uidValue) return current
  for (const trip of trips) {
    const mine = trip.members.find((member) => member.claimedByUid && member.claimedByUid === uidValue)
    if (mine) {
      return sanitizeProfile({
        ...current,
        name: mine.name,
        gcash: current.gcash || mine.gcash,
      })
    }
  }
  return current
}

export function resetMemberLock(trip: Trip, memberId: string): Trip {
  return {
    ...trip,
    members: trip.members.map((member) =>
      member.id === memberId ? { ...member, claimedByUid: null } : member
    ),
  }
}
