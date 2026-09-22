import { requireOperator } from '@/lib/auth'
import { readCounts } from '@/lib/counts'
import { Frame } from '@/components/Frame'
import { NewClient } from '@/components/onboarding/NewClient'
import styles from '@/components/onboarding/onboarding.module.css'

/*
 * /onboarding/new: taking on a new client, on its own route (operator, 22 Sep
 * 2026). The list is the frequent use and has the whole of /onboarding; this
 * form is occasional, so it is a destination rather than a permanent column.
 */
export const dynamic = 'force-dynamic'

export default async function NewClientPage() {
  const operator = await requireOperator()
  const counts = await readCounts()
  return (
    <Frame mode="operator" current="onboarding" counts={counts} operatorEmail={operator.email}>
      <div className={styles.page}>
        <a className={styles.back} href="/onboarding">← All clients</a>
        <div className={styles.top}>
          <h1 className={styles.title}>Take on a new client</h1>
        </div>
        <p className={styles.lede}>Nothing is written until you create it, and then the client and its Concierge are created together or not at all. Its checklist opens next.</p>
        <NewClient />
      </div>
    </Frame>
  )
}
