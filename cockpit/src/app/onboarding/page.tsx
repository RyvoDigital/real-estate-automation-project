import { requireOperator } from '@/lib/auth'
import { getQueue } from '@/lib/data'
import { Shell, Who } from '@/components/Shell'
import { Onboarding } from '@/components/Onboarding'

export const dynamic = 'force-dynamic'

export default async function OnboardingPage() {
  const operator = await requireOperator()
  const queue = await getQueue()

  return (
    <Shell active="onboarding" openCount={queue.length}>
      <div className="topbar">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flexGrow: 1 }}>
          <h1 className="topbar__title">New client</h1>
          <span className="topbar__sub">
            Everything here writes one <code>clients</code> row and one{' '}
            <code>client_automations</code> config. No SQL.
          </span>
        </div>
        <Who email={operator.email} />
      </div>
      <Onboarding />
    </Shell>
  )
}
