import type { Metadata } from "next"

import { JoinView } from "@/components/barkada/join-view"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>
}): Promise<Metadata> {
  const { code } = await params
  const joinCode = decodeURIComponent(code)
  const title = `🏝️ Join our trip on Tally! (Code: ${joinCode})`
  const description = "Don't forget who owes what. Tap to claim your name, log expenses, and settle up via GCash."
  return {
    title,
    description,
    openGraph: { title, description, siteName: "Tally", type: "website" },
    twitter: { card: "summary_large_image", title, description },
  }
}

export default async function JoinPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>
  searchParams: Promise<{ seat?: string }>
}) {
  const { code } = await params
  const query = await searchParams
  return <JoinView code={decodeURIComponent(code)} seat={query.seat} />
}
