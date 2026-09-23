import { requireOperator } from '@/lib/auth'
import { readClientList } from '@/lib/clients/read'
import { ClientsView } from '@/components/clients/ClientsView'

/**
 * Clients (brief §1.2, §2.2): every agency and how each one is doing.
 *
 * 🔒 Rehearsals are LISTED here, unlike Today and /ops/expiries: this screen is
 * who exists, not a count of the business's work. The deploy gate's own client
 * is not an agency and is not listed (lib/clients/read.ts).
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function ClientsPage() {
  // The frame is the group's layout; this page renders its <main> only. The
  // gate runs here as well as there — see src/app/(operator)/layout.tsx.
  await requireOperator()
  const list = await readClientList(new Date())
  return <ClientsView list={list} />
}
