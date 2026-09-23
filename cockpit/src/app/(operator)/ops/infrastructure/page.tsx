import { requireOperator } from '@/lib/auth'
import { readInfrastructure } from '@/lib/infrastructure/read'
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
  // The frame is the group's layout; this page renders its <main> only. The
  // gate runs here as well as there — see src/app/(operator)/layout.tsx.
  await requireOperator()
  const infra = await readInfrastructure(new Date())
  return <InfrastructureView infra={infra} />
}
