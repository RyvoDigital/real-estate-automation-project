import { notFound } from 'next/navigation'
import { requireOperator } from '@/lib/auth'
import { readMatches } from '@/lib/matching/screen-read'
import { ListingDetailView } from '@/components/listings/ListingDetailView'

/**
 * Who a listing serves. Redrawn 22 Sep 2026 (checkpoint 2): this file signs in
 * and reads; components/listings/ListingDetailView draws. A 404 only when the
 * listing was READ and is not there: a failed read is shown as failed.
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function ListingMatches({ params }: { params: Promise<{ id: string }> }) {
  await requireOperator()
  const { id } = await params
  const screen = await readMatches(id)
  if (!screen.listing && !screen.failures.listing) notFound()
  return <ListingDetailView id={id} screen={screen} />
}
