export function isPin(value: string) {
  return /^\d{4}$/.test(value)
}

export function pinKey(tripId: string, memberId: string) {
  return tripId + ":" + memberId
}

export async function hashPin(pin: string, salt: string) {
  const data = new TextEncoder().encode(salt + ":" + pin)
  const digest = await crypto.subtle.digest("SHA-256", data)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

export async function pinsMatch(pin: string, salt: string, expected: string) {
  if (!expected) return false
  const hashed = await hashPin(pin, salt)
  return hashed === expected
}
