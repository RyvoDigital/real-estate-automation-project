import { notFound } from 'next/navigation'
import { requireOperator } from '@/lib/auth'
import { getClients } from '@/lib/data'
import { agencyFacts } from '@/lib/publication/facts-store'
import { allAdvertisingPolicy } from '@/lib/publication/policy-store'
import { standingClearances } from '@/lib/publication/clearances-store'
import type { ClearanceRow } from '@/lib/publication/recheck'
import { Notice } from '@/components/Notice'

/*
 * The operator's view of the re-check notice — what would be said to the
 * agency, read before saying it.
 *
 * 🔒 The page is <Notice/> and nothing else. The agency's view at
 * /p/<client>/notice renders the same component; only the frame differs.
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function readNotice(clientId: string) {
  const [standing, policy, agency] = await Promise.all([
    standingClearances(clientId),
    allAdvertisingPolicy(),
    agencyFacts(clientId),
  ])
  const clearances: ClearanceRow[] = standing.map((c) => ({
    clearanceId: c.id,
    listingId: c.listingId,
    reference: null,
    satisfied: c.satisfied,
    country: c.country,
    region: c.region,
    decidedAt: c.decidedAt,
    noticeSentAt: c.noticeSentAt,
  }))
  return { clearances, policy, agency }
}

export default async function NoticePage({ params }: { params: Promise<{ client: string }> }) {
  await requireOperator()
  const { client: clientId } = await params
  const clients = await getClients()
  if (!clients.some((c) => c.id === clientId)) notFound()
  const { clearances, policy, agency } = await readNotice(clientId)
  return <Notice clearances={clearances} policy={policy} agency={agency} />
}
