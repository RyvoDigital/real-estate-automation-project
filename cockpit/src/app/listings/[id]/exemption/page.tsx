import { notFound } from 'next/navigation'
import { requireOperator } from '@/lib/auth'
import { readExemptionScreen } from '@/lib/publication/exemption-read'
import { ExemptionView } from '@/components/listings/ExemptionView'
import { readClientLocale } from '@/lib/client-locale'
import { refusalFrom } from '@/lib/refusals'

/**
 * Declaring a property exempt from certification. Redrawn 22 Sep 2026
 * (checkpoint 2): this file signs in and reads (exemption-read.ts); ExemptionView
 * draws; the write is record_exemption (0057) through exemption-core.ts.
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function Exemption({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ guardado?: string; jaGuardado?: string; recusa?: string; p?: string }>
}) {
  await requireOperator()
  const { id } = await params
  const sp = await searchParams
  const screen = await readExemptionScreen(id)
  if (!screen.listing && !screen.failures.listing) notFound()
  const refusal = refusalFrom(sp)
  // The agency's language, read only when there is a refusal to say.
  const locale = refusal ? await readClientLocale(screen.clientId) : null
  return <ExemptionView id={id} screen={screen} guardado={sp.guardado} jaGuardado={sp.jaGuardado} refusal={refusal} locale={locale} />
}
