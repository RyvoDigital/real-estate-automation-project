import { requireOperator } from '@/lib/auth'
import { getOpenCount } from '@/lib/data'
import { Shell } from '@/components/Shell'
import { Onboarding } from '@/components/Onboarding'

export const dynamic = 'force-dynamic'

export default async function OnboardingPage() {
  const operator = await requireOperator()
  const openCount = await getOpenCount()

  return (
    <Shell active="onboarding" openCount={openCount} email={operator.email}>
      <header className="head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="eyebrow">Onboarding</span>
          <h1 className="head__title">New client</h1>
        </div>
      </header>
      <span className="head__sub">
        Everything here writes one <code>clients</code> row and one{' '}
        <code>client_automations</code> config. No SQL.
      </span>
      <Onboarding />
    </Shell>
  )
}
