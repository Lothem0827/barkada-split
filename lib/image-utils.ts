import { peso, totalOf } from "@/lib/calc"
import type { Expense, Trip } from "@/lib/types"

const DATA_MAX = 150_000
const HTTPS_MAX = 500

export function isKeepablePhotoUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value) return false
  if (value.startsWith("https://") && value.length <= HTTPS_MAX && !/[\s<>]/.test(value)) return true
  return /^data:image\/(jpeg|jpg|png|webp);base64,/i.test(value) && value.length <= DATA_MAX
}

export function compressImage(file: File, maxDim = 800, quality = 0.72): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("not-image"))
      return
    }
    const reader = new FileReader()
    reader.onerror = () => reject(new Error("read"))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error("decode"))
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height) || 1)
        const canvas = document.createElement("canvas")
        canvas.width = Math.max(1, Math.round(img.width * scale))
        canvas.height = Math.max(1, Math.round(img.height * scale))
        const ctx = canvas.getContext("2d")
        if (!ctx) {
          reject(new Error("canvas"))
          return
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL("image/jpeg", quality))
      }
      img.src = String(reader.result || "")
    }
    reader.readAsDataURL(file)
  })
}

export type MemoryPhoto = { url: string; caption?: string }

export function memoryPhotosOf(trip: Trip): MemoryPhoto[] {
  const seen = new Set<string>()
  const out: MemoryPhoto[] = []
  const push = (url: string | null | undefined, caption?: string) => {
    if (!url || seen.has(url)) return
    seen.add(url)
    out.push(caption ? { url, caption } : { url })
  }
  push(trip.coverPhotoUrl)
  for (const url of trip.wrappedPhotos || []) push(url)
  trip.expenses
    .filter((expense): expense is Expense & { photoUrl: string } =>
      expense.status === "approved" && !!expense.photoUrl && expense.photoType !== "receipt"
    )
    .sort((a, b) => b.ts - a.ts)
    .forEach((expense) => push(expense.photoUrl, expense.title + " • " + peso(totalOf(expense))))
  return out
}

export function tripCoverUrl(trip: Trip) {
  if (trip.coverPhotoUrl) return trip.coverPhotoUrl
  return (
    trip.expenses.find(
      (expense) => expense.status === "approved" && expense.photoUrl && expense.photoType !== "receipt"
    )?.photoUrl || ""
  )
}
