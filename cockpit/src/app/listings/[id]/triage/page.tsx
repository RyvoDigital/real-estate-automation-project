import { notFound } from 'next/navigation'
import { requireOperator } from '@/lib/auth'
import { readTriage } from '@/lib/matching/triage-read'
import { TriageView } from '@/components/listings/TriageView'
import { readClientLocale } from '@/lib/client-locale'
import { refusalFrom } from '@/lib/refusals'

/**
 * The triage floor: the product for an agency with no structured data. Redrawn
 * 22 Sep 2026 (checkpoint 2): this file signs in and reads; TriageView draws;
 * the write is record_agent_pick (0057) through pick-core.ts.
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function Triage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ guardado?: string; jaGuardado?: string; recusa?: string; p?: string }>
}) {
  await requireOperator()
  const { id } = await params
  const sp = await searchParams
  const screen = await readTriage(id)
  if (!screen.listing && !screen.failures.listing) notFound()
  const refusal = refusalFrom(sp)
  // The agency's language, read only when there is a refusal to say.
  const locale = refusal ? await readClientLocale(screen.clientId) : null
  return <TriageView id={id} screen={screen} guardado={sp.guardado} jaGuardado={sp.jaGuardado} refusal={refusal} locale={locale} />
}
