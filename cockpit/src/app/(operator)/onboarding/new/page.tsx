import Link from 'next/link'
import { requireOperator } from '@/lib/auth'
import { NewClient } from '@/components/onboarding/NewClient'
import styles from '@/components/onboarding/onboarding.module.css'

/*
 * /onboarding/new: taking on a new client, on its own route (operator, 22 Sep
 * 2026). The list is the frequent use and has the whole of /onboarding; this
 * form is occasional, so it is a destination rather than a permanent column.
 */
export const dynamic = 'force-dynamic'

export default async function NewClientPage() {
  // The frame is the group's layout; this page renders its <main> only. The
  // gate runs here as well as there — see src/app/(operator)/layout.tsx.
  await requireOperator()
  return (
    <div className={styles.page}>
      <Link className={styles.back} href="/onboarding">← All clients</Link>
      <div className={styles.top}>
        <h1 className={styles.title}>Take on a new client</h1>
      </div>
      <p className={styles.lede}>Nothing is written until you create it, and then the client and its Concierge are created together or not at all. Its checklist opens next.</p>
      <NewClient />
    </div>
  )
}
