import { TripPage } from "@/components/barkada/shell"

export default async function LakadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <TripPage tripId={id} />
}
