import { requireOperator } from '@/lib/auth'
import { readCounts } from '@/lib/counts'
import { readExpiries } from '@/lib/expiries/read'
import { refusalFrom } from '@/lib/refusals'
import { Frame } from '@/components/Frame'
import { ExpiriesView } from '@/components/expiries/ExpiriesView'

/**
 * Expiries (brief §2.3; route map: /ops/expiries; C5). The cross-client home of
 * the clearance re-check and of Ryvo's own expiries. It reads lib/expiries, the
 * SAME module Today's groups 3 and 4 read, so there is one account of what
 * expires, never two. Built 22 Sep 2026 (checkpoint 2).
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function OpsExpiries({ searchParams }: {
  searchParams: Promise<{ recusa?: string; p?: string; guardado?: string; jaGuardado?: string }>
}) {
  const operator = await requireOperator()
  const sp = await searchParams
  const [e, counts] = await Promise.all([readExpiries(new Date()), readCounts()])
  return (
    <Frame mode="operator" current="expiries" counts={counts} operatorEmail={operator.email}>
      <ExpiriesView e={e} refusal={refusalFrom(sp)} guardado={sp.guardado} jaGuardado={sp.jaGuardado} />
    </Frame>
  )
}
