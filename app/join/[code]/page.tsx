import { JoinView } from "@/components/barkada/join-view"

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
