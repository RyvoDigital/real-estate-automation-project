import { requireOperator } from '@/lib/auth'
import { readCounts } from '@/lib/counts'
import { readClientList } from '@/lib/clients/read'
import { Frame } from '@/components/Frame'
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
  const operator = await requireOperator()
  const [list, counts] = await Promise.all([readClientList(new Date()), readCounts()])
  return (
    <Frame mode="operator" current="clients" counts={counts} operatorEmail={operator.email}>
      <ClientsView list={list} />
    </Frame>
  )
}
