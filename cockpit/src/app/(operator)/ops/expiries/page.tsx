import { requireOperator } from '@/lib/auth'
import { readExpiries } from '@/lib/expiries/read'
import { hiddenClients } from '@/lib/hidden-clients'
import { refusalFrom } from '@/lib/refusals'
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
  // The frame is the group's layout; this page renders its <main> only. The
  // gate runs here as well as there — see src/app/(operator)/layout.tsx.
  await requireOperator()
  const sp = await searchParams
  // 🔒 Off by default (lib/hidden-clients.ts).
  const includeRehearsals = sp.ensaios === '1'
  const [hidden, e] = await Promise.all([
    hiddenClients(includeRehearsals),
    readExpiries(new Date(), includeRehearsals),
  ])
  return <ExpiriesView e={e} refusal={refusalFrom(sp)} guardado={sp.guardado} jaGuardado={sp.jaGuardado} hidden={hidden} />
}
