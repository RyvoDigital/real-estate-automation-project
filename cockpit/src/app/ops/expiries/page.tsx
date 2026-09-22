import { requireOperator } from '@/lib/auth'
import { readCounts } from '@/lib/counts'
import { readExpiries } from '@/lib/expiries/read'
import { hiddenClients } from '@/lib/hidden-clients'
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
  searchParams: Promise<{ recusa?: string; p?: string; guardado?: string; jaGuardado?: string; ensaios?: string }>
}) {
  const operator = await requireOperator()
  const sp = await searchParams
  // 🔒 Off by default, and the badge follows the same answer (lib/hidden-clients.ts).
  const includeRehearsals = sp.ensaios === '1'
  const hidden = await hiddenClients(includeRehearsals)
  const [e, counts] = await Promise.all([
    readExpiries(new Date(), includeRehearsals),
    readCounts(undefined, includeRehearsals),
  ])
  return (
    <Frame mode="operator" current="expiries" counts={counts} operatorEmail={operator.email}>
      <ExpiriesView e={e} refusal={refusalFrom(sp)} guardado={sp.guardado} jaGuardado={sp.jaGuardado} hidden={hidden} />
    </Frame>
  )
}
