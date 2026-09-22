import { requireOperator } from '@/lib/auth'
import { readScreen } from '@/lib/segmentation/read'
import { SegmentationView } from '@/components/segmentation/SegmentationView'

/**
 * Where did these contacts come from? /segmentation, redrawn 22 Sep 2026
 * (checkpoint 2) in The Month's direction. The one screen that writes a consent
 * declaration, shown across a table to the agency.
 *
 * This file signs in and reads; components/segmentation/SegmentationView.tsx
 * draws, and components/segmentation/DeclareFlow.tsx holds the two steps.
 *
 * 🔒 THE URL CARRIES THE GROUP, NEVER THE ANSWER: the search params read here
 * are the group and the outcome of the last save, and nothing that chooses.
 *
 * Standalone, per improvements §3.17: no cockpit frame in front of a client.
 */

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function SegmentationScreen({
  params, searchParams,
}: {
  params: Promise<{ clientId: string }>
  searchParams: Promise<{ erro?: string; guardado?: string; jaGuardado?: string; grupo?: string }>
}) {
  await requireOperator()
  const { clientId } = await params
  const { erro, guardado, jaGuardado, grupo } = await searchParams
  const screen = await readScreen(clientId)
  return <SegmentationView clientId={clientId} screen={screen} grupo={grupo} erro={erro} guardado={guardado} jaGuardado={jaGuardado} />
}
