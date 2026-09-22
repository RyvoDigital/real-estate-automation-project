import { notFound } from 'next/navigation'
import { requireOperator } from '@/lib/auth'
import { readTriage } from '@/lib/matching/triage-read'
import { TriageView } from '@/components/listings/TriageView'

/**
 * The triage floor: the product for an agency with no structured data. Redrawn
 * 22 Sep 2026 (checkpoint 2): this file signs in and reads; TriageView draws;
 * the write is record_agent_pick (0057) through pick-core.ts.
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function Triage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ guardado?: string; jaGuardado?: string; erro?: string }>
}) {
  await requireOperator()
  const { id } = await params
  const { guardado, jaGuardado, erro } = await searchParams
  const screen = await readTriage(id)
  if (!screen.listing && !screen.failures.listing) notFound()
  return <TriageView id={id} screen={screen} guardado={guardado} jaGuardado={jaGuardado} erro={erro} />
}
