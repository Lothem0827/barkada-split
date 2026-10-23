export function sanitizeGcash(raw: string) {
  return String(raw ?? "")
    .replace(/[^\d+\-\s]/g, "")
    .slice(0, 16)
}

export function isValidGcash(raw: string) {
  const trimmed = String(raw ?? "").trim()
  if (!trimmed) return true
  const digits = trimmed.replace(/\D/g, "")
  if (digits.length < 10 || digits.length > 13) return false
  return digits.startsWith("09") || digits.startsWith("9") || digits.startsWith("63")
}
