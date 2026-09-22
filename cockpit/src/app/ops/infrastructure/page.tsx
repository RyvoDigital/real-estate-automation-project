import { requireOperator } from '@/lib/auth'
import { readCounts } from '@/lib/counts'
import { readInfrastructure } from '@/lib/infrastructure/read'
import { Frame } from '@/components/Frame'
import { InfrastructureView } from '@/components/infrastructure/InfrastructureView'

/**
 * Infrastructure (brief §2.4, Q4; route map: /ops/infrastructure). This was
 * /health, on the old Shell; moved here 22 Sep 2026 with the rest of the
 * operator level, rebuilt on the Frame, with Better Stack's one line added.
 * The reads and the refusals are unchanged: no re-run, no dashboard.
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function OpsInfrastructure() {
  const operator = await requireOperator()
  const [infra, counts] = await Promise.all([readInfrastructure(new Date()), readCounts()])
  return (
    <Frame mode="operator" current="infrastructure" counts={counts} operatorEmail={operator.email}>
      <InfrastructureView infra={infra} />
    </Frame>
  )
}
